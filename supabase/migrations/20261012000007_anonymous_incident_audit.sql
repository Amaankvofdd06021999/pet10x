-- Pet10x — Part F review: an anonymous report is anonymous in the audit log.
--
-- submit_incident_report already writes reporter_id = NULL when p_anonymous,
-- but its audit row wrote actor_id = auth.uid() regardless — and audit_select
-- lets the building's managers read actor_id. A signed-in resident who chose
-- "anonymous" was named to exactly the people they chose not to tell.
--
-- The function below is 20261008000004's, verbatim, except the audit insert's
-- actor_id. Then the rows already written are cleared: every incident.submitted
-- row whose report is_anonymous, or whose metadata says anonymous.

create or replace function public.submit_incident_report(
  p_building_code text,
  p_type          text,
  p_description   text,
  p_location      text default null,
  p_unit          text default null,
  p_anonymous     boolean default true,
  p_pet_id        uuid default null,
  p_evidence_paths text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_building uuid;
  v_ref      text;
  v_id       uuid;
  v_pet      uuid;
  v_path     text;
begin
  select id into v_building
  from public.buildings
  where upper(building_code) = upper(trim(p_building_code))
    and archived_at is null;  -- ARCHIVED (20261008000004)

  if v_building is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if coalesce(trim(p_description), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'description_required');
  end if;

  -- Evidence lands in guest-evidence under {buildingId}/{draftId}/{name},
  -- uploaded through a signed URL this building's code authorised. Anything
  -- with a different prefix was not ours to attach, and anything that can be
  -- normalised out of that folder is the same problem wearing a disguise.
  -- One anchored regex does both: exactly three segments, segment 1 the
  -- building, segment 2 a uuid, segment 3 starting alphanumeric. See the note
  -- at the top of this migration for why the character class alone is not it.
  if coalesce(cardinality(p_evidence_paths), 0) > 0 then
    if array_ndims(p_evidence_paths) > 1 then
      return jsonb_build_object('ok', false, 'error', 'bad_evidence_path');
    end if;
    if cardinality(p_evidence_paths) > 5 then
      return jsonb_build_object('ok', false, 'error', 'too_many_files');
    end if;
    foreach v_path in array p_evidence_paths loop
      if v_path is null or v_path !~ (
           '^' || v_building::text ||
           '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' ||
           '/[A-Za-z0-9][A-Za-z0-9._-]*$'
         ) then
        return jsonb_build_object('ok', false, 'error', 'bad_evidence_path');
      end if;
    end loop;
  end if;

  -- Only a pet that actually lives in this building. Silently dropped rather
  -- than rejected: a stale id should not lose someone's written report.
  if p_pet_id is not null then
    select p.id into v_pet
    from public.pets p
    where p.id = p_pet_id and p.building_id = v_building and p.deleted_at is null;
  end if;

  v_ref := 'IR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.incident_reports (
    building_id, reporter_id, is_anonymous, type, description,
    location_text, unit_involved, pet_id, status, reference_code,
    evidence_paths
  )
  values (
    v_building,
    case when p_anonymous then null else auth.uid() end,
    p_anonymous,
    p_type::incident_type,
    trim(p_description),
    nullif(trim(coalesce(p_location, '')), ''),
    nullif(trim(coalesce(p_unit, '')), ''),
    v_pet,
    'submitted',
    v_ref,
    -- The column is NOT NULL DEFAULT '{}', and an explicit null argument would
    -- reach it as null rather than falling back to the default.
    coalesce(p_evidence_paths, '{}')
  )
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  -- 20261012000007: an anonymous report names nobody here either.
  values (case when p_anonymous then null else auth.uid() end,
          'incident.submitted', 'incident_report', v_id, v_building,
          jsonb_build_object('anonymous', p_anonymous, 'reference', v_ref,
                             'pet_identified', v_pet is not null,
                             'evidence_count', coalesce(cardinality(p_evidence_paths), 0)));

  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$function$;

update public.audit_log a
   set actor_id = null
 where a.action = 'incident.submitted'
   and a.actor_id is not null
   and (coalesce((a.metadata ->> 'anonymous')::boolean, false)
        or exists (select 1 from public.incident_reports ir
                    where ir.id = a.entity_id and ir.is_anonymous));
