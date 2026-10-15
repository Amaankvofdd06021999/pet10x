-- DRY RUN — generated 2026-10-15 from branch ui-system by bundles/build.sh.
-- Applies every migration from 20261018000001 on, runs supabase/tests/part-*.sql,
-- then RAISES ON PURPOSE so the whole transaction rolls back. Nothing is saved.
-- SUCCESS looks like the error:  DRY RUN OK — ...
-- Any other error is the first thing that broke; fix it before running apply.sql.
begin;
set local lock_timeout = '5s';

-- ===== migration 20261018000001_ui_system.sql =====
-- UI system — notifications can be snoozed or deleted with a swipe.
--
--   * notifications.snoozed_until — the row is asleep until then: out of the
--     inbox and the unread count, and not pushed or emailed. Snoozing clears
--     read_at, so the row comes back unread when it wakes.
--   * notifications.dismissed_at — "deleted" in the inbox. The row is hidden,
--     never erased: delivery bookkeeping (emailed_at, pushed_at, the claims)
--     stays intact, and Undo is restore_notification clearing the stamp.
--   * snooze_notification / dismiss_notification / restore_notification —
--     the only writers of the two columns. Security definer because
--     notifs_update would also let an admin (is_admin) touch other people's
--     rows through the API; these take the caller's OWN row and nobody
--     else's, admin or not. A row that is not the caller's (or does not
--     exist) is the same 'forbidden', so the answer says nothing about
--     whose ids are real.
--   * claim_notification_emails / claim_notification_pushes — copied from
--     their newest definitions (20261011000005 and 20261011000002) with one
--     filter added each: not dismissed, and not still asleep. A sleeping row
--     not yet sent is claimed when it wakes, not before.

alter table public.notifications
  add column if not exists snoozed_until timestamptz,
  add column if not exists dismissed_at  timestamptz;

create or replace function public.snooze_notification(p_id uuid, p_until timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := auth.uid();
  v_owner uuid;
begin
  select n.profile_id into v_owner from public.notifications n where n.id = p_id;
  -- NULL-safe: no session, no row, or someone else's row are all refused.
  if v_me is null or v_owner is null or v_owner <> v_me then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- The sheet only offers times inside this window; anything else is a
  -- client bug or a hand-made call, not a choice someone made.
  if p_until is null or p_until <= now() or p_until > now() + interval '7 days' then
    raise exception 'Pick a time within the next 7 days' using errcode = '22023';
  end if;
  update public.notifications
     set snoozed_until = p_until,
         read_at = null
   where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.dismiss_notification(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := auth.uid();
  v_owner uuid;
begin
  select n.profile_id into v_owner from public.notifications n where n.id = p_id;
  if v_me is null or v_owner is null or v_owner <> v_me then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- coalesce: a second delete keeps the first stamp.
  update public.notifications set dismissed_at = coalesce(dismissed_at, now()) where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.restore_notification(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_me    uuid := auth.uid();
  v_owner uuid;
begin
  select n.profile_id into v_owner from public.notifications n where n.id = p_id;
  if v_me is null or v_owner is null or v_owner <> v_me then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  update public.notifications set dismissed_at = null where id = p_id;
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.snooze_notification(uuid, timestamptz) from public, anon;
revoke all on function public.dismiss_notification(uuid) from public, anon;
revoke all on function public.restore_notification(uuid) from public, anon;
grant execute on function public.snooze_notification(uuid, timestamptz) to authenticated;
grant execute on function public.dismiss_notification(uuid) to authenticated;
grant execute on function public.restore_notification(uuid) to authenticated;

-- claim_notification_emails: verbatim from 20261011000005, plus the two
-- lines marked 20261018000001.
create or replace function public.claim_notification_emails(
  p_kinds public.notification_kind[], p_max_recipients integer default 200)
returns table (
  id uuid, profile_id uuid, email text, full_name text,
  kind public.notification_kind, severity text, title text, body text,
  action_label text, action_target text, created_at timestamptz,
  read_at timestamptz, notify_email boolean)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select n.id, n.profile_id, n.created_at
      from public.notifications n
     where n.emailed_at is null
       and n.email_failed_at is null  -- 20261011000005: refused for good
       and n.dismissed_at is null  -- 20261018000001: deleted in the inbox
       and (n.snoozed_until is null or n.snoozed_until <= now())  -- 20261018000001: still asleep
       and n.read_at is null
       and n.created_at > now() - interval '24 hours'
       and n.created_at <= now() - interval '2 minutes'
       and (n.email_claimed_at is null or n.email_claimed_at < now() - interval '15 minutes')
       and n.kind = any (p_kinds)
       /* A practice's reminder goes by email only when its rule says Email
          (20261011000003). `clinic_reminder_action('notify')` links the item
          to the notification it wrote; an in-app or call-list rule's
          reminder stays in the app (and push). */
       and not exists (select 1 from public.reminder_items ri
                        where ri.notification_id = n.id and ri.channel <> 'email')
       and exists (select 1 from public.profiles p
                    where p.id = n.profile_id and p.notify_email and not p.is_suspended
                      -- An account with no address is never claimed, rather
                      -- than re-leased all day for an email it cannot get.
                      and coalesce((select u.email::text from auth.users u where u.id = p.id),
                                   p.email, '') <> '')
     for update of n skip locked
  ),
  recipients as (
    select c.profile_id
      from candidates c
     group by c.profile_id
     order by min(c.created_at)
     limit greatest(coalesce(p_max_recipients, 200), 1)
  ),
  claimed as (
    update public.notifications n
       set email_claimed_at = now()
      from candidates c
      join recipients r on r.profile_id = c.profile_id
     where n.id = c.id
    returning n.id, n.profile_id, n.kind, n.severity, n.title, n.body,
              n.action_label, n.action_target, n.created_at, n.read_at
  )
  select cl.id, cl.profile_id, coalesce(u.email::text, p.email), p.full_name,
         cl.kind, cl.severity, cl.title, cl.body, cl.action_label, cl.action_target,
         cl.created_at, cl.read_at, p.notify_email
    from claimed cl
    join public.profiles p on p.id = cl.profile_id
    left join auth.users u on u.id = cl.profile_id
   order by cl.profile_id, cl.created_at
$$;
revoke all on function public.claim_notification_emails(public.notification_kind[], integer) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(public.notification_kind[], integer) to service_role;

-- claim_notification_pushes: verbatim from 20261011000002 (its only
-- definition), plus the two lines marked 20261018000001.
create or replace function public.claim_notification_pushes(p_limit integer default 500)
returns table (
  id uuid, profile_id uuid, kind public.notification_kind, severity text,
  title text, body text, action_target text, created_at timestamptz)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select n.id
      from public.notifications n
     where n.pushed_at is null
       and n.dismissed_at is null  -- 20261018000001: deleted in the inbox
       and (n.snoozed_until is null or n.snoozed_until <= now())  -- 20261018000001: still asleep
       and n.read_at is null
       and n.created_at > now() - interval '24 hours'
       and (n.push_claimed_at is null or n.push_claimed_at < now() - interval '15 minutes')
       and exists (select 1 from public.profiles p
                    where p.id = n.profile_id and p.notify_push and not p.is_suspended)
       and exists (select 1 from public.web_push_subscriptions s where s.profile_id = n.profile_id)
     order by n.created_at
     limit greatest(coalesce(p_limit, 500), 1)
     for update of n skip locked
  )
  update public.notifications n
     set push_claimed_at = now()
    from candidates c
   where n.id = c.id
  returning n.id, n.profile_id, n.kind, n.severity, n.title, n.body, n.action_target, n.created_at
$$;
revoke all on function public.claim_notification_pushes(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_pushes(integer) to service_role;


-- ===== checks part-a-archive =====
-- Part A — owner_archive_pet, impersonated, in ONE rolled-back transaction.
--
-- Covers 20261007000001 and 20261007000002 (the archive guard and
-- clinic_publish_record's refusal).
--
-- Not yet run: written before the migrations were applied (no database was
-- reachable from the session that wrote it). Run it after both are applied,
-- as the project's own
-- connection role (the Supabase SQL editor or MCP `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-a-archive.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written: the fixtures it
-- plants (a share, a desk code, a care task, an emergency token) and the
-- archive itself all roll back.
--
-- Actors are chosen from live data, not invented: a pet in Maple Court
-- Residences (MCR2026) that has a unit, its owner, a manager of that building,
-- and an owner from a different building. Each is asserted is_admin() = false
-- inside its own impersonation, because most policies carry is_admin() as a
-- disjunct and an admin control proves nothing (docs/RBAC_CAPABILITIES.md).
--
-- Fixture ids travel between role switches in transaction-local GUCs
-- (`part_a.*`), which any role can read with current_setting().

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_building uuid; v_pet uuid; v_owner uuid; v_manager uuid; v_other uuid; v_biz uuid;
  v_clinic uuid; v_clinic_owner uuid; v_customer uuid; v_patient uuid;
  v_token text := 'part-a-test-' || replace(gen_random_uuid()::text, '-', '');
begin
  select b.id into v_building from public.buildings b where upper(b.building_code) = 'MCR2026';
  if v_building is null then raise exception 'FIXTURE: building MCR2026 not found'; end if;

  select p.id, p.owner_id into v_pet, v_owner
    from public.pets p join public.profiles pr on pr.id = p.owner_id
   where p.building_id = v_building and p.unit_id is not null and p.deleted_at is null
     and not coalesce(pr.is_super_admin, false)
   order by p.created_at, p.id limit 1;
  if v_pet is null then raise exception 'FIXTURE: no current pet with a unit in MCR2026'; end if;

  select bm.profile_id into v_manager
    from public.building_managers bm join public.profiles pr on pr.id = bm.profile_id
   where bm.building_id = v_building and bm.profile_id <> v_owner
     and not coalesce(pr.is_super_admin, false)
   limit 1;
  if v_manager is null then raise exception 'FIXTURE: no non-admin manager of MCR2026'; end if;

  select p.owner_id into v_other
    from public.pets p join public.profiles pr on pr.id = p.owner_id
   where p.owner_id <> v_owner and p.building_id is distinct from v_building
     and not coalesce(pr.is_super_admin, false)
     and not exists (select 1 from public.building_managers bm
                      where bm.building_id = v_building and bm.profile_id = p.owner_id)
   limit 1;
  if v_other is null then raise exception 'FIXTURE: no owner outside MCR2026'; end if;

  select b.id into v_biz from public.businesses b
   where not exists (select 1 from public.record_shares s
                      where s.pet_id = v_pet and s.business_id = b.id and s.revoked_at is null)
   limit 1;
  if v_biz is null then raise exception 'FIXTURE: no business to share with'; end if;

  -- A practice, run by someone who is neither the owner nor an admin, with a
  -- chart linked to the pet — for clinic_publish_record (20261007000002).
  select b.id, b.owner_id into v_clinic, v_clinic_owner
    from public.businesses b join public.profiles pr on pr.id = b.owner_id
   where b.owner_id <> v_owner and not pr.is_suspended
     and not coalesce(pr.is_super_admin, false)
     and not exists (select 1 from public.clinic_patients cp
                      where cp.business_id = b.id and cp.pet_id = v_pet)
   limit 1;
  if v_clinic is null then raise exception 'FIXTURE: no practice to publish from'; end if;
  insert into public.clinic_customers (business_id, profile_id, first_name)
  values (v_clinic, v_owner, 'Part A') returning id into v_customer;
  insert into public.clinic_patients (business_id, customer_id, pet_id, name)
  values (v_clinic, v_customer, v_pet, 'Part A patient') returning id into v_patient;

  -- Something for the archive to revoke, delete and deactivate.
  insert into public.record_shares (pet_id, business_id, granted_by)
  values (v_pet, v_biz, v_owner);
  insert into public.record_desk_codes (pet_id, profile_id, code)
  values (v_pet, v_owner, 'PA' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));
  insert into public.pet_care_tasks (pet_id, label) values (v_pet, 'Part A test task');
  insert into public.emergency_access_tokens (building_id, token) values (v_building, v_token);

  perform set_config('part_a.building', v_building::text, true);
  perform set_config('part_a.pet', v_pet::text, true);
  perform set_config('part_a.owner', v_owner::text, true);
  perform set_config('part_a.manager', v_manager::text, true);
  perform set_config('part_a.other', v_other::text, true);
  perform set_config('part_a.token', v_token, true);
  perform set_config('part_a.clinic_owner', v_clinic_owner::text, true);
  perform set_config('part_a.patient', v_patient::text, true);
  raise notice 'fixtures: pet % owner % manager % other %', v_pet, v_owner, v_manager, v_other;
end $$;

-- Before: how many pets the emergency directory counts, two ways — its
-- `totals` and the per-unit entries are separate queries with separate filters.
create or replace function pg_temp.part_a_directory_counts()
returns int[] language sql as $$
  with d as (select public.emergency_directory(current_setting('part_a.token')) as j)
  select array[
    (select (j->'totals'->>'total')::int from d),
    (select count(*)::int from d,
            jsonb_array_elements(d.j->'floors') f,
            jsonb_array_elements(f->'units') u,
            jsonb_array_elements(coalesce(u->'pets', '[]'::jsonb)) pe)
  ];
$$;

do $$
declare c int[] := pg_temp.part_a_directory_counts();
begin
  if c[1] < 1 or c[2] < 1 then
    raise exception 'FIXTURE: emergency_directory counts % before archive', c;
  end if;
  perform set_config('part_a.dir_before', array_to_string(c, ','), true);
  raise notice 'ok: emergency_directory counts % before archive', c;
end $$;

-- ---------------------------------------------------------------------------
-- 1. A different user is refused (42501)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_a.other'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: other user is an admin'; end if;
  begin
    perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, 'rehomed');
    raise exception 'FAIL: a different user archived the pet';
  exception when insufficient_privilege then
    raise notice 'ok: different user refused (42501)';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. The building's manager is refused (42501) — and BEFORE archive, their
--    registry query sees the pet
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_a.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: manager is an admin'; end if;
  if (select count(*) from public.pets
       where building_id = current_setting('part_a.building')::uuid
         and id = current_setting('part_a.pet')::uuid and deleted_at is null) <> 1 then
    raise exception 'FAIL: manager registry does not see the pet BEFORE archive';
  end if;
  begin
    perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, 'rehomed');
    raise exception 'FAIL: a manager archived a resident''s pet';
  exception when insufficient_privilege then
    raise notice 'ok: manager refused (42501)';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2b. BEFORE archive, publishing reaches past the pet check (it fails later,
--     on the made-up source id or the practice's tier — anything but
--     pet_archived), so the refusal after archive is the archive's doing
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_a.clinic_owner'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: practice owner is an admin'; end if;
  r := public.clinic_publish_record(current_setting('part_a.patient')::uuid, 'vaccination', gen_random_uuid());
  if r->>'error' = 'pet_archived' or r->>'error' in ('forbidden', 'role_not_permitted', 'not_linked') then
    raise exception 'FAIL: publish before archive answered %', r;
  end if;
  raise notice 'ok: publish before archive gets past the pet (%)', r->>'error';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. The owner: an invalid reason is refused (22023), then the archive works
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_a.owner'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;

  -- The guard (20261007000002): pets_owner_write would otherwise let the
  -- owner archive by hand, skipping every consequence below.
  begin
    update public.pets set deleted_at = now(), archived_reason = 'mistake'
     where id = current_setting('part_a.pet')::uuid;
    raise exception 'FAIL: owner archived by direct UPDATE';
  exception when insufficient_privilege then
    raise notice 'ok: direct archive UPDATE refused (42501)';
  end;

  begin
    insert into public.pets (owner_id, name, species, deleted_at, archived_reason)
    values (auth.uid(), 'Part A ghost', 'dog', now(), 'passed_away');
    raise exception 'FAIL: owner created a pet already archived';
  exception when insufficient_privilege then
    raise notice 'ok: pre-archived INSERT refused (42501)';
  end;

  begin
    perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, 'ran_away');
    raise exception 'FAIL: invalid reason accepted';
  exception when invalid_parameter_value then
    raise notice 'ok: invalid reason refused (22023)';
  end;

  begin
    perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, null);
    raise exception 'FAIL: null reason accepted';
  exception when invalid_parameter_value then
    raise notice 'ok: null reason refused (22023)';
  end;

  perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, 'passed_away');
  raise notice 'ok: owner archived the pet';

  -- The owner still READS it (RLS is the floor) — the In memory list needs that.
  if not exists (select 1 from public.pets
                  where id = current_setting('part_a.pet')::uuid
                    and deleted_at is not null and archived_reason = 'passed_away') then
    raise exception 'FAIL: owner cannot read the archived pet with its reason';
  end if;
  raise notice 'ok: owner reads the archived pet, reason passed_away';

  -- A second archive is refused.
  begin
    perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, 'rehomed');
    raise exception 'FAIL: a second archive was accepted';
  exception when insufficient_privilege then
    raise notice 'ok: second archive refused (42501)';
  end;

  -- The owner cannot un-archive, nor rewrite the reason (the guard).
  begin
    update public.pets set deleted_at = null, archived_reason = null
     where id = current_setting('part_a.pet')::uuid;
    raise exception 'FAIL: owner un-archived by direct UPDATE';
  exception when insufficient_privilege then
    raise notice 'ok: un-archive refused (42501)';
  end;
  begin
    update public.pets set archived_reason = 'mistake' where id = current_setting('part_a.pet')::uuid;
    raise exception 'FAIL: owner rewrote the archive reason';
  exception when insufficient_privilege then
    raise notice 'ok: reason rewrite refused (42501)';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Consequences, read as the connection role (authoritative, no RLS)
-- ---------------------------------------------------------------------------
do $$
declare v_pet uuid := current_setting('part_a.pet')::uuid;
begin
  -- Past the guard (not a client role), the constraint still holds the two
  -- columns together.
  begin
    update public.pets set archived_reason = null where id = v_pet;
    raise exception 'FAIL: archived_reason cleared while deleted_at is set';
  exception when check_violation then
    raise notice 'ok: archived_reason/deleted_at must agree (23514)';
  end;

  if exists (select 1 from public.record_shares where pet_id = v_pet and revoked_at is null) then
    raise exception 'FAIL: an open record share survived the archive';
  end if;
  raise notice 'ok: every record share revoked';

  if exists (select 1 from public.record_desk_codes where pet_id = v_pet and redeemed_at is null) then
    raise exception 'FAIL: an unredeemed desk code survived the archive';
  end if;
  raise notice 'ok: unredeemed desk codes deleted';

  if exists (select 1 from public.pet_care_tasks where pet_id = v_pet and is_active) then
    raise exception 'FAIL: an active care task survived the archive';
  end if;
  raise notice 'ok: care tasks inactive';

  if not exists (select 1 from public.audit_log
                  where action = 'pet.archived' and entity_id = v_pet
                    and actor_id = current_setting('part_a.owner')::uuid
                    and metadata->>'reason' = 'passed_away') then
    raise exception 'FAIL: no audit_log row for the archive';
  end if;
  raise notice 'ok: audit_log written';

  if pg_temp.part_a_directory_counts() <> array[
       split_part(current_setting('part_a.dir_before'), ',', 1)::int - 1,
       split_part(current_setting('part_a.dir_before'), ',', 2)::int - 1] then
    raise exception 'FAIL: emergency_directory counts % after archive, % before',
      pg_temp.part_a_directory_counts(), current_setting('part_a.dir_before');
  end if;
  raise notice 'ok: emergency_directory no longer lists the pet';
end $$;

-- ---------------------------------------------------------------------------
-- 5. The manager's registry query no longer returns it — though RLS alone
--    still would, which is exactly why the query filters
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_a.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  if (select count(*) from public.pets
       where building_id = current_setting('part_a.building')::uuid
         and id = current_setting('part_a.pet')::uuid and deleted_at is null) <> 0 then
    raise exception 'FAIL: manager registry still returns the archived pet';
  end if;
  raise notice 'ok: manager registry query no longer returns the pet';
  raise notice 'info: unfiltered, RLS still shows the manager % row(s) — the floor, not the filter',
    (select count(*) from public.pets where id = current_setting('part_a.pet')::uuid);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5b. The practice cannot publish onto the removed pet
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_a.clinic_owner'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.clinic_publish_record(current_setting('part_a.patient')::uuid, 'vaccination', gen_random_uuid());
  if r->>'error' is distinct from 'pet_archived' then
    raise exception 'FAIL: publish after archive answered %', r;
  end if;
  raise notice 'ok: publish onto an archived pet refused (pet_archived)';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. anon cannot call it at all
-- ---------------------------------------------------------------------------
set local role anon;
do $$
begin
  begin
    perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, 'mistake');
    raise exception 'FAIL: anon executed owner_archive_pet';
  exception when insufficient_privilege then
    raise notice 'ok: anon has no EXECUTE (42501)';
  end;
end $$;
reset role;

rollback to savepoint checks; reset role;


-- ===== checks part-b =====
-- Part B — manager tools, impersonated, in ONE rolled-back transaction.
--
-- Not yet run: written before 20261008000001…000007 were applied (no database
-- was reachable from the session that wrote it). Run it after they are, as the
-- project's own connection role (the Supabase SQL editor or MCP `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-b.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written: the fixtures it
-- plants (two fines, pet documents, an empty building) and the archive all
-- roll back.
--
-- Actors come from live data: Maple Court Residences (MCR2026), a non-admin
-- manager of it, a current pet in it with its owner, and a non-admin owner
-- from a different building. Each is asserted is_admin() = false inside its
-- own impersonation, because most checks carry is_admin() as a disjunct.

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_building uuid; v_pet uuid; v_owner uuid; v_manager uuid; v_other uuid;
  v_vio uuid; v_fine uuid; v_fine2 uuid; v_doc uuid; v_doc2 uuid; v_doc3 uuid; v_admin uuid; v_empty uuid;
begin
  select b.id into v_building from public.buildings b where upper(b.building_code) = 'MCR2026';
  if v_building is null then raise exception 'FIXTURE: building MCR2026 not found'; end if;

  select p.id, p.owner_id into v_pet, v_owner
    from public.pets p join public.profiles pr on pr.id = p.owner_id
   where p.building_id = v_building and p.deleted_at is null
     and not coalesce(pr.is_super_admin, false)
   order by p.created_at, p.id limit 1;
  if v_pet is null then raise exception 'FIXTURE: no current pet in MCR2026'; end if;

  select bm.profile_id into v_manager
    from public.building_managers bm join public.profiles pr on pr.id = bm.profile_id
   where bm.building_id = v_building and bm.profile_id <> v_owner
     and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   limit 1;
  if v_manager is null then raise exception 'FIXTURE: no non-admin manager of MCR2026'; end if;

  select p.owner_id into v_other
    from public.pets p join public.profiles pr on pr.id = p.owner_id
   where p.owner_id <> v_owner and p.building_id is distinct from v_building
     and not coalesce(pr.is_super_admin, false)
     and not exists (select 1 from public.building_managers bm
                      where bm.building_id = v_building and bm.profile_id = p.owner_id)
   limit 1;
  if v_other is null then raise exception 'FIXTURE: no owner outside MCR2026'; end if;

  -- A case to hang the fine on, when the building has one; the RPC handles a
  -- fine without a case too, and that path is exercised by the second fine.
  select v.id into v_vio from public.violations v
   where v.building_id = v_building and v.resolved_at is null
   order by v.created_at limit 1;

  insert into public.fines (violation_id, building_id, resident_id, amount_cents, currency, status)
  values (v_vio, v_building, v_owner, 12345, 'cad', 'issued')
  returning id into v_fine;
  insert into public.fines (violation_id, building_id, resident_id, amount_cents, currency, status)
  values (null, v_building, v_owner, 5000, 'cad', 'issued')
  returning id into v_fine2;

  insert into public.pet_documents (pet_id, kind, name, status, storage_path)
  values (v_pet, 'municipal_license', 'Part B licence', 'current', v_owner || '/' || v_pet || '/partb.pdf')
  returning id into v_doc;
  insert into public.pet_documents (pet_id, kind, name, status, storage_path)
  values (v_pet, 'liability_insurance', 'Part B insurance (no file)', 'current', null)
  returning id into v_doc2;
  -- Lapsed yesterday, with a file: approve must be refused.
  insert into public.pet_documents (pet_id, kind, name, status, storage_path, expires_on)
  values (v_pet, 'vaccination', 'Part B lapsed', 'expired', v_owner || '/' || v_pet || '/lapsed.pdf', current_date - 1)
  returning id into v_doc3;

  -- An admin, for admin_building_history (it returns nothing to anyone else).
  select pr.id into v_admin from public.profiles pr
   where pr.is_super_admin and not pr.is_suspended limit 1;
  if v_admin is null then raise exception 'FIXTURE: no active super admin'; end if;

  -- A building nobody has used: the only kind Delete is offered for.
  insert into public.buildings (name, building_code)
  values ('Part B empty building', 'PB' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)))
  returning id into v_empty;

  perform set_config('part_b.building', v_building::text, true);
  perform set_config('part_b.pet', v_pet::text, true);
  perform set_config('part_b.owner', v_owner::text, true);
  perform set_config('part_b.manager', v_manager::text, true);
  perform set_config('part_b.other', v_other::text, true);
  perform set_config('part_b.vio', coalesce(v_vio::text, ''), true);
  perform set_config('part_b.fine', v_fine::text, true);
  perform set_config('part_b.fine2', v_fine2::text, true);
  perform set_config('part_b.doc', v_doc::text, true);
  perform set_config('part_b.doc2', v_doc2::text, true);
  perform set_config('part_b.doc3', v_doc3::text, true);
  perform set_config('part_b.admin', v_admin::text, true);
  perform set_config('part_b.empty', v_empty::text, true);
  raise notice 'fixtures: building % manager % owner % other % case %', v_building, v_manager, v_owner, v_other, v_vio;
end $$;

-- ===========================================================================
-- 1. Fines
-- ===========================================================================

-- 1a. A non-manager is refused, and the fine does not move.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: other user is an admin'; end if;
  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'paid');
  if r->>'error' is distinct from 'forbidden' then
    raise exception 'FAIL: non-manager got % from manager_set_fine_status', r;
  end if;
  raise notice 'ok: non-manager refused (forbidden)';
end $$;
reset role;

-- 1b. The manager: direct UPDATE now changes nothing; illegal targets refused;
--     issued -> paid works; paid -> waived refused.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; n integer;
begin
  if public.is_admin() then raise exception 'FIXTURE: manager is an admin'; end if;

  update public.fines set status = 'waived' where id = current_setting('part_b.fine')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a manager''s direct UPDATE on fines touched % row(s)', n; end if;
  raise notice 'ok: direct UPDATE on fines refused (0 rows; fines_manager_update is gone)';

  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'disputed');
  if r->>'error' is distinct from 'illegal_transition' then
    raise exception 'FAIL: issued -> disputed returned %', r;
  end if;
  raise notice 'ok: issued -> disputed refused (illegal_transition)';

  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'issued');
  if r->>'error' is distinct from 'illegal_transition' then
    raise exception 'FAIL: issued -> issued returned %', r;
  end if;
  raise notice 'ok: issued -> issued refused (illegal_transition)';

  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'paid', 'Cheque received');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL: issued -> paid returned %', r;
  end if;
  raise notice 'ok: issued -> paid accepted %', r;

  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'waived');
  if r->>'error' is distinct from 'illegal_transition' or r->>'from' is distinct from 'paid' then
    raise exception 'FAIL: paid -> waived returned %', r;
  end if;
  raise notice 'ok: paid -> waived refused (illegal_transition, from paid)';

  r := public.manager_set_fine_status(current_setting('part_b.fine2')::uuid, 'waived');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL: issued -> waived on a fine with no case returned %', r;
  end if;
  raise notice 'ok: issued -> waived accepted on a fine with no case';
