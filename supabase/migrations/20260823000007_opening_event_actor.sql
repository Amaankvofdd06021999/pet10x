-- The opening record must name who actually opened the case.
--
-- `trg_violations_opening_event` attributed the opening row with
-- `coalesce(new.opened_by, auth.uid())`. But `opened_by` is a client-supplied
-- column: `violations_manager_insert` constrains only `manages_building` and
-- `stage = 'open'`, and says nothing about whose name goes in that field. So a
-- manager could open a case and sign it as a colleague -- measured, a Cedar
-- Grove insert produced a `violation_events.actor_id` and a `violation.opened`
-- audit row both naming a different manager entirely.
--
-- Every other audit row this phase writes uses `auth.uid()`, and the whole
-- point of the ledger is that it records who did a thing rather than who was
-- claimed to have done it. Reversing the coalesce restores that: the
-- authenticated caller wins when there is one, and `new.opened_by` is the
-- fallback only for callers that have no JWT at all -- the seed, service_role,
-- and `escalate_incident_to_violation` running as definer, which are exactly
-- the cases where `opened_by` is the truthful answer and `auth.uid()` is null.
--
-- `violations.opened_by` itself is left alone. It is the case's own field and
-- a manager may legitimately record that a colleague opened a matter; what
-- must not be forgeable is the LEDGER's account of who pressed the button.
--
-- Idempotent: `create or replace function` only. The trigger is unchanged and
-- is not re-created.

create or replace function public.violations_opening_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $opening$
declare
  v_actor uuid := coalesce(auth.uid(), new.opened_by);
begin
  -- (null -> stage) is the shape Task 1's backfill used for the ten cases that
  -- existed then: from_stage null means "this is where the case started", as
  -- distinct from a move. `to_stage` is NEW.stage rather than the literal
  -- 'open' so that a row inserted at another stage by a future migration or by
  -- service_role still records where it truly began.
  insert into public.violation_events (violation_id, from_stage, to_stage, note, actor_id, occurred_on)
  values (
    new.id,
    null,
    new.stage,
    case when new.origin_incident_id is not null
         then 'Case opened from an escalated incident report'
         else 'Case opened' end,
    v_actor,
    -- `current_date` and not `pg_catalog.current_date`: it is an SQL keyword,
    -- not a schema-qualified function, so the prefix is a syntax error
    -- (42P01, "missing FROM-clause entry for table pg_catalog") -- which is how
    -- this was caught, on the first insert probe. Being a keyword, it is
    -- unaffected by `search_path = ''` and needs no qualification.
    current_date
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (
    v_actor,
    'violation.opened',
    'violation',
    new.id,
    new.building_id,
    pg_catalog.jsonb_build_object(
      'type', new.type,
      'stage', new.stage,
      'pet_id', new.pet_id,
      'resident_id', new.resident_id,
      'unit_id', new.unit_id,
      'origin_incident_id', new.origin_incident_id
    )
  );

  return null;  -- AFTER trigger; the return value is ignored.
end;
$opening$;

comment on function public.violations_opening_event() is
  'Writes the (null -> stage) opening row and its audit entry for every new violation, '
  'attributed to auth.uid() where there is one and to opened_by only for callers with no JWT.';
