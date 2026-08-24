-- What a fine costs is a decision, and decisions get recorded.
--
-- This is the deliverable Phase 2 discovered and could not build. AD-5 puts the
-- bylaw fine schedule in `buildings.pet_rules` under `fine_1_cents`,
-- `fine_2_cents` and `fine_currency`; `manager_advance_violation` has read it
-- since 20260823000001. Measured 2026-08-23: **zero of six buildings carry any
-- of those keys and no surface in the app can write one**, so every fine issued
-- so far has carried a hand-typed amount and AD-5's "bylaw default,
-- overridable" behaviour has been unreachable. This migration is the writer.
--
-- ---------------------------------------------------------------------------
-- THE HOLE THIS CLOSES, MEASURED RATHER THAN REASONED
--
-- `buildings_manager_update` is UPDATE with `manages_building(id)` in both
-- USING and WITH CHECK; `buildings_admin_all` is ALL with `is_admin()`. Neither
-- restricts columns, and the only triggers on `buildings` were
-- `buildings_normalise_code` and `trg_buildings_updated`. There is no audit
-- trail on a `buildings` update at all — `updated_at` moves for any field, so
-- it cannot tell a fine-schedule change from a postcode correction.
--
-- Run as `manager@pet10x.com` immediately before this migration, inside a
-- rolled-back transaction:
--
--     update public.buildings
--        set pet_rules = pet_rules || '{"fine_1_cents": 999999999}'::jsonb
--      where id = 'b41968f8-f45c-4a2b-a644-e94311100faf';
--
--     -> pet_rules->'fine_1_cents' = 999999999   (a $9,999,999.99 first offence)
--     -> audit_log unchanged at 35 rows
--
-- Read carelessly, "both policies are live, just add the keys" says the schema
-- is ready. Shipping it that way hands every manager an unrecorded rewrite of
-- what a bylaw offence costs — and the schedule is what makes two residents'
-- fines comparable, which is the exact consistency AD-5 exists to protect.
--
-- So: the schedule moves behind an audited SECURITY DEFINER RPC, and a trigger
-- makes every other write path incapable of moving it.
--
-- ---------------------------------------------------------------------------
-- WHY THE GUARD RESTORES INSTEAD OF RAISING
--
-- Three surfaces write the WHOLE `pet_rules` object today, and all three have a
-- legitimate reason to:
--
--   components/screens/strata/bylaws-editor.tsx:53   updateMyBuildingRules
--   components/screens/manager/settings-screen.tsx   BylawsSheet, same function
--   components/screens/strata/bylaws-screen.tsx:162  BulkApply — applies a
--     TEMPLATE that is a whole pet_rules snapshot held in localStorage
--
-- The third is a live data-loss hazard the moment a schedule exists: a template
-- saved before this migration contains no fine keys, so applying it later
-- REPLACES the object and silently deletes the building's fine schedule. Every
-- subsequent fine then falls back to a hand-typed amount with nothing to
-- indicate why.
--
-- A raising trigger would turn that into a broken button on three screens. So
-- this one strips the three schedule keys out of NEW and re-adds whichever of
-- them OLD held. That makes the three bylaw surfaces STRUCTURALLY INCAPABLE of
-- moving the schedule while leaving everything they actually meant to write
-- intact, and it needs no client change to be safe.
--
-- Restoring silently is normally a smell, because it hides a caller's bug. It
-- is right here because none of those callers INTENDS to write the schedule —
-- the keys are only along for the ride in a whole-object round-trip. The RPC
-- below is the only documented path, and it is the only one that leaves a
-- record.
--
-- This is the opposite choice from `building_rules_publish_guard`
-- (20260825000001), which raises. The difference is whether a legitimate caller
-- sends the guarded field by accident. There, none does; here, three do.

-- ---------------------------------------------------------------------------
-- 1. THE WRITER

