-- Vet visit history.
--
-- The pet already carried a vet's clinic, name and phone — who to call. What
-- it had nowhere to put was what actually happened: the check-up, the dental,
-- the reason for the limp last spring. An owner switching vets, or handing a
-- pet to a sitter, has nothing to show without it, and the compliance tables
-- (pet_vaccinations, pet_documents) are the wrong shape — a visit is not a
-- certificate and does not expire.

create table if not exists public.pet_vet_visits (
  id           uuid primary key default gen_random_uuid(),
  pet_id       uuid not null references public.pets(id) on delete cascade,
  visited_on   date not null,
  reason       text not null,
  clinic       text,
  vet_name     text,
  notes        text,
  -- Optional link to an uploaded record, so a visit and its paperwork are one
  -- thing rather than two lists the owner has to reconcile.
  document_id  uuid references public.pet_documents(id) on delete set null,
  -- When the vet asked to see them again. Drives nothing yet; recorded so a
  -- reminder can be built on it without another migration.
  follow_up_on date,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id) on delete set null
);

create index if not exists pet_vet_visits_pet_idx on public.pet_vet_visits (pet_id, visited_on desc);

alter table public.pet_vet_visits enable row level security;

-- Mirrors pet_documents: the owner, a manager of the pet's building, or an
-- admin may read; only the owner (or an admin) writes. A manager can see that
-- a pet is under veterinary care without being able to author its history.
drop policy if exists pet_vet_visits_rw on public.pet_vet_visits;
create policy pet_vet_visits_rw on public.pet_vet_visits
  for all
  using (
    exists (select 1 from public.pets p
            where p.id = pet_vet_visits.pet_id
              and (p.owner_id = auth.uid() or manages_building(p.building_id) or is_admin()))
  )
  with check (
    exists (select 1 from public.pets p
            where p.id = pet_vet_visits.pet_id
              and (p.owner_id = auth.uid() or is_admin()))
  );

comment on table public.pet_vet_visits is
  'What happened at the vet. Distinct from pet_vaccinations and pet_documents: a visit is a record of care, not a certificate with an expiry.';
