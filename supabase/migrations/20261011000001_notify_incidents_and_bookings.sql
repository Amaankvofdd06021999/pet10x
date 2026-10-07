-- Part D §1 — the three events that told nobody.
--
-- An incident report sat in the manager's Incidents queue with no signal that
-- it had arrived; a booking request sat in the business's Bookings tab the
-- same way; and a customer whose booking was confirmed, declined or completed
-- learned it only by opening My Bookings. All three are now notifications.
--
-- Triggers rather than edits to the writers. A report arrives through
-- `submit_incident_report` (guests and residents), the capture RPCs, and the
-- `incidents_insert_auth` policy; a booking through a client insert; a status
-- change through two RLS update policies and `business_mark_booking_paid`.
-- One trigger per event covers every door, including ones added later.
--
-- SECURITY DEFINER because every one of these notifications is addressed to
-- somebody other than the person acting, and the only client insert policy on
-- `notifications` is `kind = 'assistant'` for oneself. Trigger functions are
-- granted to nobody: they run as the trigger, never as a call.

-- ---------------------------------------------------------------------------
-- 1. A new incident report → every manager of its building
-- ---------------------------------------------------------------------------
create or replace function public.notify_managers_of_incident()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_label text;
  v_where text;
begin
  -- Mirrors INCIDENT_TYPE_LABEL in lib/data/incidents.ts.
  v_label := case new.type
    when 'noise'        then 'Noise / barking'
    when 'aggressive'   then 'Aggressive behaviour'
    when 'off_leash'    then 'Off-leash'
    when 'waste'        then 'Waste not cleaned'
    when 'damage'       then 'Property damage'
    when 'unregistered' then 'Unregistered pet'
    else 'Other'
  end;

  /* The body names WHERE, never WHO. A report can be anonymous, and a guest
     report can carry the reporter's phone or email in its own columns; none of
     it belongs in a notification that is also emailed and pushed to a lock
     screen. The manager reads the full report on the Incidents screen, under
     that screen's own rules. */
  v_where := nullif(trim(coalesce(new.location_text, '')), '');

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target, building_id)
  select
    bm.profile_id,
    'incident',
    case when new.type = 'aggressive' then 'warning' else 'info' end,
    'New incident: ' || v_label || coalesce(' · ' || new.reference_code, ''),
    case when v_where is not null
         then 'Reported at ' || left(v_where, 120) || '. Open Incidents to review and triage it.'
         else 'Open Incidents to review and triage it.' end,
    'Open incidents',
    'incidents',
    new.building_id
  from public.building_managers bm
  join public.profiles p on p.id = bm.profile_id
  where bm.building_id = new.building_id
    and not p.is_suspended
    -- A manager who files a report in their own building already knows.
    and bm.profile_id is distinct from new.reporter_id;

  return null;
end;
$$;
revoke all on function public.notify_managers_of_incident() from public, anon, authenticated;

drop trigger if exists trg_incident_reports_notify on public.incident_reports;
create trigger trg_incident_reports_notify
  after insert on public.incident_reports
  for each row execute function public.notify_managers_of_incident();

-- ---------------------------------------------------------------------------
-- 2. A new booking → the business owner
-- ---------------------------------------------------------------------------
/* Times are rendered in the RECIPIENT's zone, with the same fallback the care
   reminder cron uses (app/api/care/reminders/run/route.ts, DEFAULT_TZ): a
   notification read in Vancouver must not say a 10:00 booking is at 17:00. */
create or replace function public.booking_when(p_at timestamptz, p_profile uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when p_at is null then null else
    to_char(p_at at time zone coalesce(
      (select nullif(timezone, '') from public.profiles
        where id = p_profile and timezone in (select name from pg_timezone_names)),
      'America/Vancouver'), 'Dy DD Mon, HH12:MI AM')
  end
$$;
revoke all on function public.booking_when(timestamptz, uuid) from public, anon, authenticated;

create or replace function public.notify_business_of_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner   uuid;
  v_service text;
  v_pet     text;
  v_who     text;
  v_when    text;
begin
  select b.owner_id into v_owner from public.businesses b where b.id = new.business_id;
  -- No owner, or the owner booking their own business: nobody to tell.
  if v_owner is null or v_owner = new.customer_id then return null; end if;
  if exists (select 1 from public.profiles where id = v_owner and is_suspended) then return null; end if;

  select s.name into v_service from public.business_services s where s.id = new.service_id;
  select p.name into v_pet from public.pets p where p.id = new.pet_id;
  -- The business already reads its customers' names on the Bookings tab
  -- (profiles_business_customer_read); the first name is enough here.
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_who
    from public.profiles where id = new.customer_id;
  v_when := public.booking_when(new.scheduled_for, v_owner);

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target)
  values (
    v_owner,
    'appointment',
    'info',
    'New booking request' || coalesce(': ' || v_service, ''),
    coalesce(v_who, 'A customer') || ' asked to book'
      || coalesce(' ' || v_service, '')
      || coalesce(' for ' || v_pet, '')
      || coalesce(' on ' || v_when, '')
      || '. Confirm or decline it in Bookings.',
    'Open bookings',
    'business:bookings'
  );
  return null;
end;
$$;
revoke all on function public.notify_business_of_booking() from public, anon, authenticated;

drop trigger if exists trg_service_bookings_notify_insert on public.service_bookings;
create trigger trg_service_bookings_notify_insert
  after insert on public.service_bookings
  for each row execute function public.notify_business_of_booking();

-- ---------------------------------------------------------------------------
-- 3. confirmed / declined / completed → the customer
-- ---------------------------------------------------------------------------
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
  if new.status not in ('confirmed', 'declined', 'completed') then return null; end if;
  /* `bookings_customer_update` lets the customer write their own row. A
     customer who changes it has nothing to be told about. */
  if auth.uid() is not null and auth.uid() = new.customer_id then return null; end if;
  if exists (select 1 from public.profiles where id = new.customer_id and is_suspended) then return null; end if;

  select b.name into v_biz from public.businesses b where b.id = new.business_id;
  select s.name into v_service from public.business_services s where s.id = new.service_id;
  v_when := public.booking_when(new.scheduled_for, new.customer_id);
  v_reason := nullif(trim(coalesce(new.declined_reason, '')), '');

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target)
  values (
    new.customer_id,
    'appointment',
    case new.status when 'declined' then 'warning' else 'success' end,
    case new.status
      when 'confirmed' then 'Booking confirmed'
      when 'declined'  then 'Booking declined'
      else 'Booking completed'
    end || coalesce(' — ' || v_biz, ''),
    case new.status
      when 'confirmed' then coalesce(v_biz, 'The business') || ' confirmed your booking'
                            || coalesce(' for ' || v_service, '') || coalesce(' on ' || v_when, '') || '.'
      when 'declined'  then coalesce(v_biz, 'The business') || ' could not take your booking'
                            || coalesce(' for ' || v_service, '') || '.'
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

drop trigger if exists trg_service_bookings_notify_status on public.service_bookings;
create trigger trg_service_bookings_notify_status
  after update of status on public.service_bookings
  for each row execute function public.notify_customer_of_booking_status();
