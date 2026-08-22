-- Two holes in the guard added by 20260822000000, plus the bucket limits that
-- were never set. The signature does not change, so this is a plain
-- `create or replace`: no drop, and therefore no ACL to restore.

-- ONE (critical). The guard tested `like buildingId || '/%'`. That anchors the
-- start correctly — a lookalike `{buildingId}X/…` was always rejected — but it
-- says nothing about the rest of the string, so
--   {buildingId}/../{otherBuilding}/d/1.jpg
-- passed. WHATWG URL normalisation collapses that into the other building's
-- folder in any consumer that puts the stored string into a URL. Nothing reads
-- guest-evidence yet, so it is not exploitable today; it becomes a live
-- cross-building read the moment a route signs these paths with service_role.
--
-- Note the fix is NOT "the character class excludes `..`". It does not: `.` is
-- a literal inside [A-Za-z0-9._-], so `..` is a perfectly valid segment there,
-- and `{buildingId}/../evil.jpg` still matches a three-segment pattern built
-- from that class. Measured, not assumed. What actually closes the escape is
-- pinning both segments to shapes that cannot BE `..`: the draft id must be the
-- uuid the sign route mints and validates (app/api/incidents/evidence/sign/
-- route.ts), and the file name must begin with an alphanumeric.

-- TWO (important). `array_length(x, 1)` counts the first dimension only, while
-- `foreach … in array` iterates every leaf. A nested 2x4 array therefore walked
-- past the "max 5" check and stored 8 paths, and PostgREST will coerce nested
-- JSON from a plain anon client into a 2-D text[]. cardinality() counts every
-- element at any dimensionality; array_ndims rejects the nested shape outright,
-- which also keeps the column matching the string[] database.types.ts declares
-- and stops evidence_count under-reporting.

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
  values (auth.uid(), 'incident.submitted', 'incident_report', v_id, v_building,
          jsonb_build_object('anonymous', p_anonymous, 'reference', v_ref,
                             'pet_identified', v_pet is not null,
                             'evidence_count', coalesce(cardinality(p_evidence_paths), 0)));

  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$function$;

-- THREE. The bucket carried no limits at all, so the sign route's 15 MB and
-- MIME checks were advisory: the route trusts the client's declared `size`,
-- and a client declaring 1 KB could PUT 500 MB straight to storage through the
-- signed URL. The route is not the enforcement point; the bucket is. These two
-- values mirror MAX_BYTES and ALLOWED in app/api/incidents/evidence/sign/
-- route.ts and must be changed together with them.
update storage.buckets
   set file_size_limit = 15728640,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
 where id = 'guest-evidence';
