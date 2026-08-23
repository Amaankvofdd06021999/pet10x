-- Settling the money leaves a record, the same way moving the case does.
--
-- THE GAP, as handed to Phase 3 by Phase 2's Task 5 review.
--
-- Phase 2 spent five tasks making it impossible to move a violation without
-- writing a `violation_events` row and an `audit_log` row: a stage guard
-- (20260823000002), a ledger with no client write path (20260823000004), and
-- an AFTER INSERT trigger so even opening a case records itself
-- (20260823000006). Every one of those is about the CASE.
--
-- The MONEY attached to the case had none of it. `setFineStatus`
-- (`lib/data/portfolio.ts:391`) is a plain `.update({ status })`, and it sits
-- behind two one-click controls in the strata work queue --
-- `components/screens/strata/queue-screen.tsx:74` "Mark paid" and `:75`
-- "Waive". A manager could waive a $250 fine and the database would hold no
-- trace of who did it, when, or from what. The one surface that reported the
-- money -- the manager's Violations screen -- would simply show a smaller
-- number the next time it loaded.
--
-- That asymmetry is the defect. A fine is the part of an enforcement case that
-- a tribunal actually asks about.
--
-- ---------------------------------------------------------------------------
-- WHY A TRIGGER RATHER THAN AN RPC
--
-- The same reasoning that produced `violations_opening_event`, and the same
-- lesson Phase 2 recorded from it: when a defect shows up at a call site, ask
-- whether the call site or the TABLE is the right place to fix it.
--
-- Wrapping `setFineStatus` in a `manager_settle_fine` RPC would fix the two
-- buttons that were reported and leave every other route open -- a second
-- surface calling `.update({ status })`, a Stripe webhook marking a fine paid,
-- Phase 5's dispute flow moving `issued -> disputed -> waived`, a seed. A
-- trigger on the table covers all of them, including the ones nobody has
-- written yet, and it costs the client nothing: `setFineStatus` does not
-- change at all.
--
-- It also composes correctly with what is already there. `trg_fines_settle_only`
-- (20260823000004) is BEFORE UPDATE and raises 42501 on any change outside
-- `status`; this one is AFTER UPDATE, so a refused write records nothing.
-- Measured: an UPDATE bundling `status='waived'` with `amount_cents=1` is
-- refused 42501 and writes zero audit rows.
--
-- ---------------------------------------------------------------------------
-- WHY `audit_log` AND NOT `violation_events`
--
-- `violation_events` is the STAGE ledger. Its rows are
-- `(from_stage, to_stage)` over `violation_stage_v2`, and Phase 2 built the
-- whole ladder on the property that one row there means one rung moved.
-- Settling a fine moves no rung: a case at `fine_1` whose fine is paid is
-- still at `fine_1`. Writing a stage row for it would have to invent a
-- `fine_1 -> fine_1` self-transition, which is exactly the kind of row Phase 2
-- went to some trouble to make illegal.
--
-- The precedent is already set and this follows it: `manager_remind_fine`
-- writes a `violation.fine_reminded` audit row and deliberately NO event row.
-- A money act on a case audits; it does not enter the stage ledger.
--
-- The pairing also closes: `manager_advance_violation`'s `violation.advanced`
-- audit row already carries `fine_id` and `amount_cents`
-- (20260823000002:345-349), so a fine's issuance is on the audit log. This
-- adds its settlement. Between the two, a fine's whole life is readable from
-- `audit_log` alone.
--
-- ---------------------------------------------------------------------------
-- HAND-OFF TO PHASE 5 -- READ THIS BEFORE ASSERTING AN AUDIT COUNT
--
-- Every `fines.status` change now writes exactly one `fine.status_changed`
-- row, and Phase 5 changes `fines.status` in three places:
--   * `resident_dispute_violation`  issued  -> disputed
--   * uphold                        disputed -> issued
--   * overturn                      disputed -> waived
-- So Phase 5's expected audit-row counts go up by one per fine touched. Its
-- plan currently states "two audit rows (this function's and the nested
-- advance's)" for an overturn; with this trigger that is THREE, and the third
-- is the fine waiver -- which is the row an overturn most needs. The counts in
-- that plan are wrong by one, not this trigger.
-- ---------------------------------------------------------------------------

