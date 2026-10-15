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
--   * invoices_client_guard — staff updating status, paid_cents or
--     total_cents directly is 42501; a note-only update still works; a client
--     insert as paid, or as a draft carrying a total, is 42501; a plain draft
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

begin;

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
  -- C: approved, $20.00 — paid in one go, then a note-only update.
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

  -- What the app writes after a payment today: the note, and nothing else.
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
  raise notice 'ok: direct status, paid_cents and total writes 42501; note-only update works; client inserts are plain drafts whose lines set the total';
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

rollback;
