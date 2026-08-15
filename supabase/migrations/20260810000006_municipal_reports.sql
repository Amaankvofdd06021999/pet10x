-- Reports that go to a city, not a building.
--
-- Deliberately NOT incident_reports. That table is building_id NOT NULL and
-- every manager query and policy on it is written around
-- manages_building(building_id); making it nullable means every one of those
-- has to remember the null case, and a missed one leaks or hides rows. A
-- municipal report also has no unit, no register to pick a pet from, and no
-- manager triage workflow. Same word, different thing.

create table if not exists public.municipal_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references public.profiles(id) on delete set null,
  is_anonymous    boolean not null default true,
  type            text not null,
  description     text not null,
  postal_code     text,
  latitude        double precision,
  longitude       double precision,
  location_text   text,
  municipality_id uuid references public.municipalities(id) on delete set null,
  evidence_paths  text[] not null default '{}',
  reference_code  text,
  status          text not null default 'submitted',
  ip_hash         text,
  created_at      timestamptz not null default now()
);

-- Limited on purpose. The building form handles noise, waste and damage —
-- strata matters a city will not act on. A municipality has jurisdiction over
-- animals that hurt or endanger.
alter table public.municipal_reports drop constraint if exists municipal_reports_type_check;
alter table public.municipal_reports add constraint municipal_reports_type_check
  check (type in ('attack_on_pet','attack_on_person','dangerous_animal','animal_at_large'));

alter table public.municipal_reports drop constraint if exists municipal_reports_status_check;
alter table public.municipal_reports add constraint municipal_reports_status_check
  check (status in ('submitted','acknowledged','closed'));

create index if not exists municipal_reports_reporter_idx on public.municipal_reports (reporter_id);
create index if not exists municipal_reports_municipality_idx on public.municipal_reports (municipality_id);

alter table public.municipal_reports enable row level security;

-- Reporter sees their own; admins see all. Building managers deliberately do
-- NOT — the point of this path is that it does not go to them.
drop policy if exists municipal_reports_select on public.municipal_reports;
create policy municipal_reports_select on public.municipal_reports
  for select using ((reporter_id is not null and reporter_id = auth.uid()) or is_admin());
drop policy if exists municipal_reports_admin_write on public.municipal_reports;
create policy municipal_reports_admin_write on public.municipal_reports
  for all using (is_admin()) with check (is_admin());
