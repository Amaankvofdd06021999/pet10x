-- Capture care_entries / care_targets, which exist in production but were
-- never committed as a migration.
--
-- The app has been reading and writing both since the care tracker shipped
-- (`useCareEntries`, `useCareTargets`, `addCareEntry`, `setCareTarget`), yet
-- neither appears in any migration file. Anyone running `supabase db reset`
-- would drop them and take the whole care feature with them.
--
-- Written from the live schema, and guarded throughout, so applying it to the
-- existing project is a no-op while a fresh database gets the real tables.

-- The tracker's own kinds. Deliberately NOT public.care_kind, which is the
-- older enum used by pet_care_tasks and carries a different vocabulary
-- (meal/medication vs food/medicine, plus grooming).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'care_entry_kind') then
    create type public.care_entry_kind as enum
      ('food', 'medicine', 'treat', 'water', 'walk', 'weight', 'potty', 'other');
  end if;
end $$;

-- One row per logged event: a meal, a dose, a walk.
create table if not exists public.care_entries (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.pets(id) on delete cascade,
  kind       public.care_entry_kind not null,
  label      text,
  amount     numeric,
  unit       text,
  note       text,
  logged_at  timestamptz not null default now(),
  logged_by  uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- The daily goal for a kind — an amount and a unit, never a time. Scheduling
-- lives in pet_care_tasks; see the following migration.
create table if not exists public.care_targets (
  id            uuid primary key default gen_random_uuid(),
  pet_id        uuid not null references public.pets(id) on delete cascade,
  kind          public.care_entry_kind not null,
  target_amount numeric,
  unit          text,
  updated_at    timestamptz not null default now(),
  unique (pet_id, kind)
);

create index if not exists care_entries_pet_kind_logged_idx
  on public.care_entries (pet_id, kind, logged_at desc);

alter table public.care_entries enable row level security;
alter table public.care_targets enable row level security;

-- Owner reads and writes; a building manager may read (compliance), never
-- write; admin transcends. Mirrors the live policies exactly.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and policyname='care_entries_rw') then
    create policy care_entries_rw on public.care_entries for all using (
      exists (
        select 1 from public.pets p
        where p.id = care_entries.pet_id
          and (p.owner_id = auth.uid() or public.manages_building(p.building_id) or public.is_admin())
      )
    ) with check (
      exists (
        select 1 from public.pets p
        where p.id = care_entries.pet_id and (p.owner_id = auth.uid() or public.is_admin())
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and policyname='care_targets_rw') then
    create policy care_targets_rw on public.care_targets for all using (
      exists (
        select 1 from public.pets p
        where p.id = care_targets.pet_id
          and (p.owner_id = auth.uid() or public.manages_building(p.building_id) or public.is_admin())
      )
    ) with check (
      exists (
        select 1 from public.pets p
        where p.id = care_targets.pet_id and (p.owner_id = auth.uid() or public.is_admin())
      )
    );
  end if;
end $$;