end $$;
reset role;

-- 1c. What it wrote, read as the connection role.
do $$
declare v_vio text := current_setting('part_b.vio');
begin
  if (select status from public.fines where id = current_setting('part_b.fine')::uuid) <> 'paid' then
    raise exception 'FAIL: fine is not paid';
  end if;
  if not exists (select 1 from public.audit_log
                  where action = 'fine.status_changed' and entity_id = current_setting('part_b.fine')::uuid
                    and metadata->>'from' = 'issued' and metadata->>'to' = 'paid') then
    raise exception 'FAIL: trg_fines_settlement_event wrote no audit row';
  end if;
  raise notice 'ok: settlement audit row written by the existing trigger';

  if v_vio <> '' then
    if not exists (select 1 from public.violation_events
                    where violation_id = v_vio::uuid and from_stage = to_stage
                      and note like 'Fine of 123.45 CAD marked paid: Cheque received') then
      raise exception 'FAIL: no violation_events self-transition for the payment';
    end if;
    raise notice 'ok: violation_events row written on the case';
  else
    raise notice 'info: MCR2026 has no open case; the violation_events path was not exercised';
  end if;

  if not exists (select 1 from public.notifications
                  where profile_id = current_setting('part_b.owner')::uuid and kind = 'compliance'
                    and title = 'Fine recorded as paid' and body like '%Cheque received%') then
    raise exception 'FAIL: the resident was not notified of the payment';
  end if;
  raise notice 'ok: resident notified (compliance)';
end $$;

-- ===========================================================================
-- 2. Municipal reports
-- ===========================================================================
do $$
declare v_result text := pg_get_function_result('public.manager_municipal_reports(uuid)'::regprocedure);
begin
  -- 20261008000005: an area summary. Nothing a reporter could be recognised
  -- by — no description, location, reference, evidence, nor reporter fields.
  if v_result ~* '(reporter|anonymous|ip_hash|latitude|longitude|postal|evidence|description|location|reference)' then
    raise exception 'FAIL: manager_municipal_reports exposes %', v_result;
  end if;
  raise notice 'ok: manager_municipal_reports returns only %', v_result;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform * from public.manager_municipal_reports(current_setting('part_b.building')::uuid);
    raise exception 'FAIL: a non-manager read municipal reports for MCR2026';
  exception when insufficient_privilege then
    raise notice 'ok: non-manager refused municipal reports (42501)';
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
declare n integer;
begin
  select count(*) into n from public.manager_municipal_reports(current_setting('part_b.building')::uuid);
  raise notice 'ok: manager reads % municipal report(s) for MCR2026', n;
  -- The table itself stays closed to them.
  if exists (select 1 from public.municipal_reports where reporter_id is distinct from auth.uid()) then
    raise exception 'FAIL: a manager can read municipal_reports rows directly';
  end if;
  raise notice 'ok: municipal_reports itself is still unreadable to the manager';

  -- The area is admin-set. Changing the postal code (which a manager may) does
  -- not move it; changing municipality_id is refused.
  perform set_config('part_b.muni_before', n::text, true);
  update public.buildings set postal_code = 'V5H 0A1' where id = current_setting('part_b.building')::uuid;
  select count(*) into n from public.manager_municipal_reports(current_setting('part_b.building')::uuid);
  if n <> current_setting('part_b.muni_before')::int then
    raise exception 'FAIL: editing the postal code changed which reports the manager sees (% -> %)',
      current_setting('part_b.muni_before'), n;
  end if;
  raise notice 'ok: postal code edit does not move the manager''s area';

  begin
    update public.buildings set municipality_id = (select m.id from public.municipalities m
                                                     where m.id is distinct from
                                                       (select b.municipality_id from public.buildings b
                                                         where b.id = current_setting('part_b.building')::uuid)
                                                     limit 1)
     where id = current_setting('part_b.building')::uuid;
    raise exception 'FAIL: a manager changed their building''s municipality';
  exception when insufficient_privilege then
    raise notice 'ok: manager cannot change municipality_id (42501)';
  end;
end $$;
reset role;

-- ===========================================================================
-- 3. Pet document review
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.manager_review_pet_document(current_setting('part_b.doc')::uuid, 'approve');
  if r->>'error' is distinct from 'forbidden' then
    raise exception 'FAIL: non-manager review returned %', r;
  end if;
  raise notice 'ok: non-manager refused document review (forbidden)';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; n integer;
begin
  -- Still no direct write: since 20261014000001 a manager's UPDATE matches no
  -- row (pet_documents_update admits owner|admin only).
  update public.pet_documents set status = 'approved' where id = current_setting('part_b.doc')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a manager''s direct UPDATE on pet_documents touched % row(s)', n; end if;
  raise notice 'ok: direct UPDATE on pet_documents matches nothing for a manager';

  -- A delete produces no row, so WITH CHECK never saw it (20261014000001).
  delete from public.pet_documents where id = current_setting('part_b.doc')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a manager''s direct DELETE on pet_documents removed % row(s)', n; end if;
  raise notice 'ok: direct DELETE on pet_documents matches nothing for a manager';

  r := public.manager_review_pet_document(current_setting('part_b.doc2')::uuid, 'approve');
  if r->>'error' is distinct from 'no_file' then raise exception 'FAIL: approve without a file returned %', r; end if;
  raise notice 'ok: approve without a file refused (no_file)';

  r := public.manager_review_pet_document(current_setting('part_b.doc2')::uuid, 'reject');
  if r->>'error' is distinct from 'note_required' then raise exception 'FAIL: reject without a note returned %', r; end if;
  raise notice 'ok: reject without a note refused (note_required)';

  r := public.manager_review_pet_document(current_setting('part_b.doc')::uuid, 'maybe');
  if r->>'error' is distinct from 'verdict_required' then raise exception 'FAIL: bad verdict returned %', r; end if;
  raise notice 'ok: unknown verdict refused (verdict_required)';

  r := public.manager_review_pet_document(current_setting('part_b.doc')::uuid, 'approve');
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL: approve returned %', r; end if;
  raise notice 'ok: approve accepted';

  r := public.manager_review_pet_document(current_setting('part_b.doc')::uuid, 'approve');
  if r->>'error' is distinct from 'already_reviewed' then raise exception 'FAIL: second approve returned %', r; end if;
  raise notice 'ok: second approve refused (already_reviewed)';

  r := public.manager_review_pet_document(current_setting('part_b.doc2')::uuid, 'reject', 'Please upload the certificate itself.');
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL: reject returned %', r; end if;
  raise notice 'ok: reject with a note accepted';
end $$;
reset role;

do $$
begin
  if not exists (select 1 from public.pet_documents
                  where id = current_setting('part_b.doc')::uuid and status = 'approved'
                    and provenance = 'manager_verified'
                    and verified_by = current_setting('part_b.manager')::uuid and verified_at is not null) then
    raise exception 'FAIL: approved document lacks status/provenance/verifier';
  end if;
  raise notice 'ok: approved document carries manager_verified provenance';

  if not exists (select 1 from public.notifications
                  where profile_id = current_setting('part_b.owner')::uuid and kind = 'compliance'
                    and action_target = 'pet-detail:' || current_setting('part_b.pet')
                    and body like '%Please upload the certificate itself.%') then
    raise exception 'FAIL: owner not notified of the rejection';
  end if;
  raise notice 'ok: owner notified of the rejection, with the note and the pet';

  if (select count(*) from public.audit_log
       where entity_id in (current_setting('part_b.doc')::uuid, current_setting('part_b.doc2')::uuid)
         and action in ('pet_document.approved', 'pet_document.rejected')) <> 2 then
    raise exception 'FAIL: expected two pet_document audit rows';
  end if;
  raise notice 'ok: both verdicts audited';
end $$;

-- 3b. Approving a lapsed document is refused.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.manager_review_pet_document(current_setting('part_b.doc3')::uuid, 'approve');
  if r->>'error' is distinct from 'expired' then raise exception 'FAIL: approving a lapsed document returned %', r; end if;
  raise notice 'ok: lapsed document cannot be approved (expired)';
end $$;
reset role;

-- 3c. The owner cannot forge a verdict, and a new file voids the real one.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.owner'), 'role', 'authenticated')::text, true);
do $$
declare v_new uuid;
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;

  -- The ordinary upload path (lib/data/live.ts addPetDocument) still works.
  insert into public.pet_documents (pet_id, kind, name, status, storage_path, expires_on)
  values (current_setting('part_b.pet')::uuid, 'other', 'Part B owner upload', 'current', null, null)
  returning id into v_new;
  raise notice 'ok: owner upload with no verdict columns accepted';

  begin
    insert into public.pet_documents (pet_id, kind, name, status)
    values (current_setting('part_b.pet')::uuid, 'other', 'Forged', 'approved');
    raise exception 'FAIL: owner inserted an approved document';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot insert an approved document (42501)';
  end;

  begin
    insert into public.pet_documents (pet_id, kind, name, status, provenance)
    values (current_setting('part_b.pet')::uuid, 'other', 'Forged', 'current', 'clinic_confirmed');
    raise exception 'FAIL: owner inserted a clinic_confirmed document';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot insert a clinic_confirmed document (42501)';
  end;

  begin
    update public.pet_documents set status = 'approved' where id = v_new;
    raise exception 'FAIL: owner approved their own document';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot set status approved (42501)';
  end;

  begin
    update public.pet_documents set provenance = 'manager_verified' where id = v_new;
    raise exception 'FAIL: owner set provenance manager_verified';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot set provenance (42501)';
  end;

  begin
    update public.pet_documents set verified_at = now(), verified_by = auth.uid() where id = v_new;
    raise exception 'FAIL: owner stamped verified_at/verified_by';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot stamp verified_* (42501)';
  end;

  -- The manager approved part_b.doc in section 3. A new file voids that.
  update public.pet_documents set storage_path = storage_path || '.v2'
   where id = current_setting('part_b.doc')::uuid;
  if not exists (select 1 from public.pet_documents
                  where id = current_setting('part_b.doc')::uuid
                    and status = 'current' and provenance = 'self_reported'
                    and verified_by is null and verified_at is null) then
    raise exception 'FAIL: replacing the file kept the manager''s approval';
  end if;
  raise notice 'ok: a replaced file resets status, provenance and verified_*';
end $$;
reset role;

-- ===========================================================================
-- 4. Archiving a building
-- ===========================================================================

-- 4a. Its manager cannot archive it (they may otherwise update the row).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    update public.buildings set archived_at = now() where id = current_setting('part_b.building')::uuid;
    raise exception 'FAIL: a manager archived their own building';
  exception when insufficient_privilege then
    raise notice 'ok: manager cannot archive (42501)';
  end;
end $$;
reset role;

-- 4b. Archived (as the connection role, no JWT — the admin path), the code no
--     longer resolves, and joining and reporting say invalid_code. The claims
--     are cleared first: set_config(..., true) outlives `reset role`, and the
--     guard would otherwise see the manager's uid.
select set_config('request.jwt.claims', '', true);
do $$
begin
  if (public.resolve_building_code('MCR2026')->>'valid')::boolean is distinct from true then
    raise exception 'FIXTURE: MCR2026 does not resolve before archiving';
  end if;
  update public.buildings set archived_at = now() where id = current_setting('part_b.building')::uuid;
  if (public.resolve_building_code('mcr2026')->>'valid')::boolean is distinct from false then
    raise exception 'FAIL: an archived building still resolves by code';
  end if;
  raise notice 'ok: archived building not resolvable by code';

  if public.submit_incident_report('MCR2026', 'noise', 'Part B test')->>'error' is distinct from 'invalid_code' then
    raise exception 'FAIL: an archived building accepted an incident report';
  end if;
  raise notice 'ok: archived building refuses incident reports (invalid_code)';

  if exists (select 1 from public.targetable_buildings() t where t.id = current_setting('part_b.building')::uuid) then
    raise exception 'FAIL: an archived building is still targetable';
  end if;
  raise notice 'ok: archived building not targetable';
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.request_building_link('MCR2026')->>'error' is distinct from 'invalid_code' then
    raise exception 'FAIL: an archived building accepted a join request';
  end if;
  raise notice 'ok: archived building refuses join requests (invalid_code)';
end $$;
reset role;

-- 4c. The guest pet picker no longer resolves it, and a direct pending
--     resident_links insert into it is refused.
select set_config('request.jwt.claims', '', true);
do $$
begin
  if (public.building_pets_for_report('MCR2026')->>'valid')::boolean is distinct from false then
    raise exception 'FAIL: building_pets_for_report still lists an archived building''s pets';
  end if;
  raise notice 'ok: building_pets_for_report refuses an archived building';
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    insert into public.resident_links (profile_id, building_id, status)
    values (auth.uid(), current_setting('part_b.building')::uuid, 'pending');
    raise exception 'FAIL: a direct resident_links insert into an archived building was accepted';
  exception when insufficient_privilege then
    raise notice 'ok: links_insert_self refuses an archived building (42501)';
  end;
end $$;
reset role;

-- 4d. admin_building_history counts cascading tables too: MCR2026 (pets,
--     residents, units…) has history; a building nobody used has none; and a
--     non-admin gets nothing.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.admin'), 'role', 'authenticated')::text, true);
do $$
declare v_used record; v_empty record;
begin
  if not public.is_admin() then raise exception 'FIXTURE: admin is not is_admin()'; end if;
  select * into v_used from public.admin_building_history() h
   where h.building_id = current_setting('part_b.building')::uuid;
  if v_used.total is null or v_used.total = 0 or (v_used.counts->>'pets')::int = 0 then
    raise exception 'FAIL: MCR2026 history %', v_used;
  end if;
  raise notice 'ok: MCR2026 has history (total %, pets %)', v_used.total, v_used.counts->>'pets';
  select * into v_empty from public.admin_building_history() h
   where h.building_id = current_setting('part_b.empty')::uuid;
  if v_empty.total is distinct from 0 then
    raise exception 'FAIL: an unused building reports history %', v_empty;
  end if;
  raise notice 'ok: an unused building has none (only it may be deleted)';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  if exists (select 1 from public.admin_building_history()) then
    raise exception 'FAIL: a manager read admin_building_history';
  end if;
  raise notice 'ok: admin_building_history returns nothing to a non-admin';
end $$;
reset role;

-- ===========================================================================
-- 5. A pet's records: managers read, never write (20261014000001)
-- ===========================================================================
do $$
declare v text;
begin
  select string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', ') into v
    from pg_catalog.pg_policies
   where schemaname = 'public'
     and tablename in ('care_entries', 'care_targets', 'pet_activity', 'pet_care_tasks',
                       'pet_documents', 'pet_emergency_contacts', 'pet_feeding', 'pet_medications',
                       'pet_photos', 'pet_vaccinations', 'pet_vet_visits')
     and cmd <> 'SELECT'
     and (coalesce(qual, '') like '%manages_building%' or coalesce(with_check, '') like '%manages_building%');
  if v is not null then raise exception 'FAIL: a write policy admits managers: %', v; end if;
  raise notice 'ok: no write policy on a pet''s records admits a manager';
end $$;

rollback to savepoint checks; reset role;


-- ===== checks part-c =====
-- Part C — business tiers and sign-up intent, impersonated, in ONE rolled-back
-- transaction.
--
-- Not yet run: written before 20261009000001…000003 were applied (no database
-- was reachable from the session that wrote it). Run it after they are, as the
-- project's own connection role (the Supabase SQL editor or MCP `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-c.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written: the two businesses,
-- the requests and the pending signup it plants all roll back.
--
-- Actors come from live data: two non-admin, unsuspended profiles (the owners
-- of two fresh businesses) and an active super admin. Each is asserted
-- is_admin() inside its own impersonation.

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare v_owner uuid; v_other uuid; v_admin uuid; v_biz uuid; v_biz2 uuid;
begin
  select pr.id into v_owner from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_other from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended and pr.id <> v_owner
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_admin from public.profiles pr
   where pr.is_super_admin and not pr.is_suspended limit 1;
  if v_owner is null or v_other is null then raise exception 'FIXTURE: need two non-admin profiles'; end if;
  if v_admin is null then raise exception 'FIXTURE: no active super admin'; end if;

  insert into public.businesses (owner_id, name, category)
  values (v_owner, 'Part C Clinic', 'Veterinary') returning id into v_biz;
  insert into public.businesses (owner_id, name, category)
  values (v_other, 'Part C Groomer', 'Grooming') returning id into v_biz2;

  perform set_config('part_c.owner', v_owner::text, true);
  perform set_config('part_c.other', v_other::text, true);
  perform set_config('part_c.admin', v_admin::text, true);
  perform set_config('part_c.biz', v_biz::text, true);
  perform set_config('part_c.biz2', v_biz2::text, true);
  raise notice 'fixtures: owner % other % admin % biz % biz2 %', v_owner, v_other, v_admin, v_biz, v_biz2;
end $$;

-- ===========================================================================
-- 1. A non-admin cannot move a tier — not by RPC, not directly
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_c.owner'), 'role', 'authenticated')::text, true);
do $$
declare v_biz uuid := current_setting('part_c.biz')::uuid; refused boolean;
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;

  refused := false;
  begin
    perform public.admin_set_business_tier(v_biz, 'verified');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: owner called admin_set_business_tier'; end if;
  raise notice 'ok: admin_set_business_tier refused for the owner (42501)';

  refused := false;
  begin
    update public.businesses set tier = 'verified' where id = v_biz;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: owner updated their own tier'; end if;
  raise notice 'ok: direct UPDATE of tier refused (42501)';

  refused := false;
  begin
    update public.businesses set is_verified = true where id = v_biz;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: owner updated their own is_verified'; end if;
  raise notice 'ok: direct UPDATE of is_verified refused (42501)';

  refused := false;
  begin
    insert into public.businesses (owner_id, name, category, tier)
    values (auth.uid(), 'Born verified', 'Other', 'listed');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: owner created a business already listed'; end if;
  raise notice 'ok: INSERT above registered refused (42501)';

  -- An ordinary edit still works.
  update public.businesses set description = 'Part C edit' where id = v_biz;
  if not found then raise exception 'FAIL: owner could not edit their own business'; end if;
  raise notice 'ok: owner still edits other columns';
end $$;
reset role;

-- ===========================================================================
-- 2. Verification requests: own business only, born unreviewed, one open
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_c.owner'), 'role', 'authenticated')::text, true);
do $$
declare v_biz uuid := current_setting('part_c.biz')::uuid; v_biz2 uuid := current_setting('part_c.biz2')::uuid;
        refused boolean; v_req uuid;
begin
  insert into public.business_verifications (business_id, kind, status)
  values (v_biz, 'licence', 'submitted') returning id into v_req;
  perform set_config('part_c.req', v_req::text, true);
  raise notice 'ok: owner requested verification for their own business';

  refused := false;
  begin
    insert into public.business_verifications (business_id, kind, status) values (v_biz2, 'licence', 'submitted');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: owner requested verification for someone else''s business'; end if;
  raise notice 'ok: request for another business refused (RLS)';

  refused := false;
  begin
    insert into public.business_verifications (business_id, kind, status, note)
    values (v_biz, 'listing', 'submitted', 'Approved by me');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: a request was born with a review note'; end if;
  raise notice 'ok: a request cannot arrive pre-reviewed';

  refused := false;
  begin
    insert into public.business_verifications (business_id, kind, status) values (v_biz, 'licence', 'submitted');
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'FAIL: a second open licence request was accepted'; end if;
  raise notice 'ok: one open request per kind';
end $$;
reset role;

-- ===========================================================================
-- 3. The admin: reject needs a note; approve verifies; tier moves stay in step
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_c.admin'), 'role', 'authenticated')::text, true);
do $$
declare v_biz uuid := current_setting('part_c.biz')::uuid; v_biz2 uuid := current_setting('part_c.biz2')::uuid;
        v_req uuid := current_setting('part_c.req')::uuid; refused boolean; b record;
begin
  if not public.is_admin() then raise exception 'FIXTURE: admin is not is_admin()'; end if;

  refused := false;
  begin
    perform public.admin_review_business_verification(v_req, false, '   ');
  exception when invalid_parameter_value then refused := true;
  end;
  if not refused then raise exception 'FAIL: a rejection without a note was accepted'; end if;
  raise notice 'ok: reject requires a note';

  perform public.admin_review_business_verification(v_req, true);
  select tier, is_verified into b from public.businesses where id = v_biz;
  if b.tier <> 'verified' or not b.is_verified then
    raise exception 'FAIL: approval left tier=% is_verified=%', b.tier, b.is_verified;
  end if;
  if (select status from public.business_verifications where id = v_req) <> 'approved' then
    raise exception 'FAIL: approved request is not approved';
  end if;
  raise notice 'ok: approve → tier verified, is_verified true, request approved';

  refused := false;
  begin
    perform public.admin_review_business_verification(v_req, false, 'late');
  exception when invalid_parameter_value then refused := true;
  end;
  if not refused then raise exception 'FAIL: a decided request was decided again'; end if;
  raise notice 'ok: a decided request stays decided';

  perform public.admin_set_business_tier(v_biz2, 'listed', 'Looks good');
  select tier, is_verified into b from public.businesses where id = v_biz2;
  if b.tier <> 'listed' or b.is_verified then
    raise exception 'FAIL: listed left tier=% is_verified=%', b.tier, b.is_verified;
  end if;
  raise notice 'ok: admin sets listed (is_verified false)';

  perform public.admin_set_business_tier(v_biz, 'registered');
  select tier, is_verified into b from public.businesses where id = v_biz;
  if b.tier <> 'registered' or b.is_verified then
    raise exception 'FAIL: lowering left tier=% is_verified=%', b.tier, b.is_verified;
  end if;
  raise notice 'ok: admin lowers to registered (is_verified false)';
end $$;
reset role;

-- 3b. What the admin's calls wrote, as the connection role; then the CHECK.
do $$
declare v_biz uuid := current_setting('part_c.biz')::uuid; v_biz2 uuid := current_setting('part_c.biz2')::uuid;
        refused boolean;
begin
  if (select count(*) from public.audit_log where action = 'business.tier_set' and entity_id = v_biz) <> 2 then
    raise exception 'FAIL: expected two tier_set audit rows for the clinic';
  end if;
  if not exists (select 1 from public.notifications
                  where profile_id = current_setting('part_c.other')::uuid and kind = 'system'
                    and title = 'Part C Groomer is listed' and body like '%Looks good%') then
    raise exception 'FAIL: the groomer''s owner was not notified';
  end if;
  if not exists (select 1 from public.audit_log
                  where action = 'business.verification_approved' and entity_id = v_biz
                    and metadata->>'request_id' = current_setting('part_c.req')) then
    raise exception 'FAIL: the request approval was not audited';
  end if;
  raise notice 'ok: audited and notified';

  refused := false;
  begin
    update public.businesses set is_verified = true where id = v_biz2;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'FAIL: is_verified drifted from tier'; end if;
  raise notice 'ok: businesses_verified_tier_ck pins is_verified to tier';
end $$;

-- 3c. A listed business is readable by an unrelated signed-in user.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_c.owner'), 'role', 'authenticated')::text, true);
do $$
begin
  if not exists (select 1 from public.businesses where id = current_setting('part_c.biz2')::uuid) then
    raise exception 'FAIL: a listed business is not readable by owners';
  end if;
  raise notice 'ok: listed business readable (businesses_select)';
end $$;
reset role;

-- ===========================================================================
-- 4. pending_signups carries a business intent
-- ===========================================================================
do $$
declare r record; refused boolean;
begin
  insert into public.pending_signups (email, code_hash, full_name, expires_at, intent, business)
  values ('part-c@example.invalid', 'x', 'Part C', now() + interval '15 minutes', 'business',
          jsonb_build_object('businessName', 'Part C Paws', 'category', 'Grooming'));
  select intent, business into r from public.pending_signups where email = 'part-c@example.invalid';
  if r.intent <> 'business' or r.business->>'businessName' <> 'Part C Paws' or r.business->>'category' <> 'Grooming' then
    raise exception 'FAIL: pending business row read back as %', r;
  end if;
  raise notice 'ok: business pending row round-trips';

  insert into public.pending_signups (email, code_hash, expires_at)
  values ('part-c-resident@example.invalid', 'x', now() + interval '15 minutes');
  if (select intent from public.pending_signups where email = 'part-c-resident@example.invalid') <> 'resident' then
    raise exception 'FAIL: intent did not default to resident';
  end if;
  raise notice 'ok: intent defaults to resident';

  refused := false;
  begin
    insert into public.pending_signups (email, code_hash, expires_at, intent)
    values ('part-c-bad@example.invalid', 'x', now() + interval '15 minutes', 'business');
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'FAIL: a business intent without details was accepted'; end if;
  raise notice 'ok: business intent requires details';
end $$;

-- 4b. Still unreachable from a client role.
set local role authenticated;
do $$
declare refused boolean := false;
begin
  begin
    perform 1 from public.pending_signups limit 1;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: authenticated can read pending_signups'; end if;
  raise notice 'ok: pending_signups stays service-role only';
end $$;
reset role;

rollback to savepoint checks; reset role;


