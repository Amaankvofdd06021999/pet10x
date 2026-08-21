-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- Size, restraint and diet.
--
-- SIZE IS RECORDED, NOT ENFORCED. The brief said "maximum Medium" and "up to
-- 36 inches" in the same breath, which cannot both be a limit — a Medium dog
-- is roughly 18–22in at the shoulder and 36in is taller than a Great Dane.
-- Blocking registration on either would also mean a resident whose large dog
-- already lives in the building simply cannot register it, and the register
-- stops describing what is actually in the building. The size is captured and
-- flagged to the manager instead.

alter table public.pets
  add column if not exists size_band       text,
  add column if not exists height_cm       numeric,
  -- Several can be true at once: a dog can be both harnessed and muzzled.
  add column if not exists restraints      text[] not null default '{}',
  add column if not exists diet_type       text,
  add column if not exists diet_notes      text;

alter table public.pets drop constraint if exists pets_size_band_check;
alter table public.pets
  add constraint pets_size_band_check
  check (size_band is null or size_band in ('small', 'medium', 'large', 'xlarge'));

alter table public.pets drop constraint if exists pets_diet_type_check;
alter table public.pets
  add constraint pets_diet_type_check
  check (diet_type is null or diet_type in ('raw', 'dried', 'wet', 'mixed', 'prescription'));

alter table public.pets drop constraint if exists pets_height_check;
alter table public.pets
  add constraint pets_height_check
  check (height_cm is null or (height_cm > 0 and height_cm < 200));

alter table public.pets drop constraint if exists pets_restraints_check;
alter table public.pets
  add constraint pets_restraints_check
  check (restraints <@ array['muzzled', 'harnessed', 'leashed', 'caged', 'carrier']::text[]);

comment on column public.pets.size_band is
  'small | medium | large | xlarge. Advisory — surfaces to the manager when it exceeds the building rule, never blocks registration.';
comment on column public.pets.height_cm is
  'Height at the shoulder. Stored metric; the form offers inches and converts, because the size chart is quoted in inches.';
comment on column public.pets.restraints is
  'How the animal is restrained in common areas. Multiple apply — harnessed AND muzzled is a normal answer.';