create or replace function public.fines_settlement_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $settle$
begin
  -- SECURITY DEFINER is required, not decorative. A trigger runs as the
  -- invoking role, and 20260823000004 left `audit_log` with no INSERT policy
  -- for any JWT-bearing role -- only `audit_select`. As definer it runs as the
  -- owner (postgres), which owns the table, and `relforcerowsecurity` is false
  -- on it. Same route `violations_opening_event` and every RPC here take.
  --
  -- `search_path = ''` with everything schema-qualified, matching
  -- `fines_settle_only_guard`. `auth.uid()` is already qualified.
  --
  -- `auth.uid()` and not `new.issued_by`: this records who SETTLED the fine,
  -- which is a different person from whoever issued it and is the whole point
  -- of the row. It is null for a `service_role` write carrying no JWT, and
  -- `audit_log.actor_id` is nullable precisely for that case -- a null actor is
  -- an honest "a key did this", not a missing record.
  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (
    auth.uid(),
    'fine.status_changed',
    'fine',
    new.id,
    new.building_id,
    -- `from` is the half that cannot be recovered afterwards. The row itself
    -- still holds `to`, the amount and the currency; nothing anywhere holds
    -- what the status used to be. Amount and currency are carried anyway so
    -- the audit row states the sum of money on its own, without a join to a
    -- table whose row a later phase may make unreachable.
    pg_catalog.jsonb_build_object(
      'from', old.status,
      'to', new.status,
      'violation_id', new.violation_id,
      'resident_id', new.resident_id,
      'amount_cents', new.amount_cents,
      'currency', new.currency)
  );

  return null;  -- AFTER trigger; the return value is ignored.
end;
$settle$;

comment on function public.fines_settlement_event() is
  'AFTER UPDATE OF status on fines: writes one fine.status_changed audit_log row per actual change, carrying the old status, the new one, and the amount. SECURITY DEFINER because audit_log has no client INSERT policy. Deliberately writes NO violation_events row - settling a fine moves no rung of the ladder, and manager_remind_fine set that precedent. Covers every write path, including ones not yet written: the strata queue''s Mark paid and Waive, Phase 5''s dispute transitions, and any future payment webhook.';

-- `of status` and the WHEN clause together are the "only a real change counts"
-- rule. `of status` means an update touching other columns never enters the
-- function; WHEN means an update setting `status` to what it already was
-- writes nothing. Measured: re-marking an already-paid fine as paid produces
-- zero rows.
--
-- THE LIMIT OF `of status`, WHICH THE ABOVE OVERSTATES (noted 2026-08-23):
--
-- `of status` fires on the SET CLAUSE, not on the value. It asks "did this
-- UPDATE name the `status` column?", and the WHEN clause is only consulted
-- for statements that did. So the two halves guard different things and only
-- one of them is about the value:
--
--   update fines set status = 'paid'   -- names it, value differs -> audited
--   update fines set status = 'issued' -- names it, value same    -> WHEN, no row
--   update fines set amount_cents = 1  -- does not name it        -> never entered
--
-- The gap is the third line's cousin: a BEFORE UPDATE trigger that assigns
-- `new.status` without the statement naming `status` in its SET clause. That
-- write changes the status and is NEVER AUDITED, because `of status` decided
-- at statement level that this update had nothing to do with status.
--
-- MEASURED, not reasoned (2026-08-23, both inside `begin ... rollback`). A
-- temporary BEFORE UPDATE trigger assigning `new.status := 'waived'`, then the
-- same value change reached two ways:
--
--   update fines set currency = currency  -- paid -> waived, 0 audit rows
--   update fines set status   = 'waived'  -- paid -> waived, 1 audit row
--
-- Same table, same row, same before and after status. The only difference is
-- whether the SET clause named the column.
--
-- No such trigger exists on `fines` today. `trg_fines_settle_only`
-- (20260823000004) is BEFORE UPDATE but only RAISES; it assigns nothing. The
-- exposure is entirely future: anyone adding a BEFORE UPDATE trigger to
-- `fines` that touches `new.status` must drop `of status` from this trigger
-- at the same time, or the settlement it causes goes unrecorded.
--
-- `of status` is kept rather than removed because it is what makes the common
-- case free: `fines` is updated for reasons unrelated to status, and without
-- it every one of those updates would run this function only to be discarded
-- by WHEN. The cost of the choice is the paragraph above, which is why the
-- paragraph is here instead of a claim that the two clauses cover everything.
create or replace trigger trg_fines_settlement_event
  after update of status on public.fines
  for each row
  when (old.status is distinct from new.status)
  execute function public.fines_settlement_event();