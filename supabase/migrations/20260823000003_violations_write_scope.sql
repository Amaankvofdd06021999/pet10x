-- A ledger you can delete is not a ledger.
--
-- 20260823000002 made `manager_advance_violation` the only way to change a
-- violation's stage. Review found the two doors that left standing, and
-- together they are wider than the one that was closed, because
-- `violations_manager_write` was `FOR ALL` — every command, not just UPDATE.
--
-- 1. DELETE. `violation_events_violation_id_fkey` is ON DELETE CASCADE, so
--    deleting a case takes its paper trail with it. Measured as a real
--    manager: `delete from public.violations where id = '5570be70…'` removed
--    the case and its one `violation_events` row in the same statement. The
--    direct UPDATE we closed at least left behind a row that DISAGREED with
--    its ledger; a DELETE leaves nothing to disagree with. For a table whose
--    entire purpose is being the record a tribunal reads, that is the worse
--    failure.
--
--    There was one accident of protection: `fines_violation_id_fkey` is
--    NO ACTION, so a case that has already been fined cannot be deleted
--    (measured: 23503). That protected the fined minority by side effect of a
--    constraint written for a different reason, and protected nothing else.
--
-- 2. INSERT. Measured: a manager could
--    `insert into public.violations (building_id, stage, type)
--     values (…, 'fine_2', 'noise')` — a fabricated case sitting at second
--    fine, with no event row and no fine behind it. The ladder governs how a
--    case MOVES; nothing governed where it could START.
--
-- The fix is to stop stating the manager's write scope as "everything". A
-- policy is a grammar: say which commands are allowed and under what
-- conditions, and let everything unnamed be refused. `FOR ALL` is the
-- denylist-shaped version of that — it grants the two commands nobody had
-- thought about yet.

drop policy violations_manager_write on public.violations;

-- SELECT is deliberately NOT re-created here.
--
-- `violations_select` already reads
-- `manages_building(building_id) or is_admin() or resident_id = auth.uid()`,
-- which covers the manager and the admin on exactly the terms the dropped
-- policy did, and the resident besides. A second permissive SELECT policy
-- saying a subset of the same thing would be two places to keep in agreement
-- and no additional access. Verified after this migration: a manager still
-- sees her building's cases and no others.

-- INSERT: a case may be opened, and only opened.
--
-- `open` is the stage the ladder starts at and the one
-- `escalate_incident_to_violation` already uses, so this forbids nothing any
-- legitimate path does today. It forbids arriving at `warning`, `fine_1` or
-- `fine_2` without having passed through the RPC that would have written the
-- event, issued the fine and told the resident — and it forbids opening a case
-- that is already `resolved` or `dismissed`, which would be a closed record of
-- a decision nobody made.
--
-- `violations.stage` defaults to 'open', so an insert that never names the
-- column still satisfies this.
create policy violations_manager_insert on public.violations
  for insert
  with check (
    (public.manages_building(building_id) or public.is_admin())
    and stage = 'open'::public.violation_stage_v2
  );

-- UPDATE: unchanged from what the dropped policy allowed.
--
-- Both USING and WITH CHECK carry the same scope test the FOR ALL policy had,
-- so a manager may still edit her building's cases and may not move one into
-- or out of a building she does not manage. What a manager may do to `stage`
-- is not this policy's business and never was — `trg_violations_stage_guard`
-- decides that, and it is deliberately a trigger rather than a policy so that
-- `is_admin()` and every RLS-bypassing role are subject to it too.
create policy violations_manager_update on public.violations
  for update
  using       (public.manages_building(building_id) or public.is_admin())
  with check  (public.manages_building(building_id) or public.is_admin());

-- DELETE: no policy, for anybody, including admins.
--
-- Deliberate, and the reasoning is worth writing down because the absence of a
-- policy is invisible otherwise:
--
--   * The ladder already has the answer for a case filed in error. `dismissed`
--     is reachable from all four non-terminal stages, and it closes the case
--     while LEAVING the record — an event row saying who dismissed it and why.
--     That is strictly better evidence than the case never having existed.
--   * A delete path was never coherent anyway: the fines FK already made fined
--     cases undeletable, so the capability existed only for the cases that had
--     not yet cost anybody money.
--   * Genuine erasure — a privacy request, a legal order — is still possible
--     for `service_role` and the table owner, which bypass RLS entirely
--     (`relforcerowsecurity` is false). That is the right amount of friction:
--     a deliberate server-side act by someone holding a secret key, rather
--     than a button in a strata portal.
--
-- The CASCADE on `violation_events_violation_id_fkey` is therefore no longer
-- reachable by any JWT-bearing caller. It is still there, so if a delete path
-- is ever reintroduced, that FK has to be reconsidered in the same breath.

-- Fix-forward, minor: `create trigger` at 20260823000002:369 is the one
-- non-idempotent statement in an otherwise `create or replace` migration, so
-- re-applying that file fails on its last line. This server is PostgreSQL 17.6
-- and `create or replace trigger` has existed since 14. Re-issuing it here in
-- the replaceable form makes the pair idempotent without editing a migration
-- that has already been applied. The definition is byte-identical to the one
-- it replaces.
create or replace trigger trg_violations_stage_guard
  before update on public.violations
  for each row
  when (old.stage is distinct from new.stage)
  execute function public.violations_stage_guard();
