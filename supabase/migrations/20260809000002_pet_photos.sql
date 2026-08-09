-- More than one photo per pet.
--
-- `pets.image_url` stays as the avatar — every list, card and emergency page
-- reads it, and repointing all of them at a join is a bigger change than the
-- ask. This table holds the gallery; the app mirrors the primary into
-- image_url so nothing existing has to change.

create table if not exists public.pet_photos (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.pets(id) on delete cascade,
  path       text not null,
  caption    text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists pet_photos_pet_idx on public.pet_photos (pet_id, sort_order);

alter table public.pet_photos enable row level security;

drop policy if exists pet_photos_rw on public.pet_photos;
create policy pet_photos_rw on public.pet_photos
  for all
  using (
    exists (select 1 from public.pets p
            where p.id = pet_photos.pet_id
              and (p.owner_id = auth.uid() or manages_building(p.building_id) or is_admin()))
  )
  with check (
    exists (select 1 from public.pets p
            where p.id = pet_photos.pet_id
              and (p.owner_id = auth.uid() or is_admin()))
  );

comment on table public.pet_photos is
  'Gallery for a pet. pets.image_url remains the avatar the rest of the app reads; the app keeps it pointed at the first photo.';
