-- The ledger, protected as well as the thing it records.
--
-- 20260823000003 was committed under the title "A ledger you can delete is not
-- a ledger" and did not make that true. It closed DELETE and INSERT on
-- `violations` and left `vevents_manager_write` on `violation_events` at
-- `FOR ALL`. So a manager still could not move a case up the ladder without
-- writing an event — and could then delete or rewrite the event that says so,
-- in one supabase-js call, never touching `violations`. Measured, all rolled
-- back:
--
--   Rachel  delete from violation_events where violation_id='5570be70…'  -> 1
--   Rachel  delete from violation_events            (unqualified)        -> 4
--   Dana    delete the FINED case's events                               -> 2
--   Rachel  update … set to_stage='dismissed', note='rewritten by hand'  -> 1,
--           and the row then read exactly that
--   Rachel  insert a fabricated warning -> fine_2 event                  -> 1
--
-- `fines_manager_write` was `FOR ALL` too, and that dissolved the accidental
-- protection the previous migration's reasoning leaned on: measured, a manager
-- deleted the fines row (-> 1) and the FK stopped objecting. Worse, and not
-- previously noticed: `update fines set amount_cents = 1` succeeded, so a fine
-- could be rewritten after the resident had already been notified of a
-- different amount.
--
-- The same mistake three times: `FOR ALL` states a write scope as "everything",
-- which grants the commands nobody has thought about yet. This migration states
-- the scope of every remaining write path in the enforcement chain positively —
-- which command, on which condition, and nothing else.

-- ---------------------------------------------------------------------------
-- 1. Fix forward the idempotence defect in 20260823000003.
--
-- `create policy` has no `or replace` form in PostgreSQL 17, and that file's
-- three policy statements have no `if exists`, so re-running it fails at its
-- first line. Its trigger statement is the only re-runnable one. Re-issuing all
-- three here in drop-if-exists form makes the pair idempotent without editing a
-- migration that has already been applied. The two policy bodies are identical
-- to the ones they replace.
-- ---------------------------------------------------------------------------

drop policy if exists violations_manager_write on public.violations;

drop policy if exists violations_manager_insert on public.violations;
create policy violations_manager_insert on public.violations
  for insert
  with check (
    (public.manages_building(building_id) or public.is_admin())
    and stage = 'open'::public.violation_stage_v2
  );

