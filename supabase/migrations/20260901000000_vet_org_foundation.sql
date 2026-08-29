-- Pet10x — Veterinary platform, part 1 of 6: organisation.
--
-- A veterinary practice is a `business` that has locations and staff. Today a
-- business is a single owner_id with no second address and no employees, so a
-- two-site practice with eleven people cannot be represented at all. These
-- three tables are deliberately generic — groomers, walkers and boarding
-- kennels get multi-site and multi-user from exactly the same code.
--
-- Capability tiers are what make self-serve signup safe. Anyone may sign up
-- and immediately run their own practice; the capabilities that touch data
-- belonging to SOMEONE ELSE unlock as the business proves it is real:
--   registered — everything with its own data. Instant, no review.
--   listed     — appears in owner-facing search, accepts online bookings.
--   verified   — may receive owner record shares, publish records back to an
--                owner, and use emergency access. A person checks a licence.

do $$ begin
  create type public.business_tier as enum ('registered','listed','verified');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.clinic_staff_role as enum ('owner','manager','veterinarian','nurse','reception');
exception when duplicate_object then null; end $$;

alter table public.businesses
  add column if not exists tier public.business_tier not null default 'registered',
  add column if not exists business_kind text not null default 'other',
  add column if not exists timezone text not null default 'America/Vancouver',
  add column if not exists booking_mode text not null default 'manual';

-- Derive the constrained kind from the free-text category that already exists,
-- rather than putting a CHECK on a column with live rows in it.
update public.businesses set business_kind = case
  when lower(coalesce(category,'')) like '%vet%'     then 'veterinary'
  when lower(coalesce(category,'')) like '%groom%'   then 'grooming'
  when lower(coalesce(category,'')) like '%walk%'    then 'walking'
  when lower(coalesce(category,'')) like '%board%'   then 'boarding'
  when lower(coalesce(category,'')) like '%train%'   then 'training'
  when lower(coalesce(category,'')) like '%daycare%' then 'daycare'
  when lower(coalesce(category,'')) like '%sit%'     then 'sitting'
  else 'other' end
where business_kind = 'other';

-- Businesses verified before tiers existed keep the standing they had.
update public.businesses set tier = 'verified' where is_verified and tier = 'registered';

alter table public.businesses drop constraint if exists businesses_kind_ck;
alter table public.businesses add constraint businesses_kind_ck
  check (business_kind in ('veterinary','grooming','walking','boarding','training','daycare','sitting','other'));

alter table public.businesses drop constraint if exists businesses_booking_mode_ck;
alter table public.businesses add constraint businesses_booking_mode_ck
  check (booking_mode in ('manual','request','instant'));

-- ---------------------------------------------------------------------------
-- Locations
-- ---------------------------------------------------------------------------
create table if not exists public.business_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  address text,
  city text,
  region text,
  postal_code text,
  country text default 'CA',
  latitude double precision,
  longitude double precision,
  phone text,
  email text,
  timezone text not null default 'America/Vancouver',
  hours jsonb not null default '{}'::jsonb,
  after_hours_note text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_locations_business_idx on public.business_locations(business_id);
create unique index if not exists business_locations_one_primary
  on public.business_locations(business_id) where is_primary;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create table if not exists public.business_staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  role public.clinic_staff_role not null default 'reception',
  title text,
  licence_number text,
  licence_expires_on date,
  colour text,
  is_bookable boolean not null default false,
  is_active boolean not null default true,
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, profile_id)
);
create index if not exists business_staff_business_idx on public.business_staff(business_id);
create index if not exists business_staff_profile_idx on public.business_staff(profile_id);

-- ---------------------------------------------------------------------------
-- Verification submissions
-- ---------------------------------------------------------------------------
create table if not exists public.business_verifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('listing','licence')),
  licence_number text,
  issuing_body text,
  document_path text,
  contact_name text,
  contact_phone text,
  status text not null default 'submitted'
    check (status in ('submitted','in_review','needs_info','approved','rejected')),
  note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists business_verifications_business_idx on public.business_verifications(business_id);
create index if not exists business_verifications_open_idx
  on public.business_verifications(status) where status in ('submitted','in_review','needs_info');

-- ---------------------------------------------------------------------------
-- Who is staff, and what may they do
-- ---------------------------------------------------------------------------

-- Owner counts as staff even with no explicit row, so a solo practice works
-- the moment it signs up.
create or replace function public.staff_of_business(p_business uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.businesses b
    join public.profiles pr on pr.id = b.owner_id
    where b.id = p_business and b.owner_id = auth.uid() and not pr.is_suspended
  ) or exists (
    select 1 from public.business_staff s
    join public.profiles pr on pr.id = s.profile_id
    where s.business_id = p_business
      and s.profile_id = auth.uid()
      and s.is_active
      and not pr.is_suspended
  );
$$;

