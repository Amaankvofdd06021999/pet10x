-- Make the ladder the only way up.
--
-- Task 2 built `manager_advance_violation`: one transaction that authorises the
-- caller, checks the transition against the ladder, moves the stage, writes the
-- `violation_events` row a tribunal would ask for, issues the fine, tells the
-- resident and audits the decision. None of that was a CONTROL, because
-- `violations_manager_write` is `FOR ALL` — a manager could skip the whole
-- function with `update violations set stage = 'fine_2'`. Measured, twice:
-- three live cases jumped from `open` straight to `fine_2` in a single
-- statement, with no event row, no fine, and no notice to the resident.
--
-- So: a BEFORE UPDATE trigger that refuses a `stage` change unless it carries a
-- token only the RPC mints. The two halves have to land in the same migration —
-- a trigger without the signal breaks the RPC on the next call, a signal
-- without the trigger enforces nothing.
--
-- Only `stage` is guarded. `resolution_outcome`, `resolved_at`, `resident_id`
-- and `pet_id` are all written by legitimate paths that are not stage changes,
-- so the trigger's WHEN clause compares `old.stage is distinct from new.stage`
-- and every other column stays as freely updatable as it was.
--
-- No CHECK constraint is added to `violation_events`. Task 1's remap collapsed
-- `verbal_warning` and `written_warning` into one label, which left exactly one
-- historical `warning -> warning` self-transition (re-counted here: 13 events,
-- 1 self-transition). Any validating `to_stage > from_stage` constraint would
-- fail against it, and the rule is not ordinal anyway — `resolved` and
-- `dismissed` are reachable from every rung. The ladder is enforced where it
-- can be enforced correctly: in the function, against the row's actual stage,
-- read under a lock. A constraint here would either duplicate that or
-- contradict it.

-- The guard.
--
-- SECURITY INVOKER on purpose: this function reads one setting and either
-- raises or returns. It needs no privilege of its own, and a definer function
-- that raises is a definer function whose only job could be done without the
-- privilege.
--
-- Triggers are not RLS. `is_admin()` transcends the `violations` policies but
-- transcends nothing here: a super-admin's direct UPDATE fires this trigger
-- exactly as a manager's does, and is refused exactly the same way. Verified
-- for both roles.
create or replace function public.violations_stage_guard()
returns trigger
language plpgsql
set search_path = ''
as $guard$
begin
  -- The token is a single-use capability, not a mode. This is the part the
  -- design brief got wrong, and it matters.
  --
  -- `set_config(..., true)` is TRANSACTION-local, which was read as "cannot
  -- leak between statements". Measured on this database before this migration
  -- was written: a GUC set inside a SECURITY DEFINER function survives that
  -- function's return, and is still readable two statements later in the same
  -- transaction. (A function's own `SET` clause saves and restores only the
  -- parameters it names — here `search_path` — not every GUC the body touches.)
  --
  -- Left as a mode, the control would fail open after every legitimate use:
  -- call the RPC once, then move any case anywhere by plain UPDATE for the rest
  -- of the transaction. So the trigger SPENDS the token on the way through.
  -- One token, one stage change. The RPC mints one immediately before its own
  -- UPDATE; by the time that UPDATE returns, it is gone.
  if pg_catalog.current_setting('pet10x.stage_change', true) is distinct from 'ok' then
    -- `is distinct from` rather than `<>`, because an unset setting reads as
    -- NULL and `NULL <> 'ok'` is NULL — the same three-valued-logic hole that
    -- the RPC's own transition guard was corrected for. A guard that evaluates
    -- to NULL is not a guard.
    raise exception
      'violations.stage cannot be changed by a direct UPDATE'
      using errcode = '42501',
            detail  = pg_catalog.format(
                        'Violation %s: attempted %s -> %s outside manager_advance_violation().',
                        old.id, old.stage, new.stage),
            hint    = 'Call manager_advance_violation(p_violation, p_to_stage, p_note, p_amount_cents, p_due_on) instead. It checks the transition against the ladder, writes the violation_events row, issues the fine and notifies the resident, all in one transaction.';
  end if;

  perform pg_catalog.set_config('pet10x.stage_change', '', true);
  return new;
end;
$guard$;

