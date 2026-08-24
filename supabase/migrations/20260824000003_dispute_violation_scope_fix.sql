-- Two defects in 20260824000001, both found by probing rather than by reading,
-- and both fixed here because an applied migration is not edited in place.
--
-- ===========================================================================
-- 1. THE SCOPE GUARD HAD A THREE-VALUED HOLE — the same one, in the same
--    phase, that its own comment cites Phase 2 for.
--
-- As shipped:
--
--   if v_vio.resident_id is null or v_vio.resident_id <> auth.uid() then
--     return ... 'forbidden';
--
-- `auth.uid()` is NULL for any caller with no JWT — the `anon` role, and
-- `service_role` invoked without one. On a case that HAS a resident:
--
--   v_vio.resident_id is null       -> false
--   v_vio.resident_id <> auth.uid() -> NULL      (not false: NULL)
--   false or NULL                   -> NULL
--   if NULL then                    -> NOT TAKEN
--
-- so the guard was skipped entirely and control fell through the stage check,
-- the duplicate check and the window check into the writes. MEASURED, as
-- `anon`, against live case 35000000-…-0002:
--
--   ERROR: 23502 null value in column "filed_by" of relation
--   "violation_disputes" violates not-null constraint
--   CONTEXT: PL/pgSQL function dispute_violation(uuid,text) line 93
--
-- WHAT IT WAS AND WAS NOT. No row was written and none could be: `filed_by` is
-- NOT NULL and `auth.uid()` was the value being inserted, so the very first
-- write aborted the transaction. It was not a data hole. It WAS a raise where
-- the function's own comment promises "every rejection it specifies is a return
-- value, not a raise" — Phase 2's lesson, verbatim: THE OVERCLAIM IS WHAT MAKES
-- THE GAP A CONTRACT VIOLATION. And it was a guard that a later hand could make
-- into a data hole simply by making one column nullable.
--
-- THE FIX, and why this spelling:
--
--   if auth.uid() is null or v_vio.resident_id is distinct from auth.uid()
--
--   * `is distinct from` rather than `<>` collapses the third value at the
--     comparison, the way `violations_stage_guard` (20260823000002:70) does for
--     exactly this reason: "a guard that evaluates to NULL is not a guard".
--   * `auth.uid() is null` is still required IN ADDITION, and this is the part
--     that is easy to get wrong. `is distinct from` treats NULL as a value, so
--     on a case with NO resident a caller with no JWT would satisfy
--     `null is not distinct from null` and pass. Both halves are load-bearing:
--     the first says the caller must be somebody, the second says they must be
--     THIS somebody.
--   * The old `v_vio.resident_id is null` disjunct is now redundant — a null
--     resident_id is distinct from any non-null uid — and is dropped rather
--     than kept "for safety", because a redundant clause is one more thing that
--     can be true for the wrong reason.
--
-- ===========================================================================
-- 2. `revoke ... from public` IS NOT `revoke ... from anon`.
--
-- 20260824000001 said `revoke all on function ... from public`, and the acl
-- immediately afterwards read:
--
--   dispute_violation          postgres=X | anon=X | authenticated=X | service_role=X
--   manager_advance_violation  postgres=X |          authenticated=X | service_role=X
--
-- Supabase's default privileges on `schema public` grant EXECUTE on every newly
-- created function to `anon`, `authenticated` and `service_role`. That is an
-- explicit grant to the `anon` ROLE, and revoking from PUBLIC — the pseudo-role
-- — does not touch it. `escalate_incident_to_violation` still carries `anon=X`
-- for the same reason; the two functions Phase 2 wrote do not, because both say
-- `from public, anon` (20260823000001:297, 20260823000005:140). That spelling
-- is adopted below.
--
-- This is the reason the plan asks for `proacl` to be COMPARED against
-- `manager_advance_violation`'s rather than merely inspected. Reading the acl
-- and nodding at three familiar entries is how a fourth one survives.
--
-- ===========================================================================
-- The body below is 20260824000001's, verbatim, with the guard at "SCOPE, THE
-- ONE CHANGED STATEMENT" replaced and nothing else touched. Everything the
-- original header argues — the RBAC divergence, the positive stage grammar, the
-- 14-day constant, why a `violation_events` row is written, the audit-row count
-- — stands unchanged and is not restated here.

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
  -- The three findings a resident may contest. See 20260824000001's header.
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

  -- SCOPE, THE ONE CHANGED STATEMENT. See section 1 of this file's header.
  --
  -- SECURITY DEFINER bypasses RLS, so this is by hand, before anything is read
  -- that it would leak and before any write. ONE RULE: no `manages_building`
  -- branch, no `is_admin()` branch.
  if auth.uid() is null or v_vio.resident_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- The reason, before any state check: a caller who typed nothing should be
  -- told that, not told about the stage.
  --
  -- `v_reason` is btrim'd from `coalesce(p_reason,'')`, so a NULL argument
  -- lands here as `reason_required` rather than reaching the INSERT and raising
  -- 23502.
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
  -- was exercised for real before that guard existed.
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
  -- comparison below into NULL.
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

  -- 3. The money, marked contested. `issued` ONLY — the one status that means
  -- "outstanding and uncontested". A status-only UPDATE, which is what
  -- `trg_fines_settle_only` permits; that trigger fires for definer functions
  -- too, so bundling another column here would raise 42501 rather than smuggle.
  -- The status is a CONSEQUENCE of the dispute row, never an input to it.
  update public.fines
     set status = 'disputed'
   where violation_id = v_vio.id and status = 'issued';
  get diagnostics v_marked = row_count;

  -- 4. Tell the managers, one row each. NO MANAGERS IS A VALID STATE. The body
  -- does not quote the resident's reason — the case detail is where that is
  -- read, in context.
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

  -- 5. The audit row — one, plus one per fine moved, written by Phase 3's
  -- `trg_fines_settlement_event`.
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
  'Files a resident''s appeal against the degree a violation currently sits on: writes the violation_disputes row, a violation_events self-transition carrying the reason, marks every issued fine on the case disputed, notifies each of the building''s managers, and audits. Authorised on violations.resident_id = auth.uid() ONLY — not managers, not admins; a dispute is a first-person statement, and docs/RBAC_CAPABILITIES.md records that divergence from the spec''s super-admin ✅. Disputable stages are warning, fine_1 and fine_2, within 14 days of the event that entered the current stage. Granted to authenticated and service_role only. Returns {ok:true, dispute_id, stage, fines_marked, managers_notified} or {ok:false, error: not_found | forbidden | reason_required | reason_too_long | stage_not_disputable | already_disputed | dispute_open | window_closed} — every rejection it specifies is a return value, not a raise.';

revoke execute on function public.dispute_violation(uuid, text) from public, anon;
grant  execute on function public.dispute_violation(uuid, text) to authenticated, service_role;