-- ===== checks part-e =====
-- Part E — owner bills, impersonated, in ONE rolled-back transaction.
--
-- Covers 20261010000001 (owners never read drafts; owner_approve_estimate
-- takes an estimate only and notifies the practice; clinic_set_invoice_status
-- notifies the owner on draft -> sent) and 20261010000002 (business_staff_guard:
-- a manager cannot promote themselves, touch the owner's row, or hand out
-- `owner`).
--
-- Not yet run: written before 20261010000001 was applied (no database was
-- reachable from the session that wrote it). Run it after it is, as the
-- project's own connection role (the Supabase SQL editor or MCP `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-e.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written: the practice, its
-- chart, the invoices and the notifications all roll back.
--
-- Actors come from live data: a non-admin owner of a current pet, and three
-- other non-admin, unsuspended profiles — the practice's owner, a manager on
-- its staff, and an unrelated person. Each impersonation asserts
-- is_admin() = false, since policies carry is_admin() as a disjunct.

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_pet uuid; v_owner uuid; v_clinic_owner uuid; v_manager uuid; v_other uuid;
  v_biz uuid; v_customer uuid; v_patient uuid;
  v_draft uuid; v_est uuid; v_inv uuid; v_est_draft uuid;
begin
  select p.id, p.owner_id into v_pet, v_owner
    from public.pets p join public.profiles pr on pr.id = p.owner_id
   where p.deleted_at is null and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by p.created_at, p.id limit 1;
  if v_pet is null then raise exception 'FIXTURE: no current pet with a non-admin owner'; end if;

  select pr.id into v_clinic_owner from public.profiles pr
   where pr.id <> v_owner and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_manager from public.profiles pr
   where pr.id not in (v_owner, v_clinic_owner)
     and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_other from public.profiles pr
   where pr.id not in (v_owner, v_clinic_owner, v_manager)
     and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  if v_clinic_owner is null or v_manager is null or v_other is null then
    raise exception 'FIXTURE: need four non-admin profiles';
  end if;

  -- business_bootstrap gives the owner a `veterinarian` staff row.
  insert into public.businesses (owner_id, name, category, business_kind)
  values (v_clinic_owner, 'Part E Clinic', 'Veterinary', 'veterinary') returning id into v_biz;
  insert into public.business_staff (business_id, profile_id, role, is_active)
  values (v_biz, v_manager, 'manager', true);

  insert into public.clinic_customers (business_id, profile_id, first_name)
  values (v_biz, v_owner, 'Part E') returning id into v_customer;
  insert into public.clinic_patients (business_id, customer_id, pet_id, name)
  values (v_biz, v_customer, v_pet, 'Part E patient') returning id into v_patient;

  insert into public.invoices (business_id, customer_id, patient_id, kind, status)
  values (v_biz, v_customer, v_patient, 'invoice', 'draft') returning id into v_draft;
  insert into public.invoice_lines (invoice_id, business_id, description, quantity, unit_price_cents)
  values (v_draft, v_biz, 'Draft line', 1, 5000);

  insert into public.invoices (business_id, customer_id, patient_id, kind, status, number)
  values (v_biz, v_customer, v_patient, 'estimate', 'sent', 'E-1') returning id into v_est;
  insert into public.invoice_lines (invoice_id, business_id, description, quantity, unit_price_cents)
  values (v_est, v_biz, 'Dental estimate', 1, 42000);

  insert into public.invoices (business_id, customer_id, patient_id, kind, status)
  values (v_biz, v_customer, v_patient, 'invoice', 'sent') returning id into v_inv;

  insert into public.invoices (business_id, customer_id, patient_id, kind, status)
  values (v_biz, v_customer, v_patient, 'estimate', 'draft') returning id into v_est_draft;

  perform set_config('part_e.pet', v_pet::text, true);
  perform set_config('part_e.owner', v_owner::text, true);
  perform set_config('part_e.clinic_owner', v_clinic_owner::text, true);
  perform set_config('part_e.manager', v_manager::text, true);
  perform set_config('part_e.other', v_other::text, true);
  perform set_config('part_e.draft', v_draft::text, true);
  perform set_config('part_e.est', v_est::text, true);
  perform set_config('part_e.inv', v_inv::text, true);
  perform set_config('part_e.est_draft', v_est_draft::text, true);
  perform set_config('part_e.biz', v_biz::text, true);
  raise notice 'fixtures: owner % clinic owner % manager % other % biz %',
    v_owner, v_clinic_owner, v_manager, v_other, v_biz;
end $$;

-- ===========================================================================
-- 1. The owner never reads a draft — invoice or line
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.owner'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;
  if exists (select 1 from public.invoices where id = current_setting('part_e.draft')::uuid) then
    raise exception 'FAIL: owner read a draft invoice';
  end if;
  if exists (select 1 from public.invoice_lines where invoice_id = current_setting('part_e.draft')::uuid) then
    raise exception 'FAIL: owner read a draft invoice''s lines';
  end if;
  if exists (select 1 from public.invoices where id = current_setting('part_e.est_draft')::uuid) then
    raise exception 'FAIL: owner read a draft estimate';
  end if;
  raise notice 'ok: drafts and their lines are invisible to the owner';

  if not exists (select 1 from public.invoices where id = current_setting('part_e.est')::uuid) then
    raise exception 'FAIL: owner cannot read their sent estimate';
  end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = current_setting('part_e.est')::uuid) then
    raise exception 'FAIL: owner cannot read their sent estimate''s lines';
  end if;
  if not exists (select 1 from public.invoices where id = current_setting('part_e.inv')::uuid) then
    raise exception 'FAIL: owner cannot read their sent invoice';
  end if;
  raise notice 'ok: sent estimate, its lines and sent invoice are readable';
end $$;
reset role;

-- ===========================================================================
-- 2. Approving: not an invoice, not someone else's, then the real one
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.owner'), 'role', 'authenticated')::text, true);
do $$
declare res jsonb;
begin
  res := public.owner_approve_estimate(current_setting('part_e.inv')::uuid);
  if coalesce((res->>'ok')::boolean, false) or res->>'error' <> 'not_an_estimate' then
    raise exception 'FAIL: approving an invoice answered %', res;
  end if;
  if (select status from public.invoices where id = current_setting('part_e.inv')::uuid) <> 'sent' then
    raise exception 'FAIL: the invoice moved anyway';
  end if;
  raise notice 'ok: an invoice cannot be approved (not_an_estimate)';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.other'), 'role', 'authenticated')::text, true);
do $$
declare res jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: other is an admin'; end if;
  res := public.owner_approve_estimate(current_setting('part_e.est')::uuid);
  if coalesce((res->>'ok')::boolean, false) or res->>'error' <> 'forbidden' then
    raise exception 'FAIL: another person approving the estimate answered %', res;
  end if;
  raise notice 'ok: another person cannot approve the owner''s estimate (forbidden)';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.owner'), 'role', 'authenticated')::text, true);
do $$
declare res jsonb; r record;
begin
  res := public.owner_approve_estimate(current_setting('part_e.est')::uuid);
  if not coalesce((res->>'ok')::boolean, false) then
    raise exception 'FAIL: owner could not approve their sent estimate: %', res;
  end if;
  select status, owner_approved_at into r from public.invoices where id = current_setting('part_e.est')::uuid;
  if r.status <> 'approved' or r.owner_approved_at is null then
    raise exception 'FAIL: estimate after approval reads %', r;
  end if;
  raise notice 'ok: owner approved their sent estimate';

  res := public.owner_approve_estimate(current_setting('part_e.est')::uuid);
  if coalesce((res->>'ok')::boolean, false) or res->>'error' <> 'not_awaiting_approval' then
    raise exception 'FAIL: approving twice answered %', res;
  end if;
  raise notice 'ok: a second approval is refused (not_awaiting_approval)';
end $$;
reset role;

-- 2b. The practice's administrators heard; the owner did not notify themself.
do $$
declare n int;
begin
  select count(*) into n from public.notifications
   where profile_id = current_setting('part_e.clinic_owner')::uuid
     and kind = 'clinic' and title like 'Estimate approved for %' and created_at = now();
  if n <> 1 then raise exception 'FAIL: business owner got % approval notifications, expected 1', n; end if;
  select count(*) into n from public.notifications
   where profile_id = current_setting('part_e.manager')::uuid
     and kind = 'clinic' and title like 'Estimate approved for %' and created_at = now();
  if n <> 1 then raise exception 'FAIL: manager got % approval notifications, expected 1', n; end if;
  select count(*) into n from public.notifications
   where profile_id = current_setting('part_e.owner')::uuid
     and title like 'Estimate approved for %' and created_at = now();
  if n <> 0 then raise exception 'FAIL: the approving owner was notified of their own approval'; end if;
  raise notice 'ok: business owner and manager notified, once each';
end $$;

-- ===========================================================================
-- 3. Sending a draft tells the owner, with a Bills target
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.clinic_owner'), 'role', 'authenticated')::text, true);
do $$
declare res jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: clinic owner is an admin'; end if;
  res := public.clinic_set_invoice_status(current_setting('part_e.est_draft')::uuid, 'sent');
  if not coalesce((res->>'ok')::boolean, false) then
    raise exception 'FAIL: clinic could not send its draft estimate: %', res;
  end if;
  -- A move that is not draft -> sent notifies nobody. (sent -> approved since
  -- 20261016000001: paying is clinic_record_payment now, and this zero-total
  -- invoice has nothing to pay.)
  res := public.clinic_set_invoice_status(current_setting('part_e.inv')::uuid, 'approved');
  if not coalesce((res->>'ok')::boolean, false) then
    raise exception 'FAIL: clinic could not mark its sent invoice approved: %', res;
  end if;
  raise notice 'ok: clinic sent a draft estimate and marked an invoice approved';
end $$;
reset role;

do $$
declare n int; r record;
begin
  select count(*) into n from public.notifications
   where profile_id = current_setting('part_e.owner')::uuid
     and kind = 'clinic' and action_target = 'my-vets:bills' and created_at = now();
  if n <> 1 then raise exception 'FAIL: owner got % bill notifications, expected exactly 1', n; end if;
  select title, action_label into r from public.notifications
   where profile_id = current_setting('part_e.owner')::uuid
     and action_target = 'my-vets:bills' and created_at = now();
  if r.title <> 'Estimate from Part E Clinic' or r.action_label <> 'Review estimate' then
    raise exception 'FAIL: bill notification reads %', r;
  end if;
  raise notice 'ok: owner notified once, on draft -> sent, pointing at my-vets:bills';
end $$;

-- ===========================================================================
-- 4. business_staff_guard (20261010000002)
-- ===========================================================================
-- A nurse row for the unrelated person, so the manager has an OTHER row to edit.
do $$
begin
  insert into public.business_staff (business_id, profile_id, role, is_active)
  values (current_setting('part_e.biz')::uuid, current_setting('part_e.other')::uuid, 'nurse', true);
end $$;

-- 4a. As the manager.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.manager'), 'role', 'authenticated')::text, true);
do $$
declare
  v_biz uuid := current_setting('part_e.biz')::uuid;
  v_me uuid := current_setting('part_e.manager')::uuid;
  v_owner uuid := current_setting('part_e.clinic_owner')::uuid;
  v_other uuid := current_setting('part_e.other')::uuid;
  refused boolean;
begin
  if public.is_admin() then raise exception 'FIXTURE: manager is an admin'; end if;
  if not public.can_admin_business(v_biz) then raise exception 'FIXTURE: manager cannot administer the practice'; end if;

  refused := false;
  begin
    update public.business_staff set role = 'veterinarian' where business_id = v_biz and profile_id = v_me;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager changed their own role'; end if;
  raise notice 'ok: manager cannot change their own role (42501)';

  refused := false;
  begin
    update public.business_staff set role = 'owner' where business_id = v_biz and profile_id = v_me;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager made themselves owner'; end if;
  raise notice 'ok: manager cannot make themselves owner (42501)';

  refused := false;
  begin
    update public.business_staff set is_active = false where business_id = v_biz and profile_id = v_me;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager deactivated their own row'; end if;
  raise notice 'ok: manager cannot change their own is_active (42501)';

  refused := false;
  begin
    update public.business_staff set role = 'nurse' where business_id = v_biz and profile_id = v_owner;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager changed the owner''s role'; end if;
  refused := false;
  begin
    update public.business_staff set is_active = false where business_id = v_biz and profile_id = v_owner;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager deactivated the owner''s row'; end if;
  raise notice 'ok: manager cannot change the owner''s role or is_active (42501)';

  refused := false;
  begin
    update public.business_staff set role = 'owner' where business_id = v_biz and profile_id = v_other;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager made another member owner'; end if;
  raise notice 'ok: manager cannot hand out owner (42501)';

  refused := false;
  begin
    update public.business_staff set profile_id = current_setting('part_e.owner')::uuid
     where business_id = v_biz and profile_id = v_other;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager moved a staff row to another person'; end if;
  raise notice 'ok: a staff row cannot be moved to another person (42501)';

  refused := false;
  begin
    insert into public.business_staff (business_id, profile_id, role)
    values (v_biz, current_setting('part_e.owner')::uuid, 'owner');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager added someone as owner'; end if;
  raise notice 'ok: nobody is added as owner (42501)';

  -- What a manager may still do: change another member's role and access.
  update public.business_staff set role = 'veterinarian' where business_id = v_biz and profile_id = v_other;
  if not found then raise exception 'FAIL: manager could not change another member''s role'; end if;
  update public.business_staff set is_active = false where business_id = v_biz and profile_id = v_other;
  if not found then raise exception 'FAIL: manager could not deactivate another member'; end if;
  update public.business_staff set title = 'Practice lead' where business_id = v_biz and profile_id = v_me;
  if not found then raise exception 'FAIL: manager could not edit their own title'; end if;
  raise notice 'ok: manager edits other members, and their own non-access columns';
end $$;
reset role;

-- 4b. As the business owner.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.clinic_owner'), 'role', 'authenticated')::text, true);
do $$
declare
  v_biz uuid := current_setting('part_e.biz')::uuid;
  v_me uuid := current_setting('part_e.clinic_owner')::uuid;
  refused boolean;
begin
  update public.business_staff set role = 'reception'
   where business_id = v_biz and profile_id = current_setting('part_e.manager')::uuid;
  if not found then raise exception 'FAIL: owner could not change the manager''s role'; end if;
  update public.business_staff set role = 'nurse' where business_id = v_biz and profile_id = v_me;
  if not found then raise exception 'FAIL: owner could not change their own role'; end if;
  raise notice 'ok: the owner changes the manager''s role and their own';

  refused := false;
  begin
    update public.business_staff set role = 'owner'
     where business_id = v_biz and profile_id = current_setting('part_e.other')::uuid;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: the owner handed out the owner role'; end if;
  raise notice 'ok: not even the owner hands out the owner role (42501)';
end $$;
reset role;

rollback to savepoint checks; reset role;


