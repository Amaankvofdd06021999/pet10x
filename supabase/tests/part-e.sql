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

begin;

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

rollback;