-- An explicit staff row wins over ownership, so an owner who is also the vet
-- can hold the veterinarian role; an owner with no row is treated as owner.
create or replace function public.staff_role_in(p_business uuid)
returns public.clinic_staff_role language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select s.role from public.business_staff s
      where s.business_id = p_business and s.profile_id = auth.uid() and s.is_active
      limit 1),
    (select 'owner'::public.clinic_staff_role from public.businesses b
      where b.id = p_business and b.owner_id = auth.uid())
  );
$$;

create or replace function public.can_admin_business(p_business uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.staff_role_in(p_business) in ('owner','manager');
$$;

-- Reading another person's pet records is a clinical need-to-know, so business
-- administration alone does not confer it.
create or replace function public.can_read_shared_records(p_business uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.staff_role_in(p_business) in ('owner','veterinarian','nurse');
$$;

create or replace function public.business_tier_of(p_business uuid)
returns public.business_tier language sql stable security definer set search_path = public, pg_temp as $$
  select b.tier from public.businesses b where b.id = p_business;
$$;

create or replace function public.business_is_public(p_business uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.businesses b
    where b.id = p_business and b.tier in ('listed','verified'));
$$;

-- ---------------------------------------------------------------------------
-- Every new business gets an owner staff row and a primary location, so the
-- console is never empty on first load.
-- ---------------------------------------------------------------------------
create or replace function public.business_bootstrap()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.business_staff (business_id, profile_id, role, is_active, is_bookable, joined_at)
  values (new.id, new.owner_id,
          case when new.business_kind = 'veterinary' then 'veterinarian'::public.clinic_staff_role
               else 'owner'::public.clinic_staff_role end,
          true, true, now())
  on conflict (business_id, profile_id) do nothing;

  insert into public.business_locations
    (business_id, name, address, city, region, postal_code, country, latitude, longitude, is_primary)
  values (new.id, coalesce(new.name,'Main location'), new.address, new.city, new.region,
          new.postal_code, coalesce(new.country,'CA'), new.latitude, new.longitude, true);
  return new;
end; $$;

drop trigger if exists trg_business_bootstrap on public.businesses;
create trigger trg_business_bootstrap after insert on public.businesses
  for each row execute function public.business_bootstrap();

-- Backfill the businesses that already exist.
insert into public.business_staff (business_id, profile_id, role, is_active, is_bookable, joined_at)
select b.id, b.owner_id,
       case when b.business_kind = 'veterinary' then 'veterinarian'::public.clinic_staff_role
            else 'owner'::public.clinic_staff_role end,
       true, true, now()
from public.businesses b
on conflict (business_id, profile_id) do nothing;

insert into public.business_locations
  (business_id, name, address, city, region, postal_code, country, latitude, longitude, hours, is_primary)
select b.id, b.name, b.address, b.city, b.region, b.postal_code, coalesce(b.country,'CA'),
       b.latitude, b.longitude, coalesce(b.hours,'{}'::jsonb), true
from public.businesses b
where not exists (select 1 from public.business_locations l where l.business_id = b.id);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists trg_business_locations_updated on public.business_locations;
create trigger trg_business_locations_updated before update on public.business_locations
  for each row execute function public.set_updated_at();
drop trigger if exists trg_business_verifications_updated on public.business_verifications;
create trigger trg_business_verifications_updated before update on public.business_verifications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.business_locations enable row level security;
alter table public.business_staff enable row level security;
alter table public.business_verifications enable row level security;

drop policy if exists bloc_select on public.business_locations;
create policy bloc_select on public.business_locations for select
  using (public.staff_of_business(business_id) or public.is_admin()
         or (is_active and public.business_is_public(business_id)));
drop policy if exists bloc_write on public.business_locations;
create policy bloc_write on public.business_locations for all
  using (public.can_admin_business(business_id) or public.is_admin())
  with check (public.can_admin_business(business_id) or public.is_admin());

drop policy if exists bstaff_select on public.business_staff;
create policy bstaff_select on public.business_staff for select
  using (profile_id = auth.uid() or public.staff_of_business(business_id) or public.is_admin());
drop policy if exists bstaff_write on public.business_staff;
create policy bstaff_write on public.business_staff for all
  using (public.can_admin_business(business_id) or public.is_admin())
  with check (public.can_admin_business(business_id) or public.is_admin());

drop policy if exists bver_select on public.business_verifications;
create policy bver_select on public.business_verifications for select
  using (public.staff_of_business(business_id) or public.is_admin());
drop policy if exists bver_insert on public.business_verifications;
create policy bver_insert on public.business_verifications for insert
  with check (public.can_admin_business(business_id) and status = 'submitted');
drop policy if exists bver_admin on public.business_verifications;
create policy bver_admin on public.business_verifications for all
  using (public.is_admin()) with check (public.is_admin());

-- Staff must be able to read their own business row even before it is listed.
drop policy if exists businesses_staff_read on public.businesses;
create policy businesses_staff_read on public.businesses for select
  using (public.staff_of_business(id));

revoke all on function public.business_bootstrap() from public, anon, authenticated;
