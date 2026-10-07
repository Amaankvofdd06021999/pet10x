-- A booking whose customer deleted their account can still be answered.
--
-- 20261012000001 made service_bookings.customer_id ON DELETE SET NULL, so a
-- booking survives its customer's account deletion with no customer. The
-- status trigger from 20261011000001 then inserted a notification with a NULL
-- profile_id, which notifications.profile_id (NOT NULL) refuses — so the
-- business's confirm / decline / complete failed outright on that booking.
--
-- Copied verbatim from 20261011000001 with one change: a booking with no
-- customer has nobody to tell, so the trigger returns before notifying. The
-- comment about bookings_customer_update is also updated — that policy was
-- dropped in 20261012000004 and customers now cancel through
-- customer_cancel_booking, so a customer never moves a booking to one of the
-- three statuses below; the auth.uid() check stays as a belt.

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
  /* A booking whose customer deleted their account has nobody to tell. */
  if new.customer_id is null then return null; end if;
  /* Customers no longer write their own row (customer_cancel_booking is the
     only door, and it only cancels), but a customer who somehow changes it
     has nothing to be told about. */
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
