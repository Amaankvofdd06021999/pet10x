-- Pet10x — Part F review: the account flags have one door, for admins too.
--
-- 20261012000002 put the self-lockout refusal and the audit row in
-- admin_set_user_flags, but `profiles_admin_all` still lets an admin PATCH
-- `profiles` over REST, and guard_profile_privilege (20260714000000) only asks
-- "is the caller an admin". So an admin could set is_super_admin /
-- is_suspended directly — on themselves included — and nothing was audited.
--
-- Now a change to is_super_admin, is_suspended, suspended_at or suspended_by
-- from a request that carries a JWT must carry the single-use transaction-
-- local token `pet10x.user_flags`, which only admin_set_user_flags mints,
-- immediately before each of its UPDATEs. The guard spends it on every pass
-- (the pet10x.post_counts / pet10x.stage_change pattern: a GUC set inside a
-- definer function outlives the function, so a token left standing would be a
-- mode, not a capability).
--
-- The guard is SECURITY DEFINER, so `current_user` inside it is its owner and
-- cannot tell a client from the system; it keeps its original test,
-- `auth.uid() is not null` — a request with a JWT. Service-role scripts and
-- the referential SET NULL of suspended_by (an account deletion, run by
-- GoTrue without a JWT) carry none and pass, as before. The role check is
-- copied verbatim from 20260714000000.

create or replace function public.guard_profile_privilege()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_token boolean;
begin
  v_token := pg_catalog.current_setting('pet10x.user_flags', true) is not distinct from 'ok';
  perform pg_catalog.set_config('pet10x.user_flags', '', true);

  if (new.role is distinct from old.role
      or new.is_super_admin is distinct from old.is_super_admin
      or new.is_suspended is distinct from old.is_suspended)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Not allowed to change role, admin flag, or suspension state';
  end if;

  if (new.is_super_admin is distinct from old.is_super_admin
      or new.is_suspended is distinct from old.is_suspended
      or new.suspended_at is distinct from old.suspended_at
      or new.suspended_by is distinct from old.suspended_by)
     and auth.uid() is not null and not v_token then
    raise exception 'Admin access and suspension change only through admin_set_user_flags'
      using errcode = '42501',
            hint    = 'Call admin_set_user_flags(p_profile, p_suspended, p_super_admin). It refuses self-lockout and writes the audit row.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_profile_privilege() from public, anon, authenticated;

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
    -- The single-use capability guard_profile_privilege requires (20261012000006).
    perform set_config('pet10x.user_flags', 'ok', true);
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
    perform set_config('pet10x.user_flags', 'ok', true);
    update public.profiles set is_super_admin = p_super_admin where id = p_profile;
    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (v_me, case when p_super_admin then 'user.admin_granted' else 'user.admin_revoked' end,
            'profile', p_profile, jsonb_build_object('from', v_row.is_super_admin, 'to', p_super_admin));
  end if;
end;
$$;

revoke all on function public.admin_set_user_flags(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_set_user_flags(uuid, boolean, boolean) to authenticated;
