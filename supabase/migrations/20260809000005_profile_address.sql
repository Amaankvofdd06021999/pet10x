-- A structured home address on the profile.
--
-- profiles carried latitude/longitude/location_label — a coarse point used for
-- nearby services — and nothing you could compare to a building. A standalone
-- owner ("just here for my pet") has no resident_link and therefore no unit
-- anywhere, so their address is the only way to notice that the building they
-- live in is already on Pet10x and offer them the code path.

alter table public.profiles
  add column if not exists street_address text,
  add column if not exists address_unit   text,
  add column if not exists city           text,
  add column if not exists region         text,
  add column if not exists postal_code    text,
  add column if not exists country        text default 'CA';

comment on column public.profiles.address_unit is
  'The unit in their own words. Distinct from resident_links.unit_id, which is the unit a MANAGER has confirmed inside a building. This one is self-reported and may exist with no building at all.';

create index if not exists profiles_postal_idx
  on public.profiles (upper(replace(postal_code, ' ', ''))) where postal_code is not null;
create index if not exists buildings_postal_idx
  on public.buildings (upper(replace(postal_code, ' ', ''))) where postal_code is not null;
