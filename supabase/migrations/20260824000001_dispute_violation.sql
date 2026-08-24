-- Let a resident say the finding is wrong.
--
-- Everything Phase 2 built is the manager's half of the ladder: open a case,
-- warn, fine, fine again, close. `violations_select`, `vevents_select` and
-- `fines_select` have admitted `resident_id = auth.uid()` since the beginning
-- and NOTHING HAS EVER QUERIED THEM. This is the other half — the one act a
-- resident may perform on a case against them.
--
-- It is deliberately the ONLY one. There is no payment surface in this phase
-- (AD-8): a resident sees what they owe and may contest it; they do not pay
-- in the app.
--
-- ---------------------------------------------------------------------------
-- WHO MAY CALL IT: the resident the case is about, and nobody else.
--
-- The spec's RBAC matrix (`:475`) marks "Dispute a violation" ✅ for
-- super-admin. THIS FUNCTION DELIBERATELY DIVERGES and refuses admins, and
-- 20260824000003 amends the matrix row to say so.
--
-- A dispute is a FIRST-PERSON STATEMENT. `reason` is stored verbatim, shown to
-- the manager as the resident's own words, and is the document a tribunal reads
-- to decide whether the resident was heard. An admin filing one puts words in a
-- resident's mouth, in a record whose whole value is that it is theirs. The ✅
-- came from the blanket admin column that produced Phase 2's over-grant
-- findings; it is not a considered grant.
--
-- Admins keep the READ (`vdisputes_select` admits `is_admin()`) and keep
-- `manager_resolve_dispute`. What they lose is the ability to author somebody
-- else's appeal.
--
-- ---------------------------------------------------------------------------
-- WHAT MAY BE DISPUTED, AS A POSITIVE GRAMMAR
--
--   warning, fine_1, fine_2   — the three findings against a person.
--
-- Not `open`: that is "we are looking into it", not a finding. One of the 13
-- live cases at `open` has no `resident_id` at all. There is nothing yet to
-- contest.
-- Not `resolved` or `dismissed`: both terminal, and `dismissed` is already the
-- outcome a dispute seeks.
--
-- Written as an explicit array rather than "everything except open/resolved/
-- dismissed", so a seventh `violation_stage_v2` label added next year is
-- EXCLUDED until somebody decides it belongs. This is the treatment
-- `manager_remind_fine` gives `fine_status` (`= 'issued'`, never `<> 'paid'`).
--
-- THE RULE IS HERE AND NOT IN A CHECK CONSTRAINT ON THE TABLE, and that is a
-- decision rather than an oversight: 20260824000000's backfill records a real
-- legacy dispute against a case sitting at `open`. A CHECK cannot be
-- conditional on a row's age, so the choice was between telling the truth about
-- that row and weakening the rule for every new one. This RPC is the table's
-- only writer, so the enforcement point is identical either way.
--
-- ---------------------------------------------------------------------------
-- THE WINDOW: 14 days from the event that entered the current stage.
--
-- Anchor = coalesce(max(violation_events.created_at where to_stage = v.stage),
--                   v.created_at)
--
-- The coalesce covers a case whose stage predates any event. Measured
-- 2026-08-23: all four live cases at a disputable stage carry such an event, so
-- this is exercisable against live data today.
--
-- 14 IS A CONSTANT HERE, NOT A `buildings.pet_rules` KEY, and that reverses the
-- obvious reading of AD-5's pattern on measured evidence. `fine_1_cents` /
-- `fine_2_cents` are a `pet_rules` convention with NO WRITER ANYWHERE IN THE
-- CODEBASE and 0 of 6 buildings carrying them (re-counted 2026-08-23). Adding a
-- third unwritable key would repeat a defect this project has already shipped
-- and then had to document. A per-building window ships the day its editor
-- does. `lib/data/disputes.ts` mirrors this constant, and Task 4 asserts the
-- mirror against this function's deployed `prosrc`.
--
-- ---------------------------------------------------------------------------
-- WHY THIS WRITES A `violation_events` ROW, having argued both sides.
--
-- AGAINST: `to_stage` is NOT NULL and a dispute changes no stage, so the row is
-- a self-transition — `from_stage = to_stage`.
--
-- FOR, and decisively: the paper trail is the product. A dispute is the single
-- most tribunal-relevant thing a resident does, and AD-7 already requires the
-- OUTCOME in the ledger. Recording the decision but not the filing yields
-- "Dispute upheld" with no record of when it was raised, which is exactly what
-- a tribunal asks about first.
--
-- The objection is answered by the schema rather than argued away: a
-- self-transition is already representable and already PRESENT (the
-- `warning -> warning` row left by Task 1's verbal/written collapse), and
-- Phase 2 deliberately added no validating constraint precisely so it stays
-- legal.
--
-- Contrast `manager_remind_fine`, which correctly writes NO event: a reminder
-- is communication ABOUT a case. A dispute is a party TO the case making a
-- formal statement in it.
--
-- ---------------------------------------------------------------------------
-- AUDIT ROWS THIS WRITES: one, PLUS one per fine it moves.
--
-- Phase 3's `trg_fines_settlement_event` (20260828000000) is an AFTER UPDATE OF
-- status trigger on `fines` writing one `fine.status_changed` row per real
-- status change. So a dispute on a case with one `issued` fine writes TWO audit
-- rows, not one: this function's `dispute_violation`, and the trigger's record
-- of `issued -> disputed`. The plan for this phase said "one"; it was written
-- before that trigger and is wrong by the number of fines touched.

create or replace function public.dispute_violation(
  p_violation uuid,
  p_reason    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vio        public.violations%rowtype;
  v_reason     text := btrim(coalesce(p_reason, ''));
  v_anchor     timestamptz;
  v_dispute    uuid;
  v_marked     integer := 0;
  v_notified   integer := 0;
  -- The three findings a resident may contest. See the header.
  c_disputable public.violation_stage_v2[] :=
    array['warning', 'fine_1', 'fine_2']::public.violation_stage_v2[];
  c_window     interval := interval '14 days';
begin
  -- FOR UPDATE first, exactly as `manager_advance_violation` does. Two taps on
  -- a slow connection must not produce two disputes; the unique constraint on
  -- (violation_id, stage) is the backstop, not the plan.
  select * into v_vio from public.violations where id = p_violation for update;
  if not found then
    -- Existence before scope, matching `manager_advance_violation` and
    -- `escalate_incident_to_violation`. The leak is existence only, ids are
    -- uuids rather than guessable integers, and `not_found` has to stay
    -- distinguishable from `forbidden` for the client to say anything useful.
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS, so the scope check is by hand, before
  -- anything is read that it would leak and before any write.
  --
  -- ONE CLAUSE. No `manages_building` branch, no `is_admin()` branch.
  if v_vio.resident_id is null or v_vio.resident_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- The reason, before any state check: a caller who typed nothing should be
  -- told that, not told about the stage.
  --
  -- `v_reason` is btrim'd from `coalesce(p_reason,'')`, so a NULL argument
  -- lands here as `reason_required` rather than reaching the INSERT and raising
  -- 23502. Phase 2's fix round found exactly that shape on `p_to_stage` — a
  -- null argument raising where the contract promises a structured return — and
  -- the fix is the same one: collapse the third value before the guard.
  if v_reason = '' then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  if length(v_reason) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'reason_too_long',
                              'length', length(v_reason), 'max', 2000);
  end if;

  if not (v_vio.stage = any (c_disputable)) then
    return jsonb_build_object('ok', false, 'error', 'stage_not_disputable',
                              'stage', v_vio.stage::text);
  end if;

  -- Once per degree. Checked before the open-dispute test so that re-filing
  -- against the SAME rung says so, rather than giving the vaguer answer.
  if exists (select 1 from public.violation_disputes d
              where d.violation_id = v_vio.id and d.stage = v_vio.stage) then
    return jsonb_build_object('ok', false, 'error', 'already_disputed',
                              'stage', v_vio.stage::text);
  end if;

  -- One open dispute per case, whatever rung it was filed against.
  --
  -- HONEST NOTE ON REACHABILITY: once 20260824000002 lands,
  -- `manager_advance_violation` refuses to move a case with an open dispute, so
  -- a case cannot reach a rung it has not already disputed while one is open —
  -- which makes this branch unreachable through any supported path, the check
  -- above catching it first. It is kept because it states a rule of THIS
  -- function rather than borrowing one from another function's guard, and it
  -- was exercised for real before that guard existed. It is not dead code
  -- pretending to be a control; it is the control that does not depend on
  -- somebody else's control staying in place.
  if exists (select 1 from public.violation_disputes d
              where d.violation_id = v_vio.id and d.outcome is null) then
    return jsonb_build_object('ok', false, 'error', 'dispute_open');
  end if;

  select coalesce(max(e.created_at), v_vio.created_at) into v_anchor
    from public.violation_events e
   where e.violation_id = v_vio.id and e.to_stage = v_vio.stage;
  -- `max()` over zero rows is NULL, and an aggregate query always returns one
  -- row, so `coalesce` is what makes the eventless case fall back to the
  -- violation's own timestamp rather than leaving v_anchor null and turning the
  -- comparison below into NULL — the three-valued trap Phase 2 was bitten by.
  if now() > v_anchor + c_window then
    return jsonb_build_object('ok', false, 'error', 'window_closed',
                              'closed_at', to_char(v_anchor + c_window,
                                                   'YYYY-MM-DD"T"HH24:MI:SSOF'));
  end if;

  -- 1. The dispute itself.
  insert into public.violation_disputes (violation_id, stage, filed_by, reason)
  values (v_vio.id, v_vio.stage, auth.uid(), v_reason)
  returning id into v_dispute;

  -- 2. The ledger row. A self-transition: the case has not moved, and saying it
  -- had would be a lie in the one table built to be believed.
  insert into public.violation_events (violation_id, from_stage, to_stage, note,
                                       actor_id, occurred_on)
  values (v_vio.id, v_vio.stage, v_vio.stage, 'Dispute filed: ' || v_reason,
          auth.uid(), current_date);

  -- 3. The money, marked contested.
  --
  -- `issued` ONLY — the one status that means "outstanding and uncontested".
  -- `partially_paid` is left alone: money already part-settled is not something
  -- this phase models an appeal over, and naming the one permitted source
  -- status means a `fine_status` label added later is excluded until somebody
  -- decides it belongs.
  --
  -- This is a status-only UPDATE, which is exactly what `trg_fines_settle_only`
  -- (20260823000004) permits. That trigger fires for SECURITY DEFINER functions
  -- too — a trigger is not RLS — so bundling any other column here would raise
  -- 42501 rather than smuggle.
  --
  -- WHY THE STATUS IS WRITTEN AT ALL, given `violation_disputes` is now the
  -- dispute signal: so the MONEY stays truthful on its own. `manager_remind_fine`
  -- refuses to chase anything but `status = 'issued'`, and
  -- `lib/data/portfolio.ts` counts `disputed` as outstanding. Both keep working
  -- unedited. It is a CONSEQUENCE, never an input — nothing derives "is this
  -- disputed?" from it any more.
  update public.fines
     set status = 'disputed'
   where violation_id = v_vio.id and status = 'issued';
  get diagnostics v_marked = row_count;

  -- 4. Tell the managers. One per manager, following `request_building_link`
  -- verbatim (20260801000003:53-66). NO MANAGERS IS A VALID STATE, not an
  -- error — the insert simply writes zero rows.
  --
  -- The body does NOT quote the resident's reason. Reason text is
  -- resident-authored and would land unread in a manager's alert list; the case
  -- detail is where it belongs, in context, beside the fine it contests.
  insert into public.notifications (profile_id, kind, severity, title, body,
                                    action_label, action_target, building_id)
  select bm.profile_id,
         'building',
         'warning',
         'A resident has disputed a bylaw case',
         'An appeal was filed against a case in your building. Open Violations to read it and decide.',
         'Review appeal',
         'violations',
         v_vio.building_id
    from public.building_managers bm
   where bm.building_id = v_vio.building_id;
  get diagnostics v_notified = row_count;

  -- 5. The audit row. See the header for why this is not the only one written.
  insert into public.audit_log (actor_id, action, entity_type, entity_id,
                                building_id, metadata)
  values (auth.uid(), 'dispute_violation', 'violation', v_vio.id,
          v_vio.building_id,
          jsonb_build_object('dispute_id', v_dispute,
                             'stage', v_vio.stage::text,
                             'fines_marked', v_marked,
                             'managers_notified', v_notified));

  return jsonb_build_object('ok', true,
                            'dispute_id', v_dispute,
                            'stage', v_vio.stage::text,
                            'fines_marked', v_marked,
                            'managers_notified', v_notified);
end;
$$;

comment on function public.dispute_violation(uuid, text) is
  'Files a resident''s appeal against the degree a violation currently sits on: writes the violation_disputes row, a violation_events self-transition carrying the reason, marks every issued fine on the case disputed, notifies each of the building''s managers, and audits. Authorised on violations.resident_id = auth.uid() ONLY — not managers, not admins; a dispute is a first-person statement. Disputable stages are warning, fine_1 and fine_2, within 14 days of the event that entered the current stage. Returns {ok:true, dispute_id, stage, fines_marked, managers_notified} or {ok:false, error: not_found | forbidden | reason_required | reason_too_long | stage_not_disputable | already_disputed | dispute_open | window_closed} — every rejection it specifies is a return value, not a raise.';

-- Granted exactly as `manager_advance_violation` is: authenticated and
-- service_role, and NOT anon. A dispute is signed; there is no anonymous
-- appeal.
revoke all on function public.dispute_violation(uuid, text) from public;
grant execute on function public.dispute_violation(uuid, text)
  to authenticated, service_role;
