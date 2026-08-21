-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- Pet10x — anonymous guest intake (PRD §6.4).
--
-- A non-pet resident or visitor files an incident with no account: they only
-- have the building code from a placard or QR. RLS blocks them from reading
-- `buildings` and from inserting into `incident_reports` (incidents_insert_auth
-- requires reporter_id = auth.uid()). These two SECURITY DEFINER functions are
-- the intake door, and they are the only thing anon may call.

-- Resolve a building code to its name. Returns null for an unknown code, so a
-- guest can be told "invalid code" without being able to enumerate buildings.
create or replace function public.resolve_building_code(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when b.id is null then jsonb_build_object('valid', false)
    else jsonb_build_object('valid', true, 'building_id', b.id, 'name', b.name)
  end
  from (select 1) dummy
  left join public.buildings b
    on upper(b.building_code) = upper(trim(p_code));
$$;

-- File an incident. Works for a signed-out guest (reporter_id stays NULL) and
-- for a signed-in resident (reporter_id = their uid, so they can see it later).
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

  -- Human-quotable reference so a guest can follow up without an account.
  v_ref := 'IR-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

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

revoke all on function public.resolve_building_code(text) from public;
revoke all on function public.submit_incident_report(text, text, text, text, text, boolean) from public;
grant execute on function public.resolve_building_code(text) to anon, authenticated;
grant execute on function public.submit_incident_report(text, text, text, text, text, boolean) to anon, authenticated;
