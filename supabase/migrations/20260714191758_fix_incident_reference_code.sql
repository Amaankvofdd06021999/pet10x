-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- gen_random_bytes() lives in the extensions schema (pgcrypto), which this
-- function's search_path deliberately excludes. gen_random_uuid() is core.
create or replace function public.submit_incident_report(
  p_building_code text,
  p_type          text,
  p_description   text,
  p_location      text default null,
  p_unit          text default null,
  p_anonymous     boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building uuid;
  v_ref      text;
  v_id       uuid;
begin
  select id into v_building
  from public.buildings
  where upper(building_code) = upper(trim(p_building_code));

  if v_building is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if coalesce(trim(p_description), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'description_required');
  end if;

  v_ref := 'IR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.incident_reports (
    building_id, reporter_id, is_anonymous, type, description,
    location_text, unit_involved, status, reference_code
  )
  values (
    v_building,
    case when p_anonymous then null else auth.uid() end,
    p_anonymous,
    p_type::incident_type,
    trim(p_description),
    nullif(trim(coalesce(p_location, '')), ''),
    nullif(trim(coalesce(p_unit, '')), ''),
    'submitted',
    v_ref
  )
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'incident.submitted', 'incident_report', v_id, v_building,
          jsonb_build_object('anonymous', p_anonymous, 'reference', v_ref));

  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$$;

revoke all on function public.submit_incident_report(text, text, text, text, text, boolean) from public;
grant execute on function public.submit_incident_report(text, text, text, text, text, boolean) to anon, authenticated;
