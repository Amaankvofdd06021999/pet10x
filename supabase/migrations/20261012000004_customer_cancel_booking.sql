-- Pet10x — Part F: a customer cancels a booking; they do not rewrite it.
--
-- `bookings_customer_update` (20260722000000) was `using (customer_id =
-- auth.uid()) with check (customer_id = auth.uid())` — every column, every
-- status. A customer could mark their own booking `paid` or `completed`, move
-- its time, or zero its amount, and the business's Earnings tab would believe
-- it. The only customer write the app makes is Cancel (my-bookings-screen →
-- cancelBooking); business-detail-screen only inserts.
--
-- So the policy goes and one door replaces it: customer_cancel_booking moves
-- the caller's own booking to `cancelled` from `requested` or `confirmed`, and
-- tells the business. notify_customer_of_booking_status (20261011000001) never
-- covered a cancellation — it speaks to the customer, about confirmed /
-- declined / completed — so the business heard nothing when a customer
-- cancelled. It hears now, from here.

drop policy if exists bookings_customer_update on public.service_bookings;

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

  update public.service_bookings set status = 'cancelled' where id = p_booking;

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
  'The one customer write on service_bookings (20261012000004). Moves the caller''s own booking from requested or confirmed to cancelled — a repeat on a cancelled booking is a no-op — and notifies the business owner (kind appointment, target business:bookings). bookings_customer_update was dropped in the same migration.';

revoke all on function public.customer_cancel_booking(uuid) from public, anon;
grant execute on function public.customer_cancel_booking(uuid) to authenticated;