-- ===== checks part-d =====
-- Part D — notifications that reach people, in ONE rolled-back transaction.
--
-- Covers 20261011000001 (an incident notifies exactly its building's
-- managers; a booking notifies the business owner; confirmed / declined /
-- completed notify the customer, and the customer's own change does not),
-- 20261011000002 (preferences are the account's to change; push
-- subscriptions are own-rows only, and registering takes an endpoint over;
-- the dispatcher's claims are service-role only and never hand the same row
-- out twice) and 20261011000003/20261011000004 (no rule may choose SMS; a historic sms rule
-- stays editable) and 20261011000005 (a permanently refused email is not
-- retried).
--
-- Not yet run: written before these migrations were applied (no database was
-- reachable from the session that wrote it). Run it after they are, as the
-- project's own connection role (the Supabase SQL editor or MCP
-- `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-d.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written.
--
-- Actors come from live data: a live building that has at least one
-- unsuspended manager, and three non-admin, unsuspended profiles who manage
-- nothing — a business owner, a customer, and an unrelated person. Each
-- impersonation asserts is_admin() = false, since policies carry is_admin()
-- as a disjunct.

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_building uuid; v_code text;
  v_owner uuid; v_customer uuid; v_other uuid;
  v_biz uuid; v_service uuid;
begin
  select b.id, b.building_code into v_building, v_code
    from public.buildings b
   where b.archived_at is null and b.building_code is not null
     and exists (select 1 from public.building_managers bm
                   join public.profiles p on p.id = bm.profile_id
                  where bm.building_id = b.id and not p.is_suspended)
   order by b.created_at, b.id limit 1;
  if v_building is null then raise exception 'FIXTURE: no live building with an unsuspended manager'; end if;

  select pr.id into v_owner from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_customer from public.profiles pr
   where pr.id <> v_owner and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_other from public.profiles pr
   where pr.id not in (v_owner, v_customer) and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
   order by pr.created_at, pr.id limit 1;
  if v_owner is null or v_customer is null or v_other is null then
    raise exception 'FIXTURE: need three non-admin, non-manager profiles';
  end if;

  insert into public.businesses (owner_id, name, category)
  values (v_owner, 'Part D Grooming', 'Grooming') returning id into v_biz;
  insert into public.business_services (business_id, name, price_cents)
  values (v_biz, 'Full groom', 6500) returning id into v_service;

  -- Both on, whatever the live rows say, so the claims below can see them.
  update public.profiles set notify_email = true, notify_push = true
   where id in (v_owner, v_customer, v_other);

  perform set_config('part_d.building', v_building::text, true);
  perform set_config('part_d.code', v_code, true);
  perform set_config('part_d.owner', v_owner::text, true);
  perform set_config('part_d.customer', v_customer::text, true);
  perform set_config('part_d.other', v_other::text, true);
  perform set_config('part_d.biz', v_biz::text, true);
  perform set_config('part_d.service', v_service::text, true);
  raise notice 'fixtures: building % owner % customer % other % biz %',
    v_building, v_owner, v_customer, v_other, v_biz;
end $$;

-- ===========================================================================
-- 1. A guest's incident report notifies exactly the building's managers
-- ===========================================================================
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
do $$
declare v jsonb;
begin
  v := public.submit_incident_report(
    current_setting('part_d.code'), 'off_leash',
    'Part D test: call me on 555-0100, I am the reporter', 'Lobby', null, true);
  if not coalesce((v->>'ok')::boolean, false) then
    raise exception 'FAIL: guest report refused: %', v;
  end if;
  perform set_config('part_d.ref', v->>'reference', true);
  raise notice 'ok: a guest filed a report (%)', v->>'reference';
end $$;

reset role;
do $$
declare
  v_expected int; v_got int; v_stray int; v_leak int;
begin
  select count(*) into v_expected
    from public.building_managers bm join public.profiles p on p.id = bm.profile_id
   where bm.building_id = current_setting('part_d.building')::uuid and not p.is_suspended;

  select count(*) into v_got
    from public.notifications n
   where n.kind = 'incident'
     and n.building_id = current_setting('part_d.building')::uuid
     and n.title like '%' || current_setting('part_d.ref')
     and n.action_target = 'incidents'
     and n.profile_id in (select bm.profile_id from public.building_managers bm
                           where bm.building_id = current_setting('part_d.building')::uuid);
  if v_got <> v_expected then
    raise exception 'FAIL: % managers should be told, % were', v_expected, v_got;
  end if;

  select count(*) into v_stray
    from public.notifications n
   where n.title like '%' || current_setting('part_d.ref')
     and n.profile_id not in (select bm.profile_id from public.building_managers bm
                               join public.profiles p on p.id = bm.profile_id
                              where bm.building_id = current_setting('part_d.building')::uuid
                                and not p.is_suspended);
  if v_stray <> 0 then raise exception 'FAIL: % non-managers were told about the incident', v_stray; end if;

  -- WHERE, never WHO: the description (which carries a phone number) is not in it.
  select count(*) into v_leak
    from public.notifications n
   where n.title like '%' || current_setting('part_d.ref')
     and (coalesce(n.body, '') like '%555-0100%' or n.title like '%555-0100%');
  if v_leak <> 0 then raise exception 'FAIL: the reporter''s words reached the notification'; end if;
  raise notice 'ok: exactly the % unsuspended managers were told, and nothing the reporter wrote', v_expected;
end $$;

-- ===========================================================================
-- 2. A booking notifies the business owner
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.customer'), 'role', 'authenticated')::text, true);
do $$
declare v_id uuid;
begin
  if public.is_admin() then raise exception 'FIXTURE: customer is an admin'; end if;
  insert into public.service_bookings (business_id, customer_id, service_id, amount_cents, scheduled_for)
  values (current_setting('part_d.biz')::uuid, auth.uid(), current_setting('part_d.service')::uuid,
          6500, now() + interval '3 days')
  returning id into v_id;
  perform set_config('part_d.booking', v_id::text, true);
  raise notice 'ok: the customer booked';
end $$;

reset role;
do $$
declare v_n int; v_customer_n int;
begin
  select count(*) into v_n from public.notifications
   where profile_id = current_setting('part_d.owner')::uuid
     and kind = 'appointment' and action_target = 'business:bookings'
     and title like 'New booking request%Full groom%';
  if v_n <> 1 then raise exception 'FAIL: the business owner got % booking notifications, expected 1', v_n; end if;

  select count(*) into v_customer_n from public.notifications
   where profile_id = current_setting('part_d.customer')::uuid and kind = 'appointment';
  if v_customer_n <> 0 then raise exception 'FAIL: the customer was told about their own booking'; end if;
  raise notice 'ok: the owner, and only the owner, heard about the booking';
end $$;

-- ===========================================================================
-- 3. confirmed / declined / completed notify the customer; their own change does not
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.owner'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;
  update public.service_bookings set status = 'confirmed', responded_at = now()
   where id = current_setting('part_d.booking')::uuid;
  if not found then raise exception 'FAIL: the owner could not confirm their own booking'; end if;
  -- Writing the same status again is not news.
  update public.service_bookings set status = 'confirmed'
   where id = current_setting('part_d.booking')::uuid;
  update public.service_bookings set status = 'completed'
   where id = current_setting('part_d.booking')::uuid;
end $$;

reset role;
do $$
declare v_confirmed int; v_completed int;
begin
  select count(*) into v_confirmed from public.notifications
   where profile_id = current_setting('part_d.customer')::uuid
     and kind = 'appointment' and action_target = 'my-bookings' and title like 'Booking confirmed%';
  select count(*) into v_completed from public.notifications
   where profile_id = current_setting('part_d.customer')::uuid
     and kind = 'appointment' and action_target = 'my-bookings' and title like 'Booking completed%';
  if v_confirmed <> 1 then raise exception 'FAIL: % "confirmed" notifications, expected 1', v_confirmed; end if;
  if v_completed <> 1 then raise exception 'FAIL: % "completed" notifications, expected 1', v_completed; end if;
  raise notice 'ok: the customer was told once per real status change';
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.customer'), 'role', 'authenticated')::text, true);
do $$
begin
  -- bookings_customer_update lets the customer write their own row; whatever
  -- they set, they are not notified about their own action.
  update public.service_bookings set status = 'declined'
   where id = current_setting('part_d.booking')::uuid;
end $$;

reset role;
do $$
declare v int;
begin
  select count(*) into v from public.notifications
   where profile_id = current_setting('part_d.customer')::uuid and title like 'Booking declined%';
  if v <> 0 then raise exception 'FAIL: the customer was notified about their own change'; end if;
  raise notice 'ok: the customer''s own change notifies nobody';
end $$;

-- ===========================================================================
-- 4. Preferences are the account's own to change
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.customer'), 'role', 'authenticated')::text, true);
do $$
begin
  update public.profiles set notify_email = false, notify_push = false where id = auth.uid();
  if not found then raise exception 'FAIL: the account could not change its own preferences'; end if;
  if (select notify_email or notify_push from public.profiles where id = auth.uid()) then
    raise exception 'FAIL: preferences did not stick';
  end if;
  update public.profiles set notify_email = false where id = current_setting('part_d.other')::uuid;
  if found then raise exception 'FAIL: an account changed someone else''s preferences'; end if;
  update public.profiles set notify_email = true, notify_push = true where id = auth.uid();
  raise notice 'ok: preferences are own-row only, and guard_profile_privilege allows them';
end $$;

-- ===========================================================================
-- 5. Push subscriptions: own rows only; registering takes an endpoint over
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.other'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.register_web_push_subscription('https://push.example.test/part-d-shared', 'k1', 'a1', 'test');
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: register refused: %', v; end if;
  insert into public.web_push_subscriptions (profile_id, endpoint, p256dh, auth)
  values (auth.uid(), 'https://push.example.test/part-d-other', 'k', 'a');
  raise notice 'ok: an account registers and inserts its own subscriptions';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.customer'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  if exists (select 1 from public.web_push_subscriptions where endpoint like 'https://push.example.test/part-d-%') then
    raise exception 'FAIL: an account can see another''s push subscriptions';
  end if;

  begin
    insert into public.web_push_subscriptions (profile_id, endpoint, p256dh, auth)
    values (current_setting('part_d.other')::uuid, 'https://push.example.test/part-d-forged', 'k', 'a');
    raise exception 'FAIL: inserted a subscription for someone else';
  exception when insufficient_privilege then null;
  end;

  delete from public.web_push_subscriptions where endpoint = 'https://push.example.test/part-d-other';
  if found then raise exception 'FAIL: deleted another account''s subscription'; end if;

  v := public.register_web_push_subscription('http://insecure.example.test/x', 'k', 'a', null);
  if (v->>'error') is distinct from 'invalid_subscription' then
    raise exception 'FAIL: a non-https endpoint was accepted: %', v;
  end if;

  -- The same browser, now signed in as someone else.
  v := public.register_web_push_subscription('https://push.example.test/part-d-shared', 'k2', 'a2', 'test');
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: takeover refused: %', v; end if;
  if not exists (select 1 from public.web_push_subscriptions
                  where endpoint = 'https://push.example.test/part-d-shared' and profile_id = auth.uid()) then
    raise exception 'FAIL: the endpoint was not taken over by the signed-in account';
  end if;
  raise notice 'ok: own rows only, and a shared browser moves to whoever is signed in';
end $$;

reset role;
do $$
begin
  if (select count(*) from public.web_push_subscriptions
       where endpoint = 'https://push.example.test/part-d-shared') <> 1 then
    raise exception 'FAIL: the taken-over endpoint is held twice';
  end if;
  raise notice 'ok: one endpoint, one row';
end $$;

-- ===========================================================================
-- 6. The dispatcher's claims: service role only, and never the same row twice
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.customer'), 'role', 'authenticated')::text, true);
do $$
begin
  if has_function_privilege('authenticated', 'public.claim_notification_emails(public.notification_kind[], integer)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_notification_pushes(integer)', 'execute') then
    raise exception 'FAIL: a signed-in account can lease notifications';
  end if;
  begin
    perform public.claim_notification_pushes(10);
    raise exception 'FAIL: claim_notification_pushes ran for authenticated';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: only the service role can claim';
end $$;

reset role;
do $$
declare
  v_old uuid; v_fresh uuid; v_read uuid; v_care uuid;
  v_first uuid[]; v_second uuid[]; v_push1 uuid[]; v_push2 uuid[];
begin
  insert into public.notifications (profile_id, kind, title, created_at)
  values (current_setting('part_d.customer')::uuid, 'billing', 'Part D old enough', now() - interval '10 minutes')
  returning id into v_old;
  insert into public.notifications (profile_id, kind, title, created_at)
  values (current_setting('part_d.customer')::uuid, 'billing', 'Part D too fresh', now() - interval '30 seconds')
  returning id into v_fresh;
  insert into public.notifications (profile_id, kind, title, created_at, read_at)
  values (current_setting('part_d.customer')::uuid, 'billing', 'Part D already read', now() - interval '10 minutes', now())
  returning id into v_read;
  insert into public.notifications (profile_id, kind, title, created_at)
  values (current_setting('part_d.customer')::uuid, 'care', 'Part D push-only', now() - interval '10 minutes')
  returning id into v_care;

  select array_agg(c.id) into v_first
    from public.claim_notification_emails(array['billing', 'appointment']::public.notification_kind[], 1000) c;
  if not (v_old = any (coalesce(v_first, '{}'))) then raise exception 'FAIL: an eligible row was not claimed'; end if;
  if v_fresh = any (coalesce(v_first, '{}')) then raise exception 'FAIL: a row under two minutes old was claimed'; end if;
  if v_read = any (coalesce(v_first, '{}')) then raise exception 'FAIL: a read row was claimed for email'; end if;
  if v_care = any (coalesce(v_first, '{}')) then raise exception 'FAIL: a push-only kind was claimed for email'; end if;

  select array_agg(c.id) into v_second
    from public.claim_notification_emails(array['billing', 'appointment']::public.notification_kind[], 1000) c;
  if coalesce(v_second, '{}') && v_first then raise exception 'FAIL: a leased row was handed out twice'; end if;
  raise notice 'ok: email claims respect age, read and kind, and lease each row once';

  -- The customer holds a subscription (section 5), so push sees every kind.
  select array_agg(c.id) into v_push1 from public.claim_notification_pushes(1000) c;
  if not (v_care = any (coalesce(v_push1, '{}'))) then raise exception 'FAIL: a push-only kind was not pushed'; end if;
  if v_read = any (coalesce(v_push1, '{}')) then raise exception 'FAIL: a read row was claimed for push'; end if;
  select array_agg(c.id) into v_push2 from public.claim_notification_pushes(1000) c;
  if coalesce(v_push2, '{}') && v_push1 then raise exception 'FAIL: a push lease was handed out twice'; end if;
  raise notice 'ok: push claims take every kind and lease each row once';

  -- 20261011000005: a message Resend refused for good is never claimed again.
  update public.notifications set email_claimed_at = null, email_failed_at = now() where id = v_old;
  if exists (select 1 from public.claim_notification_emails(array['billing']::public.notification_kind[], 1000) c
              where c.id = v_old) then
    raise exception 'FAIL: a permanently refused email was claimed again';
  end if;
  update public.notifications set email_failed_at = null where id = v_old;
  raise notice 'ok: email_failed_at stops the retries';

  update public.profiles set notify_email = false where id = current_setting('part_d.customer')::uuid;
  update public.notifications set email_claimed_at = null where id = v_old;
  if exists (select 1 from public.claim_notification_emails(array['billing']::public.notification_kind[], 1000) c
              where c.id = v_old) then
    raise exception 'FAIL: email was claimed for an account that turned it off';
  end if;
  raise notice 'ok: notify_email = false stops the email claim';
end $$;

-- ===========================================================================
-- 7. No new SMS reminder rule
-- ===========================================================================
do $$
begin
  begin
    insert into public.reminder_rules (business_id, name, trigger_kind, channel)
    values (current_setting('part_d.biz')::uuid, 'Part D SMS', 'vaccination_due', 'sms');
    raise exception 'FAIL: an SMS reminder rule was saved';
  exception when check_violation then null;
  end;
  insert into public.reminder_rules (business_id, name, trigger_kind, channel)
  values (current_setting('part_d.biz')::uuid, 'Part D email', 'vaccination_due', 'email');
  begin
    update public.reminder_rules set channel = 'sms'
     where business_id = current_setting('part_d.biz')::uuid and name = 'Part D email';
    raise exception 'FAIL: a rule was switched to SMS';
  exception when check_violation then null;
  end;
  raise notice 'ok: SMS is refused on insert and on a channel change, email is accepted';
end $$;

-- A rule saved as sms before 20261011000004 is history: it stays editable.
alter table public.reminder_rules disable trigger trg_reminder_rules_refuse_sms;
insert into public.reminder_rules (business_id, name, trigger_kind, channel)
values (current_setting('part_d.biz')::uuid, 'Part D historic sms', 'vaccination_due', 'sms');
alter table public.reminder_rules enable trigger trg_reminder_rules_refuse_sms;
do $$
begin
  update public.reminder_rules set is_active = false, name = 'Part D historic sms (off)'
   where business_id = current_setting('part_d.biz')::uuid and name = 'Part D historic sms';
  if not found then raise exception 'FAIL: a historic sms rule could not be switched off'; end if;
  update public.reminder_rules set channel = 'email'
   where business_id = current_setting('part_d.biz')::uuid and name = 'Part D historic sms (off)';
  if not found then raise exception 'FAIL: a historic sms rule could not move to email'; end if;
  raise notice 'ok: a historic sms rule can be switched off and moved off sms';
end $$;

rollback to savepoint checks; reset role;


-- ===== checks part-f =====
-- Part F — admin RPCs, account deletion, the audit log, booking cancellation,
-- in ONE rolled-back transaction.
--
-- Covers 20261012000001 (deleting a profile with closed history succeeds and
-- nulls every person column while the records stay; a guard still refuses a
-- non-referential rewrite of the same column), 20261012000002 (the admin RPCs
-- refuse non-admins, and an admin cannot suspend or demote themselves),
-- the audit log's reach (a building's manager reads it, nobody else does) and
-- 20261012000004 (a customer cancels through the RPC, the business is told,
-- and the direct UPDATE path is gone). The review round added 20261012000006
-- (no direct PATCH of admin/suspension flags, admins included),
-- 20261012000007 (anonymous reports name nobody in audit_log) and
-- 20261012000008 (a client's booking insert is rewritten by the server).
--
-- Not yet run: written before these migrations were applied (no database was
-- reachable from the session that wrote it). Run it after they are, as the
-- project's own connection role (the Supabase SQL editor or MCP
-- `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-f.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written.

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_building uuid; v_manager uuid; v_outsider uuid; v_owner uuid; v_admin uuid;
  v_gone uuid := gen_random_uuid();
  v_pet uuid; v_vio uuid; v_biz uuid; v_service uuid;
begin
  select bm.building_id, bm.profile_id into v_building, v_manager
    from public.building_managers bm
    join public.profiles p on p.id = bm.profile_id
    join public.buildings b on b.id = bm.building_id
   where not p.is_suspended and not p.is_super_admin and b.archived_at is null
   order by bm.created_at, bm.id limit 1;
  if v_building is null then raise exception 'FIXTURE: no live building with a non-admin manager'; end if;

  select pr.id into v_outsider from public.profiles pr
   where not pr.is_super_admin and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_owner from public.profiles pr
   where pr.id <> v_outsider and not pr.is_super_admin and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
   order by pr.created_at, pr.id limit 1;
  if v_outsider is null or v_owner is null then raise exception 'FIXTURE: need two non-admin, non-manager profiles'; end if;

  -- An admin to impersonate: a live one, or the outsider promoted for the
  -- length of this transaction (trg_profiles_guard admits a write with no JWT).
  select id into v_admin from public.profiles where is_super_admin and not is_suspended order by created_at limit 1;
  if v_admin is null then
    update public.profiles set is_super_admin = true where id = v_outsider;
    select pr.id into v_outsider from public.profiles pr
     where pr.id not in (v_owner, v_outsider) and not pr.is_super_admin and not pr.is_suspended
       and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
     order by pr.created_at, pr.id limit 1;
    select id into v_admin from public.profiles where is_super_admin and not is_suspended order by created_at limit 1;
  end if;

  -- The person who will be deleted: a fresh account (handle_new_user makes
  -- the profile) with a history that touches every kind of column.
  insert into auth.users (id, instance_id, aud, role, email)
  values (v_gone, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'part-f-' || v_gone || '@example.invalid');
  if not exists (select 1 from public.profiles where id = v_gone) then
    raise exception 'FIXTURE: handle_new_user did not create the profile';
  end if;

  insert into public.pets (owner_id, name, species, building_id)
  values (v_gone, 'Part F Rex', 'dog', v_building) returning id into v_pet;

  -- subject + actor on a closed case, its fine, a decided appeal
  insert into public.violations (building_id, resident_id, pet_id, opened_by, type, stage, resolved_at)
  values (v_building, v_gone, v_pet, v_gone, 'off_leash', 'resolved', now()) returning id into v_vio;
  insert into public.violation_events (violation_id, from_stage, to_stage, actor_id, note)
  values (v_vio, 'open', 'resolved', v_gone, 'Part F');
  insert into public.fines (violation_id, building_id, resident_id, issued_by, amount_cents, status)
  values (v_vio, v_building, v_gone, v_gone, 5000, 'paid');
  insert into public.violation_disputes (violation_id, stage, filed_by, reason, outcome, decided_by, decided_at)
  values (v_vio, 'warning', v_gone, 'Part F appeal', 'upheld', v_gone, now());

  -- reports, community, audit, payments
  insert into public.incident_reports (building_id, reporter_id, triaged_by, type, description)
  values (v_building, v_gone, v_gone, 'off_leash', 'Part F incident');
  insert into public.community_posts (building_id, author_id, content) values (v_building, v_gone, 'Part F post');
  insert into public.lost_found (building_id, reporter_id, kind, pet_name) values (v_building, v_gone, 'lost', 'Part F');
  insert into public.events (building_id, created_by, title, starts_at)
  values (v_building, v_gone, 'Part F event', now() + interval '1 day');
  insert into public.audit_log (actor_id, action, entity_type, building_id, metadata)
  values (v_gone, 'violation.opened', 'violation', v_building, '{}'::jsonb);
  insert into public.payments (profile_id, purpose, amount_cents, provider) values (v_gone, 'fine', 5000, 'stripe');
  insert into public.emergency_access_tokens (building_id, token, issued_by)
  values (v_building, 'part-f-' || v_gone, v_gone);

  -- a business and a booking for section 4
  insert into public.businesses (owner_id, name, category) values (v_owner, 'Part F Grooming', 'Grooming')
  returning id into v_biz;
  insert into public.business_services (business_id, name, price_cents) values (v_biz, 'Bath', 4000)
  returning id into v_service;
  -- the deleted person's booking there, so customer_id goes NULL too
  insert into public.service_bookings (business_id, customer_id, service_id, amount_cents, status)
  values (v_biz, v_gone, v_service, 4000, 'completed');

  perform set_config('part_f.building', v_building::text, true);
  perform set_config('part_f.manager', v_manager::text, true);
  perform set_config('part_f.outsider', v_outsider::text, true);
  perform set_config('part_f.owner', v_owner::text, true);
  perform set_config('part_f.admin', v_admin::text, true);
  perform set_config('part_f.gone', v_gone::text, true);
  perform set_config('part_f.vio', v_vio::text, true);
  perform set_config('part_f.biz', v_biz::text, true);
  perform set_config('part_f.service', v_service::text, true);
  raise notice 'fixtures: building % manager % outsider % owner % admin % gone %',
    v_building, v_manager, v_outsider, v_owner, v_admin, v_gone;
end $$;

-- ===========================================================================
-- 1. A guard still refuses a rewrite that is not the referential SET NULL
-- ===========================================================================
do $$
begin
  begin
    update public.fines set resident_id = null where violation_id = current_setting('part_f.vio')::uuid;
    raise exception 'FAIL: a fine''s resident was nulled while the resident still exists';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.events set created_by = null where title = 'Part F event';
    raise exception 'FAIL: an event''s author was nulled while the author still exists';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: nulling a live person''s column is still a rewrite';
end $$;

-- ===========================================================================
-- 2. Deleting a profile with closed history succeeds and de-identifies it
-- ===========================================================================
do $$
declare
  v_gone uuid := current_setting('part_f.gone')::uuid;
  v_vio uuid := current_setting('part_f.vio')::uuid;
  v_left int;
begin
  delete from auth.users where id = v_gone;

  if exists (select 1 from public.profiles where id = v_gone) then raise exception 'FAIL: the profile survived'; end if;
  if exists (select 1 from public.pets where owner_id = v_gone) then raise exception 'FAIL: the pet survived'; end if;

  select count(*) into v_left from public.violations
   where id = v_vio and resident_id is null and opened_by is null and pet_id is null;
  if v_left <> 1 then raise exception 'FAIL: the case is gone or still names the person or pet'; end if;
  if not exists (select 1 from public.violation_events where violation_id = v_vio and actor_id is null) then
    raise exception 'FAIL: the case history lost its event or kept the actor';
  end if;
  if not exists (select 1 from public.fines where violation_id = v_vio and resident_id is null and issued_by is null and status = 'paid') then
    raise exception 'FAIL: the fine is gone or still names the person';
  end if;
  if not exists (select 1 from public.violation_disputes
                  where violation_id = v_vio and filed_by is null and decided_by is null and outcome = 'upheld') then
    raise exception 'FAIL: the decided appeal is gone or still names the person';
  end if;
  if not exists (select 1 from public.incident_reports where description = 'Part F incident' and reporter_id is null and triaged_by is null) then
    raise exception 'FAIL: the incident report is gone or still names the person';
  end if;
  if not exists (select 1 from public.community_posts where content = 'Part F post' and author_id is null) then
    raise exception 'FAIL: the post is gone or still names its author';
  end if;
  if not exists (select 1 from public.lost_found where pet_name = 'Part F' and reporter_id is null) then
    raise exception 'FAIL: the lost-and-found report is gone or still names its reporter';
  end if;
  if not exists (select 1 from public.events where title = 'Part F event' and created_by is null) then
    raise exception 'FAIL: the event is gone or still names its author';
  end if;
  if exists (select 1 from public.audit_log where actor_id = v_gone)
     or exists (select 1 from public.payments where profile_id = v_gone)
     or exists (select 1 from public.emergency_access_tokens where issued_by = v_gone)
     or exists (select 1 from public.service_bookings where customer_id = v_gone) then
    raise exception 'FAIL: a row still names the deleted person';
  end if;
  if not exists (select 1 from public.service_bookings
                  where business_id = current_setting('part_f.biz')::uuid and customer_id is null) then
    raise exception 'FAIL: the booking history is gone';
  end if;
  raise notice 'ok: the account is deleted; every record stays and names nobody';
end $$;

-- ===========================================================================
-- 3. Admin RPCs refuse non-admins, and an admin cannot lock themselves out
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: outsider is an admin'; end if;
  begin
    perform public.admin_platform_stats();
    raise exception 'FAIL: a non-admin read platform stats';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.admin_list_users(null, 10, 0);
    raise exception 'FAIL: a non-admin listed users';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_set_user_flags(auth.uid(), null, true);
    raise exception 'FAIL: a non-admin made themselves an admin';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: the admin RPCs refuse a non-admin';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.admin'), 'role', 'authenticated')::text, true);
do $$
declare v_stats jsonb; v_n int;
begin
  if not public.is_admin() then raise exception 'FIXTURE: admin is not an admin'; end if;
  begin
    perform public.admin_set_user_flags(auth.uid(), true, null);
    raise exception 'FAIL: an admin suspended themselves';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_set_user_flags(auth.uid(), null, false);
    raise exception 'FAIL: an admin demoted themselves';
  exception when insufficient_privilege then null;
  end;

  perform public.admin_set_user_flags(current_setting('part_f.outsider')::uuid, true, null);
  if not (select is_suspended from public.profiles where id = current_setting('part_f.outsider')::uuid) then
    raise exception 'FAIL: the admin could not suspend another account';
  end if;
  if not exists (select 1 from public.audit_log where action = 'user.suspended'
                  and entity_id = current_setting('part_f.outsider')::uuid and actor_id = auth.uid()) then
    raise exception 'FAIL: the suspension was not audit-logged';
  end if;
  perform public.admin_set_user_flags(current_setting('part_f.outsider')::uuid, false, null);

  v_stats := public.admin_platform_stats();
  if (v_stats->>'users')::int < 1 or v_stats->'businesses_by_tier' is null then
    raise exception 'FAIL: platform stats look wrong: %', v_stats;
  end if;
  select count(*) into v_n from public.admin_list_users('Part F', 50, 0);
  raise notice 'ok: admins act on others, never on themselves; stats %; % "Part F" users', v_stats->>'users', v_n;
end $$;

-- ===========================================================================
-- 4. The audit log: the building's manager reads it, an outsider does not
-- ===========================================================================
reset role;
insert into public.audit_log (actor_id, action, entity_type, building_id, metadata)
values (current_setting('part_f.manager')::uuid, 'building.fine_schedule_set', 'building',
        current_setting('part_f.building')::uuid, '{"part_f": true}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  if not exists (select 1 from public.audit_log
                  where building_id = current_setting('part_f.building')::uuid and metadata ? 'part_f') then
    raise exception 'FAIL: the building''s manager cannot read its audit log';
  end if;
  raise notice 'ok: the manager reads the building''s audit log';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  if exists (select 1 from public.audit_log where building_id = current_setting('part_f.building')::uuid) then
    raise exception 'FAIL: an outsider read the building''s audit log';
  end if;
  raise notice 'ok: an outsider reads none of it';
end $$;

-- ===========================================================================
-- 5. A customer cancels through the RPC; the direct UPDATE path is gone
-- ===========================================================================
do $$
declare v_id uuid; v_n int;
begin
  insert into public.service_bookings (business_id, customer_id, service_id, amount_cents, scheduled_for)
  values (current_setting('part_f.biz')::uuid, auth.uid(), current_setting('part_f.service')::uuid,
          4000, now() + interval '2 days')
  returning id into v_id;

  update public.service_bookings set status = 'paid', amount_cents = 0 where id = v_id;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: the customer rewrote their own booking'; end if;

  perform public.customer_cancel_booking(v_id);
  perform public.customer_cancel_booking(v_id);  -- a repeat is a no-op
  perform set_config('part_f.booking', v_id::text, true);
  raise notice 'ok: the customer could not rewrite the booking, and cancelled it';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.customer_cancel_booking(current_setting('part_f.booking')::uuid);
    raise exception 'FAIL: someone else cancelled the customer''s booking';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: only the customer can cancel';
end $$;

reset role;
do $$
declare v_n int;
begin
  if (select status from public.service_bookings where id = current_setting('part_f.booking')::uuid) <> 'cancelled' then
    raise exception 'FAIL: the booking is not cancelled';
  end if;
  select count(*) into v_n from public.notifications
   where profile_id = current_setting('part_f.owner')::uuid
     and action_target = 'business:bookings' and title like 'Booking cancelled%Bath%';
  if v_n <> 1 then raise exception 'FAIL: the business was told % times, expected once', v_n; end if;

  update public.service_bookings set status = 'completed' where id = current_setting('part_f.booking')::uuid;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.customer_cancel_booking(current_setting('part_f.booking')::uuid);
    raise exception 'FAIL: a completed booking was cancelled';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'ok: a completed booking cannot be cancelled';
end $$;

-- ===========================================================================
-- 6. (review) Admin flags have one door, for admins too
-- ===========================================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.admin'), 'role', 'authenticated')::text, true);
do $$
begin
  if not public.is_admin() then raise exception 'FIXTURE: admin is not an admin'; end if;
  begin
    update public.profiles set is_suspended = true, suspended_at = now()
     where id = current_setting('part_f.outsider')::uuid;
    raise exception 'FAIL: an admin suspended someone by a direct PATCH';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set is_super_admin = false where id = auth.uid();
    raise exception 'FAIL: an admin demoted themselves by a direct PATCH';
  exception when insufficient_privilege then null;
  end;
  -- An ordinary profile edit still works, and the RPC still does.
  update public.profiles set full_name = full_name where id = auth.uid();
  perform public.admin_set_user_flags(current_setting('part_f.outsider')::uuid, true, null);
  perform public.admin_set_user_flags(current_setting('part_f.outsider')::uuid, false, null);
  raise notice 'ok: flags change only through admin_set_user_flags';
end $$;

-- ===========================================================================
-- 7. (review) An anonymous report names nobody in the audit log
-- ===========================================================================
reset role;
select set_config('part_f.code',
  (select building_code from public.buildings where id = current_setting('part_f.building')::uuid), true);
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.outsider'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.submit_incident_report(current_setting('part_f.code'), 'off_leash', 'Part F anonymous report', null, null, true);
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: the report was refused: %', v; end if;
  perform set_config('part_f.anon_ref', v->>'reference', true);
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.audit_log
              where action = 'incident.submitted'
                and metadata->>'reference' = current_setting('part_f.anon_ref')
                and actor_id is not null) then
    raise exception 'FAIL: the anonymous report''s audit row names the reporter';
  end if;
  if exists (select 1 from public.audit_log a join public.incident_reports ir on ir.id = a.entity_id
              where a.action = 'incident.submitted' and ir.is_anonymous and a.actor_id is not null) then
    raise exception 'FAIL: an older anonymous report''s audit row still names its reporter';
  end if;
  raise notice 'ok: anonymous reports name nobody, old or new';
end $$;

-- ===========================================================================
-- 8. (review) A customer's booking is written by the server, not the customer
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.outsider'), 'role', 'authenticated')::text, true);
do $$
declare v record;
begin
  insert into public.service_bookings
    (business_id, customer_id, service_id, amount_cents, commission_cents, status, responded_at, scheduled_for)
  values (current_setting('part_f.biz')::uuid, auth.uid(), current_setting('part_f.service')::uuid,
          1, 0, 'paid', now(), now() + interval '4 days')
  returning status, amount_cents, commission_cents, responded_at, payment_id into v;
  if v.status <> 'requested' or v.amount_cents <> 4000 or v.commission_cents <> 600
     or v.responded_at is not null or v.payment_id is not null then
    raise exception 'FAIL: the customer''s values survived: %', row_to_json(v);
  end if;
  begin
    insert into public.service_bookings (business_id, customer_id, service_id)
    values (current_setting('part_f.biz')::uuid, auth.uid(), gen_random_uuid());
    raise exception 'FAIL: a booking for a service that is not the business''s was accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'ok: status, amount and commission come from the server';
end $$;

rollback to savepoint checks; reset role;


