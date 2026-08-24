-- A capability the guard never collects is a capability that stays live.
--
-- ---------------------------------------------------------------------------
-- WHAT LEAKED, MEASURED
--
-- `manager_set_fine_schedule` (20260825000003:158) minted its
-- `pet10x.fine_schedule` token UNCONDITIONALLY, immediately before its UPDATE,
-- and relied entirely on `buildings_fine_schedule_guard` to spend it on the way
-- through. But that trigger carries
--
--     when (old.pet_rules is distinct from new.pet_rules)
--
-- so a re-set of values the building ALREADY HOLDS produces an UPDATE that
-- changes nothing, the WHEN clause is false, the guard function is never
-- entered, and the token is never spent. It then stays live — `set_config(...,
-- true)` is TRANSACTION-local, not statement-local — authorising every
-- subsequent write to `buildings.pet_rules` for the rest of the transaction.
--
-- Measured on production as `manager@pet10x.com`, inside a rolled-back
-- transaction, immediately before this migration:
--
--     1  set schedule 25000/50000/CAD      -> {"ok":true}
--     2  direct update f1=999999999        -> f1 = 25000        restored
--     3  no-op re-set, same values         -> {"ok":true}
--     4  direct update f1=999999999        -> f1 = 999999999    TOKEN LEAKED
--     5  second direct update f1=888888888 -> f1 = 999999999    still single-use
--
-- Step 4 is one unaudited $9,999,999.99 first-offence rewrite through
-- `buildings_manager_update`, with no `audit_log` row — the exact hole
-- 20260825000003 was written to close, and which its own header quotes as its
-- RED. Step 5 confirms the token really is single-use once something does
-- collect it; the defect is only that on the no-op path nothing ever does.
--
-- Not reachable from the app today: PostgREST runs one statement per
-- transaction and there is no server-side multi-statement transaction in `app/`
-- or `lib/`. It is reachable from any SQL session, the Supabase SQL editor, or
-- any future RPC that composes with this one — which is precisely the kind of
-- caller a SECURITY DEFINER capability has to be safe against.
--
-- ---------------------------------------------------------------------------
-- THE RULE, STATED WHERE IT CAN BE CHECKED
--
-- The fix is NOT to teach the RPC to predict the trigger's WHEN clause. That
-- duplicates the predicate in two files that are free to drift, and drift is
-- what produced this bug. The invariant is simpler, local, and checkable by
-- reading one function:
--
--     A MINTER CLOSES ITS OWN WINDOW. The token must not outlive the function
--     that minted it, whether or not any trigger chose to run.
--
-- So the mint is now bracketed by an unconditional clear after the guarded
-- statement. If the guard ran, it already spent the token and the clear is a
-- no-op; if the guard did not run, the clear is what closes the window. Either
-- way the token is dead before the RPC returns, and no reasoning about trigger
-- WHEN clauses is required to see it.
--
-- ---------------------------------------------------------------------------
-- THE OTHER TWO TOKENS, CHECKED RATHER THAN ASSUMED
--
-- Every `set_config('pet10x.` mint in the repo, cross-checked against
-- `pg_proc.prosrc` on production so a function that exists only in the database
-- could not hide (the census is exactly three mints and three spends):
--
--   pet10x.stage_change   minted by manager_advance_violation
--                         spent by trg_violations_stage_guard
--                         WHEN (old.stage is distinct from new.stage)
--     SAFE, and not by luck. The ladder above the mint is a positive grammar in
--     which no branch lists its own stage: open -> {warning,resolved,dismissed},
--     warning -> {fine_1,...}, fine_1 -> {fine_2,...}, fine_2 ->
--     {resolved,dismissed}, else false. A same-stage call is refused as
--     `illegal_transition` BEFORE the mint, so whenever a token exists the stage
--     is genuinely changing, the WHEN clause is true, and the guard collects it.
--     Verified live: advancing a case to the stage it already holds returns
--     illegal_transition and mints nothing.
--
--   pet10x.rule_publish   minted by publish_building_rule
--                         spent by trg_building_rules_publish_guard
--                         no WHEN clause — the guard runs on every write
--     SAFE. Two independent reasons: the mint is already conditional on
--     `v_want is distinct from v_rule.is_published`, and the trigger has no
--     WHEN clause at all, so the guard is entered on every INSERT or UPDATE of
--     `building_rules` and collects any token that exists.
--
-- Only `pet10x.fine_schedule` combined an unconditional mint with a WHEN-gated
-- guard, and it is the only one changed here.
--
-- ---------------------------------------------------------------------------
-- WHY A NEW FILE
--
-- 20260825000003 is applied. Its DDL is left byte-identical and the body below
-- is that migration's verbatim, with exactly one statement added and one
-- comment corrected, both marked in place.

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
  --
  -- CORRECTED IN THIS MIGRATION. 20260825000003 said here: "The guard spends it
  -- on the way through: one token, one write." That was false. The guard's
  -- trigger is WHEN-gated on `old.pet_rules is distinct from new.pet_rules`, so
  -- on a re-set of values the building already holds the guard is never entered
  -- and spends nothing. What actually bounds this token is the explicit clear
  -- below, which runs whether or not the guard did.
  perform set_config('pet10x.fine_schedule', 'ok', true);

  -- MERGE, NEVER REPLACE. The compliance toggles, quiet_hours, notes,
  -- breed_restrictions and the rest live in the same jsonb and must come out
  -- untouched.
  update public.buildings
     set pet_rules = (coalesce(pet_rules, '{}'::jsonb)
                      - 'fine_1_cents' - 'fine_2_cents' - 'fine_currency') || v_new
   where id = p_building;

  -- ADDED IN THIS MIGRATION, and the only added statement.
  --
  -- The window closes here, unconditionally. If the UPDATE above changed
  -- `pet_rules` the guard already ran and already spent the token, and this is
  -- a no-op; if it changed nothing the guard was never entered and this is what
  -- stops the token outliving the call. Writing it unconditionally is the whole
  -- point — the RPC must not have to predict which way the trigger's WHEN
  -- clause resolved, because that prediction is what was wrong.
  perform set_config('pet10x.fine_schedule', '', true);

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

-- The comment is restated because `create or replace` keeps the old one, and
-- the sentence about the token is now accurate about what bounds it.
comment on function public.manager_set_fine_schedule(uuid, integer, integer, text) is
  'The only audited writer of the bylaw fine schedule in buildings.pet_rules (fine_1_cents, fine_2_cents, fine_currency). Amounts are integer cents from 1 to 1000000 or NULL, and NULL REMOVES the key rather than writing a JSON null — the shape manager_advance_violation reads as "no schedule for this degree". Amounts are written as JSON numbers, the one shape that reader accepts. Merges into pet_rules; the compliance toggles are untouched. Mints the single-use pet10x.fine_schedule token immediately before its UPDATE and CLEARS IT IMMEDIATELY AFTER, unconditionally: buildings_fine_schedule_guard is WHEN-gated on pet_rules actually changing, so on a no-op re-set the guard never runs and the clear here is the only thing that stops the token authorising later writes in the same transaction. Returns {ok:true, fine_1_cents, fine_2_cents, currency} or {ok:false, error: not_found | forbidden | bad_amount | bad_currency}.';
