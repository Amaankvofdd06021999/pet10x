-- Pet10x — business types as DATA, not as an enum.
--
-- A vet, a groomer, a dog walker and a boarding kennel run different days. The
-- console has to change shape for each, and the list of types has to be able to
-- grow without a migration and a deploy — so the type registry is a table, and
-- each type declares which MODULES it turns on. The console renders its tabs
-- from that list, which means adding "pet taxi" later is one INSERT.
--
-- `modules` is a text[] rather than a join table on purpose: it is read on
-- every console load, never joined against, and an admin editing one row is the
-- whole workflow.

create table if not exists public.business_types (
  code text primary key,
  label text not null,
  plural_label text,
  description text,
  icon text,
  -- Which parts of the console this type gets. See MODULES below.
  modules text[] not null default '{}',
  -- What this type calls the animals it deals with, and their people.
  subject_label text not null default 'Patient',
  subject_plural text not null default 'Patients',
  client_label text not null default 'Customer',
  -- A type may only ever reach owner records if the platform allows it to.
  may_request_records boolean not null default false,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.business_types.modules is
  'Console modules: schedule, bookings, clients, medical, grooming, boarding, '
  'daycare, classes, reminders, shop, invoices, emergency, records_sharing, '
  'storefront, team. Unknown values are ignored by the client rather than '
  'breaking it, so a new module can be seeded before the UI ships.';

insert into public.business_types
  (code, label, plural_label, description, icon, modules,
   subject_label, subject_plural, client_label, may_request_records, sort_order)
values
  ('veterinary','Veterinary practice','Veterinary practices',
   'Consultations, vaccinations, treatment and records.','stethoscope',
   array['schedule','clients','medical','reminders','shop','invoices','emergency','records_sharing','storefront','team'],
   'Patient','Patients','Client', true, 10),

  ('doctor','Specialist or behaviourist','Specialists',
   'Referral consultations and behaviour work.','brain',
   array['schedule','clients','medical','reminders','invoices','records_sharing','storefront','team'],
   'Patient','Patients','Client', true, 20),

  ('grooming','Grooming','Groomers',
   'Baths, clips, coat care and nail trims.','scissors',
   array['schedule','clients','grooming','reminders','shop','invoices','storefront','team'],
   'Pet','Pets','Customer', false, 30),

  ('spa','Pet spa','Pet spas',
   'Bathing, conditioning and relaxation treatments.','sparkles',
   array['schedule','clients','grooming','reminders','shop','invoices','storefront','team'],
   'Pet','Pets','Customer', false, 40),

  ('salon','Pet salon','Pet salons',
   'Styling and coat work by appointment.','scissors',
   array['schedule','clients','grooming','reminders','shop','invoices','storefront','team'],
   'Pet','Pets','Customer', false, 50),

  ('walking','Dog walking','Dog walkers',
   'Scheduled and ad-hoc walks, solo or group.','footprints',
   array['bookings','clients','reminders','invoices','storefront','team'],
   'Dog','Dogs','Customer', false, 60),

  ('sitting','Pet sitting','Pet sitters',
   'Visits and stays in the owner''s home.','home',
   array['bookings','clients','reminders','invoices','storefront','team'],
   'Pet','Pets','Customer', false, 70),

  ('boarding','Boarding','Boarding kennels',
   'Overnight stays, runs and feeding plans.','bed-double',
   array['bookings','boarding','clients','reminders','invoices','storefront','team'],
   'Guest','Guests','Owner', false, 80),

  ('daycare','Daycare','Daycares',
   'Day attendance, play groups and reports.','sun',
   array['bookings','daycare','clients','reminders','invoices','storefront','team'],
   'Guest','Guests','Owner', false, 90),

  ('training','Training','Trainers',
   'Classes, courses and one-to-one sessions.','graduation-cap',
   array['schedule','classes','clients','reminders','invoices','storefront','team'],
   'Student','Students','Owner', false, 100),

  ('play_area','Play area','Play areas',
   'Drop-in sessions and supervised play.','tent-tree',
   array['bookings','daycare','clients','invoices','storefront','team'],
   'Visitor','Visitors','Owner', false, 110),

  ('other','Other pet service','Other services',
   'Anything else that serves pets and their people.','paw-print',
   array['bookings','clients','invoices','storefront','team'],
   'Pet','Pets','Customer', false, 200)
on conflict (code) do update set
  label = excluded.label,
  plural_label = excluded.plural_label,
  description = excluded.description,
  icon = excluded.icon,
  modules = excluded.modules,
  subject_label = excluded.subject_label,
  subject_plural = excluded.subject_plural,
  client_label = excluded.client_label,
  may_request_records = excluded.may_request_records,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Point businesses at the registry. The old CHECK is replaced by a foreign key
-- so a new type is data rather than DDL.
update public.businesses set business_kind = 'other'
 where business_kind not in (select code from public.business_types);

alter table public.businesses drop constraint if exists businesses_kind_ck;
alter table public.businesses drop constraint if exists businesses_kind_fk;
alter table public.businesses
  add constraint businesses_kind_fk foreign key (business_kind)
  references public.business_types(code) on update cascade;

create index if not exists businesses_kind_idx on public.businesses(business_kind);

drop trigger if exists trg_business_types_updated on public.business_types;
create trigger trg_business_types_updated before update on public.business_types
  for each row execute function public.set_updated_at();

alter table public.business_types enable row level security;

-- The registry is a public vocabulary: signup has to render it before the
-- account exists, so anon reads it. Only an admin may change it.
drop policy if exists btypes_read on public.business_types;
create policy btypes_read on public.business_types for select using (true);
drop policy if exists btypes_admin on public.business_types;
create policy btypes_admin on public.business_types for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.business_types to anon, authenticated;

-- What may this business do, given its type? Read by the console and by the
-- record-sharing guard, so a groomer can never be granted medical records
-- merely by being verified.
create or replace function public.business_has_module(p_business uuid, p_module text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.businesses b
    join public.business_types t on t.code = b.business_kind
    where b.id = p_business and p_module = any(t.modules) and t.is_active
  );
$$;