-- ===== checks part-g =====
-- Part G — building managers' decisions carry reasons, and the person decided
-- about is told, in ONE rolled-back transaction.
--
-- Covers 20261015000001:
--   * manager_decide_registration — a deny with a note notifies the owner and
--     the body quotes the note; a whitespace-only note, and a 2-argument deny
--     with no note at all, are refused (22023); an approve with no note is
--     allowed and notifies too; deciding a registration that is no longer
--     pending is refused (22023) and notifies nobody again; a non-manager is
--     refused (42501); both decisions are audit-logged.
--   * manager_decide_link — approve, remove and deny each move the link,
--     stamp decided_at/decided_by, notify the resident (the reason quoted when
--     given) and write audit_log; removing a link that is still pending, and a
--     decision outside the grammar, are refused (22023); a non-manager is
--     refused (42501).
--
-- Covers 20261015000002 (sections 5-9):
--   * admin_business_footprint / admin_delete_business — a non-admin (an
--     outsider, and the business's own owner) is refused (42501); a name that
--     differs (case, blank, null) is name_mismatch; a business with a clinic
--     patient, or with an open booking, is has_records and survives with its
--     rows; an empty business — one active colleague, who is counted and does
--     not block — is deleted by its name typed with spaces around it, and
--     audited once.
--   * businesses has no client delete path: a direct delete by an admin, and
--     by the owner, matches 0 rows; the admin can still update, and the owner
--     can still update and insert (the select/insert/update split kept them).
--     The fixture businesses and an active super admin join the actors below.
--
-- Covers 20261015000004: admin_building_activity — a non-admin is refused
--   (42501); an admin gets MCR2026's live counts (active residents at least
--   the approved, not-left links).
--
-- Covers 20261015000005 (sections 11-14):
--   * businesses.contact_phone / contact_email — the owner updates them; a
--     phone or email outside the grammar is refused (23514).
--   * business_cancel_booking — a non-member (the customer) is refused
--     (42501); a blank (tab) or 2001-character reason is 22023; a completed
--     booking is not_cancellable; a confirmed one is cancelled with the
--     trimmed reason and cancelled_by business, and the customer is told,
--     the body quoting the reason.
--   * customer_cancel_booking still works, sets cancelled_by customer, tells
--     the business and does NOT tell the customer. A customer's insert cannot
--     pre-fill cancelled_by / cancelled_reason (the insert guard clears them).
--   * service_bookings_update_guard — the business owner's direct update
--     cannot cancel a booking or change its amount (42501), nor mark it paid;
--     a direct confirm (what setBookingStatus sends) still works and tells
--     the customer; business_cancel_booking still works through it.
--   * business_booking_contact — the customer's email and phone to the
--     business owner while confirmed or completed; null fields for a
--     requested or cancelled booking, and for anyone else.
--   * Appointments: an inserted request, and an online booking inserted
--     booked, notify the practice (clinic:today); a booking the front desk
--     made does not; owner_cancel_appointment refuses a non-owner and a
--     suspended owner (42501), an over-long
--     reason (22023), a visit 1 hour away (too_late) and a cancelled one
--     (not_cancellable), and cancels a visit 3 days away, telling the
--     practice; the practice confirming, declining a request, cancelling and
--     marking missed each tell the owner (my-vets:visits), and the owner's
--     own cancel does not; a missed visit's note is not quoted when it is
--     later cancelled with none.
--   * owner_decline_estimate — a non-owner is refused (42501), a blank note
--     is 22023, an approved estimate is not_awaiting_approval; a sent one is
--     declined, the note appended after the practice's, and the practice told
--     (clinic:billing).
--   Fixtures planted in section 11: Part G Salon (the Part G owner's), its
--   service and four bookings by the outsider; the outsider's pet "Part G
--   Rex", its chart at Part G Clinic (section 5), five appointments and two
--   estimates. The owner is the business side throughout, the outsider the
--   customer and pet owner.
--
-- Covers 20261015000006 (section 15): a new veterinary business (inserted, so
--   business_bootstrap fires) has exactly Wellness exam / Vaccination / Sick
--   visit, active and online-bookable, and Mon-Fri 09:00-17:00 on the owner's
--   staff row; clinic_available_slots, asked by the owner, offers at least one
--   slot for its first type on the next Monday at least two days out. A new
--   grooming business gets Bath & brush and Full groom, neither online-
--   bookable. seed_business_defaults called again adds nothing, and no client
--   role can execute it. The backfill's call (p_bookable false) on a clinic
--   with no types and no hours seeds the three types NOT online-bookable, and
--   the hours.
--
-- Actors are chosen from live data, not invented: Maple Court Residences
-- (MCR2026), a non-admin manager of it, and two non-admin profiles that manage
-- no building and hold no pending or approved link anywhere (an owner and an
-- outsider) — so the fixture links cannot collide with
-- resident_links_active_uniq, whatever its exact columns. Each is asserted is_admin() = false
-- inside its own impersonation, because every check here carries is_admin() as
-- a disjunct and an admin control proves nothing. The pet and the two links
-- are fixtures planted in this transaction.
--
-- Not yet run: written before the migration was applied (no database was
-- reachable from the session that wrote it). Run it after it is, as the
-- project's own connection role (the Supabase SQL editor or MCP
-- `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-g.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written.
--
-- Rows this transaction writes are found by `created_at >= now()`: now() is
-- the transaction's start time, and column defaults use the same clock, so
-- that matches only what was written here. Counts also name the fixture's
-- actor or entity, so a concurrent write elsewhere cannot change them.
--
-- Every connection-role block that follows an impersonation clears
-- request.jwt.claims first: `reset role` does not, and a trigger reading
-- auth.uid() would otherwise take the last impersonated user as the actor.

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_building uuid; v_manager uuid; v_owner uuid; v_outsider uuid;
  v_pet uuid; v_pet_b uuid; v_link_a uuid; v_link_b uuid;
begin
  select b.id into v_building from public.buildings b where upper(b.building_code) = 'MCR2026';
  if v_building is null then raise exception 'FIXTURE: building MCR2026 not found'; end if;

  select bm.profile_id into v_manager
    from public.building_managers bm join public.profiles pr on pr.id = bm.profile_id
   where bm.building_id = v_building and not pr.is_suspended
     and not coalesce(pr.is_super_admin, false)
   order by bm.created_at, bm.profile_id limit 1;
  if v_manager is null then raise exception 'FIXTURE: no non-admin manager of MCR2026'; end if;

  select pr.id into v_owner from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
     and not exists (select 1 from public.resident_links rl
                      where rl.profile_id = pr.id and rl.status in ('pending', 'approved'))
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_outsider from public.profiles pr
   where pr.id <> v_owner and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
     and not exists (select 1 from public.resident_links rl
                      where rl.profile_id = pr.id and rl.status in ('pending', 'approved'))
   order by pr.created_at, pr.id limit 1;
  if v_owner is null or v_outsider is null then
    raise exception 'FIXTURE: need two non-admin profiles that manage no building and hold no active link';
  end if;

  -- Two pets waiting on a registration decision in MCR2026: Biscuit will be
  -- denied, Pepper approved.
  insert into public.pets (owner_id, name, species, building_id, registration_status)
  values (v_owner, 'Part G Biscuit', 'dog', v_building, 'pending')
  returning id into v_pet;
  insert into public.pets (owner_id, name, species, building_id, registration_status)
  values (v_owner, 'Part G Pepper', 'cat', v_building, 'pending')
  returning id into v_pet_b;

  -- Two pending link requests: A will be approved then removed; B will be
  -- refused an illegal removal, then denied with a reason.
  insert into public.resident_links (profile_id, building_id, status)
  values (v_owner, v_building, 'pending') returning id into v_link_a;
  insert into public.resident_links (profile_id, building_id, status)
  values (v_outsider, v_building, 'pending') returning id into v_link_b;

  perform set_config('part_g.building', v_building::text, true);
  perform set_config('part_g.manager', v_manager::text, true);
  perform set_config('part_g.owner', v_owner::text, true);
  perform set_config('part_g.outsider', v_outsider::text, true);
  perform set_config('part_g.pet', v_pet::text, true);
  perform set_config('part_g.pet_b', v_pet_b::text, true);
  perform set_config('part_g.link_a', v_link_a::text, true);
  perform set_config('part_g.link_b', v_link_b::text, true);
  raise notice 'fixtures: building % manager % owner % outsider % pets % % links % %',
    v_building, v_manager, v_owner, v_outsider, v_pet, v_pet_b, v_link_a, v_link_b;
end $$;

-- ===========================================================================
-- 1. A non-manager decides nothing
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: outsider is an admin'; end if;
  begin
    perform public.manager_decide_registration(current_setting('part_g.pet')::uuid, false, 'Not my building');
    raise exception 'FAIL: a non-manager denied a registration';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.manager_decide_registration(current_setting('part_g.pet_b')::uuid, true);
    raise exception 'FAIL: a non-manager approved a registration';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.manager_decide_link(current_setting('part_g.link_a')::uuid, 'approve');
    raise exception 'FAIL: a non-manager approved a link';
  exception when insufficient_privilege then null;
  end;
  begin
    -- Their own link, too: being the resident is not being the manager.
    perform public.manager_decide_link(current_setting('part_g.link_b')::uuid, 'approve');
    raise exception 'FAIL: a resident approved their own link';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: a non-manager is refused (42501) on registrations and links';
end $$;

-- ===========================================================================
-- 2. Registration: a deny needs a reason; an approve does not; a decided
--    registration is not decided again
-- ===========================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.manager'), 'role', 'authenticated')::text, true);
do $$
declare
  v_pet uuid := current_setting('part_g.pet')::uuid;
  v_pet_b uuid := current_setting('part_g.pet_b')::uuid;
begin
  if public.is_admin() then raise exception 'FIXTURE: manager is an admin'; end if;
  if not public.manages_building(current_setting('part_g.building')::uuid) then
    raise exception 'FIXTURE: manager does not manage MCR2026';
  end if;

  begin
    perform public.manager_decide_registration(v_pet, false, E'   \t  ');
    raise exception 'FAIL: a whitespace-only note was accepted as a reason';
  exception when invalid_parameter_value then null;
  end;
  begin
    -- The 2-argument call an old client sends: it resolves (the default), and
    -- is refused because a deny has no reason.
    perform public.manager_decide_registration(v_pet, false);
    raise exception 'FAIL: a deny with no note was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.manager_decide_registration(v_pet, false, repeat('x', 2001));
    raise exception 'FAIL: a 2001-character note was accepted';
  exception when invalid_parameter_value then null;
  end;
  if (select registration_status from public.pets where id = v_pet) <> 'pending' then
    raise exception 'FAIL: a refused deny still changed the registration';
  end if;

  perform public.manager_decide_registration(v_pet, false, '  Over the weight limit  ');
  if (select registration_status from public.pets where id = v_pet) <> 'denied' then
    raise exception 'FAIL: the deny did not deny';
  end if;

  perform public.manager_decide_registration(v_pet_b, true);
  if (select registration_status from public.pets where id = v_pet_b) <> 'approved' then
    raise exception 'FAIL: the approve with no note did not approve';
  end if;

  -- A second tap on either: refused, and (checked in section 4) nobody is
  -- notified twice.
  begin
    perform public.manager_decide_registration(v_pet, false, 'Still over the limit');
    raise exception 'FAIL: a denied registration was denied again';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.manager_decide_registration(v_pet, true);
    raise exception 'FAIL: a denied registration was approved without a new application';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.manager_decide_registration(v_pet_b, true);
    raise exception 'FAIL: an approved registration was approved again';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'ok: blank, missing and over-long reasons are refused (22023); a reasoned deny and a bare approve go through; a decided registration is not decided again (22023)';
end $$;

-- ===========================================================================
-- 3. Links: approve, remove and deny move along the grammar and no further
-- ===========================================================================
do $$
declare
  v_a uuid := current_setting('part_g.link_a')::uuid;
  v_b uuid := current_setting('part_g.link_b')::uuid;
  v jsonb;
begin
  begin
    perform public.manager_decide_link(v_b, 'remove', 'Never lived here');
    raise exception 'FAIL: a pending link was removed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.manager_decide_link(v_b, 'revoke');
    raise exception 'FAIL: a decision outside the grammar was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.manager_decide_link(v_b, null);
    raise exception 'FAIL: a null decision was accepted';
  exception when invalid_parameter_value then null;
  end;

  v := public.manager_decide_link(gen_random_uuid(), 'approve');
  if coalesce((v->>'ok')::boolean, true) or v->>'error' <> 'not_found' then
    raise exception 'FAIL: a missing link did not answer not_found: %', v;
  end if;

  v := public.manager_decide_link(v_a, 'approve');
  if not coalesce((v->>'ok')::boolean, false) or v->>'status' <> 'approved' then
    raise exception 'FAIL: approve was refused: %', v;
  end if;
  begin
    perform public.manager_decide_link(v_a, 'approve');
    raise exception 'FAIL: an approved link was approved again';
  exception when invalid_parameter_value then null;
  end;

  v := public.manager_decide_link(v_a, 'remove', 'Moved out in September');
  if not coalesce((v->>'ok')::boolean, false) or v->>'status' <> 'left' then
    raise exception 'FAIL: remove was refused: %', v;
  end if;

  v := public.manager_decide_link(v_b, 'deny', '  Unit number does not match  ');
  if not coalesce((v->>'ok')::boolean, false) or v->>'status' <> 'denied' then
    raise exception 'FAIL: deny was refused: %', v;
  end if;
  raise notice 'ok: approve, remove and deny go through; illegal moves are refused (22023); a missing link is not_found';
end $$;

-- ===========================================================================
-- 4. What was written: statuses, notifications, audit rows
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare
  v_pet uuid := current_setting('part_g.pet')::uuid;
  v_pet_b uuid := current_setting('part_g.pet_b')::uuid;
  v_owner uuid := current_setting('part_g.owner')::uuid;
  v_outsider uuid := current_setting('part_g.outsider')::uuid;
  v_manager uuid := current_setting('part_g.manager')::uuid;
  v_a uuid := current_setting('part_g.link_a')::uuid;
  v_b uuid := current_setting('part_g.link_b')::uuid;
  v_n int;
  v_link record;
begin
  -- Registration: the owner was told both times, and the deny quotes the note.
  select count(*) into v_n from public.notifications
   where profile_id = v_owner and created_at >= now()
     and action_target = 'pet-detail:' || v_pet::text
     and kind = 'building' and severity = 'warning'
     and body like '%Reason: Over the weight limit';
  if v_n <> 1 then raise exception 'FAIL: the owner got % deny notifications quoting the note, expected 1', v_n; end if;

  select count(*) into v_n from public.notifications
   where profile_id = v_owner and created_at >= now()
     and action_target = 'pet-detail:' || v_pet::text;
  if v_n <> 1 then raise exception 'FAIL: the denied pet''s owner got % notifications, expected 1 (a refused retry notified)', v_n; end if;

  select count(*) into v_n from public.notifications
   where profile_id = v_owner and created_at >= now()
     and action_target = 'pet-detail:' || v_pet_b::text
     and kind = 'building' and severity = 'success';
  if v_n <> 1 then raise exception 'FAIL: the owner got % approve notifications, expected 1', v_n; end if;

  select count(*) into v_n from public.audit_log
   where action = 'pet.registration_decided' and entity_id in (v_pet, v_pet_b) and actor_id = v_manager
     and created_at >= now();
  if v_n <> 2 then raise exception 'FAIL: % registration audit rows, expected 2', v_n; end if;
  if not exists (select 1 from public.audit_log
                  where action = 'pet.registration_decided' and entity_id = v_pet
                    and metadata->>'to' = 'denied' and metadata->>'note' = 'Over the weight limit') then
    raise exception 'FAIL: the deny''s audit row does not carry the trimmed note';
  end if;
  raise notice 'ok: the owner is notified on approve and deny, the deny quotes the reason, both are audited';

  -- Link A: approved, then removed.
  select * into v_link from public.resident_links where id = v_a;
  if v_link.status <> 'left' or v_link.left_at is null
     or v_link.decided_by is distinct from v_manager or v_link.decided_at is null then
    raise exception 'FAIL: link A is not a stamped removal: %', row_to_json(v_link);
  end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_owner and created_at >= now() and action_target = 'link-building'
     and severity = 'success' and title like 'Welcome to %';
  if v_n <> 1 then raise exception 'FAIL: the resident got % welcome notifications, expected 1', v_n; end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_owner and created_at >= now() and action_target = 'link-building'
     and severity = 'warning' and title like 'You were removed from %'
     and body like '%Reason: Moved out in September';
  if v_n <> 1 then raise exception 'FAIL: the resident got % removal notifications quoting the reason, expected 1', v_n; end if;

  -- Link B: denied, with the trimmed reason quoted.
  select * into v_link from public.resident_links where id = v_b;
  if v_link.status <> 'denied' or v_link.left_at is not null
     or v_link.decided_by is distinct from v_manager or v_link.decided_at is null then
    raise exception 'FAIL: link B is not a stamped denial: %', row_to_json(v_link);
  end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'link-building'
     and severity = 'warning' and body like '%Reason: Unit number does not match';
  if v_n <> 1 then raise exception 'FAIL: the denied resident got % notifications quoting the reason, expected 1', v_n; end if;

  select count(*) into v_n from public.audit_log
   where action = 'resident_link.decided' and entity_id in (v_a, v_b) and actor_id = v_manager
     and created_at >= now();
  if v_n <> 3 then raise exception 'FAIL: % link audit rows, expected 3', v_n; end if;
  raise notice 'ok: each link decision is stamped, notified (reason quoted) and audited';
end $$;

-- ===========================================================================
-- 5. Guarded business deletion (20261015000002): fixtures, as the connection
--    role
-- ===========================================================================
-- Three businesses owned by the Part G owner (non-admin, asserted in section
-- 8): one empty but for a colleague, one with a clinic patient, one with a
-- booking still to answer. An active super admin from live data runs the
-- console's side.
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare
  v_owner uuid := current_setting('part_g.owner')::uuid;
  v_outsider uuid := current_setting('part_g.outsider')::uuid;
  v_admin uuid; v_empty uuid; v_clinic uuid; v_booked uuid; v_customer uuid; v_patient uuid;
begin
  select pr.id into v_admin from public.profiles pr
   where pr.is_super_admin and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  if v_admin is null then raise exception 'FIXTURE: no active super admin'; end if;

  -- business_bootstrap gives each one the owner's staff row and a location.
  insert into public.businesses (owner_id, name, category)
  values (v_owner, 'Part G Empty', 'Grooming') returning id into v_empty;
  -- A colleague: counted as staff, and not a reason to refuse.
  insert into public.business_staff (business_id, profile_id, role, is_active)
  values (v_empty, v_outsider, 'manager', true);

  insert into public.businesses (owner_id, name, category)
  values (v_owner, 'Part G Clinic', 'Veterinary') returning id into v_clinic;
  insert into public.clinic_customers (business_id, first_name)
  values (v_clinic, 'Part G') returning id into v_customer;
  insert into public.clinic_patients (business_id, customer_id, name)
  values (v_clinic, v_customer, 'Part G patient') returning id into v_patient;

  insert into public.businesses (owner_id, name, category)
  values (v_owner, 'Part G Booked', 'Grooming') returning id into v_booked;
  insert into public.service_bookings (business_id, customer_id, status)
  values (v_booked, v_outsider, 'requested');

  perform set_config('part_g.admin', v_admin::text, true);
  perform set_config('part_g.biz_empty', v_empty::text, true);
  perform set_config('part_g.biz_clinic', v_clinic::text, true);
  perform set_config('part_g.biz_booked', v_booked::text, true);
  perform set_config('part_g.patient', v_patient::text, true);
  raise notice 'fixtures: admin % businesses empty % clinic % booked % patient %',
    v_admin, v_empty, v_clinic, v_booked, v_patient;
end $$;

-- ===========================================================================
-- 5b. Permission helpers answer false, never NULL (20261015000001)
-- ===========================================================================
-- staff_role_in is NULL for a stranger; a bare `not helper(x)` guard would then
-- skip its IF. The outsider has no staff row and does not own biz_clinic
-- (their staff row is in biz_empty only), so both must be exactly false.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  if not (public.can_admin_business(current_setting('part_g.biz_clinic')::uuid) is false) then
    raise exception 'FAIL: can_admin_business is not exactly false for a stranger';
  end if;
  if not (public.can_read_shared_records(current_setting('part_g.biz_clinic')::uuid) is false) then
    raise exception 'FAIL: can_read_shared_records is not exactly false for a stranger';
  end if;
  raise notice 'ok: the helpers return false, not NULL, for a stranger';
end $$;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.owner'), 'role', 'authenticated')::text, true);
do $$
begin
  if not (public.can_admin_business(current_setting('part_g.biz_clinic')::uuid) is true) then
    raise exception 'FAIL: the owner cannot administer their own business';
  end if;
  raise notice 'ok: the owner administers their business';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ===========================================================================
-- 6. A non-admin neither counts nor deletes — not even the owner
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.outsider'), 'role', 'authenticated')::text, true);
do $$
declare v_empty uuid := current_setting('part_g.biz_empty')::uuid;
begin
  if public.is_admin() then raise exception 'FIXTURE: outsider is an admin'; end if;
  begin
    perform public.admin_business_footprint(v_empty);
    raise exception 'FAIL: a non-admin read a business footprint';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_delete_business(v_empty, 'Part G Empty');
    raise exception 'FAIL: a non-admin deleted a business';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.owner'), 'role', 'authenticated')::text, true);
do $$
declare v_empty uuid := current_setting('part_g.biz_empty')::uuid;
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;
  begin
    perform public.admin_business_footprint(v_empty);
    raise exception 'FAIL: the owner read their business footprint through the admin function';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_delete_business(v_empty, 'Part G Empty');
    raise exception 'FAIL: the owner deleted their business through the admin function';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: a non-admin, owner included, is refused footprint and delete (42501)';
end $$;

-- ===========================================================================
-- 7. The admin: counts, a typed name, refusals while records exist, and no
--    direct delete
-- ===========================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.admin'), 'role', 'authenticated')::text, true);
do $$
declare
  v_empty uuid := current_setting('part_g.biz_empty')::uuid;
  v_clinic uuid := current_setting('part_g.biz_clinic')::uuid;
  v_booked uuid := current_setting('part_g.biz_booked')::uuid;
  v jsonb;
  v_n int;
begin
  if not public.is_admin() then raise exception 'FIXTURE: admin is not is_admin()'; end if;

  v := public.admin_business_footprint(v_empty);
  if v is distinct from '{"patients":0,"visits":0,"invoices":0,"staff":1,"open_bookings":0,"appointments":0}'::jsonb then
    raise exception 'FAIL: the empty business''s footprint is %, expected one colleague and nothing else', v;
  end if;
  v := public.admin_business_footprint(v_clinic);
  if (v->>'patients')::int <> 1 or (v->>'staff')::int <> 0 then
    raise exception 'FAIL: the clinic''s footprint is %, expected 1 patient and no staff beyond the owner', v;
  end if;
  v := public.admin_business_footprint(v_booked);
  if (v->>'open_bookings')::int <> 1 then
    raise exception 'FAIL: the booked business''s footprint is %, expected 1 open booking', v;
  end if;
  begin
    perform public.admin_business_footprint(gen_random_uuid());
    raise exception 'FAIL: a missing business had a footprint';
  exception when no_data_found then null;
  end;
  raise notice 'ok: the footprint counts patients, open bookings and staff other than the owner; a missing business is P0002';

  -- A direct delete, as the console used to do it: RLS matches nothing.
  delete from public.businesses where id = v_empty;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: an admin''s direct delete removed % business rows', v_n; end if;
  -- …while the admin's other writes still go through.
  update public.businesses set description = 'Part G admin edit' where id = v_clinic;
  if not found then raise exception 'FAIL: the admin could no longer update a business'; end if;
  raise notice 'ok: an admin''s direct delete matches 0 rows; an admin update still works';

  v := public.admin_delete_business(v_empty, 'part g empty');
  if v->>'error' is distinct from 'name_mismatch' then
    raise exception 'FAIL: a name in the wrong case did not answer name_mismatch: %', v;
  end if;
  v := public.admin_delete_business(v_empty, '   ');
  if v->>'error' is distinct from 'name_mismatch' then
    raise exception 'FAIL: a blank name did not answer name_mismatch: %', v;
  end if;
  v := public.admin_delete_business(v_empty, null);
  if v->>'error' is distinct from 'name_mismatch' then
    raise exception 'FAIL: a null name did not answer name_mismatch: %', v;
  end if;
  raise notice 'ok: a name that differs in case, or is blank or null, is name_mismatch';

  v := public.admin_delete_business(v_clinic, 'Part G Clinic');
  if v->>'error' is distinct from 'has_records' or (v->'footprint'->>'patients')::int <> 1 then
    raise exception 'FAIL: a business with a clinic patient did not answer has_records with its footprint: %', v;
  end if;
  v := public.admin_delete_business(v_booked, 'Part G Booked');
  if v->>'error' is distinct from 'has_records' or (v->'footprint'->>'open_bookings')::int <> 1 then
    raise exception 'FAIL: a business with an open booking did not answer has_records: %', v;
  end if;
  raise notice 'ok: a clinic patient or an open booking answers has_records, with the footprint';

  v := public.admin_delete_business(gen_random_uuid(), 'Anything');
  if v->>'error' is distinct from 'not_found' then
    raise exception 'FAIL: a missing business did not answer not_found: %', v;
  end if;

  -- Trimmed on both sides; the colleague does not block.
  v := public.admin_delete_business(v_empty, '  Part G Empty  ');
  if not coalesce((v->>'ok')::boolean, false) then
    raise exception 'FAIL: the empty business was not deleted: %', v;
  end if;
  raise notice 'ok: the empty business is deleted by its name typed with surrounding spaces';
end $$;

-- ===========================================================================
-- 8. The owner: no direct delete, but edits and sign-up inserts still work
-- ===========================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.owner'), 'role', 'authenticated')::text, true);
do $$
declare
  v_clinic uuid := current_setting('part_g.biz_clinic')::uuid;
  v_new uuid;
  v_n int;
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;

  delete from public.businesses where id = v_clinic;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: the owner''s direct delete removed % business rows', v_n; end if;

  update public.businesses set description = 'Part G owner edit' where id = v_clinic;
  if not found then raise exception 'FAIL: the owner could no longer update their business'; end if;

  -- What clinic onboarding does from the browser: insert, and read the id back.
  insert into public.businesses (owner_id, name, category)
  values (auth.uid(), 'Part G New', 'Grooming') returning id into v_new;
  if v_new is null then raise exception 'FAIL: the owner could not create a business'; end if;

  delete from public.businesses where id = v_new;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: the owner deleted the business they just created (% rows)', v_n; end if;
  raise notice 'ok: an owner''s direct delete matches 0 rows; an owner still updates and inserts';
end $$;

-- ===========================================================================
-- 9. What happened: one business gone and audited, the others intact
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare
  v_admin uuid := current_setting('part_g.admin')::uuid;
  v_empty uuid := current_setting('part_g.biz_empty')::uuid;
  v_n int;
begin
  if exists (select 1 from public.businesses where id = v_empty) then
    raise exception 'FAIL: the empty business still exists';
  end if;
  if exists (select 1 from public.business_staff where business_id = v_empty) then
    raise exception 'FAIL: the deleted business left staff rows behind';
  end if;
  if not exists (select 1 from public.businesses where id = current_setting('part_g.biz_clinic')::uuid
                    and description = 'Part G owner edit') then
    raise exception 'FAIL: the clinic is gone, or the owner''s edit did not land';
  end if;
  if not exists (select 1 from public.clinic_patients where id = current_setting('part_g.patient')::uuid) then
    raise exception 'FAIL: the clinic''s patient did not survive the refused delete';
  end if;
  if not exists (select 1 from public.service_bookings
                  where business_id = current_setting('part_g.biz_booked')::uuid and status = 'requested') then
    raise exception 'FAIL: the open booking did not survive the refused delete';
  end if;
  if not exists (select 1 from public.businesses where owner_id = current_setting('part_g.owner')::uuid
                    and name = 'Part G New') then
    raise exception 'FAIL: the owner''s new business is gone';
  end if;

  select count(*) into v_n from public.audit_log
   where action = 'business.deleted' and created_at >= now() and actor_id = v_admin
     and entity_id in (v_empty, current_setting('part_g.biz_clinic')::uuid,
                       current_setting('part_g.biz_booked')::uuid);
  if v_n <> 1 then raise exception 'FAIL: % business.deleted audit rows, expected 1 (refusals audit nothing)', v_n; end if;
  if not exists (select 1 from public.audit_log
                  where action = 'business.deleted' and entity_id = v_empty and actor_id = v_admin
                    and metadata->>'name' = 'Part G Empty'
                    and (metadata->'footprint'->>'staff')::int = 1) then
    raise exception 'FAIL: the audit row does not name the business, the admin and its footprint';
  end if;
  raise notice 'ok: the deleted business is audited; the refused ones keep their patient and booking';
end $$;

-- ---------------------------------------------------------------------------
-- 20261015000003 — asking a clinic for information, and its answer
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare v_clinic uuid := current_setting('part_g.biz_clinic')::uuid; v_r uuid; v_old uuid;
begin
  -- A fixture request on the clinic (any older open one is closed first), and
  -- an approved one for the not_open check.
  update public.business_verifications set status = 'rejected'
   where business_id = v_clinic and status in ('submitted', 'in_review', 'needs_info');
  insert into public.business_verifications (business_id, kind, status)
  values (v_clinic, 'licence', 'approved') returning id into v_old;
  insert into public.business_verifications (business_id, kind, status, licence_number, issuing_body)
  values (v_clinic, 'licence', 'submitted', 'VET-1', 'College') returning id into v_r;
  perform set_config('part_g.vreq', v_r::text, true);
  perform set_config('part_g.vreq_old', v_old::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.owner'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.admin_request_verification_info(current_setting('part_g.vreq')::uuid, 'Please send more');
    raise exception 'FAIL: a non-admin asked for information';
  exception when sqlstate '42501' then null; end;
  raise notice 'ok: a non-admin cannot ask for information (42501)';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.admin'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.admin_request_verification_info(current_setting('part_g.vreq_old')::uuid, 'Anything');
  if v->>'error' is distinct from 'not_open' then raise exception 'FAIL: ask on an approved row gave %', v; end if;
  v := public.admin_request_verification_info(current_setting('part_g.vreq')::uuid, 'Send a clearer licence number');
  if (v->>'ok')::boolean is not true then raise exception 'FAIL: ask on a submitted row gave %', v; end if;
  if not exists (select 1 from public.business_verifications
                  where id = current_setting('part_g.vreq')::uuid and status = 'needs_info'
                    and note = 'Send a clearer licence number' and reviewed_by = current_setting('part_g.admin')::uuid) then
    raise exception 'FAIL: the request did not move to needs_info with the note and reviewer';
  end if;
  raise notice 'ok: ask on submitted works; on an approved row it is not_open';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.business_resubmit_verification(current_setting('part_g.vreq')::uuid, 'VET-22', 'College', null, null);
    raise exception 'FAIL: a non-member resubmitted';
  exception when sqlstate '42501' then null; end;
  raise notice 'ok: a non-member cannot resubmit (42501)';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.owner'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  begin
    perform public.business_resubmit_verification(current_setting('part_g.vreq')::uuid, '#!', 'College', null, null);
    raise exception 'FAIL: a bad licence number was accepted';
  exception when sqlstate '22023' then null; end;
  v := public.business_resubmit_verification(current_setting('part_g.vreq')::uuid, 'VET-22', 'College', 'Dr Lee', '604 555 0100');
  if (v->>'ok')::boolean is not true then raise exception 'FAIL: resubmit gave %', v; end if;
  if not exists (select 1 from public.business_verifications
                  where id = current_setting('part_g.vreq')::uuid and status = 'submitted'
                    and licence_number = 'VET-22' and note is null and reviewed_by is null) then
    raise exception 'FAIL: the resubmitted request is not submitted with the new details';
  end if;
  v := public.business_resubmit_verification(current_setting('part_g.vreq')::uuid, 'VET-22', 'College', null, null);
  if v->>'error' is distinct from 'not_needs_info' then raise exception 'FAIL: second resubmit gave %', v; end if;
  raise notice 'ok: bad licence 22023; resubmit moves needs_info -> submitted; a second is not_needs_info';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);
do $$
begin
  if not exists (select 1 from public.notifications
                  where profile_id = current_setting('part_g.owner')::uuid
                    and title like 'Pet10x needs more information:%' and created_at >= now()) then
    raise exception 'FAIL: the owner was not notified';
  end if;
  if not exists (select 1 from public.audit_log
                  where action = 'business.verification_info_requested' and created_at >= now()
                    and entity_id = current_setting('part_g.biz_clinic')::uuid
                    and actor_id = current_setting('part_g.admin')::uuid)
     or not exists (select 1 from public.audit_log
                     where action = 'business.verification_resubmitted' and created_at >= now()
                       and entity_id = current_setting('part_g.biz_clinic')::uuid
                       and actor_id = current_setting('part_g.owner')::uuid) then
    raise exception 'FAIL: the ask and the resubmit were not both audited';
  end if;
  raise notice 'ok: owner notified; both audited';
end $$;

-- ===========================================================================
-- 10. admin_building_activity (20261015000004): admin only, live numbers
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform * from public.admin_building_activity();
    raise exception 'FAIL: a non-admin read building activity';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: a non-admin is refused building activity (42501)';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.admin'), 'role', 'authenticated')::text, true);
do $$
declare
  v_building uuid := current_setting('part_g.building')::uuid;
  v_expected int;
  v_row record;
begin
  -- Computed under the admin's own role, which reads every link.
  select count(*) into v_expected from public.resident_links l
   where l.building_id = v_building and l.status = 'approved' and l.left_at is null;
  select * into v_row from public.admin_building_activity() a where a.building_id = v_building;
  if not found then raise exception 'FAIL: no activity row for MCR2026'; end if;
  if v_row.active_residents < v_expected then
    raise exception 'FAIL: active_residents % is below the % approved, not-left links', v_row.active_residents, v_expected;
  end if;
  raise notice 'ok: admin sees MCR2026 with % active residents, % open cases, % open reports',
    v_row.active_residents, v_row.open_cases, v_row.open_reports;
end $$;
reset role;

-- ===========================================================================
-- 11. Bookings, visits and estimates (20261015000005): fixtures, as the
--     connection role with no caller — so the request trigger below speaks to
--     every recipient, exactly as it does for a request no staff member made
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare
  v_owner uuid := current_setting('part_g.owner')::uuid;
  v_outsider uuid := current_setting('part_g.outsider')::uuid;
  v_clinic uuid := current_setting('part_g.biz_clinic')::uuid;
  v_salon uuid; v_svc uuid; v_b_conf uuid; v_b_done uuid; v_b_req uuid; v_b_guard uuid;
  v_pet uuid; v_cust uuid; v_patient uuid;
  v_a_req uuid; v_a_soon uuid; v_a_dec uuid; v_a_conf uuid; v_a_online uuid;
  v_e_sent uuid; v_e_appr uuid;
  v_email text; v_phone text;
begin
  if auth.uid() is not null then raise exception 'FIXTURE: a caller is still set (%)', auth.uid(); end if;

  insert into public.businesses (owner_id, name, category)
  values (v_owner, 'Part G Salon', 'Grooming') returning id into v_salon;
  insert into public.business_services (business_id, name, price_cents)
  values (v_salon, 'Part G Trim', 4500) returning id into v_svc;
  insert into public.service_bookings (business_id, customer_id, service_id, status, scheduled_for, amount_cents)
  values (v_salon, v_outsider, v_svc, 'confirmed', now() + interval '3 days', 4500) returning id into v_b_conf;
  insert into public.service_bookings (business_id, customer_id, service_id, status, scheduled_for, amount_cents)
  values (v_salon, v_outsider, v_svc, 'completed', now() - interval '3 days', 4500) returning id into v_b_done;
  insert into public.service_bookings (business_id, customer_id, service_id, status, scheduled_for, amount_cents)
  values (v_salon, v_outsider, v_svc, 'requested', now() + interval '6 days', 4500) returning id into v_b_req;
  -- For the update guard (section 12): the owner tries direct writes on it.
  insert into public.service_bookings (business_id, customer_id, service_id, status, scheduled_for, amount_cents)
  values (v_salon, v_outsider, v_svc, 'requested', now() + interval '7 days', 4500) returning id into v_b_guard;

  -- The outsider's pet, charted at Part G Clinic (owned by the Part G owner).
  insert into public.pets (owner_id, name, species)
  values (v_outsider, 'Part G Rex', 'dog') returning id into v_pet;
  insert into public.clinic_customers (business_id, profile_id, first_name)
  values (v_clinic, v_outsider, 'Part G') returning id into v_cust;
  insert into public.clinic_patients (business_id, customer_id, pet_id, name)
  values (v_clinic, v_cust, v_pet, 'Part G Rex') returning id into v_patient;

  -- Three requests (each notifies the practice on insert) and one booked visit
  -- an hour away.
  insert into public.appointments (business_id, customer_id, patient_id, starts_at, ends_at, status, reason, source, booked_by)
  values (v_clinic, v_cust, v_patient, now() + interval '3 days', now() + interval '3 days 30 minutes',
          'requested', 'Checkup', 'online', v_outsider) returning id into v_a_req;
  insert into public.appointments (business_id, customer_id, patient_id, starts_at, ends_at, status, reason, source, booked_by)
  values (v_clinic, v_cust, v_patient, now() + interval '4 days', now() + interval '4 days 30 minutes',
          'requested', 'Checkup', 'online', v_outsider) returning id into v_a_dec;
  insert into public.appointments (business_id, customer_id, patient_id, starts_at, ends_at, status, reason, source, booked_by)
  values (v_clinic, v_cust, v_patient, now() + interval '5 days', now() + interval '5 days 30 minutes',
          'requested', 'Checkup', 'online', v_outsider) returning id into v_a_conf;
  insert into public.appointments (business_id, customer_id, patient_id, starts_at, ends_at, status, reason, source)
  values (v_clinic, v_cust, v_patient, now() + interval '1 hour', now() + interval '90 minutes',
          'booked', 'Vaccination', 'staff') returning id into v_a_soon;
  -- An online booking of a type that needs no confirmation lands booked
  -- (owner_book_appointment), and the practice hears of it too.
  insert into public.appointments (business_id, customer_id, patient_id, starts_at, ends_at, status, reason, source, booked_by)
  values (v_clinic, v_cust, v_patient, now() + interval '6 days', now() + interval '6 days 30 minutes',
          'booked', 'Vaccination', 'online', v_outsider) returning id into v_a_online;

  insert into public.invoices (business_id, customer_id, patient_id, kind, number, status, total_cents, note)
  values (v_clinic, v_cust, v_patient, 'estimate', 'PG-E1', 'sent', 12000, 'Includes bloodwork')
  returning id into v_e_sent;
  insert into public.invoices (business_id, customer_id, patient_id, kind, number, status, total_cents)
  values (v_clinic, v_cust, v_patient, 'estimate', 'PG-E2', 'approved', 8000)
  returning id into v_e_appr;

  select nullif(trim(coalesce(email, '')), ''), nullif(trim(coalesce(phone, '')), '')
    into v_email, v_phone from public.profiles where id = v_outsider;
  if v_email is null and v_phone is null then
    raise notice 'note: the outsider has no profile email or phone, so the positive contact check only proves null fields match';
  end if;

  perform set_config('part_g.salon', v_salon::text, true);
  perform set_config('part_g.b_conf', v_b_conf::text, true);
  perform set_config('part_g.b_done', v_b_done::text, true);
  perform set_config('part_g.b_req', v_b_req::text, true);
  perform set_config('part_g.b_guard', v_b_guard::text, true);
  perform set_config('part_g.a_req', v_a_req::text, true);
  perform set_config('part_g.a_dec', v_a_dec::text, true);
  perform set_config('part_g.a_conf', v_a_conf::text, true);
  perform set_config('part_g.a_soon', v_a_soon::text, true);
  perform set_config('part_g.e_sent', v_e_sent::text, true);
  perform set_config('part_g.e_appr', v_e_appr::text, true);
  perform set_config('part_g.cust_email', coalesce(v_email, ''), true);
  perform set_config('part_g.cust_phone', coalesce(v_phone, ''), true);
  raise notice 'fixtures: salon % bookings % % % % pet % appointments % % % % % estimates % %',
    v_salon, v_b_conf, v_b_done, v_b_req, v_b_guard, v_pet, v_a_req, v_a_dec, v_a_conf, v_a_soon, v_a_online,
    v_e_sent, v_e_appr;
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.notifications
   where profile_id = current_setting('part_g.owner')::uuid and created_at >= now()
     and kind = 'clinic' and action_target = 'clinic:today'
     and title = 'Appointment request — Part G Rex' and body like '%asked for Checkup for Part G Rex on %';
  if v_n <> 3 then raise exception 'FAIL: the practice owner got % request notifications, expected 3', v_n; end if;
  select count(*) into v_n from public.notifications
   where profile_id = current_setting('part_g.owner')::uuid and created_at >= now()
     and kind = 'clinic' and action_target = 'clinic:today'
     and title = 'New appointment booked online — Part G Rex' and body like '%booked Vaccination for Part G Rex on %';
  if v_n <> 1 then
    raise exception 'FAIL: the practice owner got % online-booking notifications, expected 1 (the front desk''s booking is not news)', v_n;
  end if;
  select count(*) into v_n from public.notifications
   where profile_id = current_setting('part_g.owner')::uuid and created_at >= now() and action_target = 'clinic:today';
  if v_n <> 4 then raise exception 'FAIL: the practice owner got % clinic:today notices on insert, expected 4', v_n; end if;
  raise notice 'ok: each inserted request, and the online booking, notifies the practice (clinic:today); the front desk''s booking does not';
end $$;

-- ===========================================================================
-- 12. Business contact details, cancelling a booking, the customer's contact
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.outsider'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; v_row public.service_bookings%rowtype;
begin
  if public.is_admin() then raise exception 'FIXTURE: outsider is an admin'; end if;

  -- A customer's insert cannot arrive pre-cancelled: the insert guard
  -- rewrites status and clears cancelled_by / cancelled_reason.
  insert into public.service_bookings (business_id, customer_id, status, cancelled_by, cancelled_reason, scheduled_for)
  values (current_setting('part_g.salon')::uuid, auth.uid(), 'cancelled', 'business', 'Pre-filled', now() + interval '8 days')
  returning * into v_row;
  if v_row.status <> 'requested' or v_row.cancelled_by is not null or v_row.cancelled_reason is not null then
    raise exception 'FAIL: a customer insert kept %', row_to_json(v_row);
  end if;
  raise notice 'ok: a customer insert cannot pre-fill cancelled_by / cancelled_reason or the status';

  begin
    perform public.business_cancel_booking(current_setting('part_g.b_conf')::uuid, 'Not my business');
    raise exception 'FAIL: the customer cancelled through the business door';
  exception when insufficient_privilege then null;
  end;
  v := public.business_booking_contact(current_setting('part_g.b_conf')::uuid);
  if v is distinct from '{"email": null, "phone": null}'::jsonb then
    raise exception 'FAIL: a non-member read booking contact details: %', v;
  end if;
  raise notice 'ok: a non-member cannot cancel as the business (42501) or read the contact (null fields)';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.owner'), 'role', 'authenticated')::text, true);
do $$
declare
  v_salon uuid := current_setting('part_g.salon')::uuid;
  v_conf uuid := current_setting('part_g.b_conf')::uuid;
  v_done uuid := current_setting('part_g.b_done')::uuid;
  v_req uuid := current_setting('part_g.b_req')::uuid;
  v_email text := nullif(current_setting('part_g.cust_email'), '');
  v_phone text := nullif(current_setting('part_g.cust_phone'), '');
  v jsonb;
  v_row public.service_bookings%rowtype;
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;

  -- bookings_owner_update lets the owner write the row; the update guard
  -- decides which columns and which moves.
  begin
    update public.service_bookings set status = 'cancelled' where id = current_setting('part_g.b_guard')::uuid;
    raise exception 'FAIL: the owner cancelled a booking directly (no reason, customer never told)';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.service_bookings set amount_cents = 1 where id = current_setting('part_g.b_guard')::uuid;
    raise exception 'FAIL: the owner changed a booking''s amount directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.service_bookings set status = 'paid' where id = v_done;
    raise exception 'FAIL: the owner marked a booking paid without a payment';
  exception when insufficient_privilege then null;
  end;
  -- What setBookingStatus sends for a confirm.
  update public.service_bookings set status = 'confirmed', responded_at = now()
   where id = current_setting('part_g.b_guard')::uuid;
  if not found then raise exception 'FAIL: the owner''s direct confirm matched no row'; end if;
  if (select status from public.service_bookings where id = current_setting('part_g.b_guard')::uuid) <> 'confirmed'
     or (select amount_cents from public.service_bookings where id = current_setting('part_g.b_guard')::uuid) <> 4500 then
    raise exception 'FAIL: the direct confirm did not land as confirmed with the amount untouched';
  end if;
  raise notice 'ok: the owner cannot cancel, re-price or mark paid directly (42501); a direct confirm still works';

  update public.businesses set contact_phone = '+1 (604) 555-0100', contact_email = 'hello@partg.example'
   where id = v_salon;
  if not found then raise exception 'FAIL: the owner could not set contact details'; end if;
  begin
    update public.businesses set contact_phone = 'call me' where id = v_salon;
    raise exception 'FAIL: a phone outside the grammar was saved';
  exception when check_violation then null;
  end;
  begin
    update public.businesses set contact_email = 'hello at partg' where id = v_salon;
    raise exception 'FAIL: an email outside the grammar was saved';
  exception when check_violation then null;
  end;
  raise notice 'ok: the owner sets contact_phone/contact_email; text outside either grammar is 23514';

  v := public.business_booking_contact(v_req);
  if v is distinct from '{"email": null, "phone": null}'::jsonb then
    raise exception 'FAIL: a requested booking gave contact details: %', v;
  end if;
  v := public.business_booking_contact(v_conf);
  if v->>'email' is distinct from v_email or v->>'phone' is distinct from v_phone then
    raise exception 'FAIL: a confirmed booking gave %, expected the customer''s profile email/phone', v;
  end if;
  v := public.business_booking_contact(v_done);
  if v->>'email' is distinct from v_email or v->>'phone' is distinct from v_phone then
    raise exception 'FAIL: a completed booking gave %, expected the customer''s profile email/phone', v;
  end if;
  raise notice 'ok: the owner reads the customer''s contact on confirmed and completed bookings, not on a request';

  begin
    perform public.business_cancel_booking(v_conf, E'  \t\n ');
    raise exception 'FAIL: a whitespace-only reason was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.business_cancel_booking(v_conf, repeat('x', 2001));
    raise exception 'FAIL: a 2001-character reason was accepted';
  exception when invalid_parameter_value then null;
  end;
  v := public.business_cancel_booking(v_done, 'Closed today');
  if v->>'error' is distinct from 'not_cancellable' then
    raise exception 'FAIL: cancelling a completed booking gave %', v;
  end if;
  if (select status from public.service_bookings where id = v_done) <> 'completed' then
    raise exception 'FAIL: the refused cancel still moved the completed booking';
  end if;

  v := public.business_cancel_booking(v_conf, '  Groomer is ill  ');
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: the business cancel gave %', v; end if;
  select * into v_row from public.service_bookings where id = v_conf;
  if v_row.status <> 'cancelled' or v_row.cancelled_by is distinct from 'business'
     or v_row.cancelled_reason is distinct from 'Groomer is ill' then
    raise exception 'FAIL: the cancelled booking is %', row_to_json(v_row);
  end if;
  v := public.business_booking_contact(v_conf);
  if v is distinct from '{"email": null, "phone": null}'::jsonb then
    raise exception 'FAIL: a cancelled booking still gave contact details: %', v;
  end if;
  raise notice 'ok: blank/over-long reason 22023; completed is not_cancellable; confirmed cancels with the trimmed reason, cancelled_by business';
end $$;

-- The customer cancels their own request, as before.
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.outsider'), 'role', 'authenticated')::text, true);
do $$
declare v_row public.service_bookings%rowtype;
begin
  perform public.customer_cancel_booking(current_setting('part_g.b_req')::uuid);
  select * into v_row from public.service_bookings where id = current_setting('part_g.b_req')::uuid;
  if v_row.status <> 'cancelled' or v_row.cancelled_by is distinct from 'customer' or v_row.cancelled_reason is not null then
    raise exception 'FAIL: the customer''s cancel left %', row_to_json(v_row);
  end if;
  raise notice 'ok: customer_cancel_booking still cancels, with cancelled_by customer';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare
  v_owner uuid := current_setting('part_g.owner')::uuid;
  v_outsider uuid := current_setting('part_g.outsider')::uuid;
  v_n int;
begin
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'my-bookings'
     and kind = 'appointment' and severity = 'success'
     and title = 'Booking confirmed — Part G Salon'
     and body like 'Part G Salon confirmed your booking for Part G Trim on %.';
  if v_n <> 1 then raise exception 'FAIL: the customer got % confirmations of the direct confirm, expected 1', v_n; end if;

  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'my-bookings'
     and kind = 'appointment' and severity = 'warning'
     and title = 'Booking cancelled — Part G Salon'
     and body like 'Part G Salon cancelled your booking for Part G Trim on %. Reason: Groomer is ill';
  if v_n <> 1 then raise exception 'FAIL: the customer got % business-cancel notifications quoting the reason, expected 1', v_n; end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'my-bookings'
     and title like 'Booking cancelled%';
  if v_n <> 1 then raise exception 'FAIL: the customer got % cancellation notices, expected 1 (their own cancel is silent to them)', v_n; end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_owner and created_at >= now() and action_target = 'business:bookings'
     and title = 'Booking cancelled: Part G Trim' and body like '% cancelled their booking request for Part G Trim%';
  if v_n <> 1 then raise exception 'FAIL: the business got % customer-cancel notifications, expected 1', v_n; end if;
  raise notice 'ok: the business cancel tells the customer with the reason; the customer''s cancel tells only the business';
end $$;

-- ===========================================================================
-- 13. Vet visits and estimates: the practice acts, the owner acts
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.owner'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  -- The practice owner is not the pet's owner.
  begin
    perform public.owner_cancel_appointment(current_setting('part_g.a_req')::uuid, 'Not mine');
    raise exception 'FAIL: the practice cancelled through the pet owner''s door';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.owner_decline_estimate(current_setting('part_g.e_sent')::uuid, 'Not mine');
    raise exception 'FAIL: the practice declined its own estimate as the owner';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: someone other than the pet''s owner is refused cancel and decline (42501)';

  v := public.clinic_set_appointment_status(current_setting('part_g.a_conf')::uuid, 'booked'::public.appointment_status);
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: confirming the request gave %', v; end if;
  v := public.clinic_set_appointment_status(current_setting('part_g.a_dec')::uuid, 'cancelled'::public.appointment_status,
                                            'Fully booked that week');
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: declining the request gave %', v; end if;
end $$;

-- A suspended pet owner cannot cancel either (as business_cancel_booking).
-- Suspended here as the connection role with no caller, which the profile
-- guard allows, and lifted again before the owner's real calls below.
reset role;
select set_config('request.jwt.claims', '', true);
update public.profiles set is_suspended = true where id = current_setting('part_g.outsider')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.owner_cancel_appointment(current_setting('part_g.a_req')::uuid, 'Suspended');
    raise exception 'FAIL: a suspended owner cancelled a visit';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: a suspended owner is refused owner_cancel_appointment (42501)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
update public.profiles set is_suspended = false where id = current_setting('part_g.outsider')::uuid;
set local role authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.outsider'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  -- The rows are read back as the connection role in section 14, where RLS
  -- cannot hide a missing row behind a null comparison.
  v := public.owner_cancel_appointment(current_setting('part_g.a_soon')::uuid, 'Running late');
  if v->>'error' is distinct from 'too_late' then raise exception 'FAIL: cancelling 1 hour ahead gave %', v; end if;
  v := public.owner_cancel_appointment(current_setting('part_g.a_dec')::uuid);
  if v->>'error' is distinct from 'not_cancellable' then raise exception 'FAIL: cancelling a cancelled visit gave %', v; end if;
  begin
    perform public.owner_cancel_appointment(current_setting('part_g.a_req')::uuid, repeat('x', 2001));
    raise exception 'FAIL: a 2001-character reason was accepted';
  exception when invalid_parameter_value then null;
  end;
  v := public.owner_cancel_appointment(current_setting('part_g.a_req')::uuid, '  Feeling better  ');
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: the owner''s cancel gave %', v; end if;
  raise notice 'ok: too_late inside 2 hours; not_cancellable once cancelled; over-long reason 22023; a visit 3 days out answers ok';

  begin
    perform public.owner_decline_estimate(current_setting('part_g.e_sent')::uuid, E' \n ');
    raise exception 'FAIL: a whitespace-only decline note was accepted';
  exception when invalid_parameter_value then null;
  end;
  v := public.owner_decline_estimate(current_setting('part_g.e_appr')::uuid, 'Too much');
  if v->>'error' is distinct from 'not_awaiting_approval' then raise exception 'FAIL: declining an approved estimate gave %', v; end if;
  v := public.owner_decline_estimate(current_setting('part_g.e_sent')::uuid, '  Too expensive right now ');
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: the decline gave %', v; end if;
  raise notice 'ok: blank note 22023; approved is not_awaiting_approval; a sent estimate answers ok';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.owner'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  -- Missed, with a note the owner must never read…
  v := public.clinic_set_appointment_status(current_setting('part_g.a_soon')::uuid, 'no_show'::public.appointment_status,
                                            'Internal: no call, no show');
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: marking missed gave %', v; end if;
  -- …then cancelled with no note: cancel_reason still holds the missed note
  -- (coalesce(p_note, cancel_reason)), and the notice must not quote it.
  v := public.clinic_set_appointment_status(current_setting('part_g.a_soon')::uuid, 'cancelled'::public.appointment_status);
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: cancelling the missed visit gave %', v; end if;
  v := public.clinic_set_appointment_status(current_setting('part_g.a_conf')::uuid, 'cancelled'::public.appointment_status,
                                            'Vet is away');
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: cancelling the booked visit gave %', v; end if;
end $$;

-- ===========================================================================
-- 14. Who heard what
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare
  v_owner uuid := current_setting('part_g.owner')::uuid;
  v_outsider uuid := current_setting('part_g.outsider')::uuid;
  v_n int;
  v_appt public.appointments%rowtype;
  v_inv public.invoices%rowtype;
begin
  -- The rows the owner's calls moved.
  select * into v_appt from public.appointments where id = current_setting('part_g.a_req')::uuid;
  if not found or v_appt.status <> 'cancelled' or v_appt.cancelled_at is null
     or v_appt.cancel_reason is distinct from 'Feeling better' then
    raise exception 'FAIL: the owner-cancelled visit is %', row_to_json(v_appt);
  end if;
  -- a_soon was refused (too_late) while booked, then marked missed and
  -- cancelled by the practice.
  if (select status from public.appointments where id = current_setting('part_g.a_soon')::uuid) is distinct from 'cancelled' then
    raise exception 'FAIL: the visit an hour away is not missed-then-cancelled';
  end if;
  select * into v_inv from public.invoices where id = current_setting('part_g.e_sent')::uuid;
  if not found or v_inv.status is distinct from 'declined'
     or v_inv.note is distinct from E'Includes bloodwork\n\nOwner declined: Too expensive right now' then
    raise exception 'FAIL: the declined estimate is %', row_to_json(v_inv);
  end if;
  if (select status from public.invoices where id = current_setting('part_g.e_appr')::uuid) is distinct from 'approved' then
    raise exception 'FAIL: the refused decline still moved the approved estimate';
  end if;
  raise notice 'ok: the owner''s cancel stamped the visit; the declined estimate keeps the practice''s note first';

  -- The pet's owner: four notices, one per practice action; none for their own cancel.
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'my-vets:visits'
     and kind = 'appointment' and severity = 'success'
     and title = 'Appointment confirmed' and body like 'Part G Clinic confirmed Part G Rex''s appointment on %.';
  if v_n <> 1 then raise exception 'FAIL: % confirmation notices, expected 1', v_n; end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'my-vets:visits'
     and severity = 'warning' and title = 'Appointment request declined'
     and body = 'Part G Clinic couldn''t take your request for Part G Rex. Reason: Fully booked that week';
  if v_n <> 1 then raise exception 'FAIL: % declined-request notices quoting the reason, expected 1', v_n; end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'my-vets:visits'
     and title = 'Appointment cancelled' and body like 'Part G Clinic cancelled Part G Rex''s appointment on %. Reason: Vet is away';
  if v_n <> 1 then raise exception 'FAIL: % cancellation notices quoting the reason, expected 1', v_n; end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'my-vets:visits'
     and title = 'Marked as missed' and body not like '%Internal%';
  if v_n <> 1 then raise exception 'FAIL: % missed notices without the practice''s note, expected 1', v_n; end if;
  -- The note-less cancel after the missed visit quotes nothing.
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'my-vets:visits'
     and title = 'Appointment cancelled' and body like 'Part G Clinic cancelled Part G Rex''s appointment on %.'
     and body not like '%Reason%' and body not like '%Internal%';
  if v_n <> 1 then raise exception 'FAIL: % note-less cancellation notices, expected 1 (the missed note must not be quoted)', v_n; end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'my-vets:visits'
     and body like '%Internal%';
  if v_n <> 0 then raise exception 'FAIL: % visit notices quote the practice''s missed note', v_n; end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'my-vets:visits';
  if v_n <> 5 then raise exception 'FAIL: the pet owner got % visit notices, expected 5 (their own cancel is silent)', v_n; end if;
  raise notice 'ok: confirmed, declined request, cancelled, missed and missed-then-cancelled each tell the owner; a stale note is never quoted; their own cancel is silent';

  -- The practice.
  select count(*) into v_n from public.notifications
   where profile_id = v_owner and created_at >= now() and kind = 'clinic' and severity = 'warning'
     and action_target = 'clinic:today' and title = 'Appointment cancelled — Part G Rex'
     and body like '% cancelled Part G Rex''s appointment request on %. Reason: Feeling better';
  if v_n <> 1 then raise exception 'FAIL: the practice got % owner-cancel notices quoting the reason, expected 1', v_n; end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_owner and created_at >= now() and kind = 'clinic' and severity = 'warning'
     and action_target = 'clinic:billing' and title = 'Estimate declined for Part G Rex'
     and body = 'The owner declined the estimate PG-E1 for Part G Rex (120.00 CAD). Reason: Too expensive right now';
  if v_n <> 1 then raise exception 'FAIL: the practice got % estimate-declined notices, expected 1', v_n; end if;
  raise notice 'ok: the practice hears of the owner''s cancel (clinic:today) and decline (clinic:billing)';
end $$;
reset role;

-- ===========================================================================
-- 15. A new business can be booked on day one (20261015000006): fixtures and
--     checks as the connection role, then the slots as the owner
-- ===========================================================================
-- Two businesses with an explicit business_kind (the earlier fixtures pass
-- only a category, so they are kind 'other'): inserting them fires
-- business_bootstrap, which now seeds types and hours.
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare
  v_owner uuid := current_setting('part_g.owner')::uuid;
  v_vet uuid; v_groom uuid; v_staff uuid; v_n int; v_m int;
begin
  insert into public.businesses (owner_id, name, category, business_kind)
  values (v_owner, 'Part G New Clinic', 'Veterinary', 'veterinary') returning id into v_vet;
  insert into public.businesses (owner_id, name, category, business_kind)
  values (v_owner, 'Part G New Groomer', 'Grooming', 'grooming') returning id into v_groom;

  -- The vet: three active, online-bookable types, confirmed by the practice.
  select count(*) into v_n from public.appointment_types
   where business_id = v_vet and is_active and is_online_bookable and requires_confirmation
     and price_cents = 0
     and (name, duration_min, sort_order) in (('Wellness exam', 30, 0), ('Vaccination', 15, 1), ('Sick visit', 30, 2));
  select count(*) into v_m from public.appointment_types where business_id = v_vet;
  if v_n <> 3 or v_m <> 3 then
    raise exception 'FAIL: the new clinic has % matching bookable types of %, expected 3 of 3', v_n, v_m;
  end if;

  -- Its hours: Mon-Fri 09:00-17:00 on the owner's own staff row, every location.
  select s.id into v_staff from public.business_staff s
   where s.business_id = v_vet and s.profile_id = v_owner and s.is_active and s.is_bookable;
  if v_staff is null then raise exception 'FAIL: the new clinic has no active, bookable owner staff row'; end if;
  select count(*) into v_n from public.staff_availability
   where business_id = v_vet and staff_id = v_staff and location_id is null
     and weekday between 1 and 5 and start_time = '09:00'::time and end_time = '17:00'::time
     and valid_from is null and valid_to is null;
  select count(distinct weekday) into v_m from public.staff_availability where business_id = v_vet;
  if v_n <> 5 or v_m <> 5
     or (select count(*) from public.staff_availability where business_id = v_vet) <> 5 then
    raise exception 'FAIL: the new clinic has % weekday 09-17 rows over % weekdays, expected 5 and 5', v_n, v_m;
  end if;
  raise notice 'ok: a new clinic starts with Wellness exam, Vaccination and Sick visit, bookable online, and Mon-Fri 09:00-17:00';

  -- The groomer: two types, neither bookable online; the same hours.
  select count(*) into v_n from public.appointment_types
   where business_id = v_groom and is_active and not is_online_bookable and price_cents = 0
     and (name, duration_min, sort_order) in (('Bath & brush', 60, 0), ('Full groom', 90, 1));
  select count(*) into v_m from public.appointment_types where business_id = v_groom;
  if v_n <> 2 or v_m <> 2 then
    raise exception 'FAIL: the new groomer has % matching types of %, expected 2 of 2, none online-bookable', v_n, v_m;
  end if;
  select count(*) into v_n from public.staff_availability sa
    join public.business_staff s on s.id = sa.staff_id and s.profile_id = v_owner
   where sa.business_id = v_groom and sa.weekday between 1 and 5;
  if v_n <> 5 then raise exception 'FAIL: the new groomer has % weekday hours rows, expected 5', v_n; end if;
  raise notice 'ok: a new groomer starts with Bath & brush and Full groom, not bookable online, and weekday hours';

  -- Calling the helper again (twice) adds nothing.
  perform public.seed_business_defaults(v_vet);
  perform public.seed_business_defaults(v_vet);
  perform public.seed_business_defaults(v_groom);
  if (select count(*) from public.appointment_types where business_id = v_vet) <> 3
     or (select count(*) from public.staff_availability where business_id = v_vet) <> 5
     or (select count(*) from public.appointment_types where business_id = v_groom) <> 2
     or (select count(*) from public.staff_availability where business_id = v_groom) <> 5 then
    raise exception 'FAIL: seed_business_defaults duplicated rows on a second call';
  end if;
  raise notice 'ok: seed_business_defaults is idempotent';

  -- The backfill's call: an existing clinic with no types (and here no hours
  -- either) gets the three types, none online-bookable, and the weekday hours.
  delete from public.appointment_types where business_id = v_vet;
  delete from public.staff_availability where business_id = v_vet;
  perform public.seed_business_defaults(v_vet, false);
  select count(*) into v_n from public.appointment_types
   where business_id = v_vet and is_active and not is_online_bookable
     and (name, duration_min, sort_order) in (('Wellness exam', 30, 0), ('Vaccination', 15, 1), ('Sick visit', 30, 2));
  select count(*) into v_m from public.appointment_types where business_id = v_vet;
  if v_n <> 3 or v_m <> 3 then
    raise exception 'FAIL: the backfill call seeded % non-bookable types of %, expected 3 of 3', v_n, v_m;
  end if;
  if (select count(*) from public.staff_availability where business_id = v_vet) <> 5 then
    raise exception 'FAIL: the backfill call did not seed weekday hours for a clinic with none';
  end if;
  -- Put the clinic back as bootstrap left it, for the owner's slots check below.
  update public.appointment_types set is_online_bookable = true where business_id = v_vet;
  raise notice 'ok: the backfill call (p_bookable false) seeds types that are not online-bookable, and hours only where there were none';

  -- Internal only: no client role may call it.
  if has_function_privilege('authenticated', 'public.seed_business_defaults(uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public.seed_business_defaults(uuid, boolean)', 'execute') then
    raise exception 'FAIL: a client role can execute seed_business_defaults';
  end if;
  raise notice 'ok: seed_business_defaults is not callable by clients';

  -- What the owner's block below needs, read here, so that block tests only
  -- clinic_available_slots and does not lean on any table's read policy.
  perform set_config('part_g.biz_new_vet', v_vet::text, true);
  perform set_config('part_g.new_vet_staff', v_staff::text, true);
  perform set_config('part_g.new_vet_type',
    (select id from public.appointment_types where business_id = v_vet order by sort_order, name limit 1)::text, true);
  perform set_config('part_g.new_vet_tz',
    (select coalesce(timezone, 'America/Vancouver') from public.businesses where id = v_vet), true);
end $$;

-- The owner is staff of the new clinic, so clinic_available_slots answers
-- whatever the clinic's tier (a new business is only registered, not public).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.owner'), 'role', 'authenticated')::text, true);
do $$
declare
  v_vet uuid := current_setting('part_g.biz_new_vet')::uuid;
  v_type uuid := current_setting('part_g.new_vet_type')::uuid;
  v_tz text := current_setting('part_g.new_vet_tz');
  v_day date; v_slots jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;
  if not public.staff_of_business(v_vet) then raise exception 'FIXTURE: the owner is not staff of the new clinic'; end if;
  -- The first Monday at least two days out in the clinic's own time zone, so
  -- every 09:00 slot that day is in the future.
  v_day := (now() at time zone v_tz)::date + 2;
  v_day := v_day + ((8 - extract(isodow from v_day)::int) % 7);
  if extract(dow from v_day) <> 1 then raise exception 'FIXTURE: % is not a Monday', v_day; end if;

  v_slots := public.clinic_available_slots(v_vet, v_type, v_day);
  if jsonb_typeof(v_slots) is distinct from 'array' or jsonb_array_length(v_slots) < 1 then
    raise exception 'FAIL: the new clinic offers no slots on % (%)', v_day, v_slots;
  end if;
  if (v_slots -> 0 ->> 'staff_id')::uuid is distinct from current_setting('part_g.new_vet_staff')::uuid then
    raise exception 'FAIL: the first slot is not with the owner''s staff row: %', v_slots -> 0;
  end if;
  raise notice 'ok: the new clinic offers % slots for its first type on Monday %', jsonb_array_length(v_slots), v_day;
end $$;
reset role;

rollback to savepoint checks; reset role;


-- ===== checks part-h =====
-- Part H — UX follow-ups: manager notifications open the screen that decides
-- them, and clinic bills are paid in parts and voided with a reason, in ONE
-- rolled-back transaction.
--
-- Covers 20261016000001:
--   * request_building_link — a new link request tells each manager of the
--     building with target `residents` (and the body names Residents), never
--     bare `approvals`.
--   * submit_accommodation_request / withdraw_accommodation_request — the
--     arrival and the withdrawal each tell the manager with target
--     `approvals:accommodations`, never bare `approvals`.
--   * clinic_record_payment — a stranger (a building manager with no tie to
--     the clinic) and the pet's own owner are forbidden; a partial payment
--     keeps the invoice sent and records one row; a second payment over the
--     balance is over_balance with the remaining amount, and records nothing;
--     the exact remaining amount makes it paid; a paid invoice is not_payable;
--     an estimate is not_an_invoice; a method outside the allow-list, and an
--     amount of zero, are 22023. Each payment is audited and tells nobody.
--     An approved invoice takes payment too. A bill with nothing owed (PH-Z,
--     $0) is settled by an amount of 0: paid, no payment row; a 0 against a
--     balance stays 22023.
--   * invoice_payments — staff of the clinic and the pet's owner read the
--     invoice's payments; a stranger reads none; the owner reads none on a
--     draft (a row planted on PH-R only to probe the policy); staff cannot
--     insert one directly (42501).
--   * invoices_client_guard — staff updating status, paid_cents,
--     total_cents or owner_approved_at directly is 42501; a note-only update
--     still works; a client insert as paid, or as a draft carrying a total, is 42501; a plain draft
--     insert (what invoiceFromVisit sends) works, and its line sets its total
--     through invoice_recalc.
--   * clinic_void_invoice — a stranger is forbidden; a whitespace-only or
--     missing reason is 22023 and changes nothing; a paid invoice is voided
--     with the trimmed reason appended to its note, its payment rows kept, and
--     the pet's owner told (my-vets:bills, warning, quoting the reason); a
--     sent unpaid bill's notice has no "already paid" sentence; a
--     draft is voided and tells nobody; a void bill is not_voidable. Audited.
--   * clinic_set_invoice_status — sent -> paid and sent -> void are now
--     illegal_transition; sent -> approved still works; approved -> paid is
--     illegal_transition too.
--
-- Actors are chosen from live data with part-g's own fixture queries:
-- Maple Court Residences (MCR2026), a non-admin manager of it, and two
-- non-admin profiles that manage no building and hold no pending or approved
-- link anywhere (an owner and an outsider). Here the owner runs Part H Clinic,
-- the outsider is a resident asking to join MCR2026 and the owner of the
-- clinic's patient, and the manager doubles as the stranger to the clinic.
-- Each is asserted is_admin() = false inside its own impersonation, because
-- every check here carries is_admin() as a disjunct and an admin control
-- proves nothing. The clinic, its customer, patient, pet, bills and the
-- accommodation request are fixtures planted in this transaction.
--
-- Not yet run: written before the migration was applied (no database was
-- reachable from the session that wrote it). Run it after it is, as the
-- project's own connection role (the Supabase SQL editor or MCP
-- `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-h.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written.
--
-- Rows this transaction writes are found by `created_at >= now()` AND by a
-- fixture's actor or entity (the manager and MCR2026, the outsider, a fixture
-- invoice), so a concurrent write elsewhere cannot change a count.
--
-- Every connection-role block that follows an impersonation clears
-- request.jwt.claims first: `reset role` does not, and a trigger reading
-- auth.uid() would otherwise take the last impersonated user as the actor.

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare
  v_building uuid; v_manager uuid; v_owner uuid; v_outsider uuid;
  v_accom uuid; v_clinic uuid; v_pet uuid; v_cust uuid; v_patient uuid;
  v_inv_a uuid; v_inv_b uuid; v_inv_d uuid; v_est uuid;
  v_inv_c uuid; v_inv_s uuid; v_inv_z uuid; v_inv_r uuid;
