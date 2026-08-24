-- incident_reports.evidence_paths has existed since the initial schema and not
-- one of the thirteen reports filed so far carries a path, because nothing has
-- ever been able to put one there: the intake RPC had no parameter to accept
-- one. This opens that door. The photos are uploaded first, through a signed
-- URL, and the report claims them at submit time.

-- create or replace CANNOT change a signature. Adding an eighth parameter that
-- way would create a SECOND overload beside the seven-argument one, reviving
-- exactly the ambiguity 20260821000000 was written to remove. So the old
-- signature is dropped by hand and the new one created in its place. There must
-- be exactly one submit_incident_report when this migration finishes.
drop function if exists public.submit_incident_report(text, text, text, text, text, boolean, uuid);

-- The body below is the definition captured in 20260821000000, changed in five
-- places and nowhere else: the new trailing parameter, the v_path declaration,
-- the evidence guard, evidence_paths in the insert, and evidence_count in the
-- audit metadata.
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
  where upper(building_code) = upper(trim(p_building_code));

  if v_building is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if coalesce(trim(p_description), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'description_required');
  end if;

  -- Evidence lands in guest-evidence under {buildingId}/{draftId}/…, uploaded
  -- through a signed URL this building's code authorised. Anything with a
  -- different prefix was not ours to attach. Without this check a caller could
  -- name any object in the bucket and pull another building's photos onto their
  -- own report — the draft id is client-generated, so the prefix is the only
  -- thing tying an upload to the building whose code was presented.
  if array_length(p_evidence_paths, 1) is not null then
    if array_length(p_evidence_paths, 1) > 5 then
      return jsonb_build_object('ok', false, 'error', 'too_many_files');
    end if;
    foreach v_path in array p_evidence_paths loop
      if v_path is null or v_path not like (v_building::text || '/%') then
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
  values (auth.uid(), 'incident.submitted', 'incident_report', v_id, v_building,
          jsonb_build_object('anonymous', p_anonymous, 'reference', v_ref,
                             'pet_identified', v_pet is not null,
                             'evidence_count', coalesce(array_length(p_evidence_paths,1), 0)));

  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$function$;

-- create or replace preserves a function's ACL; drop and create does not. The
-- seven-argument version carried EXECUTE for anon, authenticated and
-- service_role, and anon is the one that matters most: a guest with no account
-- must still be able to file a report. Restore the grants explicitly rather
-- than trusting the schema's default privileges to reproduce them.
grant execute on function public.submit_incident_report(text, text, text, text, text, boolean, uuid, text[])
  to anon, authenticated, service_role;
