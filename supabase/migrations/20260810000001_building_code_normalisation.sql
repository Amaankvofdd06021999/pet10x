-- Make the building code safe to change.
--
-- The unique constraint was UNIQUE (building_code) — case SENSITIVE — while
-- every lookup (resolve_building_code, building_pets_for_report,
-- submit_incident_report) compares with upper(). So "mcr2026" and "MCR2026"
-- could exist as two different buildings that every lookup treats as one, and
-- which one you got would depend on the plan. Nobody hit it because codes were
-- seeded uppercase; letting managers type their own makes it reachable.
--
-- A trigger rather than only validating in an RPC: managers already hold an
-- UPDATE policy on buildings, so anything enforced solely in a function is
-- enforced only on the path that remembers to call it.

create or replace function public.normalise_building_code()
returns trigger language plpgsql as $$
begin
  if new.building_code is not null then
    new.building_code := upper(btrim(new.building_code));
    if new.building_code = '' then
      raise exception 'building_code_empty' using errcode = 'check_violation';
    end if;
    -- Letters and digits only, 4–12 characters. Codes are read off a notice,
    -- typed on a phone and dictated over the phone; punctuation and whitespace
    -- get lost or mistranscribed somewhere in that chain.
    if new.building_code !~ '^[A-Z0-9]{4,12}$' then
      raise exception 'building_code_format' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists buildings_normalise_code on public.buildings;
create trigger buildings_normalise_code
  before insert or update of building_code on public.buildings
  for each row execute function public.normalise_building_code();

create unique index if not exists buildings_building_code_ci_key
  on public.buildings (upper(building_code));

comment on column public.buildings.building_code is
  'Uppercase A–Z0–9, 4–12 chars, enforced by trigger. Unique case-insensitively. Managers may change it; the old code stops working immediately.';
