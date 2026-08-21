-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- Closes the incident loop (PRD §6.4).
--
-- 1. The anonymous reporter can check what happened to their report using only
--    the reference code they were given. Without this they file into a void.
-- 2. The manager can escalate an incident into a violation in one atomic step,
--    so the violation carries origin_incident_id and the incident is marked
--    linked_to_violation. Doing it as two client writes could leave a violation
--    with no incident, or an incident pointing at nothing.

create or replace function public.incident_status_by_reference(p_ref text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  -- Deliberately narrow: status and timestamps only. No reporter identity, no
  -- manager notes, nothing about the accused resident or their pet.
  select case
    when i.id is null then jsonb_build_object('found', false)
    else jsonb_build_object(
      'found', true,
      'reference', i.reference_code,
      'status', i.status,
      'type', i.type,
      'building', b.name,
      'filed_at', i.created_at,
      'escalated', i.status = 'linked_to_violation'
    )
  end
  from (select 1) dummy
  left join public.incident_reports i on upper(i.reference_code) = upper(trim(p_ref))
  left join public.buildings b on b.id = i.building_id;
$$;

create or replace function public.escalate_incident_to_violation(
  p_incident uuid,
  p_type     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inc record;
  v_vio uuid;
begin
  select * into v_inc from public.incident_reports where id = p_incident;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS, so re-check the caller's scope by hand.
  if not (public.manages_building(v_inc.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  insert into public.violations (building_id, unit_id, resident_id, origin_incident_id, type, stage, opened_by)
  values (
    v_inc.building_id,
    v_inc.unit_id,
    v_inc.reporter_id,          -- null for an anonymous report; the manager assigns the resident later
    v_inc.id,
    coalesce(p_type, v_inc.type::text),
    'investigation',
    auth.uid()
  )
  returning id into v_vio;

  update public.incident_reports
     set status = 'linked_to_violation', triaged_by = auth.uid()
   where id = p_incident;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'incident.escalated', 'incident_report', p_incident, v_inc.building_id,
          jsonb_build_object('violation_id', v_vio));

  return jsonb_build_object('ok', true, 'violation_id', v_vio);
end;
$$;

revoke all on function public.incident_status_by_reference(text) from public;
revoke all on function public.escalate_incident_to_violation(uuid, text) from public;
grant execute on function public.incident_status_by_reference(text) to anon, authenticated;
grant execute on function public.escalate_incident_to_violation(uuid, text) to authenticated;
