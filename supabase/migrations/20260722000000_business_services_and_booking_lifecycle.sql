-- ===========================================================================
-- Business offerings catalog — what a resident actually browses and books.
-- ===========================================================================
create table if not exists public.business_services (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null,
  description  text,
  price_cents  int not null default 0,
  currency     text not null default 'cad',
  duration_min int,
  active       boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists business_services_business_idx on public.business_services(business_id);

alter table public.business_services enable row level security;

-- Catalogs are public (they're a storefront), owners write their own.
create policy bsvc_select on public.business_services for select using (true);
create policy bsvc_owner_write on public.business_services for all
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
create policy bsvc_admin_all on public.business_services for all
  using (public.is_admin()) with check (public.is_admin());

-- ===========================================================================
-- service_bookings: real lifecycle. status was free text with no enum and no
-- UPDATE policy at all, so an owner could never accept/decline a booking.
-- ===========================================================================
create type booking_status as enum
  ('requested','confirmed','in_progress','completed','paid','declined','cancelled');

alter table public.service_bookings alter column status drop default;
alter table public.service_bookings
  alter column status type booking_status using status::booking_status;
alter table public.service_bookings alter column status set default 'requested';

alter table public.service_bookings
  add column if not exists service_id      uuid references public.business_services(id) on delete set null,
  add column if not exists pet_id          uuid references public.pets(id) on delete set null,
  add column if not exists customer_note   text,
  add column if not exists declined_reason text,
  add column if not exists responded_at    timestamptz,
  add column if not exists updated_at      timestamptz not null default now();

create index if not exists bookings_business_idx on public.service_bookings(business_id);
create index if not exists bookings_customer_idx on public.service_bookings(customer_id);
create trigger trg_bookings_updated before update on public.service_bookings
  for each row execute function public.set_updated_at();

-- The missing write paths: the owner runs the job, the customer may cancel.
create policy bookings_owner_update on public.service_bookings for update
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
create policy bookings_customer_update on public.service_bookings for update
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());

-- ===========================================================================
-- Marking a booking paid also writes a payments row, and payments has no
-- INSERT policy (service-role only), so this must go through a definer RPC.
-- ===========================================================================
create or replace function public.business_mark_booking_paid(p_booking uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.service_bookings%rowtype;
  v_payment uuid;
begin
  select * into v from public.service_bookings where id = p_booking;
  if not found then raise exception 'booking not found'; end if;
  if not exists (select 1 from public.businesses b where b.id = v.business_id and b.owner_id = auth.uid())
     and not public.is_admin() then
    raise exception 'forbidden: not the owner of this business';
  end if;
  if v.status = 'paid' then return v.payment_id; end if;

  insert into public.payments (profile_id, purpose, related_id, amount_cents, currency, status, provider, provider_ref)
  values (v.customer_id, 'booking', v.id, v.amount_cents, 'cad', 'succeeded', 'manual',
          'demo-' || left(v.id::text, 8))
  returning id into v_payment;

  update public.service_bookings
     set status = 'paid', payment_id = v_payment
   where id = p_booking;
  return v_payment;
end; $$;
grant execute on function public.business_mark_booking_paid(uuid) to authenticated;