begin
  select b.id into v_building from public.buildings b where upper(b.building_code) = 'MCR2026';
  if v_building is null then raise exception 'FIXTURE: building MCR2026 not found'; end if;

  select bm.profile_id into v_manager
    from public.building_managers bm join public.profiles pr on pr.id = bm.profile_id
   where bm.building_id = v_building and not pr.is_suspended
     and not coalesce(pr.is_super_admin, false)
   order by bm.created_at, bm.profile_id limit 1;
  if v_manager is null then raise exception 'FIXTURE: no non-admin manager of MCR2026'; end if;

  select pr.id into v_owner from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
     and not exists (select 1 from public.resident_links rl
                      where rl.profile_id = pr.id and rl.status in ('pending', 'approved'))
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_outsider from public.profiles pr
   where pr.id <> v_owner and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
     and not exists (select 1 from public.resident_links rl
                      where rl.profile_id = pr.id and rl.status in ('pending', 'approved'))
   order by pr.created_at, pr.id limit 1;
  if v_owner is null or v_outsider is null then
    raise exception 'FIXTURE: need two non-admin profiles that manage no building and hold no active link';
  end if;

  -- The outsider's ESA request in MCR2026, a draft with its one required
  -- document attached, so submit_accommodation_request accepts it.
  insert into public.accommodation_requests (building_id, resident_id, type, status, animal_desc)
  values (v_building, v_outsider, 'esa', 'draft', 'Part H — a small calm dog')
  returning id into v_accom;
  insert into public.accommodation_documents (request_id, kind, storage_path, uploaded_by)
  values (v_accom, 'esa_letter', 'part-h/' || v_accom::text || '/letter.pdf', v_outsider);

  -- Part H Clinic, owned by the Part G owner (business_bootstrap gives them a
  -- staff row), charting the outsider's pet.
  insert into public.businesses (owner_id, name, category, business_kind)
  values (v_owner, 'Part H Clinic', 'Veterinary', 'veterinary') returning id into v_clinic;
  insert into public.pets (owner_id, name, species)
  values (v_outsider, 'Part H Rex', 'dog') returning id into v_pet;
  insert into public.clinic_customers (business_id, profile_id, first_name)
  values (v_clinic, v_outsider, 'Part H') returning id into v_cust;
  insert into public.clinic_patients (business_id, customer_id, pet_id, name)
  values (v_clinic, v_cust, v_pet, 'Part H Rex') returning id into v_patient;

  -- A: sent, $100.00 — paid in two parts, then voided.
  insert into public.invoices (business_id, customer_id, patient_id, kind, number, status, total_cents)
  values (v_clinic, v_cust, v_patient, 'invoice', 'PH-A', 'sent', 10000) returning id into v_inv_a;
  -- B: sent, $50.00 — the old status doors, and a void with no reason.
  insert into public.invoices (business_id, customer_id, patient_id, kind, number, status, total_cents)
  values (v_clinic, v_cust, v_patient, 'invoice', 'PH-B', 'sent', 5000) returning id into v_inv_b;
  -- D: a draft the owner never saw — voided silently.
  insert into public.invoices (business_id, customer_id, patient_id, kind, number, status, total_cents)
  values (v_clinic, v_cust, v_patient, 'invoice', 'PH-D', 'draft', 3000) returning id into v_inv_d;
  -- An estimate the owner has — never takes payment.
  insert into public.invoices (business_id, customer_id, patient_id, kind, number, status, total_cents)
  values (v_clinic, v_cust, v_patient, 'estimate', 'PH-E', 'sent', 8000) returning id into v_est;
  -- C: approved, $20.00 — paid in one go, then a note edit.
  insert into public.invoices (business_id, customer_id, patient_id, kind, number, status, total_cents)
  values (v_clinic, v_cust, v_patient, 'invoice', 'PH-C', 'approved', 2000) returning id into v_inv_c;
  -- S: sent, $25.00, nothing paid — voided; the owner's notice has no
  -- "already paid" sentence.
  insert into public.invoices (business_id, customer_id, patient_id, kind, number, status, total_cents)
  values (v_clinic, v_cust, v_patient, 'invoice', 'PH-S', 'sent', 2500) returning id into v_inv_s;
  -- Z: sent, $0 — nothing owed, settled by an amount of 0.
  insert into public.invoices (business_id, customer_id, patient_id, kind, number, status, total_cents)
  values (v_clinic, v_cust, v_patient, 'invoice', 'PH-Z', 'sent', 0) returning id into v_inv_z;
  -- R: a draft with a payment row planted beside it. clinic_record_payment
  -- never writes one on a draft; the row exists only so the owner-read policy
  -- has something to hide.
  insert into public.invoices (business_id, customer_id, patient_id, kind, number, status, total_cents)
  values (v_clinic, v_cust, v_patient, 'invoice', 'PH-R', 'draft', 1500) returning id into v_inv_r;
  insert into public.invoice_payments (invoice_id, business_id, amount_cents, method, recorded_by)
  values (v_inv_r, v_clinic, 500, 'cash', v_owner);

  perform set_config('part_h.building', v_building::text, true);
  perform set_config('part_h.manager', v_manager::text, true);
  perform set_config('part_h.owner', v_owner::text, true);
  perform set_config('part_h.outsider', v_outsider::text, true);
  perform set_config('part_h.accom', v_accom::text, true);
  perform set_config('part_h.clinic', v_clinic::text, true);
  perform set_config('part_h.inv_a', v_inv_a::text, true);
  perform set_config('part_h.inv_b', v_inv_b::text, true);
  perform set_config('part_h.inv_d', v_inv_d::text, true);
  perform set_config('part_h.est', v_est::text, true);
  perform set_config('part_h.inv_c', v_inv_c::text, true);
  perform set_config('part_h.inv_s', v_inv_s::text, true);
  perform set_config('part_h.inv_z', v_inv_z::text, true);
  perform set_config('part_h.inv_r', v_inv_r::text, true);
  perform set_config('part_h.cust', v_cust::text, true);
  perform set_config('part_h.patient', v_patient::text, true);
  raise notice 'fixtures: building % manager % owner % outsider % accommodation % clinic % invoices % % % % % % % estimate %',
    v_building, v_manager, v_owner, v_outsider, v_accom, v_clinic, v_inv_a, v_inv_b, v_inv_d,
    v_inv_c, v_inv_s, v_inv_z, v_inv_r, v_est;
