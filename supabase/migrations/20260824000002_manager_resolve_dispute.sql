-- Uphold it or overturn it, and never escalate a case under appeal.
--
-- Three things land together because the second is what makes the first safe.
--
--   A. `manager_advance_violation` is DROPPED AND RECREATED with a sixth
--      parameter, `p_notify`, and refuses to move a case with an open dispute.
--   B. `manager_resolve_dispute` decides an appeal.
--   C. Both resident-facing notification targets point at the screen that now
--      exists.
--
-- WHY A DROP AND NOT A `create or replace`: `create or replace` CANNOT ADD A
-- PARAMETER. It would create a SECOND function — a five-argument overload
-- beside the six-argument one — and PostgREST would then resolve
-- `manager_advance_violation` by argument names on every call. A stale overload
-- is precisely the defect Phase 0 was written to remove. The drop is explicit,
-- and `select count(*) from pg_proc where proname='manager_advance_violation'`
-- must read 1 afterwards, not 2.
--
-- The grants and the comment do NOT survive a drop, so both are re-issued
-- below. That is the cost of the drop and the reason it is stated here rather
-- than discovered later by a manager getting 42501 on a function that worked
-- yesterday.
--
-- ---------------------------------------------------------------------------
-- THE BODY BELOW IS THE DEPLOYED ONE, VERBATIM, WITH THREE MARKED EDITS.
--
-- Method, and it is checkable rather than asserted: the body was extracted from
-- `20260823000002_violations_stage_guard.sql`, confirmed byte-identical to the
-- deployed `prosrc` (md5 7491c5cfb59c6b6ed503eb9c7b4050df, 12753 bytes), and
-- the three edits applied by exact-match substitution with an assertion that
-- each anchor occurred exactly once. `diff` of before against after shows those
-- three hunks and nothing else. Each is labelled EDIT n OF 3 in place.
--
--   1. the open-dispute refusal, after the scope check
--   2. `p_notify and` on the notification block
--   3. `action_target` becomes `my-cases:<violation id>`
--
-- Everything else — the ladder table, the FOR UPDATE, the null-target coalesce,
-- the fine-amount block, the token mint, the five writes — is untouched.
--
-- ---------------------------------------------------------------------------
-- `manager_advance_violation`'S ERROR SURFACE GROWS BY ONE CODE.
--
-- `lib/data/manager-queues.ts`'s `advanceError` maps exactly four today, and
-- Phase 2's review verified there was no fifth unmapped one. `dispute_open` is
-- the fifth, and until Task 4 of this phase lands that mapping is INCOMPLETE:
-- a manager pressing Escalate on a disputed case sees "Couldn't move this case
-- (dispute_open)." from the default arm. That is honest but unhelpful, and it
-- is a known gap for exactly one commit.
--
-- ONE CONSEQUENCE OF COPYING VERBATIM, stated so nobody reads it as a lie: the
-- body still carries 20260823000002's comment "ADDED IN THIS MIGRATION, and the
-- only change to this function" above the `set_config` token mint. "This
-- migration" there means 20260823000002, where that sentence was true. It is
-- left untouched because editing it would be a fourth difference and would cost
-- the diff property that makes the other three checkable.

drop function public.manager_advance_violation(uuid, public.violation_stage_v2, text, integer, date);

