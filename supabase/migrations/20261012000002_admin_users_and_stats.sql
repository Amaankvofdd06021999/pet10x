-- Pet10x — Part F: the admin console's Users and Overview tabs.
--
-- Three definer RPCs, each `is_admin()` only:
--
--   admin_list_users(p_query, p_limit, p_offset)
--     Profiles matched by name or email (server-side ilike), newest first,
--     paginated, with what each person IS on the platform — resident, manager
--     of N buildings, business owner, clinic staff, admin — so the console
--     can label them without a query per row.
--
--   admin_set_user_flags(p_profile, p_suspended, p_super_admin)
--     Suspend / unsuspend, grant / revoke super-admin. The client used to
--     write `profiles` directly (setManagerSuspended), which trg_profiles_guard
--     permits an admin — and which let an admin suspend or demote THEMSELVES,
--     locking the last door to the console from the inside. That refusal lives
--     here, in the database, and every change is audit-logged.
--
--   admin_platform_stats()
--     The counts on the Overview tab.

-- ---------------------------------------------------------------------------
-- 1. Users
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_query  text default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id                uuid,
  full_name         text,
  email             text,
  created_at        timestamptz,
  is_suspended      boolean,
  is_super_admin    boolean,
  is_resident       boolean,
  managed_buildings integer,
  owns_business     boolean,
  clinic_staff      boolean,
  total_count       bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q     text := nullif(btrim(coalesce(p_query, '')), '');
  v_like  text;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can list users' using errcode = '42501';
  end if;

  -- The typed text is matched literally: % and _ are escaped, so "a_b" does
  -- not match "axb".
  if v_q is not null then
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select p.id,
         p.full_name,
         p.email,
         p.created_at,
         p.is_suspended,
         p.is_super_admin,
         (p.role = 'pet_owner'
          or exists (select 1 from public.pets pe where pe.owner_id = p.id and pe.deleted_at is null)
          or exists (select 1 from public.resident_links rl
                      where rl.profile_id = p.id and rl.status = 'approved')),
         (select count(*)::integer from public.building_managers bm where bm.profile_id = p.id),
         exists (select 1 from public.businesses b where b.owner_id = p.id),
         exists (select 1 from public.business_staff s where s.profile_id = p.id and s.is_active),
         count(*) over ()
    from public.profiles p
   where v_like is null
      or p.full_name ilike v_like
      or p.email ilike v_like
   order by p.created_at desc, p.id
   limit v_limit
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function public.admin_list_users(text, integer, integer) is
  'Admin console Users tab (20261012000002). is_admin() only. Profiles whose name or email contains p_query (case-insensitive, % and _ matched literally), newest first, at most 100 per page, each with the persona facts the console labels: resident (pet_owner role, an active pet or an approved building link), number of buildings managed, owns a business, active clinic staff. total_count is the match count before paging.';

revoke all on function public.admin_list_users(text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;

create or replace function public.admin_set_user_flags(
  p_profile     uuid,
  p_suspended   boolean default null,
  p_super_admin boolean default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me  uuid := auth.uid();
  v_row record;
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can change an account''s access' using errcode = '42501';
  end if;
  if p_suspended is null and p_super_admin is null then
    raise exception 'Nothing to change' using errcode = '22023';
  end if;
  if p_profile = v_me and (p_suspended is true or p_super_admin is false) then
    raise exception 'You can''t suspend or demote your own account'
      using errcode = '42501',
            hint    = 'Ask another admin. An admin locking themselves out could leave nobody able to undo it.';
  end if;

  select id, is_suspended, is_super_admin into v_row
    from public.profiles where id = p_profile for update;
  if not found then
    raise exception 'That account no longer exists' using errcode = 'P0002';
  end if;

  if p_suspended is not null and p_suspended is distinct from v_row.is_suspended then
    update public.profiles
       set is_suspended = p_suspended,
           suspended_at = case when p_suspended then now() else null end,
           suspended_by = case when p_suspended then v_me else null end
     where id = p_profile;
    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (v_me, case when p_suspended then 'user.suspended' else 'user.unsuspended' end,
            'profile', p_profile, jsonb_build_object('from', v_row.is_suspended, 'to', p_suspended));
  end if;

  if p_super_admin is not null and p_super_admin is distinct from v_row.is_super_admin then
    update public.profiles set is_super_admin = p_super_admin where id = p_profile;
    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (v_me, case when p_super_admin then 'user.admin_granted' else 'user.admin_revoked' end,
            'profile', p_profile, jsonb_build_object('from', v_row.is_super_admin, 'to', p_super_admin));
  end if;
end;
$$;

comment on function public.admin_set_user_flags(uuid, boolean, boolean) is
  'Admin console (20261012000002). is_admin() only. Sets is_suspended (stamping suspended_at / suspended_by) and/or is_super_admin on one profile; a null argument leaves that flag alone. Refuses an admin suspending or demoting themselves. Each actual change writes one audit_log row (user.suspended / user.unsuspended / user.admin_granted / user.admin_revoked).';

revoke all on function public.admin_set_user_flags(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_set_user_flags(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Overview
-- ---------------------------------------------------------------------------
create or replace function public.admin_platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can read platform statistics' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'users',              (select count(*) from public.profiles),
    'pets',               (select count(*) from public.pets where deleted_at is null),
    'buildings_active',   (select count(*) from public.buildings where archived_at is null),
    'buildings_archived', (select count(*) from public.buildings where archived_at is not null),
    'businesses_by_tier', coalesce((select jsonb_object_agg(tier, n)
                                      from (select tier::text as tier, count(*) as n
                                              from public.businesses group by tier) t), '{}'::jsonb),
    'incidents_30d',      (select count(*) from public.incident_reports
                            where created_at >= now() - interval '30 days'),
    'open_violations',    (select count(*) from public.violations
                            where stage not in ('resolved', 'dismissed')),
    'bookings_30d',       (select count(*) from public.service_bookings
                            where created_at >= now() - interval '30 days'),
    'ai_conversations_30d', (select count(*) from public.ai_conversations
                              where created_at >= now() - interval '30 days')
  );
end;
$$;

comment on function public.admin_platform_stats() is
  'Admin console Overview tab (20261012000002). is_admin() only. Platform counts: users, active pets, buildings active/archived, businesses by tier, incidents / bookings / AI conversations started in the last 30 days, open violations (stage not resolved or dismissed). AI conversations a person deleted still count — deletion removes their messages and title, not the fact one was started (20261012000003).';

revoke all on function public.admin_platform_stats() from public, anon;
grant execute on function public.admin_platform_stats() to authenticated;
