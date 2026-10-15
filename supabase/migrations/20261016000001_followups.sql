-- Pet10x — UX follow-ups: manager notifications open the screen that decides
-- them, and a clinic bill is paid in parts and voided with a reason.
--
-- THE GAPS
--   * Every manager notification about a queue item targeted bare `approvals`.
--     A resident's link request is decided on the Residents screen, not in
--     Approvals, so "Review request" landed the manager one screen away from
--     the button. The accommodation notices opened Approvals on whichever tab
--     needed a decision first, which is not always the accommodations queue.
--   * A clinic recorded payment by moving a bill straight to `paid` through
--     clinic_set_invoice_status, with one optional amount and no record of
--     how it was paid (the app appended "Paid by card." to the note after the
--     fact). A bill paid in two instalments could not be written down at all:
--     the first payment closed it.
--   * Voiding asked for no reason, and the owner was never told. A bill they
--     had already been sent simply changed to "Void" on their screen.
--
-- WHAT THIS DOES
--
--   1. Notification targets (each function copied from its LIVE definition,
--      read 2026-10-14 after the 20261015* release; only the target changes):
--      * request_building_link — `approvals` -> `residents`, and the body
--        says "…waiting for review in Residents." The label stays
--        "Review request".
--      * submit_accommodation_request, withdraw_accommodation_request —
--        `approvals` -> `approvals:accommodations`, so the button opens the
--        queue it names. The label stays "Open approvals".
--      No other live function writes the literal `approvals` (checked against
--      production). Old notifications already stored with bare `approvals`
--      are left alone: the app still opens Approvals on its default tab for
--      them.
--
--   2. public.invoice_payments — one row per payment the practice records:
--      amount (> 0), method (cash | card | e_transfer | other — an allow-list,
--      not a denylist), who recorded it, when. RLS on. Staff of the business
--      (staff_of_business) and admins read every row of their business; the
--      pet's owner reads the payments on a bill they can read (the
--      invoices_owner_read path, drafts excluded as there). There is NO
--      client insert, update or delete policy: clinic_record_payment is the
--      only writer, so paid_cents and the payment rows cannot drift apart.
--
--   3. clinic_record_payment(p_invoice, p_amount_cents, p_method) -> jsonb.
--      Staff of the business or an admin, else {ok:false, error:'forbidden'}.
--      The invoice row is locked FOR UPDATE, so two payments recorded at once
--      queue behind each other and the second sees the first's paid_cents.
--      Only an invoice takes payment (an estimate is converted first:
--      not_an_invoice); only while sent or approved (not_payable). The method
--      must be in the allow-list and the amount a positive whole number of
--      cents (22023) — with one exception: when nothing is owed (a $0 bill,
--      or a total edited down to what was already paid), an amount of 0
--      settles it: no payment row, status `paid`, audited. A 0 against a
--      balance is still 22023. An amount over what is still owed is refused, not
--      capped — {ok:false, error:'over_balance', remaining} — so paid_cents
--      never exceeds total_cents. When the payments reach the total the bill
--      moves to `paid`, which is now the ONLY way a bill becomes paid.
--      "Partly paid" is not a status: the app derives it from paid_cents.
--      No notification — the owner was there, paying. Audited.
--
--   4. clinic_void_invoice(p_invoice, p_reason) -> jsonb. Staff or admin, else
--      forbidden. The reason is required, trimmed of all whitespace and at
--      most 2000 characters (22023). Allowed from draft, sent, approved or
--      paid (a positive list; declined and void are final). Appends
--      "Voided: <reason>" to invoices.note, keeping what is there. If the bill
--      had reached the owner (sent, approved or paid) the pet's owner is told,
--      kind clinic, severity warning, target my-vets:bills; a draft they never
--      saw is voided silently. Payment rows are kept: a refund happens outside
--      the app, and the record of what was taken must survive it. Audited.
--
--   5. clinic_set_invoice_status — LIVE definition, with `paid` and `void`
--      removed from its transition table: draft -> sent (and its owner
--      notification), sent -> approved | draft. Those two moves now belong to
--      the RPCs above. Its signature, and so its grants, are unchanged; the
--      p_paid_cents argument is still accepted, so an old client's call
--      resolves and is answered illegal_transition rather than "function
--      does not exist".
--
--   6. invoices_client_guard — BEFORE INSERT OR UPDATE on invoices, security
--      invoker, the service_bookings guards' `current_user in ('authenticated',
--      'anon')` test, so definer code (the RPCs above, owner_approve_estimate,
--      owner_decline_estimate, and invoice_recalc, which derives the totals
--      from the lines) and the connection role pass untouched. For a client
--      role: an UPDATE may not change status, paid_cents, subtotal_cents,
--      tax_cents or total_cents (42501) — without it, invoices_staff (`for
--      all`) would let staff write status = 'paid' or any paid_cents straight
--      from the browser, around both RPCs, and paid_cents would drift from
--      invoice_payments. An INSERT must be a draft with nothing paid and zero
--      totals (42501), which is exactly what invoiceFromVisit sends (status
--      'draft', every money column left to its default of 0); the totals then
--      arrive through invoice_recalc as the lines are inserted. Note-only
--      updates (what the app writes after a payment today) and line edits keep
--      working.
--
-- WHAT THIS DOES NOT TOUCH
--   * The invoices status CHECK (draft, sent, approved, declined, paid, void,
--     from 20261015000005) — no status is added.
--   * invoices_staff (20260901000006) itself — staff still insert drafts and
--     edit notes, numbers and dates through it; section 6's guard narrows what
--     those writes may say, not who may make them.
--   * Stored notifications, the invoices owner-read policy, invoice_lines and
--     the totals trigger, and every migration already applied.
--
-- Whitespace: the required reason uses the house expression,
-- nullif(regexp_replace(coalesce(x, ''), '^\s+|\s+$', '', 'g'), ''), as in
-- 20261015000001, 000003 and 000005 — btrim() alone leaves a tab, which is not
-- a reason.

-- ---------------------------------------------------------------------------
-- 1. Notification targets
-- ---------------------------------------------------------------------------

-- LIVE definition, verbatim but for the target and the one sentence that names
-- the screen. search_path stays as it is live ('public').
create or replace function public.request_building_link(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building public.buildings;
  v_existing public.resident_links;
  v_who      text;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_building from public.buildings
    where upper(building_code) = upper(trim(p_code))
      and archived_at is null  -- ARCHIVED (20261008000004)
    limit 1;
  if v_building.id is null then
    return json_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select * into v_existing from public.resident_links
    where profile_id = auth.uid() and building_id = v_building.id
      and status in ('pending','approved') and left_at is null
    limit 1;

  -- Re-submitting an existing request must not notify again, or a resident
  -- tapping twice would notify every manager twice.
  if v_existing.id is not null then
    return json_build_object('ok', true, 'already', true, 'status', v_existing.status,
      'building_id', v_building.id, 'building_name', v_building.name);
  end if;

  insert into public.resident_links (profile_id, building_id, status, requested_at)
    values (auth.uid(), v_building.id, 'pending', now());

  select coalesce(nullif(trim(full_name), ''), email, 'A resident')
    into v_who
  from public.profiles where id = auth.uid();

  -- One per manager of this building. No managers means no rows, which is a
  -- valid state, not an error.
  -- 20261016000001: the target is `residents` — link requests are decided on
  -- the Residents screen, not in Approvals.
  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target, building_id)
  select
    bm.profile_id,
    'building',
    'info',
    coalesce(v_who, 'A resident') || ' wants to join ' || v_building.name,
    'A new resident link is waiting for review in Residents.',
    'Review request',
    'residents',
    v_building.id
  from public.building_managers bm
  where bm.building_id = v_building.id;

  return json_build_object('ok', true, 'status', 'pending',
    'building_id', v_building.id, 'building_name', v_building.name);
end;
$$;

-- As 20260829000001 (verified against the live body: the `!~ '\S'` check,
-- pet10x.accom_write around the update, the required-kinds checklist, the
-- accommodation.submitted audit row). Only the target changes.
create or replace function public.submit_accommodation_request(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req      public.accommodation_requests%rowtype;
  v_missing  public.doc_kind[];
  v_notified integer := 0;
begin
  select * into v_req from public.accommodation_requests where id = p_request for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Ownership before anything else. A request is not a queue item until its
  -- own resident says so.
  if v_req.resident_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if v_req.status not in ('draft', 'info_requested') then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition',
                              'from', v_req.status::text, 'to', 'pending');
  end if;

  -- `!~ '\S'` and not `btrim(...) = ''`: btrim strips only ASCII spaces, so a
  -- description of E'\n\n\t\n' passed the equivalent check in Phase 6.
  if coalesce(v_req.animal_desc, '') !~ '\S' then
    return jsonb_build_object('ok', false, 'error', 'description_required');
  end if;

  -- A required kind counts only when a FILE is actually attached. A row whose
  -- storage_path is null is either a retention-purged record or a bug; neither
  -- is a document a manager can read.
  select coalesce(array_agg(k), array[]::public.doc_kind[]) into v_missing
    from unnest(public.accommodation_required_kinds(v_req.type)) k
   where not exists (
     select 1 from public.accommodation_documents d
      where d.request_id = v_req.id and d.kind = k and d.storage_path is not null
   );

  if array_length(v_missing, 1) is not null then
    return jsonb_build_object('ok', false, 'error', 'checklist_incomplete',
                              'missing', to_jsonb(v_missing::text[]));
  end if;

  perform set_config('pet10x.accom_write', 'ok', true);
  update public.accommodation_requests
     set status = 'pending',
         submitted_at = now()
   where id = p_request;
  perform set_config('pet10x.accom_write', '', true);

  -- The queue is told, in the words the phase's confidentiality contract
  -- allows: a title, a target, and NEVER the reason. No type, no animal_desc,
  -- no document name, no resident named. Every addressee is a manager of this
  -- building, which is precisely the audience the row itself became readable to
  -- one statement ago. Withdrawal's two guards, both kept: this building's
  -- managers only, suspended profiles excluded.
  -- 20261016000001: `approvals:accommodations` opens the queue tab itself.
  insert into public.notifications (profile_id, kind, severity, title, body,
                                    action_label, action_target, building_id)
  select bm.profile_id, 'building', 'info',
         'An accommodation request is waiting for review',
         'A resident has sent a request to your queue.',
         'Open approvals', 'approvals:accommodations', v_req.building_id
    from public.building_managers bm
    join public.profiles p on p.id = bm.profile_id
   where bm.building_id = v_req.building_id and not p.is_suspended;
  get diagnostics v_notified = row_count;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'accommodation.submitted', 'accommodation_request', p_request, v_req.building_id,
          jsonb_build_object('from', v_req.status::text, 'to', 'pending',
                             'managers_told', v_notified,
                             'documents', (select count(*) from public.accommodation_documents d
                                            where d.request_id = p_request and d.storage_path is not null)));

  return jsonb_build_object('ok', true, 'status', 'pending', 'managers_notified', v_notified);
end;
$$;

comment on function public.submit_accommodation_request(uuid) is
  'draft | info_requested -> pending, for the owning resident only. Refuses a blank animal_desc (by `~ ''\S''`, not btrim) and any missing required doc_kind with a file actually attached. Mints and immediately clears pet10x.accom_write around its own UPDATE. Notifies every non-suspended manager of the building that a request is waiting, targeting `approvals:accommodations` (20261016000001) — the Approvals screen''s Accommodations tab, which is the manager''s queue. The notification names no type, no animal, no note and no resident: the phase contract is that a notification carries a title and a target and never the reason, because a push preview is readable on a lock screen. It discloses no more than the transition itself does — draft -> pending is what makes the row readable to those same managers under accom_manager_read.';

-- As 20260829000001 (verified against the live body: text_present(p_reason),
-- the v_was_open guard, the accommodation.withdrawn audit row). Only the
-- target changes.
create or replace function public.withdraw_accommodation_request(
  p_request uuid,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req      public.accommodation_requests%rowtype;
  v_was_open boolean;
  v_notified integer := 0;
begin
  select * into v_req from public.accommodation_requests where id = p_request for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_req.resident_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_req.status not in ('draft', 'pending', 'info_requested') then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition',
                              'from', v_req.status::text, 'to', 'withdrawn');
  end if;

  -- Whether the managers ever knew about it decides whether they are told it
  -- is gone. THIS IS A CONFIDENTIALITY RULE, NOT A TIDINESS ONE: a draft is
  -- invisible to the building's managers by policy, so notifying them that a
  -- draft was withdrawn would announce the existence of a request the resident
  -- never filed — through the one channel that bypasses RLS entirely.
  v_was_open := v_req.status in ('pending', 'info_requested');

  perform set_config('pet10x.accom_write', 'ok', true);
  update public.accommodation_requests
     set status = 'withdrawn',
         withdrawn_at = now(),
         -- The resident's own reason is stored where the resident and their
         -- manager can both read it, which is where the decision note lives.
         decision_note = coalesce(public.text_present(p_reason), v_req.decision_note)
   where id = p_request;
  perform set_config('pet10x.accom_write', '', true);

  if v_was_open then
    -- 20261016000001: `approvals:accommodations` opens the queue tab itself.
    insert into public.notifications (profile_id, kind, severity, title, body,
                                      action_label, action_target, building_id)
    select bm.profile_id, 'building', 'info',
           'An accommodation request was withdrawn',
           'A resident has withdrawn a request from your queue.',
           'Open approvals', 'approvals:accommodations', v_req.building_id
      from public.building_managers bm
      join public.profiles p on p.id = bm.profile_id
     where bm.building_id = v_req.building_id and not p.is_suspended;
    get diagnostics v_notified = row_count;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'accommodation.withdrawn', 'accommodation_request', p_request, v_req.building_id,
          jsonb_build_object('from', v_req.status::text, 'to', 'withdrawn',
                             'was_submitted', v_was_open, 'managers_told', v_notified));

  return jsonb_build_object('ok', true, 'status', 'withdrawn', 'managers_notified', v_notified);
end;
$$;

comment on function public.withdraw_accommodation_request(uuid, text) is
  'draft | pending | info_requested -> withdrawn, for the owning resident only. Stores an optional reason in decision_note, where the resident and their manager can both read it. Notifies every non-suspended manager of the building ONLY when the request was already in their queue (pending or info_requested) — telling them a DRAFT was withdrawn would announce a request that was never filed, through the one channel that bypasses RLS. Targets `approvals:accommodations` (20261016000001), the Approvals screen''s Accommodations tab.';

-- ---------------------------------------------------------------------------
-- 2. Payments, one row each
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  method       text not null check (method in ('cash', 'card', 'e_transfer', 'other')),
  recorded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists invoice_payments_invoice_idx on public.invoice_payments(invoice_id, created_at);
create index if not exists invoice_payments_business_idx on public.invoice_payments(business_id, created_at desc);

alter table public.invoice_payments enable row level security;

-- Reads only. No insert, update or delete policy: clinic_record_payment
-- (security definer) is the one writer, so the rows and invoices.paid_cents
-- always agree.
drop policy if exists invoice_payments_staff_read on public.invoice_payments;
create policy invoice_payments_staff_read on public.invoice_payments for select
  using (public.staff_of_business(business_id) or public.is_admin());

-- The pet's owner reads the payments on a bill they can read — the
-- invoices_owner_read path (20261010000001), drafts excluded as there.
drop policy if exists invoice_payments_owner_read on public.invoice_payments;
create policy invoice_payments_owner_read on public.invoice_payments for select
  using (exists (select 1 from public.invoices i
                   join public.clinic_patients cp on cp.id = i.patient_id
                   join public.pets p on p.id = cp.pet_id
                  where i.id = invoice_payments.invoice_id
                    and i.status <> 'draft'
                    and p.owner_id = auth.uid()));

revoke all on table public.invoice_payments from anon;
revoke insert, update, delete, truncate, references, trigger on table public.invoice_payments from authenticated;
grant select on table public.invoice_payments to authenticated;

comment on table public.invoice_payments is
  'One row per payment a practice records against an invoice (20261016000001). Written only by clinic_record_payment; read by staff of the business, admins, and the pet''s owner on a bill they can read. Kept when the invoice is voided — a refund happens outside the app.';

-- ---------------------------------------------------------------------------
-- 3. Recording a payment
-- ---------------------------------------------------------------------------
create or replace function public.clinic_record_payment(
  p_invoice      uuid,
  p_amount_cents integer,
  p_method       text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv         public.invoices%rowtype;
  v_remaining integer;
  v_paid      integer;
  v_status    text;
begin
  -- Locked, so two payments recorded at once queue here and the second one
  -- measures its amount against the first one's paid_cents.
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not (coalesce(public.staff_of_business(inv.business_id), false)
          or coalesce(public.is_admin(), false)) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- An estimate is converted into an invoice before anyone pays it.
  if inv.kind is distinct from 'invoice' then
    return jsonb_build_object('ok', false, 'error', 'not_an_invoice');
  end if;
  -- What may take payment, stated: a bill the owner has, still open.
  if inv.status not in ('sent', 'approved') then
    return jsonb_build_object('ok', false, 'error', 'not_payable', 'status', inv.status);
  end if;

  if not coalesce(p_method in ('cash', 'card', 'e_transfer', 'other'), false) then
    raise exception 'Choose how it was paid: cash, card, e-transfer or other' using errcode = '22023';
  end if;
  -- greatest(…, 0): a total edited below what was already paid owes nothing,
  -- it does not owe a negative amount.
  v_remaining := greatest(inv.total_cents - inv.paid_cents, 0);

  -- Nothing owed (a $0 bill, or a total edited down to what was paid): an
  -- amount of 0 settles it. No payment row — nothing changed hands — but the
  -- bill still reaches `paid` through this door, the only one there is.
  if p_amount_cents = 0 and v_remaining = 0 then
    update public.invoices set status = 'paid' where id = inv.id;
    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'invoice.payment_recorded', 'invoice', inv.id,
            jsonb_build_object('business_id', inv.business_id, 'amount_cents', 0,
                               'method', p_method, 'paid_cents', inv.paid_cents,
                               'from', inv.status, 'to', 'paid', 'settled_nothing_owed', true));
    return jsonb_build_object('ok', true, 'paid_cents', inv.paid_cents, 'remaining', 0, 'status', 'paid');
  end if;

  if not coalesce(p_amount_cents > 0, false) then
    raise exception 'Enter an amount greater than zero' using errcode = '22023';
  end if;

  if p_amount_cents > v_remaining then
    -- Refused, not capped: the practice re-enters what was actually taken.
    return jsonb_build_object('ok', false, 'error', 'over_balance', 'remaining', v_remaining);
  end if;

  insert into public.invoice_payments (invoice_id, business_id, amount_cents, method, recorded_by)
  values (inv.id, inv.business_id, p_amount_cents, p_method, auth.uid());

  v_paid := inv.paid_cents + p_amount_cents;
  -- Reaching the total is the only way a bill becomes paid.
  v_status := case when v_paid >= inv.total_cents then 'paid' else inv.status end;

  update public.invoices
     set paid_cents = v_paid,
         status = v_status
   where id = inv.id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'invoice.payment_recorded', 'invoice', inv.id,
          jsonb_build_object('business_id', inv.business_id, 'amount_cents', p_amount_cents,
                             'method', p_method, 'paid_cents', v_paid,
                             'from', inv.status, 'to', v_status));

  return jsonb_build_object('ok', true, 'paid_cents', v_paid,
                            'remaining', greatest(inv.total_cents - v_paid, 0),
                            'status', v_status);
end;
$$;

comment on function public.clinic_record_payment(uuid, integer, text) is
  'Staff of the business or an admin record a payment on a sent or approved invoice (20261016000001). Locks the invoice; {ok:false, error: not_found | forbidden | not_an_invoice | not_payable}; 22023 for a method outside cash|card|e_transfer|other or an amount <= 0 — except 0 when nothing is owed, which sets paid with no payment row; {ok:false, error:over_balance, remaining} for more than is owed. Inserts an invoice_payments row, adds to paid_cents and, when the total is reached, sets status paid — the only way a bill becomes paid. Audited (invoice.payment_recorded); no notification. Returns {ok, paid_cents, remaining, status}.';

revoke all on function public.clinic_record_payment(uuid, integer, text) from public, anon;
grant execute on function public.clinic_record_payment(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Voiding a bill
-- ---------------------------------------------------------------------------
create or replace function public.clinic_void_invoice(p_invoice uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv       public.invoices%rowtype;
  v_reason  text := nullif(regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g'), '');
  v_told    integer := 0;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not (coalesce(public.staff_of_business(inv.business_id), false)
          or coalesce(public.is_admin(), false)) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if v_reason is null then
    raise exception 'Say why the bill is void — the reason is kept on the bill' using errcode = '22023';
  end if;
  if length(v_reason) > 2000 then
    raise exception 'The reason is too long (2000 characters at most)' using errcode = '22023';
  end if;

  -- What may be voided, stated. declined and void are final.
  if inv.status not in ('draft', 'sent', 'approved', 'paid') then
    return jsonb_build_object('ok', false, 'error', 'not_voidable', 'status', inv.status);
  end if;

  -- Appended, so the practice's own note (and an owner's decline note)
  -- survives. Payment rows are not touched: a refund happens outside the app.
  update public.invoices
     set status = 'void',
         note = concat_ws(E'\n\n', nullif(trim(coalesce(note, '')), ''), 'Voided: ' || v_reason)
   where id = inv.id;

  -- Only a bill the owner has seen. A draft never reached them (owners never
  -- read a draft, 20261010000001), so voiding one tells nobody.
  if inv.status in ('sent', 'approved', 'paid') then
    insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
    select p.owner_id, 'clinic', 'warning',
           case when inv.kind = 'estimate' then 'Estimate voided — ' else 'Invoice voided — ' end
             || coalesce(b.name, 'your vet'),
           coalesce(b.name, 'Your vet') || ' voided '
             || case when inv.kind = 'estimate' then 'the estimate' else 'the invoice' end
             || ' for ' || p.name || ' ('
             || to_char(inv.total_cents / 100.0, 'FM999,999,990.00') || ' ' || upper(inv.currency) || ').'
             || case when inv.paid_cents > 0
                     then ' Talk to the clinic about anything you already paid.'
                     else '' end
             || ' Reason: ' || left(v_reason, 200),
           case when inv.kind = 'estimate' then 'View estimate' else 'View invoice' end,
           'my-vets:bills'
      from public.clinic_patients cp
      join public.pets p on p.id = cp.pet_id
      left join public.businesses b on b.id = inv.business_id
     where cp.id = inv.patient_id;
    get diagnostics v_told = row_count;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'invoice.voided', 'invoice', inv.id,
          jsonb_build_object('business_id', inv.business_id, 'from', inv.status,
                             'reason', v_reason, 'paid_cents', inv.paid_cents,
                             'owner_told', v_told > 0));

  return jsonb_build_object('ok', true, 'status', 'void', 'owner_notified', v_told > 0);
end;
$$;

comment on function public.clinic_void_invoice(uuid, text) is
  'Staff of the business or an admin void a draft, sent, approved or paid bill with a required reason (trimmed of all whitespace, <= 2000; 22023) (20261016000001). {ok:false, error: not_found | forbidden | not_voidable}. Appends "Voided: <reason>" to invoices.note. Tells the pet''s owner (kind clinic, warning, target my-vets:bills) only if the bill had reached them — sent, approved or paid. invoice_payments rows are kept. Audited (invoice.voided). Returns {ok, status, owner_notified}.';

revoke all on function public.clinic_void_invoice(uuid, text) from public, anon;
grant execute on function public.clinic_void_invoice(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. clinic_set_invoice_status no longer pays or voids
-- ---------------------------------------------------------------------------
-- LIVE definition (as 20261010000001), with `paid` and `void` taken out of
-- the transition table and the paid_cents assignment that only `paid` used.
-- Same signature, so the existing grants stand; p_paid_cents is accepted and
-- ignored, so an old client's "mark paid" resolves and is refused as
-- illegal_transition.
create or replace function public.clinic_set_invoice_status(
  p_invoice uuid,
  p_status text,
  p_paid_cents integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare inv record; ok boolean;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.staff_of_business(inv.business_id) and not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- 20261016000001: paying goes through clinic_record_payment and voiding
  -- through clinic_void_invoice; neither is a move this function makes.
  ok := case inv.status
    when 'draft'    then p_status in ('sent')
    when 'sent'     then p_status in ('approved','draft')
    else false end;
  if not coalesce(ok, false) then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', inv.status, 'to', p_status);
  end if;
  update public.invoices set
    status = p_status,
    issued_on = case when p_status = 'sent' and issued_on is null then current_date else issued_on end
  where id = p_invoice;

  -- Part E (20261010000001): the owner learns a bill has reached them. Only
  -- on draft -> sent — the move that makes it readable to them at all.
  if inv.status = 'draft' and p_status = 'sent' then
    insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
    select p.owner_id, 'clinic', 'info',
           case when inv.kind = 'estimate' then 'Estimate from ' else 'Invoice from ' end
             || coalesce(b.name, 'your vet'),
           coalesce(b.name, 'Your vet') || ' sent '
             || case when inv.kind = 'estimate' then 'an estimate' else 'an invoice' end
             || ' for ' || p.name || ': '
             || to_char(inv.total_cents / 100.0, 'FM999,999,990.00') || ' ' || upper(inv.currency) || '. '
             || case when inv.kind = 'estimate'
                     then 'Review and approve it before treatment starts.'
                     else 'Pay the clinic directly.' end,
           case when inv.kind = 'estimate' then 'Review estimate' else 'View invoice' end,
           'my-vets:bills'
      from public.clinic_patients cp
      join public.pets p on p.id = cp.pet_id
      left join public.businesses b on b.id = inv.business_id
     where cp.id = inv.patient_id;
  end if;

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

comment on function public.clinic_set_invoice_status(uuid, text, integer) is
  'Staff of the business or an admin move a bill draft -> sent (notifying the pet''s owner, target my-vets:bills) and sent -> approved | draft (20261016000001). Paying is clinic_record_payment and voiding is clinic_void_invoice; any other move is {ok:false, error:illegal_transition, from, to}. p_paid_cents is accepted and ignored, kept so older clients'' calls resolve.';

-- ---------------------------------------------------------------------------
-- 6. Clients cannot write money or status onto an invoice
-- ---------------------------------------------------------------------------
-- Security invoker on purpose: current_user is then the caller's role for a
-- direct client write, and the definer's owner inside every security definer
-- function (the RPCs, invoice_recalc), which is how definer writes pass.
-- search_path '' and every reference qualified, as service_bookings_update_
-- guard (20261015000005).
create or replace function public.invoices_client_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- What a client may create, stated: a draft, nothing paid, no totals yet
    -- (invoice_recalc derives them from the lines).
    if new.status is distinct from 'draft' or new.paid_cents is distinct from 0
       or new.subtotal_cents is distinct from 0 or new.tax_cents is distinct from 0
       or new.total_cents is distinct from 0 then
      raise exception 'Only Pet10x can change that'
        using errcode = '42501',
              hint    = 'A new bill starts as a draft with no money on it; lines set its totals.';
    end if;
    return new;
  end if;

  if (new.status, new.paid_cents, new.subtotal_cents, new.tax_cents, new.total_cents)
     is distinct from
     (old.status, old.paid_cents, old.subtotal_cents, old.tax_cents, old.total_cents) then
    raise exception 'Only Pet10x can change that'
      using errcode = '42501',
            hint    = 'Send with clinic_set_invoice_status, take payment with clinic_record_payment, void with clinic_void_invoice; totals follow the lines.';
  end if;
  return new;
end;
$guard$;

comment on function public.invoices_client_guard() is
  'BEFORE INSERT OR UPDATE on invoices (20261016000001). For client roles (authenticated, anon) only: an insert must be status draft with paid_cents, subtotal_cents, tax_cents and total_cents all 0; an update may not change status, paid_cents, subtotal_cents, tax_cents or total_cents. Raises 42501. Definer functions (clinic_set_invoice_status, clinic_record_payment, clinic_void_invoice, owner_approve_estimate, owner_decline_estimate, invoice_recalc) and the connection role pass, because current_user is not a client role inside them.';

revoke all on function public.invoices_client_guard() from public, anon, authenticated;

drop trigger if exists trg_invoices_client_guard on public.invoices;
create trigger trg_invoices_client_guard
  before insert or update on public.invoices
  for each row execute function public.invoices_client_guard();
