-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- Care logging: food / medicine / treat / etc. entries over time + daily targets
create type care_entry_kind as enum ('food','medicine','treat','water','walk','weight','potty','other');

create table public.care_entries (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.pets(id) on delete cascade,
  kind       care_entry_kind not null,
  label      text,                 -- "Breakfast", "Heartworm tablet", "Dental chew"
  amount     numeric,              -- portion / dose / count / ml / kg
  unit       text,                 -- "cups", "tablet", "treats", "ml", "kg"
  note       text,
  logged_at  timestamptz not null default now(),
  logged_by  uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index care_entries_pet_time_idx on public.care_entries(pet_id, logged_at desc);
create index care_entries_pet_kind_idx on public.care_entries(pet_id, kind, logged_at desc);

create table public.care_targets (
  id            uuid primary key default gen_random_uuid(),
  pet_id        uuid not null references public.pets(id) on delete cascade,
  kind          care_entry_kind not null,
  target_amount numeric,
  unit          text,
  updated_at    timestamptz not null default now(),
  unique (pet_id, kind)
);

alter table public.care_entries enable row level security;
alter table public.care_targets enable row level security;

create policy care_entries_rw on public.care_entries for all using (
  exists (select 1 from public.pets p where p.id = care_entries.pet_id
          and (p.owner_id = auth.uid() or public.manages_building(p.building_id) or public.is_admin()))
) with check (
  exists (select 1 from public.pets p where p.id = care_entries.pet_id
          and (p.owner_id = auth.uid() or public.is_admin())));

create policy care_targets_rw on public.care_targets for all using (
  exists (select 1 from public.pets p where p.id = care_targets.pet_id
          and (p.owner_id = auth.uid() or public.manages_building(p.building_id) or public.is_admin()))
) with check (
  exists (select 1 from public.pets p where p.id = care_targets.pet_id
          and (p.owner_id = auth.uid() or public.is_admin())));
