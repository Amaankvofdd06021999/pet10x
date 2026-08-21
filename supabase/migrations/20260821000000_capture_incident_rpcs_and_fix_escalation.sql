-- Four functions the app calls every day existed only in the remote database.
-- A fresh `supabase db reset` produced a schema the app could not run against.
-- They are captured here verbatim, except escalate_incident_to_violation,
-- which is also fixed: see the note above it.

-- One of two overloads. The 6-arg version predates pet identification and is
-- unreachable from the client, but an ambiguous call would still resolve to it.
drop function if exists public.submit_incident_report(text, text, text, text, text, boolean);

create or replace function public.resolve_building_code(p_code text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select case
    when b.id is null then jsonb_build_object('valid', false)
    else jsonb_build_object('valid', true, 'building_id', b.id, 'name', b.name)
  end
  from (select 1) dummy
  left join public.buildings b
    on upper(b.building_code) = upper(trim(p_code));
$function$;

create or replace function public.incident_status_by_reference(p_ref text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
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
$function$;

create or replace function public.submit_incident_report(
  p_building_code text,
  p_type          text,
  p_description   text,
  p_location      text default null,
  p_unit          text default null,
  p_anonymous     boolean default true,
  p_pet_id        uuid default null
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
    location_text, unit_involved, pet_id, status, reference_code
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
    v_ref
  )
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'incident.submitted', 'incident_report', v_id, v_building,
          jsonb_build_object('anonymous', p_anonymous, 'reference', v_ref,
                             'pet_identified', v_pet is not null));

  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$function$;

-- FIXED (AD-11). This function used to open the violation with
--   resident_id = v_inc.reporter_id
-- which is the person who FILED the report. Reporting a neighbour's dog
-- non-anonymously therefore opened a case against yourself, and it did:
-- incident IR-454B06 identified the pet Simba, and produced a violation
-- naming the reporter with pet_id null.
--
-- The subject of a violation is the owner of the identified pet. Where no pet
-- was identified there is no subject yet, so resident_id stays null and the
-- manager assigns it — which is what the investigation stage is for.
create or replace function public.escalate_incident_to_violation(
  p_incident uuid,
  p_type     text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inc   record;
  v_vio   uuid;
  v_owner uuid;
  v_unit  uuid;
begin
  select * into v_inc from public.incident_reports where id = p_incident;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS, so re-check the caller's scope by hand.
  if not (public.manages_building(v_inc.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select p.owner_id, p.unit_id into v_owner, v_unit
  from public.pets p
  where p.id = v_inc.pet_id and p.deleted_at is null;

  insert into public.violations (
    building_id, unit_id, resident_id, pet_id, origin_incident_id,
    type, stage, opened_by
  )
  values (
    v_inc.building_id,
    coalesce(v_unit, v_inc.unit_id),
    v_owner,
    v_inc.pet_id,
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
          jsonb_build_object('violation_id', v_vio, 'resident_id', v_owner));

  return jsonb_build_object('ok', true, 'violation_id', v_vio);
end;
$function$;

-- Repair what the old body wrote. Any violation whose subject is its own
-- reporter is recomputed from the pet the report identified.
with corrected as (
  select v.id,
         pt.owner_id as correct_resident,
         pt.unit_id  as correct_unit
  from public.violations v
  join public.incident_reports i on i.id = v.origin_incident_id
  left join public.pets pt on pt.id = i.pet_id and pt.deleted_at is null
  where v.resident_id is not distinct from i.reporter_id
    and i.reporter_id is not null
)
update public.violations v
   set resident_id = c.correct_resident,
       unit_id     = coalesce(c.correct_unit, v.unit_id)
  from corrected c
 where v.id = c.id;

-- And carry across the pet the old body dropped.
update public.violations v
   set pet_id = i.pet_id
  from public.incident_reports i
 where i.id = v.origin_incident_id
   and v.pet_id is null
   and i.pet_id is not null;
