-- Part A — owner_archive_pet, impersonated, in ONE rolled-back transaction.
--
-- Not yet run: written before the migration was applied (no database was
-- reachable from the session that wrote it). Run it after
-- 20261007000001_owner_archive_pet.sql is applied, as the project's own
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

begin;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_building uuid; v_pet uuid; v_owner uuid; v_manager uuid; v_other uuid; v_biz uuid;
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
-- 3. The owner: an invalid reason is refused (22023), then the archive works
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_a.owner'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;

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

  -- The constraint: deleted_at without a reason is refused even to the owner,
  -- who holds pets_owner_write.
  begin
    update public.pets set archived_reason = null where id = current_setting('part_a.pet')::uuid;
    raise exception 'FAIL: archived_reason cleared while deleted_at is set';
  exception when check_violation then
    raise notice 'ok: archived_reason/deleted_at must agree (23514)';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Consequences, read as the connection role (authoritative, no RLS)
-- ---------------------------------------------------------------------------
do $$
declare v_pet uuid := current_setting('part_a.pet')::uuid;
begin
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

rollback;
