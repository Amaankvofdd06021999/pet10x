-- Municipalities and where to actually report an animal to them.
--
-- Pet10x has no integration with any city and does not forward reports. What
-- it can honestly do is record the report, give a reference, and point the
-- person at the real animal-control channel — the only outcome that helps
-- someone who has just watched a dog attack another.
--
-- Manually maintained rather than reverse-geocoded: a wrong phone number on a
-- dangerous-animal screen is worse than no number.

create table if not exists public.municipalities (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  region                text,
  country               text not null default 'CA',
  postal_prefixes       text[] not null default '{}',
  animal_control_phone  text,
  animal_control_url    text,
  notes                 text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists municipalities_name_region_key
  on public.municipalities (lower(name), lower(coalesce(region, '')));
create index if not exists municipalities_prefixes_idx
  on public.municipalities using gin (postal_prefixes);

alter table public.municipalities enable row level security;

-- Readable by anon: a person filing a report has no account, and this is
-- public contact information by definition.
drop policy if exists municipalities_select on public.municipalities;
create policy municipalities_select on public.municipalities for select using (is_active or is_admin());
drop policy if exists municipalities_admin_write on public.municipalities;
create policy municipalities_admin_write on public.municipalities for all using (is_admin()) with check (is_admin());