create or replace function public.manager_set_fine_schedule(
  p_building     uuid,
  p_fine_1_cents integer,
  p_fine_2_cents integer,
  p_currency     text default 'CAD'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old      jsonb;
  v_new      jsonb := '{}'::jsonb;
  v_currency text;
begin
  if p_building is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS, so the caller's scope is re-checked by hand
  -- before anything is read or written.
  if not (public.manages_building(p_building) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select coalesce(pet_rules, '{}'::jsonb) into v_old
    from public.buildings where id = p_building for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- THE GRAMMAR, POSITIVE. Each amount is either NULL — meaning "no schedule
  -- for this degree", written by REMOVING the key — or an integer from 1 cent
  -- to ten thousand dollars. Anything else is refused.
  --
  -- Zero is NOT "no schedule". It is refused, for two reasons:
  -- `manager_advance_violation` would refuse it later anyway
  -- (`coalesce(v_amount,0) <= 0` -> no_fine_amount, 20260823000001:147), and a
  -- literal 0 sitting in the jsonb looks like a decision somebody made rather
  -- than an absence.
  --
  -- Each test is guarded by `is not null` first, so no comparison is ever
  -- evaluated against NULL. `null < 1` is NULL, and `if not (NULL)` does not
  -- branch — the three-valued-logic hole that let a scope guard fail open in
  -- Phase 2 and that `manager_advance_violation`'s transition check had to be
  -- corrected for.
  if p_fine_1_cents is not null and (p_fine_1_cents < 1 or p_fine_1_cents > 1000000) then
    return jsonb_build_object('ok', false, 'error', 'bad_amount', 'degree', 1);
  end if;
  if p_fine_2_cents is not null and (p_fine_2_cents < 1 or p_fine_2_cents > 1000000) then
    return jsonb_build_object('ok', false, 'error', 'bad_amount', 'degree', 2);
  end if;

  v_currency := upper(btrim(coalesce(p_currency, '')));
  if v_currency !~ '^[A-Z]{3}$' then
    return jsonb_build_object('ok', false, 'error', 'bad_currency');
  end if;

  -- `to_jsonb(integer)` produces a JSON NUMBER, which is the single shape
  -- `jsonb_typeof(v_bylaw) = 'number'` accepts (20260823000001:141). A text
  -- cast would produce "25000", which that reader ignores SILENTLY — a schedule
  -- the RPC cannot parse is worse than none, because it looks configured.
  if p_fine_1_cents is not null then
    v_new := v_new || jsonb_build_object('fine_1_cents', to_jsonb(p_fine_1_cents));
  end if;
  if p_fine_2_cents is not null then
    v_new := v_new || jsonb_build_object('fine_2_cents', to_jsonb(p_fine_2_cents));
  end if;
  -- The currency key is written whenever either amount is. With no amounts at
  -- all the whole schedule is removed, currency included, so an empty schedule
  -- is empty rather than a lone currency with nothing to denominate.
  if v_new <> '{}'::jsonb then
    -- Stored UPPER CASE. `manager_advance_violation` lower-cases it on read
    -- (:159) to match `fines.currency`, and `readFineSchedule` upper-cases it
    -- for display; both survive either casing, so the point is simply to store
    -- one spelling.
    v_new := v_new || jsonb_build_object('fine_currency', v_currency);
  end if;

  -- The token, minted after every early return so a refused call never mints
  -- one, and immediately before the only statement that moves the schedule.
  -- The guard spends it on the way through: one token, one write.
  perform set_config('pet10x.fine_schedule', 'ok', true);

  -- MERGE, NEVER REPLACE. The compliance toggles, quiet_hours, notes,
  -- breed_restrictions and the rest live in the same jsonb and must come out
  -- untouched.
  update public.buildings
     set pet_rules = (coalesce(pet_rules, '{}'::jsonb)
                      - 'fine_1_cents' - 'fine_2_cents' - 'fine_currency') || v_new
   where id = p_building;

  -- BOTH the previous and the new triple. An audit row that records only the
  -- new amount cannot answer "was this lowered between the two fines?", which
  -- is the question the record exists for.
  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'building.fine_schedule_set', 'building', p_building, p_building,
          jsonb_build_object(
            'previous', jsonb_build_object(
              'fine_1_cents',  v_old -> 'fine_1_cents',
              'fine_2_cents',  v_old -> 'fine_2_cents',
              'fine_currency', v_old -> 'fine_currency'),
            'new', jsonb_build_object(
              'fine_1_cents',  v_new -> 'fine_1_cents',
              'fine_2_cents',  v_new -> 'fine_2_cents',
              'fine_currency', v_new -> 'fine_currency')));

  return jsonb_build_object('ok', true,
                            'fine_1_cents', p_fine_1_cents,
                            'fine_2_cents', p_fine_2_cents,
                            'currency', case when v_new = '{}'::jsonb then null else v_currency end);
end;
$$;

comment on function public.manager_set_fine_schedule(uuid, integer, integer, text) is
  'The only audited writer of the bylaw fine schedule in buildings.pet_rules (fine_1_cents, fine_2_cents, fine_currency). Amounts are integer cents from 1 to 1000000 or NULL, and NULL REMOVES the key rather than writing a JSON null — the shape manager_advance_violation reads as "no schedule for this degree". Amounts are written as JSON numbers, the one shape that reader accepts. Merges into pet_rules; the compliance toggles are untouched. Returns {ok:true, fine_1_cents, fine_2_cents, currency} or {ok:false, error: not_found | forbidden | bad_amount | bad_currency}.';

-- ---------------------------------------------------------------------------
-- 2. THE GUARD

create or replace function public.buildings_fine_schedule_guard()
returns trigger
language plpgsql
set search_path = ''
as $guard$
declare
  v_sched jsonb := '{}'::jsonb;
begin
  -- Single-use capability, not a mode: spent on the way through, exactly as
  -- violations_stage_guard spends pet10x.stage_change. A GUC set with
  -- set_config(..., true) is transaction-local and outlives the SECURITY
  -- DEFINER function that set it, so left unspent it would authorise every
  -- later statement in the same transaction.
  --
  -- `is distinct from` rather than `<>`: an unset setting reads as NULL and
  -- `NULL <> 'ok'` is NULL, which is not a guard.
  if pg_catalog.current_setting('pet10x.fine_schedule', true) is not distinct from 'ok' then
    perform pg_catalog.set_config('pet10x.fine_schedule', '', true);
    return new;
  end if;

  -- Everything below is the RESTORE. This statement did not come through
  -- manager_set_fine_schedule, so whatever it says about the three schedule
  -- keys is discarded and OLD's values are put back. Every other key in NEW is
  -- kept exactly as the caller wrote it — the toggles, quiet_hours, notes and
  -- breed_restrictions are what these callers actually meant to change.
  --
  -- Written key by key rather than as a jsonb subtraction so that a key ABSENT
  -- in OLD stays absent, instead of being restored as a JSON null. A null
  -- fine_1_cents would read as `jsonb_typeof = 'null'`, not 'number', so
  -- manager_advance_violation would ignore it — but it would also make
  -- `pet_rules ? 'fine_1_cents'` true, which is how the editor decides whether
  -- a schedule exists at all.
  if old.pet_rules ? 'fine_1_cents'  then v_sched := v_sched || pg_catalog.jsonb_build_object('fine_1_cents',  old.pet_rules -> 'fine_1_cents');  end if;
  if old.pet_rules ? 'fine_2_cents'  then v_sched := v_sched || pg_catalog.jsonb_build_object('fine_2_cents',  old.pet_rules -> 'fine_2_cents');  end if;
  if old.pet_rules ? 'fine_currency' then v_sched := v_sched || pg_catalog.jsonb_build_object('fine_currency', old.pet_rules -> 'fine_currency'); end if;

  new.pet_rules := (coalesce(new.pet_rules, '{}'::jsonb)
                    - 'fine_1_cents' - 'fine_2_cents' - 'fine_currency') || v_sched;
  return new;
end;
$guard$;

comment on function public.buildings_fine_schedule_guard() is
  'BEFORE UPDATE guard on buildings.pet_rules. RESTORES rather than raises: any write that does not carry the single-use pet10x.fine_schedule token minted by manager_set_fine_schedule has the three schedule keys stripped from NEW and OLD''s values put back, while every other key it wrote is kept. Restoring rather than refusing because three legitimate client surfaces (both bylaw editors and the strata BulkApply template) round-trip the WHOLE pet_rules object and carry the schedule keys along by accident — a raise would break three working buttons, and a BulkApply of a template saved before the schedule existed would otherwise delete it silently.';

-- UPDATE only, and deliberately not INSERT. The hazard this closes is the
-- silent MOVEMENT of an existing schedule; at INSERT there is no existing
-- schedule to move and no OLD to restore from, so "restore" has no meaning
-- there. `buildings` INSERT is admin-only in any case.
--
-- The WHEN clause is the whole "only pet_rules is guarded" rule: an update that
-- leaves the column alone never enters the function.
--
-- Named to sort before `trg_buildings_updated`, the existing BEFORE UPDATE
-- trigger, so the restore happens before set_updated_at() runs.
create trigger buildings_fine_schedule_guard
  before update on public.buildings
  for each row
  when (old.pet_rules is distinct from new.pet_rules)
  execute function public.buildings_fine_schedule_guard();

-- ---------------------------------------------------------------------------
-- 3. WHO MAY CALL IT
--
-- Same rule as the two rule RPCs: it bypasses RLS, so the execute grant is the
-- only remaining gate, and an unauthenticated caller has no auth.uid() for the
-- scope check to test. Revoked from PUBLIC and from anon by name; asserted from
-- pg_proc.proacl afterwards rather than trusted, because this repository has
-- seven measured no-op revokes in its history.
revoke execute on function public.manager_set_fine_schedule(uuid, integer, integer, text) from public, anon;
grant  execute on function public.manager_set_fine_schedule(uuid, integer, integer, text) to authenticated, service_role;
