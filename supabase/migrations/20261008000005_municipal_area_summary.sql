-- Pet10x — Part B review fix: a manager's view of city reports is an area
-- summary, and the area is not theirs to choose.
--
-- TWO DEFECTS IN 20261008000002.
--
-- 1. THE AREA WAS MANAGER-CONTROLLED. manager_municipal_reports resolved the
--    municipality from `buildings.postal_code`, and `buildings_manager_update`
--    lets a manager edit their own building's postal code (the settings screen
--    does exactly that). Type a Burnaby prefix, read Burnaby's reports. The
--    area now comes from `buildings.municipality_id`, a stored column only an
--    admin may change — buildings_archive_guard (20261008000004) is extended
--    to cover it, on the same `current_user` test Part A's pets_archive_guard
--    uses (20261007000002): a client role that is not is_admin() may not
--    change it; definer functions, service_role and the SQL editor may.
--
-- 2. IT COULD IDENTIFY A REPORTER. 20260810000006 kept these reports from
--    managers on purpose: in a small building, a free-text description plus a
--    location ("the dog in 4B lunged at me by the mailroom on Tuesday") names
--    the person who wrote it as surely as reporter_id would. Product decision:
--    the manager function returns ONLY id, type, status, the DAY it was made,
--    and the municipality's name. No description, no location, no evidence
--    count, no reference code. The manager screen is an area summary — counts
--    by type and month. Admins keep the full record through RLS.
--
-- The function's return type changes, so it is dropped and re-created rather
-- than replaced.

alter table public.buildings
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

comment on column public.buildings.municipality_id is
  'The city a building is in, for the manager''s area summary of municipal reports (20261008000005). Admin-set only (buildings_archive_guard); backfilled from resolve_municipality on the postal code.';

-- Backfill once, from the same resolver a reporter's form uses. It matches on
-- postal prefix only (coordinates are passed but never guess a city), so a
-- building with no postal code, or in a city with no row, stays null — and its
-- manager sees no reports until an admin picks one.
update public.buildings b
   set municipality_id = nullif(public.resolve_municipality(b.postal_code, b.latitude, b.longitude) ->> 'id', '')::uuid
 where b.municipality_id is null;

-- ---------------------------------------------------------------------------
-- The guard, now covering both admin-only columns, on the role test.
-- (20261008000004's version tested auth.uid(); `current_user` is the stronger
-- statement — PostgREST fixes it from the JWT — and matches pets_archive_guard.)
-- ---------------------------------------------------------------------------
create or replace function public.buildings_archive_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if new.archived_at is distinct from old.archived_at then
      raise exception 'only an admin can archive or restore a building'
        using errcode = '42501',
              detail  = pg_catalog.format('Building %s, caller %s.', old.id, auth.uid());
    end if;
    if new.municipality_id is distinct from old.municipality_id then
      raise exception 'only an admin can change which city a building is in'
        using errcode = '42501',
              detail  = pg_catalog.format('Building %s, caller %s.', old.id, auth.uid()),
              hint    = 'The city decides which municipal reports the building''s managers see, so it is not theirs to set.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.buildings_archive_guard() from public, anon, authenticated;

comment on function public.buildings_archive_guard() is
  'BEFORE UPDATE on buildings (20261008000004, widened 20261008000005). A client role (authenticated/anon) that is not is_admin() may not change archived_at or municipality_id. buildings_manager_update otherwise lets a manager update their own row. Raises 42501.';

drop trigger if exists buildings_archive_guard on public.buildings;
create trigger buildings_archive_guard
  before update on public.buildings
  for each row
  when (old.archived_at is distinct from new.archived_at
        or old.municipality_id is distinct from new.municipality_id)
  execute function public.buildings_archive_guard();

-- ---------------------------------------------------------------------------
-- The manager function, narrowed.
-- ---------------------------------------------------------------------------
drop function if exists public.manager_municipal_reports(uuid);

create function public.manager_municipal_reports(p_building uuid)
returns table (
  id           uuid,
  type         text,
  status       text,
  reported_on  date,
  municipality text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_municipality uuid;
  v_name         text;
begin
  if not (public.manages_building(p_building) or public.is_admin()) then
    raise exception 'manager_municipal_reports: you do not manage this building'
      using errcode = '42501',
            detail  = pg_catalog.format('Building %s, caller %s.', p_building, auth.uid());
  end if;

  select b.municipality_id, m.name into v_municipality, v_name
    from public.buildings b
    left join public.municipalities m on m.id = b.municipality_id
   where b.id = p_building;
  if v_municipality is null then
    return;
  end if;

  return query
    select r.id, r.type, r.status, (r.created_at at time zone 'America/Vancouver')::date, v_name
      from public.municipal_reports r
     where r.municipality_id = v_municipality
     order by r.created_at desc
     limit 500;
end;
$$;

comment on function public.manager_municipal_reports(uuid) is
  'Area summary of municipal reports for a building''s city (20261008000005): buildings.municipality_id, admin-set. Manager of the building or admin, else 42501. Returns id, type, status, reported_on (a day), municipality name — never description, location, evidence, reference code or anything about the reporter, because in a small building those identify them. Newest 500.';

revoke all on function public.manager_municipal_reports(uuid) from public, anon;
grant execute on function public.manager_municipal_reports(uuid) to authenticated;
