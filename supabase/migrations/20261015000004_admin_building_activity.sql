-- Pet10x — what a building is doing now, for the admin console's archive
-- summary.
--
-- THE GAP. admin_building_history (20261008000007) counts every row that
-- references a building, which is the right question for "can this be
-- deleted?" and the wrong one for "is anyone here?": resident_links includes
-- people who left, were denied or were removed, and incident_reports includes
-- closed ones. Archiving a building shows the admin those numbers; a long-dead
-- building looked busy and a live one with a few left-over rows looked the
-- same. The console's "cases" are violations a manager has not resolved, not
-- incident reports.
--
-- admin_building_activity() answers the live question, grouped server-side
-- over every building so the console does one call, not one per card:
--   active_residents  resident_links approved and not left
--   open_cases        violations with resolved_at null
--   open_reports      incident_reports still being looked at and not yet a
--                     case — submitted, triaged, investigating; a report
--                     linked_to_violation is already counted in open_cases
-- Admin only (42501). Returns a row for every building, zeros included.

create or replace function public.admin_building_activity()
returns table (building_id uuid, active_residents int, open_cases int, open_reports int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can see building activity'
      using errcode = '42501';
  end if;

  return query
  select b.id,
         (select count(*)::int from public.resident_links l
           where l.building_id = b.id and l.status = 'approved' and l.left_at is null),
         (select count(*)::int from public.violations v
           where v.building_id = b.id and v.resolved_at is null),
         (select count(*)::int from public.incident_reports r
           where r.building_id = b.id and r.status in ('submitted', 'triaged', 'investigating'))
    from public.buildings b;
end;
$$;
revoke all on function public.admin_building_activity() from public, anon;
grant execute on function public.admin_building_activity() to authenticated;

comment on function public.admin_building_activity() is
  'Per building: active residents, open cases (unresolved violations) and open reports not yet linked to a case (20261015000004). Admin only (42501).';
