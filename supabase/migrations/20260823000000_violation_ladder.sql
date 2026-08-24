-- The enforcement ladder becomes a ladder.
--
-- `violation_stage` was seven flat labels with no ordering enforced anywhere:
-- investigation, pending_review, verbal_warning, written_warning, fine_issued,
-- resolved, dismissed. Nothing in the schema said which one may follow which,
-- and two pairs of them meant the same thing to a manager. The ladder the
-- product actually wants is three degrees of escalation — warning, fine,
-- second fine — plus a state for a case that has been opened but not yet acted
-- on, plus the two terminal states.
--
-- Postgres cannot remove a value from an enum, so this is a new type and a
-- column swap, not an `alter type`. All three columns that use the old type
-- (violations.stage, violation_events.from_stage, violation_events.to_stage)
-- convert here, in one transaction, because they share the type and cannot be
-- split across migrations.
--
-- Ordering is deliberate: the default on violations.stage is written in the old
-- type and blocks the conversion, so it comes off first and goes back on after.

create type public.violation_stage_v2 as enum (
  'open',      -- opened, not yet acted on
  'warning',
  'fine_1',
  'fine_2',
  'resolved',
  'dismissed'
);

comment on type public.violation_stage_v2 is
  'Enforcement ladder. Escalation runs open -> warning -> fine_1 -> fine_2; resolved and dismissed are terminal.';

-- The paper trail, written BEFORE the conversion.
--
-- Two old labels collapse into `open` (investigation, pending_review) and two
-- into `warning` (verbal_warning, written_warning). Once the column is
-- converted those distinctions are unrecoverable — the values will not exist in
-- any type. violation_events is the table this whole phase exists to build, so
-- the migration leaves a record there rather than erasing one: one row per
-- violation whose label changed, naming the label it used to hold.
--
-- These rows are inserted while the column is still the OLD type, so to_stage
-- is written as the old label and is then carried through the same conversion
-- as every other row below — it lands on the new label automatically. `note`
-- keeps the old label as text, which is the part no type can carry.
--
-- Every remapped violation gets a row, not just the ambiguous ones. Recording
-- only the collapsed minority would make "no event" mean "was investigation",
-- and that inference breaks the moment a genuinely new violation is opened at
-- 'open' with no event of its own.
insert into public.violation_events (violation_id, from_stage, to_stage, note, occurred_on)
select v.id,
       null,
       v.stage,
       'Migrated from ' || v.stage::text,
       current_date
from public.violations v
where v.stage::text in (
  'investigation', 'pending_review', 'verbal_warning', 'written_warning', 'fine_issued'
);

-- The default is written in the old type; it must come off before the column
-- can change type, and go back on afterwards in the new one.
alter table public.violations alter column stage drop default;

alter table public.violations
  alter column stage type public.violation_stage_v2
  using (case stage::text
    when 'investigation'   then 'open'
    when 'pending_review'  then 'open'
    when 'verbal_warning'  then 'warning'
    when 'written_warning' then 'warning'
    when 'fine_issued'     then 'fine_1'
    when 'resolved'        then 'resolved'
    when 'dismissed'       then 'dismissed'
  end)::public.violation_stage_v2;

-- from_stage is nullable; a `case` over null matches no branch and yields null,
-- which is what we want.
alter table public.violation_events
  alter column from_stage type public.violation_stage_v2
  using (case from_stage::text
    when 'investigation'   then 'open'
    when 'pending_review'  then 'open'
    when 'verbal_warning'  then 'warning'
    when 'written_warning' then 'warning'
    when 'fine_issued'     then 'fine_1'
    when 'resolved'        then 'resolved'
    when 'dismissed'       then 'dismissed'
  end)::public.violation_stage_v2;

alter table public.violation_events
  alter column to_stage type public.violation_stage_v2
  using (case to_stage::text
    when 'investigation'   then 'open'
    when 'pending_review'  then 'open'
    when 'verbal_warning'  then 'warning'
    when 'written_warning' then 'warning'
    when 'fine_issued'     then 'fine_1'
    when 'resolved'        then 'resolved'
    when 'dismissed'       then 'dismissed'
  end)::public.violation_stage_v2;

alter table public.violations
  alter column stage set default 'open'::public.violation_stage_v2;

-- Nothing else referenced the old type — the three columns above were its only
-- dependents — so it goes, and an old label can no longer be written by anyone.
drop type public.violation_stage;

-- The one function that named a stage literal. It opened cases at
-- 'investigation'; the equivalent state is now 'open'.
--
-- `create or replace`, not drop-and-create: the signature is unchanged, so the
-- existing grants stay exactly as they are and no EXECUTE has to be re-issued.
-- Everything else in this body — the by-hand scope re-check that SECURITY
-- DEFINER makes necessary, and the AD-11 derivation of resident_id/unit_id from
-- the pet's owner rather than from the reporter — is carried over unchanged
-- from 20260821000000. Only the stage literal moves.
create or replace function public.escalate_incident_to_violation(p_incident uuid, p_type text default null::text)
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
    'open',
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
