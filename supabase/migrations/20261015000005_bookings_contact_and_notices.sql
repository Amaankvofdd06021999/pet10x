-- Pet10x — bookings carry contact details, cancellations explain themselves,
-- owners can cancel vet visits and decline estimates.
--
-- THE GAPS (UX audit, businesses and their customers):
--   * A business had no phone or email on Pet10x, and could not reach the
--     customer behind a confirmed booking either: the Bookings tab shows a
--     first name and nothing to call.
--   * A business could only decline a request. Cancelling a confirmed booking
--     was a raw status update with no reason, and notify_customer_of_booking_
--     status never covered `cancelled`, so the customer found out by turning
--     up.
--   * A pet owner could book a vet visit and approve an estimate, but not
--     cancel the visit or say no to the estimate — both meant phoning.
--   * Appointments told nobody anything (VC-3): only trg_appts_updated sits on
--     the table. A request waited unseen until someone opened Today, and the
--     owner never heard it was confirmed, declined, cancelled or missed.
--
-- WHAT THIS DOES
--
--   1. businesses.contact_phone / contact_email — nullable text, each held to
--      a grammar by a CHECK (phone ^[+0-9 ()-]{7,20}$, the one verification
--      uses; email ^[^\s@]+@[^\s@]+\.[^\s@]+$). The owner already updates them
--      through businesses_owner_update (20261015000002) — no policy change.
--      They are business contact details, readable wherever the row is.
--
--   2. service_bookings.cancelled_reason (<= 2000 characters) and
--      cancelled_by ('customer' | 'business'), both set only by the two
--      cancel RPCs below. service_bookings_insert_guard (20261012000008,
--      copied verbatim) also clears both on a client insert.
--
--   3. business_cancel_booking(p_booking, p_reason) -> jsonb. The caller must
--      administer the booking's business — can_admin_business: its owner, or
--      active owner/manager staff — and not be suspended (42501). The reason
--      is required, trimmed, <= 2000 (22023). Only from requested or confirmed;
--      anything else is {ok:false, error:'not_cancellable'}. Sets cancelled,
--      the reason and cancelled_by 'business'; the status trigger (4) tells
--      the customer.
--
--   4. notify_customer_of_booking_status — LIVE definition (as
--      20261012000009) verbatim, plus `cancelled` when cancelled_by is
--      'business': "Booking cancelled — {biz}", warning, quoting the reason.
--      A customer's own cancellation stays silent to them twice over: the
--      auth.uid() guard, and cancelled_by 'customer'.
--
--   5. customer_cancel_booking — LIVE definition (as 20261012000004)
--      verbatim, plus cancelled_by = 'customer' on its one update.
--
--   6. business_booking_contact(p_booking) -> jsonb {email, phone}: the
--      customer's profile email and phone, to someone who administers the
--      booking's business, while the booking is confirmed, in_progress,
--      completed or paid. Anyone else, and any other status, gets
--      {email:null, phone:null} — a request is not yet an introduction.
--
--   7. owner_cancel_appointment(p_appointment, p_reason default null) -> jsonb.
--      Only the pet's owner (appointments -> clinic_patients -> pets.owner_id,
--      the owner_approve_estimate path), else 42501. Only from requested or
--      booked ({ok:false, error:'not_cancellable'}), and only while the start
--      is more than 2 hours away ({ok:false, error:'too_late'}) — inside that
--      the slot cannot be re-used and the owner should phone. Stamps
--      cancelled_at and cancel_reason; notifies the practice's administrators
--      (owner_approve_estimate's recipients) with target clinic:today.
--
--   8. owner_decline_estimate(p_invoice, p_note) -> jsonb. Owner only (42501);
--      the note is required, trimmed, <= 2000 (22023); kind estimate and
--      status sent only (not_an_estimate / not_awaiting_approval, the codes
--      owner_approve_estimate uses). Sets status `declined` — added to the
--      invoices status CHECK here — and appends "Owner declined: {note}" to
--      invoices.note, keeping whatever the practice wrote. Notifies the same
--      recipients as approval, target clinic:billing. clinic_set_invoice_
--      status's transition table has no row for `declined`, so a declined
--      estimate is final; the practice writes a new one.
--
--   9. Appointment notifications (VC-3):
--      * AFTER INSERT, status requested: the business owner and active
--        owner/manager/reception staff hear of it, target clinic:today.
--      * AFTER UPDATE OF status to booked, cancelled or no_show, made by
--        someone other than the pet's owner: the owner hears, target
--        my-vets:visits. requested -> cancelled reads as a declined request;
--        no_show -> booked as a rebooking. cancel_reason is quoted only when
--        that same change wrote it.
--      Suspended recipients are skipped throughout.
--
-- Whitespace: every required reason is trimmed of all whitespace (tabs and
-- newlines too, regexp `\s`), not just spaces — btrim() alone leaves a tab,
-- which is not a reason. The same expression, nullif(regexp_replace(coalesce(x,
-- ''), '^\s+|\s+$', '', 'g'), ''), is used in 20261015000001 and 000003.

-- ---------------------------------------------------------------------------
-- 1. Business contact details
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists contact_phone text,
  add column if not exists contact_email text;

alter table public.businesses
  drop constraint if exists businesses_contact_phone_grammar,
  add constraint businesses_contact_phone_grammar
    check (contact_phone is null or contact_phone ~ '^[+0-9 ()-]{7,20}$'),
  drop constraint if exists businesses_contact_email_grammar,
  add constraint businesses_contact_email_grammar
    check (contact_email is null or contact_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$');

comment on column public.businesses.contact_phone is
  'How customers reach the business (20261015000005). Null, or ^[+0-9 ()-]{7,20}$.';
comment on column public.businesses.contact_email is
  'How customers reach the business (20261015000005). Null, or ^[^\s@]+@[^\s@]+\.[^\s@]+$.';

-- ---------------------------------------------------------------------------
-- 2. Who cancelled a booking, and why
-- ---------------------------------------------------------------------------
alter table public.service_bookings
  add column if not exists cancelled_reason text,
  add column if not exists cancelled_by text;

alter table public.service_bookings
  drop constraint if exists service_bookings_cancelled_reason_length,
  add constraint service_bookings_cancelled_reason_length
    check (cancelled_reason is null or length(cancelled_reason) <= 2000),
  drop constraint if exists service_bookings_cancelled_by_grammar,
  add constraint service_bookings_cancelled_by_grammar
    check (cancelled_by is null or cancelled_by in ('customer', 'business'));

comment on column public.service_bookings.cancelled_reason is
  'Why the business cancelled (business_cancel_booking, 20261015000005). At most 2000 characters.';
comment on column public.service_bookings.cancelled_by is
  'customer (customer_cancel_booking) or business (business_cancel_booking), 20261015000005.';

-- A customer books; they do not pre-cancel. service_bookings_insert_guard
-- (20261012000008, the latest definition) verbatim, plus the two new columns
-- cleared on a client insert, as it clears declined_reason. The trigger is
-- unchanged and is not recreated.
create or replace function public.service_bookings_insert_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
declare
  v_price    integer;
  v_currency text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.service_id is not null then
    select s.price_cents, s.currency into v_price, v_currency
      from public.business_services s
     where s.id = new.service_id and s.business_id = new.business_id and s.active;
    if not found then
      raise exception 'That service isn''t available to book'
        using errcode = '22023',
              hint    = 'The service must belong to the business you are booking and be active.';
    end if;
  end if;

  new.status           := 'requested';
  new.responded_at     := null;
  new.payment_id       := null;
  new.declined_reason  := null;
  new.cancelled_reason := null;
  new.cancelled_by     := null;
  new.amount_cents     := coalesce(v_price, 0);
  new.currency         := coalesce(v_currency, new.currency, 'cad');
  new.commission_cents := round(coalesce(v_price, 0) * 0.15)::integer;
  return new;
end;
$guard$;

comment on function public.service_bookings_insert_guard() is
  'BEFORE INSERT on service_bookings (20261012000008; cancelled_* added 20261015000005). For authenticated/anon callers, rewrites status to requested, clears responded_at / payment_id / declined_reason / cancelled_reason / cancelled_by, and sets amount_cents, currency and commission_cents (15%) from the booked, active business_services row of the same business (0 with no service). Refuses a service that is not that business''s or not active (22023). Service role and definer RPCs pass untouched.';

revoke all on function public.service_bookings_insert_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. A business cancels a booking, with a reason
-- ---------------------------------------------------------------------------
create or replace function public.business_cancel_booking(p_booking uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me     uuid := auth.uid();
  v_row    public.service_bookings%rowtype;
  v_reason text := nullif(regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g'), '');
begin
  if v_me is null then
    raise exception 'Sign in to cancel a booking' using errcode = '42501';
  end if;

  select * into v_row from public.service_bookings where id = p_booking for update;
  -- A missing booking reads the same as someone else's: nothing to learn.
  if not found
     or v_row.business_id is null
     or not public.can_admin_business(v_row.business_id)
     or exists (select 1 from public.profiles where id = v_me and is_suspended) then
    raise exception 'Only the business can cancel this booking' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'Tell the customer why — they see this reason' using errcode = '22023';
  end if;
  if length(v_reason) > 2000 then
    raise exception 'The reason is too long (2000 characters at most)' using errcode = '22023';
  end if;

  if v_row.status not in ('requested', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable', 'status', v_row.status);
  end if;

  -- notify_customer_of_booking_status (below) tells the customer, from the
  -- columns written here.
  update public.service_bookings
     set status = 'cancelled', cancelled_reason = v_reason, cancelled_by = 'business'
   where id = p_booking;

  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

comment on function public.business_cancel_booking(uuid, text) is
  'Business owner or active owner/manager staff (can_admin_business, unsuspended) cancels a requested or confirmed booking with a required reason (trimmed, <= 2000; 22023) (20261015000005). Sets cancelled_reason and cancelled_by business; the status trigger notifies the customer. 42501 for anyone else; {ok:false, error:not_cancellable} from any other status.';

revoke all on function public.business_cancel_booking(uuid, text) from public, anon;
grant execute on function public.business_cancel_booking(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The customer hears about a business's cancellation
-- ---------------------------------------------------------------------------
-- LIVE body (identical to 20261012000009), with `cancelled` added: the status
-- list, one guard (only a business's cancellation), the reason column it
-- quotes (trimmed of all whitespace, as every reason in this migration), and a
-- branch in each CASE.
create or replace function public.notify_customer_of_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_biz     text;
  v_service text;
  v_when    text;
  v_reason  text;
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status not in ('confirmed', 'declined', 'completed', 'cancelled') then return null; end if;
  /* A booking whose customer deleted their account has nobody to tell. */
  if new.customer_id is null then return null; end if;
  /* Customers no longer write their own row (customer_cancel_booking is the
     only door, and it only cancels), but a customer who somehow changes it
     has nothing to be told about. */
  if auth.uid() is not null and auth.uid() = new.customer_id then return null; end if;
  /* 20261015000005: a cancellation is news only when the business made it —
     the customer who cancelled already knows. */
  if new.status = 'cancelled' and new.cancelled_by is distinct from 'business' then return null; end if;
  if exists (select 1 from public.profiles where id = new.customer_id and is_suspended) then return null; end if;

  select b.name into v_biz from public.businesses b where b.id = new.business_id;
  select s.name into v_service from public.business_services s where s.id = new.service_id;
  v_when := public.booking_when(new.scheduled_for, new.customer_id);
  v_reason := nullif(regexp_replace(coalesce(
    case when new.status = 'cancelled' then new.cancelled_reason else new.declined_reason end, ''),
    '^\s+|\s+$', '', 'g'), '');

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target)
  values (
    new.customer_id,
    'appointment',
    case when new.status in ('declined', 'cancelled') then 'warning' else 'success' end,
    case new.status
      when 'confirmed' then 'Booking confirmed'
      when 'declined'  then 'Booking declined'
      when 'cancelled' then 'Booking cancelled'
      else 'Booking completed'
    end || coalesce(' — ' || v_biz, ''),
    case new.status
      when 'confirmed' then coalesce(v_biz, 'The business') || ' confirmed your booking'
                            || coalesce(' for ' || v_service, '') || coalesce(' on ' || v_when, '') || '.'
      when 'declined'  then coalesce(v_biz, 'The business') || ' could not take your booking'
                            || coalesce(' for ' || v_service, '') || '.'
                            || coalesce(' Reason: ' || left(v_reason, 200), '')
      when 'cancelled' then coalesce(v_biz, 'The business') || ' cancelled your booking'
                            || coalesce(' for ' || v_service, '') || coalesce(' on ' || v_when, '') || '.'
                            || coalesce(' Reason: ' || left(v_reason, 200), '')
      else coalesce(v_biz, 'The business') || ' marked your booking'
           || coalesce(' for ' || v_service, '') || ' as completed. You can leave a review.'
    end,
    'My bookings',
    'my-bookings'
  );
  return null;
end;
$$;

revoke all on function public.notify_customer_of_booking_status() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. A customer's cancellation records who made it
-- ---------------------------------------------------------------------------
-- LIVE body (identical to 20261012000004), with cancelled_by = 'customer'
-- added to its update. Nothing else changes; the grants are restated.
create or replace function public.customer_cancel_booking(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me      uuid := auth.uid();
  v_row     public.service_bookings%rowtype;
  v_owner   uuid;
  v_service text;
  v_who     text;
  v_when    text;
begin
  if v_me is null then
    raise exception 'Sign in to cancel a booking' using errcode = '42501';
  end if;

  select * into v_row from public.service_bookings where id = p_booking for update;
  if not found or v_row.customer_id is distinct from v_me then
    raise exception 'That booking isn''t yours' using errcode = '42501';
  end if;
  if v_row.status = 'cancelled' then
    return;
  end if;
  if v_row.status not in ('requested', 'confirmed') then
    raise exception 'This booking can''t be cancelled any more'
      using errcode = '22023',
            hint    = 'Only a requested or confirmed booking can be cancelled. Contact the business about the rest.';
  end if;

  update public.service_bookings set status = 'cancelled', cancelled_by = 'customer' where id = p_booking;

  select b.owner_id into v_owner from public.businesses b where b.id = v_row.business_id;
  if v_owner is null or v_owner = v_me then return; end if;
  if exists (select 1 from public.profiles where id = v_owner and is_suspended) then return; end if;

  select s.name into v_service from public.business_services s where s.id = v_row.service_id;
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_who
    from public.profiles where id = v_me;
  v_when := public.booking_when(v_row.scheduled_for, v_owner);

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target)
  values (
    v_owner,
    'appointment',
    'warning',
    'Booking cancelled' || coalesce(': ' || v_service, ''),
    coalesce(v_who, 'A customer') || ' cancelled'
      || case when v_row.status = 'confirmed' then ' their confirmed booking' else ' their booking request' end
      || coalesce(' for ' || v_service, '')
      || coalesce(' on ' || v_when, '') || '.',
    'Open bookings',
    'business:bookings'
  );
end;
$$;

comment on function public.customer_cancel_booking(uuid) is
  'The one customer write on service_bookings (20261012000004). Moves the caller''s own booking from requested or confirmed to cancelled, with cancelled_by customer (20261015000005) — a repeat on a cancelled booking is a no-op — and notifies the business owner (kind appointment, target business:bookings). bookings_customer_update was dropped in 20261012000004.';

revoke all on function public.customer_cancel_booking(uuid) from public, anon;
grant execute on function public.customer_cancel_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The customer's contact details, once a booking is agreed
-- ---------------------------------------------------------------------------
create or replace function public.business_booking_contact(p_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_nothing constant jsonb := jsonb_build_object('email', null, 'phone', null);
  v_row     public.service_bookings%rowtype;
  v_email   text;
  v_phone   text;
begin
  if auth.uid() is null then return v_nothing; end if;

  select * into v_row from public.service_bookings where id = p_booking;
  if not found or v_row.customer_id is null or v_row.business_id is null then return v_nothing; end if;
  if v_row.status not in ('confirmed', 'in_progress', 'completed', 'paid') then return v_nothing; end if;
  if not public.can_admin_business(v_row.business_id)
     or exists (select 1 from public.profiles where id = auth.uid() and is_suspended) then
    return v_nothing;
  end if;

  select nullif(trim(coalesce(pr.email, '')), ''), nullif(trim(coalesce(pr.phone, '')), '')
    into v_email, v_phone
    from public.profiles pr where pr.id = v_row.customer_id;
  return jsonb_build_object('email', v_email, 'phone', v_phone);
end;
$$;

comment on function public.business_booking_contact(uuid) is
  'The customer''s profile email and phone for a booking (20261015000005) — only to someone who administers its business (can_admin_business, unsuspended) and only while it is confirmed, in_progress, completed or paid. Otherwise {email:null, phone:null}; never raises.';

revoke all on function public.business_booking_contact(uuid) from public, anon;
grant execute on function public.business_booking_contact(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The owner cancels a vet visit
-- ---------------------------------------------------------------------------
create or replace function public.owner_cancel_appointment(p_appointment uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me     uuid := auth.uid();
  v_appt   record;
  v_reason text := nullif(regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g'), '');
  v_who    text;
begin
  if v_me is null then
    raise exception 'Sign in to cancel a visit' using errcode = '42501';
  end if;

  select a.id, a.business_id, a.status, a.starts_at, p.owner_id, p.name as pet_name
    into v_appt
    from public.appointments a
    join public.clinic_patients cp on cp.id = a.patient_id
    join public.pets p on p.id = cp.pet_id
   where a.id = p_appointment
     for update of a;
  if not found or v_appt.owner_id is distinct from v_me then
    raise exception 'That visit isn''t yours to cancel' using errcode = '42501';
  end if;

  if length(v_reason) > 2000 then
    raise exception 'The reason is too long (2000 characters at most)' using errcode = '22023';
  end if;
  if v_appt.status not in ('requested', 'booked') then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable', 'status', v_appt.status);
  end if;
  if v_appt.starts_at <= now() + interval '2 hours' then
    return jsonb_build_object('ok', false, 'error', 'too_late');
  end if;

  update public.appointments
     set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason
   where id = p_appointment;

  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_who
    from public.profiles where id = v_me;

  -- owner_approve_estimate's recipients: the business owner (whose own staff
  -- row may say veterinarian) and active owner/manager staff, de-duplicated
  -- by `union`, unsuspended, not the caller.
  insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
  select r.profile_id, 'clinic', 'warning',
         'Appointment cancelled — ' || v_appt.pet_name,
         coalesce(v_who, 'The owner') || ' cancelled ' || v_appt.pet_name || '''s '
           || case when v_appt.status = 'requested' then 'appointment request' else 'appointment' end
           || coalesce(' on ' || public.booking_when(v_appt.starts_at, r.profile_id), '') || '.'
           || coalesce(' Reason: ' || left(v_reason, 200), ''),
         'Open today',
         'clinic:today'
    from (
      select b.owner_id as profile_id from public.businesses b where b.id = v_appt.business_id
      union
      select s.profile_id from public.business_staff s
       where s.business_id = v_appt.business_id and s.is_active and s.role in ('owner', 'manager')
    ) r
    join public.profiles pr on pr.id = r.profile_id
   where not pr.is_suspended and r.profile_id is distinct from v_me;

  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

comment on function public.owner_cancel_appointment(uuid, text) is
  'The pet''s owner cancels a requested or booked appointment more than 2 hours before it starts (20261015000005). Optional reason (trimmed, <= 2000; 22023) stored as cancel_reason. 42501 for anyone else; {ok:false, error: not_cancellable | too_late}. Notifies the business owner and active owner/manager staff (kind clinic, target clinic:today).';

revoke all on function public.owner_cancel_appointment(uuid, text) from public, anon;
grant execute on function public.owner_cancel_appointment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The owner declines an estimate
-- ---------------------------------------------------------------------------
-- invoices.status is text with an inline CHECK (20260901000006), so Postgres
-- named it; find it by what it says rather than trusting the name, and put
-- back the same list plus `declined`. Exactly one must match: none means the
-- table is not what this migration was written against, and two would mean
-- dropping a constraint it does not understand — either way, stop.
do $$
declare
  v_names text[];
begin
  select array_agg(c.conname order by c.conname) into v_names
    from pg_catalog.pg_constraint c
   where c.conrelid = 'public.invoices'::regclass and c.contype = 'c'
     and pg_catalog.pg_get_constraintdef(c.oid) ilike '%status%'
     and pg_catalog.pg_get_constraintdef(c.oid) ilike '%void%';
  if coalesce(array_length(v_names, 1), 0) <> 1 then
    raise exception 'Expected exactly one invoices status CHECK, found %', coalesce(array_length(v_names, 1), 0)
      using detail = 'Matched: ' || coalesce(array_to_string(v_names, ', '), '(none)');
  end if;
  execute format('alter table public.invoices drop constraint %I', v_names[1]);
end $$;

alter table public.invoices
  add constraint invoices_status_check
    check (status in ('draft', 'sent', 'approved', 'declined', 'paid', 'void'));

create or replace function public.owner_decline_estimate(p_invoice uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me   uuid := auth.uid();
  inv    record;
  v_note text := nullif(regexp_replace(coalesce(p_note, ''), '^\s+|\s+$', '', 'g'), '');
begin
  if v_me is null then
    raise exception 'Sign in to decline an estimate' using errcode = '42501';
  end if;

  select i.id, i.business_id, i.kind, i.status, i.number, i.total_cents, i.currency,
         p.owner_id, p.name as pet_name
    into inv
    from public.invoices i
    join public.clinic_patients cp on cp.id = i.patient_id
    join public.pets p on p.id = cp.pet_id
   where i.id = p_invoice
     for update of i;
  if not found or inv.owner_id is distinct from v_me then
    raise exception 'That estimate isn''t yours' using errcode = '42501';
  end if;

  if v_note is null then
    raise exception 'Tell the practice why — they see this note' using errcode = '22023';
  end if;
  if length(v_note) > 2000 then
    raise exception 'The note is too long (2000 characters at most)' using errcode = '22023';
  end if;

  if inv.kind is distinct from 'estimate' then
    return jsonb_build_object('ok', false, 'error', 'not_an_estimate');
  end if;
  if inv.status is distinct from 'sent' then
    return jsonb_build_object('ok', false, 'error', 'not_awaiting_approval');
  end if;

  -- Appended, so the practice's own note on the estimate survives.
  update public.invoices
     set status = 'declined',
         note = concat_ws(E'\n\n', nullif(trim(coalesce(note, '')), ''), 'Owner declined: ' || v_note)
   where id = p_invoice;

  insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
  select r.profile_id, 'clinic', 'warning',
         'Estimate declined for ' || inv.pet_name,
         'The owner declined the ' || coalesce('estimate ' || inv.number, 'estimate') || ' for '
           || inv.pet_name || ' ('
           || to_char(inv.total_cents / 100.0, 'FM999,999,990.00') || ' ' || upper(inv.currency) || ').'
           || ' Reason: ' || left(v_note, 200),
         'Open billing',
         'clinic:billing'
    from (
      select b.owner_id as profile_id from public.businesses b where b.id = inv.business_id
      union
      select s.profile_id from public.business_staff s
       where s.business_id = inv.business_id and s.is_active and s.role in ('owner', 'manager')
    ) r
    join public.profiles pr on pr.id = r.profile_id
   where not pr.is_suspended and r.profile_id is distinct from v_me;

  return jsonb_build_object('ok', true, 'status', 'declined');
end;
$$;

comment on function public.owner_decline_estimate(uuid, text) is
  'The pet''s owner declines a sent estimate with a required note (trimmed, <= 2000; 22023) (20261015000005). Status -> declined; "Owner declined: <note>" appended to invoices.note. 42501 for anyone else; {ok:false, error: not_an_estimate | not_awaiting_approval}. Notifies the business owner and active owner/manager staff (kind clinic, target clinic:billing).';

revoke all on function public.owner_decline_estimate(uuid, text) from public, anon;
grant execute on function public.owner_decline_estimate(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9a. A visit request reaches the practice (VC-3)
-- ---------------------------------------------------------------------------
create or replace function public.notify_clinic_of_appointment_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pet  text;
  v_who  text;
begin
  if new.status is distinct from 'requested' then return null; end if;

  select cp.name into v_pet from public.clinic_patients cp where cp.id = new.patient_id;
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_who
    from public.profiles where id = new.booked_by;

  -- The business owner and the people who answer requests: active owner,
  -- manager and reception staff. Clinical staff hear once it is booked, on
  -- their calendar. Not the person who made the request, should they be staff.
  insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
  select r.profile_id, 'clinic', 'info',
         'Appointment request' || coalesce(' — ' || v_pet, ''),
         coalesce(v_who, 'An owner') || ' asked for '
           || coalesce(nullif(trim(coalesce(new.reason, '')), ''), 'an appointment')
           || coalesce(' for ' || v_pet, '')
           || coalesce(' on ' || public.booking_when(new.starts_at, r.profile_id), '')
           || '. Confirm or decline it on Today.',
         'Open today',
         'clinic:today'
    from (
      select b.owner_id as profile_id from public.businesses b where b.id = new.business_id
      union
      select s.profile_id from public.business_staff s
       where s.business_id = new.business_id and s.is_active
         and s.role in ('owner', 'manager', 'reception')
    ) r
    join public.profiles pr on pr.id = r.profile_id
   where not pr.is_suspended and r.profile_id is distinct from auth.uid();
  return null;
end;
$$;

revoke all on function public.notify_clinic_of_appointment_request() from public, anon, authenticated;

drop trigger if exists trg_appts_notify_request on public.appointments;
create trigger trg_appts_notify_request
  after insert on public.appointments
  for each row
  when (new.status = 'requested')
  execute function public.notify_clinic_of_appointment_request();

-- ---------------------------------------------------------------------------
-- 9b. The owner hears what the practice did with their visit (VC-3)
-- ---------------------------------------------------------------------------
create or replace function public.notify_owner_of_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner  uuid;
  v_pet    text;
  v_clinic text;
  v_when   text;
  v_reason text;
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status not in ('booked', 'cancelled', 'no_show') then return null; end if;

  select p.owner_id, p.name into v_owner, v_pet
    from public.clinic_patients cp join public.pets p on p.id = cp.pet_id
   where cp.id = new.patient_id;
  /* A chart with no linked pet has no Pet10x owner to tell. */
  if v_owner is null then return null; end if;
  /* The owner's own change (owner_cancel_appointment) is not news to them. */
  if auth.uid() is not null and auth.uid() = v_owner then return null; end if;
  if exists (select 1 from public.profiles where id = v_owner and is_suspended) then return null; end if;

  select b.name into v_clinic from public.businesses b where b.id = new.business_id;
  v_clinic := coalesce(nullif(trim(coalesce(v_clinic, '')), ''), 'Your vet');
  v_when := public.booking_when(new.starts_at, v_owner);
  /* Quote cancel_reason only when THIS change wrote it. clinic_set_
     appointment_status keeps the old value when no note is given
     (coalesce(p_note, cancel_reason)), so a note the practice left when
     marking a visit missed — possibly internal — would otherwise surface
     on a later, note-less cancel. */
  if new.cancel_reason is distinct from old.cancel_reason then
    v_reason := nullif(regexp_replace(coalesce(new.cancel_reason, ''), '^\s+|\s+$', '', 'g'), '');
  end if;

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target)
  values (
    v_owner,
    'appointment',
    case when new.status = 'booked' then 'success' else 'warning' end,
    case
      when new.status = 'booked' and old.status = 'no_show' then 'Appointment rebooked'
      when new.status = 'booked' then 'Appointment confirmed'
      when new.status = 'no_show' then 'Marked as missed'
      when old.status = 'requested' then 'Appointment request declined'
      else 'Appointment cancelled'
    end,
    case
      when new.status = 'booked' and old.status = 'no_show' then
        v_clinic || ' rebooked ' || v_pet || '''s appointment' || coalesce(' on ' || v_when, '') || '.'
      when new.status = 'booked' then
        v_clinic || ' confirmed ' || v_pet || '''s appointment' || coalesce(' on ' || v_when, '') || '.'
      when new.status = 'no_show' then
        v_clinic || ' marked ' || v_pet || '''s appointment' || coalesce(' on ' || v_when, '')
          || ' as missed. Contact them to book again.'
      when old.status = 'requested' then
        v_clinic || ' couldn''t take your request for ' || v_pet || '.'
          || coalesce(' Reason: ' || left(v_reason, 200), '')
      else
        v_clinic || ' cancelled ' || v_pet || '''s appointment' || coalesce(' on ' || v_when, '') || '.'
          || coalesce(' Reason: ' || left(v_reason, 200), '')
    end,
    'Open visits',
    'my-vets:visits'
  );
  return null;
end;
$$;

revoke all on function public.notify_owner_of_appointment_status() from public, anon, authenticated;

drop trigger if exists trg_appts_notify_status on public.appointments;
create trigger trg_appts_notify_status
  after update of status on public.appointments
  for each row
  when (new.status is distinct from old.status)
  execute function public.notify_owner_of_appointment_status();