drop policy if exists violations_manager_update on public.violations;
create policy violations_manager_update on public.violations
  for update
  using       (public.manages_building(building_id) or public.is_admin())
  with check  (public.manages_building(building_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. violation_events: readable, never client-writable.
--
-- Checked before removing it, because a policy nobody needs and a policy
-- something depends on look identical from the catalog:
--
--   * Codebase: `grep -rn violation_events app components lib` finds four hits,
--     all in the generated `lib/supabase/database.types.ts`. No query, no
--     insert, no update, no delete. Nothing in the app writes this table.
--   * Database: the only two functions whose bodies name it are
--     `manager_advance_violation` and `violations_stage_guard`. The first is
--     SECURITY DEFINER owned by `postgres`, and `relforcerowsecurity` is false
--     on this table, so its insert bypasses RLS and needs no policy. The second
--     only reads a setting.
--
-- So every legitimate write already comes through the definer function, and the
-- client write policy was granting a capability nothing used. It goes, with no
-- replacement: no INSERT, no UPDATE, no DELETE policy for any JWT-bearing role.
--
-- `vevents_select` is untouched. It already scopes reads to the case's managers,
-- admins, and the resident the case is about, which is what lets a resident see
-- their own case's history.
-- ---------------------------------------------------------------------------

drop policy if exists vevents_manager_write on public.violation_events;

-- ---------------------------------------------------------------------------
-- 3. fines: one client write, and only the one.
--
-- The instruction for this table was "the RPC writes fines as definer, so no
-- client write is needed". That premise is false today, and breaking a live
-- feature would have been worse than the hole:
--
--   `setFineStatus` (lib/data/portfolio.ts:375) does
--   `supabase.from("fines").update({ status })`, and it is wired to the
--   "Mark paid" and "Waive" buttons in the strata queue screen
--   (components/screens/strata/queue-screen.tsx:74-75).
--
-- So UPDATE stays, on the same scope it had. INSERT and DELETE go — the RPC
-- issues fines as definer, and a fine that can be deleted is a fine that was
-- never issued. A resident paying or disputing is Phase 5's problem and will
-- arrive as its own definer RPC (or as a Stripe webhook running under
-- service_role, which bypasses RLS), so neither needs a client policy either.
--
-- Keeping UPDATE unqualified would have preserved the `amount_cents = 1`
-- rewrite measured above, so it is not kept unqualified: the trigger below
-- restricts a client UPDATE to the column the live feature actually changes.
-- ---------------------------------------------------------------------------

drop policy if exists fines_manager_write on public.fines;

drop policy if exists fines_manager_update on public.fines;
create policy fines_manager_update on public.fines
  for update
  using       (public.manages_building(building_id) or public.is_admin())
  with check  (public.manages_building(building_id) or public.is_admin());

-- What a fine's row is allowed to become, stated as a positive grammar.
--
-- Rather than listing the columns a manager may not touch — a denylist that
-- silently admits every column added later — this compares the whole row with
-- the two mutable fields removed. Anything else differing means the row is
-- being rewritten rather than settled, and is refused. A column added to
-- `fines` next year is protected the day it is added, without anybody
-- remembering to come back here.
--
-- `updated_at` is excluded because `trg_fines_updated` rewrites it on every
-- update; `status` because settling a fine is exactly what the manager is
-- allowed to do. `stripe_payment_intent_id` is deliberately NOT excluded:
-- nothing writes it today, and when Phase 5 does, it will be a webhook running
-- as service_role, which bypasses RLS and this trigger alike.
create or replace function public.fines_settle_only_guard()
returns trigger
language plpgsql
set search_path = ''
as $guard$
begin
  if (pg_catalog.to_jsonb(old) - 'status' - 'updated_at')
     is distinct from
     (pg_catalog.to_jsonb(new) - 'status' - 'updated_at')
  then
    raise exception
      'a fine may be settled, not rewritten'
      using errcode = '42501',
            detail  = pg_catalog.format(
                        'Fine %s: an UPDATE changed a column other than status.', old.id),
            hint    = 'Only `status` may be changed on an existing fine (this is what "Mark paid" and "Waive" do). The amount, currency, due date and the case a fine belongs to are set when manager_advance_violation issues it, and are not editable afterwards — a fine the resident has already been told about cannot be quietly restated.';
  end if;
  return new;
end;
$guard$;

comment on function public.fines_settle_only_guard() is
  'BEFORE UPDATE guard on fines: permits a row to differ only in `status` (and `updated_at`, which trg_fines_updated rewrites). Compares whole rows as jsonb, so columns added later are protected without amending this function. Raises 42501.';

create or replace trigger trg_fines_settle_only
  before update on public.fines
  for each row
  execute function public.fines_settle_only_guard();

-- ---------------------------------------------------------------------------
-- 4. The ledger stops being collateral damage of a deleted case.
--
-- `violation_events_violation_id_fkey` was ON DELETE CASCADE. That was deferred
-- last time on the grounds that no JWT-bearing caller could reach it, which the
-- review falsified — `vevents_manager_write` was reachable directly, and
-- `truncate public.violations cascade` erased both tables from an `authenticated`
-- session (TRUNCATE is exempt from RLS; the `authenticated` role holds the
-- default table grants that make it possible; PostgREST offers no path to it).
-- The reason for deferring is gone, so the change lands.
--
-- RESTRICT does not make erasure impossible; it makes it two deliberate
-- statements instead of one silent cascade. That is the same standard
-- `fines_violation_id_fkey` (NO ACTION) has always held the fines to, and there
-- is no reason the record of what happened should be easier to destroy than the
-- record of what it cost.
-- ---------------------------------------------------------------------------

alter table public.violation_events
  drop constraint if exists violation_events_violation_id_fkey;

alter table public.violation_events
  add constraint violation_events_violation_id_fkey
  foreign key (violation_id) references public.violations(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 5. Correcting 20260823000003:96-98.
--
-- That file claimed the CASCADE was "no longer reachable by any JWT-bearing
-- caller" and that the two protected cases' events were untouchable. Both were
-- false when written: the ledger's own FOR ALL policy let a manager delete the
-- events directly, and TRUNCATE reached both tables regardless of RLS.
--
-- What is true once this migration lands, stated without the overreach:
--
--   * No PostgREST caller can delete or rewrite a `violation_events` row, or
--     delete a `fines` row, or change any column of a fine except `status`.
--     There is no policy admitting those commands, so they affect zero rows or
--     raise 42501.
--   * A violation carrying events can no longer be deleted at all, by anyone,
--     without deleting its events first — including `service_role` and the
--     table owner, which is the point of RESTRICT.
--   * `service_role`, the table owner, and any role able to issue TRUNCATE can
--     still destroy these tables. RLS does not constrain the first two by
--     design, and TRUNCATE is exempt from RLS entirely. That is a property of
--     holding a secret key or a database credential, not something a policy can
--     take away, and it is the boundary this phase's controls stop at.
-- ---------------------------------------------------------------------------
