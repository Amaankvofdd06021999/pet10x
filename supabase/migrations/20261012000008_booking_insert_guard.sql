-- Pet10x — Part F review: a customer books; they do not write the booking.
--
-- `bookings_insert` checks only customer_id = auth.uid(). Every other column
-- was the customer's to choose: a booking could be inserted already
-- `completed` or `paid`, at any amount, with a response time — poisoning the
-- business's Earnings tab and unlocking the "after a completed booking"
-- review. 20261012000004 closed the UPDATE path; this closes the INSERT one.
--
-- For a client caller (`authenticated` / `anon` — this function is SECURITY
-- INVOKER, so current_user is the caller; service role and definer RPCs are
-- trusted, as in 20261007000002) the row is REWRITTEN, not checked, so there
-- is no value a caller can offer that survives:
--   status            'requested'
--   responded_at, payment_id, declined_reason   NULL
--   amount_cents, currency   from the booked business_services row, which
--                     must belong to the booked business and be active
--   commission_cents  15% of that (lib/data/bookings.ts COMMISSION_RATE)
--   amount_cents      0 when no service is named
-- createBooking already sends exactly these values, so nothing changes for
-- the app.

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
  new.amount_cents     := coalesce(v_price, 0);
  new.currency         := coalesce(v_currency, new.currency, 'cad');
  new.commission_cents := round(coalesce(v_price, 0) * 0.15)::integer;
  return new;
end;
$guard$;

comment on function public.service_bookings_insert_guard() is
  'BEFORE INSERT on service_bookings (20261012000008). For authenticated/anon callers, rewrites status to requested, clears responded_at / payment_id / declined_reason, and sets amount_cents, currency and commission_cents (15%) from the booked, active business_services row of the same business (0 with no service). Refuses a service that is not that business''s or not active (22023). Service role and definer RPCs pass untouched.';

revoke all on function public.service_bookings_insert_guard() from public, anon, authenticated;

drop trigger if exists trg_service_bookings_insert_guard on public.service_bookings;
create trigger trg_service_bookings_insert_guard
  before insert on public.service_bookings
  for each row execute function public.service_bookings_insert_guard();
