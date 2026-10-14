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
-- that matches only what was written here.

begin;

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
   where action = 'business.deleted' and created_at >= now();
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
do $$
begin
  if not exists (select 1 from public.notifications
                  where profile_id = current_setting('part_g.owner')::uuid
                    and title like 'Pet10x needs more information:%' and created_at >= now()) then
    raise exception 'FAIL: the owner was not notified';
  end if;
  if not exists (select 1 from public.audit_log where action = 'business.verification_info_requested' and created_at >= now())
     or not exists (select 1 from public.audit_log where action = 'business.verification_resubmitted' and created_at >= now()) then
    raise exception 'FAIL: the ask and the resubmit were not both audited';
  end if;
  raise notice 'ok: owner notified; both audited';
end $$;

rollback;
