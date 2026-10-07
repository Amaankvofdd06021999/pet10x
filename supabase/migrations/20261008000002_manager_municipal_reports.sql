-- Pet10x — a building manager can see what was reported to the city about
-- their area, without learning who reported it.
--
-- `municipal_reports` (20260810000006) is city-scoped by design: it has no
-- building_id, and its select policy admits only the reporter and admins. That
-- stays exactly as it is. This adds ONE read path, a SECURITY DEFINER function
-- with a deliberately narrow shape:
--
--   * which reports — those whose `municipality_id` is the municipality the
--     building's postal code resolves to, through the same
--     `resolve_municipality` a reporter's form uses. `buildings` has no stored
--     municipality column, and the resolver only ever matches on postal
--     prefix (coordinates never guess a city), so a building without a postal
--     code, or in a city Pet10x has no row for, sees nothing — which is the
--     truth, not a gap;
--   * which columns — id, type, description, location_text, reference_code,
--     status, created_at and a COUNT of evidence files. Never reporter_id,
--     is_anonymous, ip_hash, the raw postal code or coordinates, or the
--     evidence paths themselves. A manager learns that a dangerous dog was
--     reported on their block; they do not learn by whom;
--   * who — a manager of the building, or an admin. Anyone else is refused
--     42501, the same code RLS would have given them.
--
-- Read-only. Pet10x files nothing with any city; the manager screen says so.
-- Admins change `status` through the existing `municipal_reports_admin_write`
-- policy; there is no manager write path and this adds none.

create or replace function public.manager_municipal_reports(p_building uuid)
returns table (
  id             uuid,
  type           text,
  description    text,
  location_text  text,
  reference_code text,
  status         text,
  created_at     timestamptz,
  evidence_count integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_postal       text;
  v_municipality uuid;
begin
  if not (public.manages_building(p_building) or public.is_admin()) then
    raise exception 'manager_municipal_reports: you do not manage this building'
      using errcode = '42501',
            detail  = pg_catalog.format('Building %s, caller %s.', p_building, auth.uid());
  end if;

  select b.postal_code into v_postal from public.buildings b where b.id = p_building;
  if v_postal is null then
    return;
  end if;

  v_municipality := nullif(public.resolve_municipality(v_postal) ->> 'id', '')::uuid;
  if v_municipality is null then
    return;
  end if;

  return query
    select r.id, r.type, r.description, r.location_text, r.reference_code, r.status,
           r.created_at, coalesce(cardinality(r.evidence_paths), 0)::integer
      from public.municipal_reports r
     where r.municipality_id = v_municipality
     order by r.created_at desc
     limit 200;
end;
$$;

comment on function public.manager_municipal_reports(uuid) is
  'Reports filed with Pet10x about the city a building sits in (20261008000002): municipality resolved from buildings.postal_code via resolve_municipality. Manager of the building or admin, else 42501. Returns id, type, description, location_text, reference_code, status, created_at, evidence_count — never reporter identity, anonymity flag, ip_hash, coordinates or evidence paths. Newest 200. Read-only.';

revoke all on function public.manager_municipal_reports(uuid) from public, anon;
grant execute on function public.manager_municipal_reports(uuid) to authenticated;