end $$;

-- ===========================================================================
-- 1. The resident asks to join, files and withdraws an accommodation request
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_h.outsider'), 'role', 'authenticated')::text, true);
do $$
declare v json; vb jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: outsider is an admin'; end if;

  v := public.request_building_link('MCR2026');
  if coalesce((v->>'ok')::boolean, false) is not true or v->>'status' is distinct from 'pending'
     or (v->>'already') is not null then
    raise exception 'FAIL: the link request gave %', v;
  end if;

  vb := public.submit_accommodation_request(current_setting('part_h.accom')::uuid);
  if not coalesce((vb->>'ok')::boolean, false) then raise exception 'FAIL: submitting the request gave %', vb; end if;
  vb := public.withdraw_accommodation_request(current_setting('part_h.accom')::uuid, 'Moving out');
  if not coalesce((vb->>'ok')::boolean, false) then raise exception 'FAIL: withdrawing the request gave %', vb; end if;
  raise notice 'ok: the resident requested a link, submitted and withdrew an accommodation request';
end $$;

-- ===========================================================================
-- 2. Where the manager was sent
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare
  v_manager uuid := current_setting('part_h.manager')::uuid;
  v_building uuid := current_setting('part_h.building')::uuid;
  v_n int;
begin
  select count(*) into v_n from public.notifications
   where profile_id = v_manager and building_id = v_building and created_at >= now()
     and action_target = 'residents' and action_label = 'Review request'
     and title like '% wants to join %'
     and body = 'A new resident link is waiting for review in Residents.';
  if v_n <> 1 then raise exception 'FAIL: the manager got % link-request notices targeting residents, expected 1', v_n; end if;

  select count(*) into v_n from public.notifications
   where profile_id = v_manager and building_id = v_building and created_at >= now()
     and action_target = 'approvals:accommodations' and action_label = 'Open approvals'
     and title = 'An accommodation request is waiting for review';
  if v_n <> 1 then raise exception 'FAIL: the manager got % arrival notices targeting approvals:accommodations, expected 1', v_n; end if;

  select count(*) into v_n from public.notifications
   where profile_id = v_manager and building_id = v_building and created_at >= now()
     and action_target = 'approvals:accommodations' and action_label = 'Open approvals'
     and title = 'An accommodation request was withdrawn';
  if v_n <> 1 then raise exception 'FAIL: the manager got % withdrawal notices targeting approvals:accommodations, expected 1', v_n; end if;

  select count(*) into v_n from public.notifications
   where profile_id = v_manager and building_id = v_building and created_at >= now()
     and action_target = 'approvals';
  if v_n <> 0 then raise exception 'FAIL: % notices to the manager still target bare approvals', v_n; end if;
  raise notice 'ok: link requests open Residents; accommodation arrivals and withdrawals open approvals:accommodations';
end $$;

-- ===========================================================================
-- 3. Strangers neither take payment nor void
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_h.manager'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb; v_n int;
begin
  if public.is_admin() then raise exception 'FIXTURE: manager is an admin'; end if;
  if public.staff_of_business(current_setting('part_h.clinic')::uuid) then
    raise exception 'FIXTURE: the manager is staff of Part H Clinic';
  end if;

  v := public.clinic_record_payment(current_setting('part_h.inv_a')::uuid, 1000, 'cash');
  if v->>'error' is distinct from 'forbidden' then raise exception 'FAIL: a stranger''s payment gave %', v; end if;
  v := public.clinic_void_invoice(current_setting('part_h.inv_a')::uuid, 'Not mine');
  if v->>'error' is distinct from 'forbidden' then raise exception 'FAIL: a stranger''s void gave %', v; end if;
  v := public.clinic_set_invoice_status(current_setting('part_h.inv_b')::uuid, 'approved');
  if v->>'error' is distinct from 'forbidden' then raise exception 'FAIL: a stranger''s status change gave %', v; end if;
  raise notice 'ok: a stranger is forbidden payment, void and status changes';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_h.outsider'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: outsider is an admin'; end if;
  -- The pet's owner pays the clinic; they do not record it.
  v := public.clinic_record_payment(current_setting('part_h.inv_a')::uuid, 1000, 'cash');
  if v->>'error' is distinct from 'forbidden' then raise exception 'FAIL: the pet owner''s own payment record gave %', v; end if;
  raise notice 'ok: the pet''s owner is forbidden to record a payment';
end $$;

-- ===========================================================================
-- 4. The practice takes payment in parts
-- ===========================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_h.owner'), 'role', 'authenticated')::text, true);
do $$
declare
  v_a uuid := current_setting('part_h.inv_a')::uuid;
  v jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;
  if not public.staff_of_business(current_setting('part_h.clinic')::uuid) then
    raise exception 'FIXTURE: the owner is not staff of Part H Clinic';
  end if;

  -- Refusals first: nothing recorded by any of them.
  begin
    perform public.clinic_record_payment(v_a, 1000, 'bitcoin');
    raise exception 'FAIL: a method outside the allow-list was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.clinic_record_payment(v_a, 1000, null);
    raise exception 'FAIL: a payment with no method was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.clinic_record_payment(v_a, 0, 'cash');
    raise exception 'FAIL: a payment of zero was accepted';
  exception when invalid_parameter_value then null;
  end;
  v := public.clinic_record_payment(current_setting('part_h.est')::uuid, 1000, 'cash');
  if v->>'error' is distinct from 'not_an_invoice' then raise exception 'FAIL: paying an estimate gave %', v; end if;
  v := public.clinic_record_payment(current_setting('part_h.inv_d')::uuid, 1000, 'cash');
  if v->>'error' is distinct from 'not_payable' then raise exception 'FAIL: paying a draft gave %', v; end if;
  raise notice 'ok: bad method or amount 22023; an estimate is not_an_invoice; a draft is not_payable';

  -- $40 of $100: still sent.
  v := public.clinic_record_payment(v_a, 4000, 'cash');
  if not coalesce((v->>'ok')::boolean, false) or (v->>'paid_cents')::int <> 4000
     or (v->>'remaining')::int <> 6000 or v->>'status' is distinct from 'sent' then
    raise exception 'FAIL: the partial payment gave %', v;
  end if;

  -- $70 against $60 owed: refused, with what is owed.
  v := public.clinic_record_payment(v_a, 7000, 'card');
  if v->>'error' is distinct from 'over_balance' or (v->>'remaining')::int is distinct from 6000 then
    raise exception 'FAIL: the payment over the balance gave %', v;
  end if;

  -- Exactly $60: paid.
  v := public.clinic_record_payment(v_a, 6000, 'e_transfer');
  if not coalesce((v->>'ok')::boolean, false) or (v->>'paid_cents')::int <> 10000
     or (v->>'remaining')::int <> 0 or v->>'status' is distinct from 'paid' then
    raise exception 'FAIL: the final payment gave %', v;
  end if;

  v := public.clinic_record_payment(v_a, 100, 'cash');
  if v->>'error' is distinct from 'not_payable' then raise exception 'FAIL: paying a paid invoice gave %', v; end if;
  raise notice 'ok: partial payment keeps it sent; over the balance is refused with remaining; the exact rest makes it paid';

  -- No client write path to the payment rows: the RPC is the only door.
  begin
    insert into public.invoice_payments (invoice_id, business_id, amount_cents, method)
    values (v_a, current_setting('part_h.clinic')::uuid, 500, 'cash');
    raise exception 'FAIL: staff inserted a payment row directly';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: staff cannot insert a payment row directly (42501)';
