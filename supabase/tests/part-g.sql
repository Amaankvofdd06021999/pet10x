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

rollback;