create function public.manager_advance_violation(
  p_violation    uuid,
  p_to_stage     public.violation_stage_v2,
  p_note         text    default null,
  p_amount_cents integer default null,
  p_due_on       date    default null,
  -- THE NEW PARAMETER. Last, and defaulted true, so every existing caller is
  -- unaffected: `lib/data/manager-queues.ts:566-575` passes by name and the
  -- strata portal goes through that same function. The only caller that passes
  -- false is `manager_resolve_dispute` below.
  p_notify       boolean default true
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

  -- EDIT 1 OF 3 IN THIS MIGRATION (20260824000002). A MANAGER MUST NOT
  -- ESCALATE A CASE WHILE THE RESIDENT'S APPEAL IS PENDING.
  --
  -- That is the procedural-fairness failure the ladder exists to prevent, and
  -- it is the first thing a tribunal looks for: a resident who contested a
  -- warning and was fined before anyone read the appeal was not heard.
  --
  -- Positive grammar: a disputed case has EXACTLY ONE legal next action, and
  -- it is `manager_resolve_dispute`, which stamps the dispute closed before it
  -- calls back into this function. There is no stage this refusal excepts —
  -- not `resolved`, not `dismissed` — because closing a case under appeal
  -- decides the appeal by ending the thing it is about.
  --
  -- Placed AFTER the scope check so a caller who does not manage the building
  -- learns `forbidden` and nothing about whether the case is disputed, and
  -- BEFORE the transition check so the answer does not depend on which move
  -- was attempted.
  if exists (select 1 from public.violation_disputes d
              where d.violation_id = v_vio.id and d.outcome is null) then
    return jsonb_build_object('ok', false, 'error', 'dispute_open');
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
  -- EDIT 2 OF 3 IN THIS MIGRATION (20260824000002): the `p_notify and` prefix.
  --
  -- `manager_resolve_dispute` sends its OWN notification about the decision and
  -- then, on an overturn, calls this function to do the dismissal. Without this
  -- the resident receives two messages about one decision — "your case was
  -- dismissed" and "your appeal succeeded" — which reads as two separate
  -- events. `p_notify => false` buys exactly one.
  --
  -- `v_notified` stays false when suppressed, so the audit row and the return
  -- value both say nobody was told BY THIS CALL. That is true, and the caller
  -- that suppressed it is the one that knows about the message it sent itself.
  if p_notify and v_vio.resident_id is not null then
    -- EDIT 3 OF 3 IN THIS MIGRATION (20260824000002): action_target.
    --
    -- This was `'pet-detail:' || pet_id` falling back to `'profile'`, under a
    -- comment reading "the resident app has no violation screen". It has one
    -- now — `my-cases`, built in this phase — so the notification opens the
    -- CASE it is about rather than the pet named in it, and a case with no pet
    -- no longer has to fall back to something adjacent. `screen:id` is the
    -- existing target grammar (`lib/navigation.ts`), where `my-cases` is
    -- registered as a RESIDENT surface that carries an id.
    --
    -- THIS TARGET IS LIVE, NOT DECORATION, and this phase's plan says
    -- otherwise. It states that `alerts-screen.tsx` "still calls
    -- toast(alert.actionLabel) and navigates nowhere" and that wiring targets
    -- is Phase 9's work. That was true when the plan was written; Phase 3 has
    -- since shipped `resolveActionTarget` and `alerts-screen.tsx:185-210`,
    -- which render a real navigating button. So this line makes the
    -- notification navigable today, and the screen it navigates to is Task 5's.
    v_target := 'my-cases:' || v_vio.id::text;

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

comment on function public.manager_advance_violation(uuid, public.violation_stage_v2, text, integer, date, boolean) is
  'Moves a violation one legal step along the enforcement ladder: validates the transition, writes a violation_events row, issues a fine on entering fine_1/fine_2, notifies the resident when there is one and p_notify is true, and audits. REFUSES any move on a case with an open violation_disputes row — the only legal next action on a disputed case is manager_resolve_dispute. Returns {ok:true, stage, notified, fine_id?} or {ok:false, error: not_found | forbidden | dispute_open | illegal_transition | no_fine_amount} — every rejection it specifies is a return value, not a raise.';

revoke execute on function public.manager_advance_violation(uuid, public.violation_stage_v2, text, integer, date, boolean) from public, anon;
grant  execute on function public.manager_advance_violation(uuid, public.violation_stage_v2, text, integer, date, boolean) to authenticated, service_role;


-- ===========================================================================
-- B. The manager decides the appeal.
--
-- Two outcomes, and what each does:
--
--   upheld      the case does not move. Fines go `disputed -> issued`, so they
--               are chaseable again and `manager_remind_fine` resumes working.
--               One self-transition event records the decision.
--   overturned  the case is DISMISSED through `manager_advance_violation`, and
--               fines go `disputed -> waived`. AD-7: overturning dismisses the
--               violation and waives the fine attached to the disputed degree.
--
-- Both are moves `LEGAL_TRANSITIONS` already permits — `dismissed` is legal
-- from all four non-terminal rungs and uphold moves nothing — so NO LADDER
-- CHANGE IS NEEDED AND NONE IS MADE.
--
-- ORDER OF WRITES IS NOT NEGOTIABLE. The dispute is stamped FIRST, because
-- edit 1 above makes `manager_advance_violation` refuse a case with an open
-- dispute and the overturn path calls it. Stamping last would deadlock the
-- function against its own new guard.
--
-- WHY `raise exception` RATHER THAN A STRUCTURED ERROR ON THE NESTED CALL.
-- By the time it runs, the dispute is already stamped decided. Returning
-- {ok:false} there would COMMIT a closed dispute on a case that was never
-- dismissed — the worst of the three possible states. The nested call's
-- preconditions are guaranteed by construction (a disputable stage is
-- non-terminal, and `dismissed` is legal from all four non-terminal rungs), so
-- this is an assertion about an invariant, not a user-facing error path. If it
-- ever fires, the whole transaction rolls back and nothing is half-decided.
--
-- WHAT THIS FUNCTION DOES NOT DO: it does not guard `fines.status` transitions
-- in general. `paid -> waived` and `waived -> issued` are both permitted by the
-- database today, and NO PHASE OWNS FINE-STATUS TRANSITION RULES — the stage
-- ladder has a guard, the money does not. This function is narrow enough not to
-- need one: both of its updates are filtered `where status = 'disputed'`, a
-- value only `dispute_violation` writes, so it can only ever move money it
-- itself contested. A general `fine_status` ladder is a real gap and is
-- recorded as one; it is not created here, because inventing it inside a
-- dispute RPC would put the rule somewhere nobody would look for it.

create or replace function public.manager_resolve_dispute(
  p_violation uuid,
  p_outcome   public.dispute_outcome,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $resolve$
declare
  v_vio      public.violations%rowtype;
  v_dispute  public.violation_disputes%rowtype;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_fines    integer := 0;
  v_adv      jsonb;
  v_stage    public.violation_stage_v2;
  v_notified boolean := false;
begin
  select * into v_vio from public.violations where id = p_violation for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS: re-check scope by hand, after existence and
  -- before anything else is read. `manages_building` is `select exists(...)`
  -- and `is_admin` is `select coalesce(..., false)`; neither can return NULL,
  -- so this guard cannot fall into the three-valued trap that
  -- `dispute_violation`'s first version did.
  if not (public.manages_building(v_vio.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- A NULL outcome is a structured refusal, not a 23502 from the UPDATE below.
  -- This is a FIFTH error code beyond the four the plan named, and it exists
  -- because Phase 2 shipped exactly this shape on `p_to_stage` and had to fix
  -- it in a review round: a function promising "every rejection is a return
  -- value" must collapse the third value before it reaches a write.
  if p_outcome is null then
    return jsonb_build_object('ok', false, 'error', 'outcome_required');
  end if;

  if length(coalesce(v_note, '')) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'note_too_long',
                              'length', length(v_note), 'max', 2000);
  end if;

  -- The open dispute, locked. `outcome is null` IS the open-dispute signal —
  -- the fine's status is never consulted.
  select * into v_dispute
    from public.violation_disputes
   where violation_id = v_vio.id and outcome is null
   for update;
  if not found then
    -- Covers both "never disputed" and "already decided". They are the same
    -- fact from this function's point of view: there is nothing awaiting a
    -- decision, and a manager who presses Uphold twice should be told that
    -- rather than shown a second decision overwriting the first.
    return jsonb_build_object('ok', false, 'error', 'no_open_dispute');
  end if;

  -- 1. Stamp the dispute. FIRST — see the header.
  update public.violation_disputes
     set outcome      = p_outcome,
         decided_by   = auth.uid(),
         decided_at   = now(),
         decided_note = v_note
   where id = v_dispute.id;

  -- 2. The money. Filtered on `status = 'disputed'`, which is the exact inverse
  -- of `dispute_violation`'s `status = 'issued'` filter — so the round trip is
  -- lossless: a fine that was `partially_paid` when the appeal was filed was
  -- never marked disputed and is not touched now either.
  if p_outcome = 'upheld' then
    update public.fines set status = 'issued'
     where violation_id = v_vio.id and status = 'disputed';
  else
    update public.fines set status = 'waived'
     where violation_id = v_vio.id and status = 'disputed';
  end if;
  get diagnostics v_fines = row_count;

  -- 3. The stage and the ledger.
  if p_outcome = 'upheld' then
    -- The case does not move. One self-transition row, the same shape the
    -- filing wrote.
    v_stage := v_vio.stage;
    insert into public.violation_events (violation_id, from_stage, to_stage,
                                         note, actor_id, occurred_on)
    values (v_vio.id, v_vio.stage, v_vio.stage,
            'Dispute upheld: ' || coalesce(v_note, 'no reason given'),
            auth.uid(), current_date);
  else
    -- DO NOT REIMPLEMENT ANY OF THIS. `manager_advance_violation` writes the
    -- `X -> dismissed` event, sets resolved_at and resolution_outcome, mints
    -- the stage-guard token the trigger requires, and writes its own audit row.
    -- `auth.uid()` is unchanged across a nested definer call, so its scope
    -- check passes for the same caller that passed ours.
    v_adv := public.manager_advance_violation(
               p_violation    => p_violation,
               p_to_stage     => 'dismissed',
               p_note         => 'Dispute overturned: '
                                 || coalesce(v_note, 'no reason given'),
               p_amount_cents => null,
               p_due_on       => null,
               p_notify       => false);
    if not coalesce((v_adv ->> 'ok')::boolean, false) then
      raise exception
        'manager_resolve_dispute: dismissal refused after the dispute was stamped'
        using errcode = 'internal_error',
              detail  = v_adv::text,
              hint    = 'This is an assertion, not a user error: a disputable stage is non-terminal by construction and dismissed is legal from all four non-terminal rungs. The whole transaction has rolled back, so the dispute is NOT decided.';
    end if;
    v_stage := 'dismissed';
  end if;

  -- 4. Tell the resident. EXACTLY ONE, in both branches — which is what
  -- `p_notify => false` above buys. A case with no resident notifies nobody,
  -- which is a valid state rather than an error; the backfilled legacy dispute
  -- is the only row that could be in it, and it has a resident.
  if v_vio.resident_id is not null then
    insert into public.notifications (profile_id, kind, severity, title, body,
                                      action_label, action_target, building_id)
    values (
      v_vio.resident_id,
      'building',
      case when p_outcome = 'upheld' then 'warning' else 'success' end,
      case when p_outcome = 'upheld' then 'Your appeal was not successful'
           else 'Your appeal succeeded' end,
      case when p_outcome = 'upheld' then
        'The strata reviewed your appeal and the finding stands.'
        || case when v_fines > 0 then ' The fine remains payable.' else '' end
      else
        'The strata reviewed your appeal and the case has been dismissed.'
        || case when v_fines > 0 then ' The fine has been waived.' else '' end
      end
      -- The manager's note is included because it is the REASON, and a
      -- decision delivered without one is not a decision a resident can act on.
      -- It is the manager's own words, written knowing the resident reads them.
      || coalesce(' ' || v_note, ''),
      'View the case',
      'my-cases:' || v_vio.id::text,
      v_vio.building_id
    );
    v_notified := true;
  end if;

  -- 5. The audit row. ONE from this function. The transaction as a whole writes
  -- more, and the count is worth stating because a reviewer will check it:
  --   upheld,     one fine   -> 2  (this, + fine.status_changed disputed->issued)
  --   overturned, one fine   -> 3  (this, + violation.advanced, + fine.status_changed
  --                                 disputed->waived)
  -- The second and third come from `manager_advance_violation` and from Phase
  -- 3's `trg_fines_settlement_event` (20260828000000). This phase's plan
  -- originally said 1 and 2; it predates that trigger.
  insert into public.audit_log (actor_id, action, entity_type, entity_id,
                                building_id, metadata)
  values (auth.uid(), 'manager_resolve_dispute', 'violation', v_vio.id,
          v_vio.building_id,
          jsonb_build_object('dispute_id', v_dispute.id,
                             'outcome', p_outcome::text,
                             'disputed_stage', v_dispute.stage::text,
                             'stage', v_stage::text,
                             'fines_settled', v_fines,
                             'notified', v_notified));

  return jsonb_build_object('ok', true,
                            'outcome', p_outcome::text,
                            'stage', v_stage::text,
                            case when p_outcome = 'upheld'
                                 then 'fines_restored' else 'fines_waived' end, v_fines,
                            'notified', v_notified);
end;
$resolve$;

comment on function public.manager_resolve_dispute(uuid, public.dispute_outcome, text) is
  'Decides a resident''s open appeal on a violation. Stamps the violation_disputes row with outcome/decided_by/decided_at/decided_note FIRST, then settles the fines it contested (upheld -> issued, overturned -> waived), then either writes a self-transition event (upheld) or dismisses the case through manager_advance_violation with p_notify => false (overturned), then sends the resident exactly one notification, then audits. Authorised on manages_building(building_id) or is_admin(). Returns {ok:true, outcome, stage, fines_restored|fines_waived, notified} or {ok:false, error: not_found | forbidden | outcome_required | note_too_long | no_open_dispute} — every rejection it specifies is a return value, not a raise. The one raise it contains is an assertion on the nested dismissal, which cannot fire without the whole transaction rolling back.';

revoke execute on function public.manager_resolve_dispute(uuid, public.dispute_outcome, text) from public, anon;
grant  execute on function public.manager_resolve_dispute(uuid, public.dispute_outcome, text) to authenticated, service_role;


-- ===========================================================================
-- C. The reminder's notification target, for the same reason as edit 3 above.
--
-- The body below is the DEPLOYED body of `manager_remind_fine` with one edit.
--
-- ONE THING FOUND WHILE DOING IT, AND WORTH RECORDING: the deployed `prosrc`
-- (md5 50de117488c4cda922d8b2b4c8bdf788, 3617 bytes) is
-- `20260823000006_reminder_throttle_and_opening_event.sql`'s body with EVERY
-- whole-line `--` comment stripped, and byte-identical otherwise — verified by
-- stripping them from the file and matching the md5 exactly. So the logic in
-- the database has never differed from the repo, but none of the reasoning
-- Phase 2 wrote for the throttle, the currency refusal or the FOR UPDATE was
-- ever stored with it. (`manager_advance_violation` did NOT have this problem —
-- its deployed body matched its file including every comment.) Re-creating it
-- here restores the comments, so the two are byte-identical again.

create or replace function public.manager_remind_fine(
  p_violation uuid,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $remind$

declare
  -- How long a case is left alone after a reminder.
  --
  -- The number is a judgement, and the judgement is: a resident who has been
  -- told once today does not need telling again today, and no legitimate use of
  -- this button is blocked by waiting until tomorrow. A shorter window would
  -- not have stopped the measured abuse (three sends in one statement); a
  -- longer one starts refusing a manager who genuinely needs to chase weekly.
  c_cooldown constant interval := interval '24 hours';

  v_vio        public.violations%rowtype;
  v_count      integer;
  v_total      integer;
  v_currencies text[];
  v_currency   text;
  v_due        date;
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_target     text;
  v_last       timestamptz;
begin
  -- FOR UPDATE, and this REVERSES the decision in 20260823000005, which said
  -- "no FOR UPDATE: this function changes nothing about the case". That was
  -- true and is no longer sufficient. The throttle is a read-then-write, so
  -- without a lock two concurrent calls both read "no recent reminder" and both
  -- send — the exact defect the throttle exists to close, just narrowed to a
  -- race. Locking the case row serialises reminders per case, and because
  -- READ COMMITTED takes a fresh snapshot after the lock is granted, the second
  -- caller sees the first caller's audit row rather than the one it started
  -- with. It is the same row `manager_advance_violation` locks, so a reminder
  -- and an advance on one case also serialise, which is the correct ordering.
  select * into v_vio from public.violations where id = p_violation for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS, so the scope check is by hand, and it comes
  -- before anything is read about the fines. Same ordering, and the same
  -- structured-return-rather-than-raise convention, as
  -- `manager_advance_violation`.
  if not (public.manages_building(v_vio.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- `issued` is the one status that means "outstanding and chaseable".
  -- Positive grammar rather than `status <> 'paid'`: `fine_status` has seven
  -- labels (issued, paid, partially_paid, waived, disputed, remitted,
  -- written_off) and six of them are reasons NOT to chase the money. A
  -- `disputed` fine is under appeal — Phase 5 decides it, and demanding payment
  -- for it in the meantime is the wrong message. `partially_paid` is excluded
  -- because `fines` has no paid-to-date column, so this function would state
  -- the full amount as outstanding, and a resident-facing money claim it cannot
  -- make truthfully is one it does not make at all. Naming the one allowed
  -- value means a status added later is excluded until somebody decides it
  -- belongs. `lib/data/violations.ts:CHASEABLE_FINE_STATUSES` mirrors this, so
  -- the button renders on exactly the cases this function will act on.
  --
  -- Currencies are collected BEFORE anything is summed. The previous version
  -- summed `amount_cents` across every issued fine and then labelled the total
  -- with `min(lower(currency))` — so a case holding 25000 cad and 5000 usd told
  -- the resident "300.00 CAD is still outstanding". `fines.currency` has no
  -- CHECK and no default beyond 'cad', there is no FX rate anywhere in this
  -- system, and inventing one inside a notification would be worse than
  -- refusing. Not reachable on today's data (all four live fines are cad), and
  -- that is precisely why it had to be closed now rather than after somebody
  -- issues the first usd fine.
  select coalesce(array_agg(distinct lower(f.currency)), array[]::text[])
    into v_currencies
    from public.fines f
   where f.violation_id = p_violation
     and f.status = 'issued';

  if coalesce(array_length(v_currencies, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_outstanding_fine');
  end if;

  if array_length(v_currencies, 1) > 1 then
    return jsonb_build_object('ok', false, 'error', 'mixed_currency',
                              'currencies', to_jsonb(v_currencies));
  end if;

  v_currency := v_currencies[1];

  select count(*), coalesce(sum(f.amount_cents), 0), min(f.due_on)
    into v_count, v_total, v_due
    from public.fines f
   where f.violation_id = p_violation
     and f.status = 'issued'
     and lower(f.currency) = v_currency;

  -- One of the thirteen live violations has no resident. Such a case can still
  -- be fined (the fine is against the unit's case), but there is nobody to
  -- remind, and saying "reminder sent" would be a lie. Unlike an advance, where
  -- notifying nobody is a successful move that simply notified nobody, a
  -- reminder whose entire content is the notification has failed.
  if v_vio.resident_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_resident');
  end if;

  -- The throttle.
  --
  -- The record it consults is the one this function already wrote: the
  -- `violation.fine_reminded` audit row. No new table, no new column, and no
  -- possibility of the throttle and the record disagreeing about whether a
  -- reminder happened — a reminder that was sent has an audit row by
  -- construction, because the two are inserted in the same transaction.
  --
  -- It is keyed on the CASE, not on the caller. Two co-managers reminding the
  -- same resident an hour apart is exactly as much noise to that resident as
  -- one manager doing it twice, and the resident is who the limit protects.
  --
  -- It is checked last, after every other rejection, so that a manager who
  -- cannot send for a real reason (wrong building, no fine, no resident) is
  -- told the real reason rather than being told to wait for something that
  -- would fail anyway.
  select max(a.created_at)
    into v_last
    from public.audit_log a
   where a.entity_id = p_violation
     and a.action = 'violation.fine_reminded';

  if v_last is not null and v_last > now() - c_cooldown then
    return jsonb_build_object(
      'ok', false, 'error', 'reminded_recently',
      'last_reminded_at', v_last,
      'retry_after_seconds', ceil(extract(epoch from (v_last + c_cooldown - now())))::int);
  end if;

  -- THE ONE EDIT IN THIS MIGRATION (20260824000002). Same target vocabulary as
  -- manager_advance_violation, and it changes for the same reason: the resident
  -- app has a violation screen now. A reminder about a fine opens the case the
  -- fine is attached to, not the pet named on it.
  v_target := 'my-cases:' || v_vio.id::text;

  insert into public.notifications (profile_id, kind, severity, title, body,
                                    action_label, action_target, building_id)
  values (
    v_vio.resident_id,
    'building',
    'warning',
    case when v_count = 1 then 'Reminder: an unpaid fine'
         else 'Reminder: unpaid fines' end,
    to_char(v_total / 100.0, 'FM999999990.00') || ' ' || upper(v_currency)
    || case when v_count = 1 then ' is still outstanding'
            else ' is still outstanding across ' || v_count || ' fines' end
    || case when v_vio.unit_id is not null then ' on your unit''s pet bylaw case.'
            else ' on your pet bylaw case.' end
    -- The due date is only mentioned when the record actually holds one. Every
    -- existing fine was seeded with due_on null, and "Payment was due " with
    -- nothing after it is worse than not raising the subject.
    || case when v_due is not null
            then ' Payment was due ' || to_char(v_due, 'FMMonth FMDD, YYYY') || '.'
            else '' end
    || coalesce(' ' || v_note, ''),
    'View details',
    v_target,
    v_vio.building_id
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'violation.fine_reminded', 'violation', p_violation, v_vio.building_id,
          jsonb_build_object('fine_count', v_count, 'amount_cents', v_total,
                             'currency', v_currency,
                             'resident_id', v_vio.resident_id));

  return jsonb_build_object('ok', true, 'notified', true,
                            'fine_count', v_count, 'amount_cents', v_total,
                            'currency', v_currency);
end;
$remind$;

comment on function public.manager_remind_fine(uuid, text) is
  'Re-notifies the resident named on a violation that its fine(s) with status=''issued'' remain outstanding, and audits the act. At most one reminder per case per 24 hours, enforced against the violation.fine_reminded audit rows under a FOR UPDATE lock on the case. Refuses rather than guesses when the outstanding fines are in more than one currency. Writes no violation_events row — a reminder moves no stage. The notification opens the resident''s own case screen (my-cases:<violation id>). Returns {ok:true, notified, fine_count, amount_cents, currency} or {ok:false, error: not_found | forbidden | no_outstanding_fine | mixed_currency | no_resident | reminded_recently}; every rejection is a return value, not a raise.';

revoke execute on function public.manager_remind_fine(uuid, text) from public, anon;
grant  execute on function public.manager_remind_fine(uuid, text) to authenticated, service_role;