comment on function public.violations_stage_guard() is
  'BEFORE UPDATE guard on violations.stage: refuses any stage change that does not carry the single-use pet10x.stage_change token minted by manager_advance_violation, and spends the token as it passes. Raises 42501 (insufficient_privilege -> HTTP 403) with a hint naming the RPC. Other columns are untouched.';

-- The other half: the only legitimate minter of the token.
--
-- `create or replace`, not drop-and-create, so the existing EXECUTE grants and
-- the function comment set in 20260823000001 survive untouched. The body below
-- is that migration's body verbatim — the ladder, the lock, the five writes,
-- the null-target coalesce — with exactly one statement added, marked in place.

create or replace function public.manager_advance_violation(
  p_violation    uuid,
  p_to_stage     public.violation_stage_v2,
  p_note         text    default null,
  p_amount_cents integer default null,
  p_due_on       date    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vio      public.violations%rowtype;
  v_from     public.violation_stage_v2;
  v_rules    jsonb;
  v_bylaw    jsonb;
  v_amount   integer;
  v_currency text;
  v_fine     uuid;
  v_notified boolean := false;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_target   text;
  v_result   jsonb;
begin
  -- FOR UPDATE is the whole concurrency story. Two managers pressing "issue
  -- fine" on the same case at the same moment both read `warning`; the second
  -- one blocks here, and when the lock is released READ COMMITTED re-reads the
  -- row it has just been granted — so it sees `fine_1`, and the ladder check
  -- below rejects fine_1 -> fine_1. Without the lock the building sends two
  -- fines for one breach.
  select * into v_vio from public.violations where id = p_violation for update;
  if not found then
    -- Existence is answered before scope, so a caller who manages nothing can
    -- still tell a real violation id from a fabricated one. Kept deliberately:
    -- ids are uuids rather than guessable integers, `not_found` and `forbidden`
    -- have to stay distinguishable for the client to say anything useful, and
    -- escalate_incident_to_violation orders its two checks the same way. The
    -- leak is existence only — nothing about the case is returned.
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS, so re-check the caller's scope by hand.
  -- Nothing has been written at this point, and nothing will be: every write
  -- below this line is unreachable for a caller who does not manage the
  -- building the case belongs to.
  if not (public.manages_building(v_vio.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_from := v_vio.stage;

  -- The ladder, written out rather than derived.
  --
  -- The enum's sort order does happen to run open < warning < fine_1 < fine_2,
  -- so escalation alone could have been expressed as `p_to_stage > v_from`.
  -- That is not the rule, though: `resolved` and `dismissed` are reachable
  -- from every rung and from each other's left, and nothing at all is
  -- reachable FROM them. An ordinal test would quietly permit
  -- resolved -> dismissed and forbid nothing that matters. The table is the
  -- specification, so the table is what is written.
  --
  -- Note that a stage cannot move to itself: re-pressing "issue fine" on a
  -- case already at fine_1 is an illegal transition, not a silent no-op, so
  -- the manager finds out that the case had already moved.
  --
  -- The coalesce is load-bearing, not decoration. `x in (...)` is NULL, not
  -- false, when x is NULL, so a null p_to_stage made `if not (...)` a NULL
  -- condition — the branch was not taken, the guard was skipped, and control
  -- fell through into the writes to be stopped only by the NOT NULL on
  -- violations.stage. That rolled back cleanly but raised 23502 at the client
  -- instead of returning something it could branch on, which contradicts this
  -- function's whole no-raise contract. Three-valued logic has to be collapsed
  -- to two before a boolean guard is trusted.
  if not coalesce(
    case v_from
      when 'open'    then p_to_stage in ('warning', 'resolved', 'dismissed')
      when 'warning' then p_to_stage in ('fine_1', 'resolved', 'dismissed')
      when 'fine_1'  then p_to_stage in ('fine_2', 'resolved', 'dismissed')
      when 'fine_2'  then p_to_stage in ('resolved', 'dismissed')
      -- resolved and dismissed are terminal. Reopening is a new violation,
      -- because a closed case that reopens under the same id destroys the
      -- meaning of its own history.
      else false
    end,
    false
  ) then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition',
                              'from', v_from::text, 'to', p_to_stage::text);
  end if;

  -- The fine amount is settled BEFORE the first write, so that a case with no
  -- amount available does not advance a stage and then fail to fine.
  --
  -- AD-5: the schedule lives in `buildings.pet_rules`, keys `fine_1_cents`,
  -- `fine_2_cents`, `fine_currency`. That column is already jsonb holding rule
  -- toggles, so a schedule needs no DDL — this function and a later bylaw
  -- editor simply agree on the key names.
  if p_to_stage in ('fine_1', 'fine_2') then
    select b.pet_rules into v_rules
      from public.buildings b where b.id = v_vio.building_id;

    v_bylaw := v_rules -> (p_to_stage::text || '_cents');

    if p_amount_cents is not null then
      -- An explicit override wins, including an explicit bad one: a caller who
      -- passes 0 is refused rather than silently charged the bylaw amount.
      v_amount := p_amount_cents;
    elsif jsonb_typeof(v_bylaw) = 'number' then
      -- Positive grammar: accept the one shape a schedule is allowed to take.
      -- A string, a bool or a nested object is not an amount, and casting one
      -- would raise out of a function whose whole contract is not to raise.
      v_amount := floor((v_bylaw #>> '{}')::numeric)::integer;
    end if;

    if coalesce(v_amount, 0) <= 0 then
      -- Refusing beats inserting a zero-dollar fine. A 0 row looks like a
      -- decision somebody made; a refusal tells the manager the building has
      -- no fine schedule yet, which is the actual problem.
      return jsonb_build_object('ok', false, 'error', 'no_fine_amount');
    end if;

    -- `fines.currency` defaults to 'cad' and all four existing rows are
    -- lowercase, so the bylaw's 'CAD' is folded to match rather than starting
    -- a second spelling in the same column.
    v_currency := lower(coalesce(nullif(btrim(v_rules ->> 'fine_currency'), ''), 'CAD'));
  end if;

  -- 1. The stage itself.
  --
  -- resolved_at is set alongside a terminal stage because the app reads it as
  -- the open/closed flag, not the stage column: `lib/data/manager.ts` and
  -- `lib/data/manager-queues.ts` both count active cases with
  -- `.is("resolved_at", null)`. A resolved case with a null resolved_at would
  -- stay in the manager's open-case count forever. Dismissal closes a case
  -- just as finally as resolution, so it stamps the same field.
  --
  -- FOR THE CLIENT: on a terminal step, p_note does double duty — it is the
  -- event's note AND the case's resolution_outcome, which the manager's
  -- resolved-cases queue renders as a short outcome label
  -- (lib/data/manager-queues.ts:459). This is what `resolveViolation` already
  -- does with its `outcome` argument. So pass a label, not a paragraph; with
  -- no note at all the stage name is used.

  -- ADDED IN THIS MIGRATION, and the only change to this function.
  --
  -- The stage guard's token, minted here: after every early return, so a
  -- refused call never mints one, and immediately before the only statement
  -- in this function that touches `stage`, so the window it is valid for is
  -- one statement wide. `trg_violations_stage_guard` spends it on the way
  -- through, which is what stops it from becoming a mode that stays open for
  -- the rest of the transaction.
  perform set_config('pet10x.stage_change', 'ok', true);

  update public.violations
     set stage       = p_to_stage,
         resolved_at = case when p_to_stage in ('resolved', 'dismissed')
                            then now() else resolved_at end,
         resolution_outcome = case when p_to_stage in ('resolved', 'dismissed')
                                   then coalesce(v_note, initcap(p_to_stage::text))
                                   else resolution_outcome end
   where id = p_violation;

  -- 2. The paper trail. This is the row the whole phase exists to produce:
  -- where the case came from, where it went, who moved it, what they said.
  insert into public.violation_events (violation_id, from_stage, to_stage, note, actor_id)
  values (p_violation, v_from, p_to_stage, v_note, auth.uid());

  -- 3. The fine, when this step enters a fine degree.
  --
  -- resident_id and unit_id are copied from the violation, which may leave
  -- them null on an unassigned case. That is honest: the fine is against the
  -- unit's case, and naming a resident who has not been identified would be
  -- worse than naming nobody.
  if p_to_stage in ('fine_1', 'fine_2') then
    insert into public.fines (violation_id, building_id, unit_id, resident_id,
                              amount_cents, currency, status, issued_by, due_on)
    values (p_violation, v_vio.building_id, v_vio.unit_id, v_vio.resident_id,
            v_amount, v_currency, 'issued', auth.uid(), p_due_on)
    returning id into v_fine;
  end if;

  -- 4. Tell the resident — when there is one.
  --
  -- A violation escalated from a report that identified no pet has no subject
  -- yet — resident_id stays null until a manager assigns one, which is what
  -- the `open` stage is for. One of the thirteen live violations is in that
  -- state today. Such a case must still be able to move; it simply notifies
  -- nobody, and says so in the return, so the client can tell the manager
  -- "advanced, but nobody was notified" instead of implying a letter went out.
  --
  -- action_target: the resident app has no violation screen, and the alerts
  -- screen's own targets are screen keys — 'profile', 'pet-care',
  -- 'pet-detail:<uuid>'. A pet bylaw matter is shown on the pet, and the
  -- existing compliance notifications already point at 'pet-detail', so that
  -- is the target when the case names a pet. With no pet there is nothing
  -- pet-shaped to open, and 'profile' is where the resident's building
  -- relationship lives — the same fallback `request-info` uses.
  if v_vio.resident_id is not null then
    v_target := case
      when v_vio.pet_id is not null then 'pet-detail:' || v_vio.pet_id::text
      else 'profile'
    end;

    insert into public.notifications (profile_id, kind, severity, title, body,
                                      action_label, action_target, building_id)
    values (
      v_vio.resident_id,
      'building',
      case
        when p_to_stage in ('fine_1', 'fine_2') then 'error'
        when p_to_stage = 'warning'             then 'warning'
        when p_to_stage = 'resolved'            then 'success'
        else 'info'
      end,
      case p_to_stage
        when 'warning'   then 'Bylaw warning issued'
        when 'fine_1'    then 'A fine has been issued'
        when 'fine_2'    then 'A second fine has been issued'
        when 'resolved'  then 'Your bylaw case is closed'
        when 'dismissed' then 'Your bylaw case was dismissed'
      end,
      -- "your unit" is only said when the case actually names one. One of the
      -- thirteen live violations has a resident but a null unit_id (a second
      -- has neither, so it never reaches here), and telling that resident a
      -- fine was issued "against your unit" names a thing the record does not
      -- contain.
      case
        when p_to_stage in ('fine_1', 'fine_2') then
          'A fine of ' || to_char(v_amount / 100.0, 'FM999999990.00')
          || ' ' || upper(v_currency) || ' has been issued'
          || case when v_vio.unit_id is not null then ' against your unit.' else '.' end
        when p_to_stage = 'warning' then
          'Your building has issued a warning about a pet bylaw matter.'
        when p_to_stage = 'resolved' then
          'The pet bylaw matter'
          || case when v_vio.unit_id is not null then ' involving your unit' else '' end
          || ' has been resolved.'
        else
          'The pet bylaw matter'
          || case when v_vio.unit_id is not null then ' involving your unit' else '' end
          || ' has been dismissed. No further action is required.'
      end || coalesce(' ' || v_note, ''),
      'View details',
      v_target,
      v_vio.building_id
    );
    v_notified := true;
  end if;

  -- 5. The audit row, which records the decision rather than its effects —
  -- who moved what, from where to where, and whether a resident heard about it.
  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'violation.advanced', 'violation', p_violation, v_vio.building_id,
          jsonb_build_object('from', v_from::text, 'to', p_to_stage::text,
                             'fine_id', v_fine, 'amount_cents', v_amount,
                             'resident_id', v_vio.resident_id, 'notified', v_notified));

  v_result := jsonb_build_object('ok', true, 'stage', p_to_stage::text, 'notified', v_notified);
  if v_fine is not null then
    v_result := v_result || jsonb_build_object('fine_id', v_fine, 'amount_cents', v_amount);
  end if;
  return v_result;
end;
$$;


-- Enforcement starts here, on the last statement of the migration — the RPC
-- above already signals, so there is no instant at which the trigger is live
-- and its only legitimate caller is not.
--
-- The WHEN clause is the whole "only stage is guarded" rule. An update that
-- leaves `stage` alone never enters the function at all.
--
-- Named to sort before `trg_violations_updated`, the existing BEFORE UPDATE
-- trigger, so a refused write never reaches set_updated_at().
create trigger trg_violations_stage_guard
  before update on public.violations
  for each row
  when (old.stage is distinct from new.stage)
  execute function public.violations_stage_guard();