end $$;

-- ===========================================================================
-- 4b. An approved invoice takes payment; nothing owed is settled by 0
-- ===========================================================================
do $$
declare v jsonb;
begin
  v := public.clinic_record_payment(current_setting('part_h.inv_c')::uuid, 2000, 'card');
  if not coalesce((v->>'ok')::boolean, false) or (v->>'paid_cents')::int <> 2000
     or (v->>'remaining')::int <> 0 or v->>'status' is distinct from 'paid' then
    raise exception 'FAIL: paying the approved invoice gave %', v;
  end if;

  v := public.clinic_record_payment(current_setting('part_h.inv_z')::uuid, 0, 'cash');
  if not coalesce((v->>'ok')::boolean, false) or (v->>'paid_cents')::int <> 0
     or (v->>'remaining')::int <> 0 or v->>'status' is distinct from 'paid' then
    raise exception 'FAIL: settling the $0 bill with 0 gave %', v;
  end if;

  -- 0 against a balance is still no payment at all.
  begin
    perform public.clinic_record_payment(current_setting('part_h.inv_b')::uuid, 0, 'cash');
    raise exception 'FAIL: a payment of 0 against a $50 balance was accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'ok: an approved invoice is paid; a $0 bill is settled by 0; 0 against a balance is 22023';
end $$;

-- ===========================================================================
-- 4c. Staff cannot write money or status straight onto an invoice
-- ===========================================================================
do $$
declare
  v_clinic uuid := current_setting('part_h.clinic')::uuid;
  v_cust uuid := current_setting('part_h.cust')::uuid;
  v_patient uuid := current_setting('part_h.patient')::uuid;
  v_b uuid := current_setting('part_h.inv_b')::uuid;
  v_new uuid;
  v_total int;
begin
  begin
    update public.invoices set status = 'paid' where id = v_b;
    raise exception 'FAIL: staff set status paid directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.invoices set paid_cents = 5000 where id = v_b;
    raise exception 'FAIL: staff set paid_cents directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.invoices set total_cents = 1 where id = v_b;
    raise exception 'FAIL: staff set total_cents directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.invoices set owner_approved_at = now() where id = v_b;
    raise exception 'FAIL: staff stamped the owner''s approval directly';
  exception when insufficient_privilege then null;
  end;

  -- A note edit, and nothing else, goes through.
  update public.invoices set note = 'Paid at the front desk.' where id = current_setting('part_h.inv_c')::uuid;
  if not found then raise exception 'FAIL: the note-only update matched no row'; end if;

  begin
    insert into public.invoices (business_id, customer_id, patient_id, kind, status)
    values (v_clinic, v_cust, v_patient, 'invoice', 'paid');
    raise exception 'FAIL: staff inserted an invoice as paid';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.invoices (business_id, customer_id, patient_id, kind, status, total_cents)
    values (v_clinic, v_cust, v_patient, 'invoice', 'draft', 9999);
    raise exception 'FAIL: staff inserted a draft carrying its own total';
  exception when insufficient_privilege then null;
  end;

  -- invoiceFromVisit's insert, then a line: the total arrives through
  -- invoice_recalc (definer), which the guard lets through.
  insert into public.invoices (business_id, customer_id, patient_id, kind, status)
  values (v_clinic, v_cust, v_patient, 'invoice', 'draft') returning id into v_new;
  insert into public.invoice_lines (invoice_id, business_id, description, quantity, unit_price_cents)
  values (v_new, v_clinic, 'Part H exam', 1, 7500);
  select total_cents into v_total from public.invoices where id = v_new;
  if v_total is distinct from 7500 then
    raise exception 'FAIL: the new draft''s total is % after its line, expected 7500', v_total;
  end if;
  raise notice 'ok: direct status, paid_cents, total and owner_approved_at writes 42501; note-only update works; client inserts are plain drafts whose lines set the total';
end $$;

-- ===========================================================================
-- 5. The old status doors no longer pay or void
-- ===========================================================================
do $$
declare
  v_b uuid := current_setting('part_h.inv_b')::uuid;
  v jsonb;
begin
  v := public.clinic_set_invoice_status(v_b, 'paid');
  if v->>'error' is distinct from 'illegal_transition' then raise exception 'FAIL: sent -> paid gave %', v; end if;
  v := public.clinic_set_invoice_status(v_b, 'paid', 5000);
  if v->>'error' is distinct from 'illegal_transition' then raise exception 'FAIL: sent -> paid with an amount gave %', v; end if;
  v := public.clinic_set_invoice_status(v_b, 'void');
  if v->>'error' is distinct from 'illegal_transition' then raise exception 'FAIL: sent -> void gave %', v; end if;
  v := public.clinic_set_invoice_status(v_b, 'approved');
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: sent -> approved gave %', v; end if;
  v := public.clinic_set_invoice_status(v_b, 'paid');
  if v->>'error' is distinct from 'illegal_transition' then raise exception 'FAIL: approved -> paid gave %', v; end if;
  raise notice 'ok: clinic_set_invoice_status refuses paid and void (illegal_transition); sent -> approved still works';
end $$;

-- ===========================================================================
-- 6. Voiding needs a reason, and the owner hears only of a bill they had
-- ===========================================================================
do $$
declare v jsonb;
begin
  begin
    perform public.clinic_void_invoice(current_setting('part_h.inv_b')::uuid, E'  \t\n ');
    raise exception 'FAIL: a whitespace-only void reason was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.clinic_void_invoice(current_setting('part_h.inv_b')::uuid, null);
    raise exception 'FAIL: a void with no reason was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.clinic_void_invoice(current_setting('part_h.inv_b')::uuid, repeat('x', 2001));
    raise exception 'FAIL: a 2001-character void reason was accepted';
  exception when invalid_parameter_value then null;
  end;

  v := public.clinic_void_invoice(current_setting('part_h.inv_a')::uuid, '  Wrong patient charged  ');
  if not coalesce((v->>'ok')::boolean, false) or v->>'status' is distinct from 'void'
     or (v->>'owner_notified')::boolean is not true then
    raise exception 'FAIL: voiding the paid invoice gave %', v;
  end if;
  v := public.clinic_void_invoice(current_setting('part_h.inv_s')::uuid, 'Duplicate bill');
  if not coalesce((v->>'ok')::boolean, false) or (v->>'owner_notified')::boolean is not true then
    raise exception 'FAIL: voiding the sent unpaid invoice gave %', v;
  end if;
  v := public.clinic_void_invoice(current_setting('part_h.inv_d')::uuid, 'Started by mistake');
  if not coalesce((v->>'ok')::boolean, false) or (v->>'owner_notified')::boolean is not false then
    raise exception 'FAIL: voiding the draft gave %', v;
  end if;
  v := public.clinic_void_invoice(current_setting('part_h.inv_a')::uuid, 'Again');
  if v->>'error' is distinct from 'not_voidable' then raise exception 'FAIL: voiding a void bill gave %', v; end if;
  raise notice 'ok: blank, missing or over-long reason 22023; paid and draft bills void; a void bill is not_voidable';
end $$;

-- ===========================================================================
-- 7. Who reads the payments
-- ===========================================================================
do $$
declare v_n int;
begin
  select count(*) into v_n from public.invoice_payments where invoice_id = current_setting('part_h.inv_a')::uuid;
  if v_n <> 2 then raise exception 'FAIL: the practice reads % payments on PH-A, expected 2', v_n; end if;
  select count(*) into v_n from public.invoice_payments where invoice_id = current_setting('part_h.inv_r')::uuid;
  if v_n <> 1 then raise exception 'FAIL: the practice reads % payments on the draft PH-R, expected 1', v_n; end if;
  raise notice 'ok: the practice reads its invoices'' payments, draft included';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_h.outsider'), 'role', 'authenticated')::text, true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.invoice_payments where invoice_id = current_setting('part_h.inv_a')::uuid;
  if v_n <> 2 then raise exception 'FAIL: the pet''s owner reads % payments on their invoice, expected 2', v_n; end if;
  select count(*) into v_n from public.invoice_payments where invoice_id = current_setting('part_h.inv_r')::uuid;
  if v_n <> 0 then raise exception 'FAIL: the pet''s owner reads % payments on a draft, expected 0', v_n; end if;
  raise notice 'ok: the pet''s owner reads the payments on their (voided) invoice, and none on a draft';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_h.manager'), 'role', 'authenticated')::text, true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.invoice_payments where invoice_id = current_setting('part_h.inv_a')::uuid;
  if v_n <> 0 then raise exception 'FAIL: a stranger reads % payments on PH-A, expected 0', v_n; end if;
  raise notice 'ok: a stranger reads no payments';
end $$;

-- ===========================================================================
-- 8. What was written, read as the connection role
-- ===========================================================================
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare
  v_owner uuid := current_setting('part_h.owner')::uuid;
  v_outsider uuid := current_setting('part_h.outsider')::uuid;
  v_a uuid := current_setting('part_h.inv_a')::uuid;
  v_b uuid := current_setting('part_h.inv_b')::uuid;
  v_d uuid := current_setting('part_h.inv_d')::uuid;
  v_inv public.invoices%rowtype;
  v_n int;
begin
  -- PH-A: paid in full, then void, the reason trimmed onto its note.
  select * into v_inv from public.invoices where id = v_a;
  if not found or v_inv.status is distinct from 'void' or v_inv.paid_cents <> 10000
     or v_inv.note is distinct from 'Voided: Wrong patient charged' then
    raise exception 'FAIL: PH-A is %', row_to_json(v_inv);
  end if;
  -- Its two payments survive the void, each recorded by the owner.
  select count(*) into v_n from public.invoice_payments
   where invoice_id = v_a and recorded_by = v_owner
     and ((amount_cents = 4000 and method = 'cash') or (amount_cents = 6000 and method = 'e_transfer'));
  if v_n <> 2 then raise exception 'FAIL: PH-A keeps % of its 2 payment rows', v_n; end if;
  select count(*) into v_n from public.invoice_payments where invoice_id = v_a;
  if v_n <> 2 then raise exception 'FAIL: PH-A has % payment rows, expected 2 (a refused payment was recorded)', v_n; end if;

  -- PH-B: approved, unpaid, untouched by the refused voids.
  select * into v_inv from public.invoices where id = v_b;
  if not found or v_inv.status is distinct from 'approved' or v_inv.paid_cents <> 0 or v_inv.note is not null then
    raise exception 'FAIL: PH-B is %', row_to_json(v_inv);
  end if;
  if exists (select 1 from public.invoice_payments where invoice_id = v_b) then
    raise exception 'FAIL: PH-B has a payment row';
  end if;

  -- PH-D: a void draft.
  if (select status from public.invoices where id = v_d) is distinct from 'void' then
    raise exception 'FAIL: PH-D is not void';
  end if;
  -- The estimate never took a payment.
  if exists (select 1 from public.invoice_payments where invoice_id = current_setting('part_h.est')::uuid) then
    raise exception 'FAIL: the estimate has a payment row';
  end if;
  -- PH-C: paid by card in one payment, its note written directly.
  select * into v_inv from public.invoices where id = current_setting('part_h.inv_c')::uuid;
  if not found or v_inv.status is distinct from 'paid' or v_inv.paid_cents <> 2000
     or v_inv.note is distinct from 'Paid at the front desk.' then
    raise exception 'FAIL: PH-C is %', row_to_json(v_inv);
  end if;
  select count(*) into v_n from public.invoice_payments
   where invoice_id = current_setting('part_h.inv_c')::uuid and amount_cents = 2000 and method = 'card';
  if v_n <> 1 then raise exception 'FAIL: PH-C has % card payments of 2000, expected 1', v_n; end if;
  -- PH-Z: paid with nothing paid and no payment row.
  select * into v_inv from public.invoices where id = current_setting('part_h.inv_z')::uuid;
  if not found or v_inv.status is distinct from 'paid' or v_inv.paid_cents <> 0 then
    raise exception 'FAIL: PH-Z is %', row_to_json(v_inv);
  end if;
  if exists (select 1 from public.invoice_payments where invoice_id = current_setting('part_h.inv_z')::uuid) then
    raise exception 'FAIL: settling the $0 bill wrote a payment row';
  end if;
  -- PH-S: void with its reason, nothing paid.
  select * into v_inv from public.invoices where id = current_setting('part_h.inv_s')::uuid;
  if not found or v_inv.status is distinct from 'void' or v_inv.paid_cents <> 0
     or v_inv.note is distinct from 'Voided: Duplicate bill' then
    raise exception 'FAIL: PH-S is %', row_to_json(v_inv);
  end if;
  raise notice 'ok: PH-A paid then void with its reason and both payments kept; PH-B approved and unpaid; PH-C paid; PH-Z settled with no row; PH-S and PH-D void';

  -- The pet's owner: one notice, for the paid bill's void, quoting the reason.
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'my-vets:bills'
     and kind = 'clinic' and severity = 'warning'
     and title = 'Invoice voided — Part H Clinic'
     and body = 'Part H Clinic voided the invoice for Part H Rex (100.00 CAD).'
                || ' Talk to the clinic about anything you already paid. Reason: Wrong patient charged';
  if v_n <> 1 then raise exception 'FAIL: the pet owner got % void notices for PH-A, expected 1', v_n; end if;
  -- PH-S had nothing paid: no "already paid" sentence.
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'my-vets:bills'
     and kind = 'clinic' and severity = 'warning'
     and title = 'Invoice voided — Part H Clinic'
     and body = 'Part H Clinic voided the invoice for Part H Rex (25.00 CAD). Reason: Duplicate bill';
  if v_n <> 1 then raise exception 'FAIL: the pet owner got % void notices for PH-S without the paid sentence, expected 1', v_n; end if;
  -- Nothing for the payments, the $0 settle, the draft's void, or sent -> approved.
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'my-vets:bills';
  if v_n <> 2 then
    raise exception 'FAIL: the pet owner got % bill notices, expected 2 (payments, a draft''s void and approval are silent)', v_n;
  end if;
  raise notice 'ok: the owner hears of the paid bill''s void, reason quoted; payments and the draft''s void tell nobody';

  select count(*) into v_n from public.audit_log
   where action = 'invoice.payment_recorded' and entity_id = v_a and actor_id = v_owner and created_at >= now();
  if v_n <> 2 then raise exception 'FAIL: % payment audit rows on PH-A, expected 2', v_n; end if;
  select count(*) into v_n from public.audit_log
   where action = 'invoice.payment_recorded' and actor_id = v_owner and created_at >= now()
     and entity_id in (current_setting('part_h.inv_c')::uuid, current_setting('part_h.inv_z')::uuid);
  if v_n <> 2 then raise exception 'FAIL: % payment audit rows on PH-C and PH-Z, expected 2', v_n; end if;
  select count(*) into v_n from public.audit_log
   where action = 'invoice.voided' and actor_id = v_owner and created_at >= now()
     and entity_id in (v_a, v_d, current_setting('part_h.inv_s')::uuid);
  if v_n <> 3 then raise exception 'FAIL: % void audit rows, expected 3', v_n; end if;
  if not exists (select 1 from public.audit_log
                  where action = 'invoice.voided' and entity_id = v_a and actor_id = v_owner
                    and metadata->>'from' = 'paid' and metadata->>'reason' = 'Wrong patient charged') then
    raise exception 'FAIL: PH-A''s void audit row does not carry from=paid and the trimmed reason';
  end if;
  raise notice 'ok: each payment and each void is audited';
end $$;
reset role;

rollback to savepoint checks; reset role;


-- ===== checks part-i =====
-- Part I — Home performance, in ONE rolled-back transaction.
--
-- Covers 20261017000001:
--   * cron_cursors — an authenticated user can neither read nor write it
--     (42501); it is reachable only with the service role.
--   * profiles.suggestions_last_run_at — exists, is timestamptz and nullable.
--
-- The actor is any non-admin profile, chosen from live data. Nothing is
-- written that survives: the whole file ends in ROLLBACK.

savepoint checks;

reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare v_actor uuid; v_type text; v_nullable text;
begin
  select pr.id into v_actor from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  if v_actor is null then raise exception 'FIXTURE: no non-admin profile'; end if;
  perform set_config('part_i.actor', v_actor::text, true);

  select data_type, is_nullable into v_type, v_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'suggestions_last_run_at';
  if v_type is distinct from 'timestamp with time zone' or v_nullable is distinct from 'YES' then
    raise exception 'FAIL: profiles.suggestions_last_run_at is % / nullable=%, expected timestamptz / YES', v_type, v_nullable;
  end if;
  raise notice 'ok: profiles.suggestions_last_run_at exists and is nullable timestamptz';
end $$;

-- The service role can write the cursor; the app roles cannot touch it.
insert into public.cron_cursors (name, cursor) values ('part_i_probe', 'x');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_i.actor'), 'role', 'authenticated')::text, true);
do $$
declare v_n int;
begin
  if public.is_admin() then raise exception 'FIXTURE: actor is an admin'; end if;

  begin
    select count(*) into v_n from public.cron_cursors;
    raise exception 'FAIL: authenticated read cron_cursors (% rows)', v_n;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.cron_cursors (name, cursor) values ('part_i_authenticated', 'x');
    raise exception 'FAIL: authenticated inserted into cron_cursors';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.cron_cursors set cursor = 'y' where name = 'part_i_probe';
    raise exception 'FAIL: authenticated updated cron_cursors';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: authenticated cannot read, insert or update cron_cursors (42501)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

rollback to savepoint checks; reset role;


-- ===== checks part-j =====
-- Part J — notification snooze and delete, in ONE rolled-back transaction.
--
-- Covers 20261018000001:
--   * snooze_notification / dismiss_notification / restore_notification work
--     on the caller's own row; another account gets 'forbidden'.
--   * a snooze in the past, or more than 7 days out, raises 22023.
--   * snoozing clears read_at, so the row wakes unread.
--   * the inbox filter every read uses — dismissed_at is null and
--     (snoozed_until is null or snoozed_until <= now()) — leaves out a
--     dismissed row and a sleeping one, and keeps a row whose snooze is over.
--   * both dispatcher claims carry the same two filters.
--
-- The actor and the stranger are any two non-admin profiles, chosen from live
-- data; the rows are inserted here. Nothing survives: the file ends in
-- ROLLBACK.

savepoint checks;

reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare v_actor uuid; v_stranger uuid; v_fn text; v_def text;
begin
  select pr.id into v_actor from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_stranger from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended and pr.id <> v_actor
   order by pr.created_at, pr.id limit 1;
  if v_actor is null or v_stranger is null then raise exception 'FIXTURE: need two non-admin profiles'; end if;
  perform set_config('part_j.actor', v_actor::text, true);
  perform set_config('part_j.stranger', v_stranger::text, true);

  -- Four rows for the actor: one to act on (already read), one dismissed,
  -- one asleep, one whose snooze has ended. Written as the table owner, the
  -- way the app's triggers and crons write notifications.
  insert into public.notifications (id, profile_id, kind, severity, title, read_at, dismissed_at, snoozed_until) values
    ('00000000-0000-4000-8000-0000000a0001', v_actor, 'system', 'info', 'Part J target',    now(), null,  null),
    ('00000000-0000-4000-8000-0000000a0002', v_actor, 'system', 'info', 'Part J dismissed', null,  now(), null),
    ('00000000-0000-4000-8000-0000000a0003', v_actor, 'system', 'info', 'Part J asleep',    null,  null,  now() + interval '1 hour'),
    ('00000000-0000-4000-8000-0000000a0004', v_actor, 'system', 'info', 'Part J awake',     null,  null,  now() - interval '1 minute');

  -- The dispatcher must not send what the inbox hides.
  foreach v_fn in array array['claim_notification_emails', 'claim_notification_pushes'] loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = v_fn;
    if v_def is null
       or position('n.dismissed_at is null' in v_def) = 0
       or position('(n.snoozed_until is null or n.snoozed_until <= now())' in v_def) = 0 then
      raise exception 'FAIL: % does not skip dismissed and sleeping rows', v_fn;
    end if;
  end loop;
  raise notice 'ok: both dispatcher claims skip dismissed and sleeping rows';
end $$;

-- The owner.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_j.actor'), 'role', 'authenticated')::text, true);
do $$
declare
  v_id constant uuid := '00000000-0000-4000-8000-0000000a0001';
  r jsonb; v_until timestamptz; v_read timestamptz; v_dismissed timestamptz; v_n int;
begin
  if public.is_admin() then raise exception 'FIXTURE: actor is an admin'; end if;

  -- The inbox filter, exactly as the app's reads apply it.
  select count(*) into v_n from public.notifications n
   where n.profile_id = auth.uid()
     and n.id in ('00000000-0000-4000-8000-0000000a0002', '00000000-0000-4000-8000-0000000a0003')
     and n.dismissed_at is null and (n.snoozed_until is null or n.snoozed_until <= now());
  if v_n <> 0 then raise exception 'FAIL: inbox filter kept % dismissed/sleeping row(s)', v_n; end if;
  select count(*) into v_n from public.notifications n
   where n.profile_id = auth.uid()
     and n.id in ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000a0004')
     and n.dismissed_at is null and (n.snoozed_until is null or n.snoozed_until <= now());
  if v_n <> 2 then raise exception 'FAIL: inbox filter dropped a visible or woken row (% of 2)', v_n; end if;
  raise notice 'ok: inbox filter hides dismissed and sleeping rows, keeps visible and woken ones';

  r := public.snooze_notification(v_id, now() + interval '1 hour');
  select snoozed_until, read_at into v_until, v_read from public.notifications where id = v_id;
  if r is distinct from '{"ok": true}'::jsonb or v_until is distinct from now() + interval '1 hour' or v_read is not null then
    raise exception 'FAIL: owner snooze returned % / until=% read_at=%', r, v_until, v_read;
  end if;
  raise notice 'ok: owner can snooze; read_at cleared';

  begin
    perform public.snooze_notification(v_id, now() - interval '1 minute');
    raise exception 'FAIL: a snooze in the past was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.snooze_notification(v_id, now() + interval '8 days');
    raise exception 'FAIL: an 8-day snooze was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.snooze_notification(v_id, null);
    raise exception 'FAIL: a snooze with no time was accepted';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'ok: past, 8-day and empty snoozes raise 22023';

  r := public.dismiss_notification(v_id);
  select dismissed_at into v_dismissed from public.notifications where id = v_id;
  if r is distinct from '{"ok": true}'::jsonb or v_dismissed is null then
    raise exception 'FAIL: owner dismiss returned % / dismissed_at=%', r, v_dismissed;
  end if;
  r := public.restore_notification(v_id);
  select dismissed_at into v_dismissed from public.notifications where id = v_id;
  if r is distinct from '{"ok": true}'::jsonb or v_dismissed is not null then
    raise exception 'FAIL: owner restore returned % / dismissed_at=%', r, v_dismissed;
  end if;
  raise notice 'ok: owner can dismiss and restore';

  -- Dismiss again, so the stranger has a stamp to try to clear.
  perform public.dismiss_notification(v_id);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- Someone else.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_j.stranger'), 'role', 'authenticated')::text, true);
do $$
declare v_id constant uuid := '00000000-0000-4000-8000-0000000a0001'; r jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: stranger is an admin'; end if;
  r := public.snooze_notification(v_id, now() + interval '1 hour');
  if r is distinct from '{"ok": false, "error": "forbidden"}'::jsonb then raise exception 'FAIL: stranger snooze returned %', r; end if;
  r := public.dismiss_notification(v_id);
  if r is distinct from '{"ok": false, "error": "forbidden"}'::jsonb then raise exception 'FAIL: stranger dismiss returned %', r; end if;
  r := public.restore_notification(v_id);
  if r is distinct from '{"ok": false, "error": "forbidden"}'::jsonb then raise exception 'FAIL: stranger restore returned %', r; end if;
  -- A row that does not exist reads the same as someone else's.
  r := public.dismiss_notification(gen_random_uuid());
  if r is distinct from '{"ok": false, "error": "forbidden"}'::jsonb then raise exception 'FAIL: unknown id returned %', r; end if;
  raise notice 'ok: a stranger is forbidden on every call';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- The stranger's calls changed nothing.
do $$
declare v_dismissed timestamptz; v_until timestamptz;
begin
  select dismissed_at, snoozed_until into v_dismissed, v_until
    from public.notifications where id = '00000000-0000-4000-8000-0000000a0001';
  if v_dismissed is null or v_until is distinct from now() + interval '1 hour' then
    raise exception 'FAIL: the stranger changed the row (dismissed_at=%, snoozed_until=%)', v_dismissed, v_until;
  end if;
  raise notice 'ok: the row is as its owner left it';
end $$;

-- An anonymous caller cannot reach the functions at all.
set local role anon;
do $$
begin
  begin
    perform public.dismiss_notification('00000000-0000-4000-8000-0000000a0001');
    raise exception 'FAIL: anon executed dismiss_notification';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: anon cannot execute the notification RPCs (42501)';
end $$;
reset role;

rollback to savepoint checks; reset role;


do $$ begin raise exception 'DRY RUN OK — all migrations applied and every check passed; rolled back, nothing saved'; end $$;
