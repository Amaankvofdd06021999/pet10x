-- Pet10x — Phase 7, Task 2: close four holes measured on live disability data.
--
-- Each of the four was reproduced on 2026-08-23 against the live project, under
-- `set local role authenticated` in a rolled-back transaction. None is
-- theoretical.
--
--  1. `accom_resident_insert`'s ENTIRE with-check was `resident_id = auth.uid()`.
--     Measured: resident4@pet10x.com, who lives at Maple Court Residences,
--     inserted a request into Harbour View Towers — a building they have no
--     link to of any kind — and it was admitted, id 5728e918-....
--
--  2. `accom_manager_update` is `FOR UPDATE` over EVERY column. Measured, in
--     ONE statement, as stratamanager@pet10x.com: `animal_desc` rewritten to
--     'REWRITTEN BY MANAGER', `status` set to 'approved', and `building_id`
--     moved to a different building. That last one RELOCATES WHO MAY READ THE
--     DOCTOR'S LETTER, because the `accommodation-docs` storage read policy
--     joins through `r.building_id`. A manager could deny a request and then
--     rewrite the request they denied.
--
--  3. `accomdoc_rw` is `FOR ALL`. Its USING admits `manages_building`, its
--     WITH CHECK does not, and DELETE consults ONLY `USING`. Measured:
--     manager@pet10x.com deleted the resident's own document row.
--
--  4. `draft` (added in 20260827000000) is visible to the building's managers
--     under the old `accom_select`. Measured: 1 row — a manager reading a
--     request nobody has filed.
--
-- WHY ALL FOUR IN ONE MIGRATION: each one alone leaves a way round the others.
-- Fixing the INSERT while UPDATE can still move `building_id` just makes the
-- cross-building write a two-statement job.
--
-- THE SHAPE OF THE FIX. RLS alone cannot express "status may only move along
-- the ladder", because `accom_manager_update` has no column list and PostgreSQL
-- policies cannot have one. So the ladder is enforced the way Phase 2 enforced
-- the violations ladder: a BEFORE UPDATE trigger that refuses a guarded change
-- unless it carries a single-use token that only a SECURITY DEFINER RPC mints.
-- Without it the RPCs of 20260827000003 would be advice, not control.
--
-- This guard goes further than `violations_stage_guard`: it also freezes the
-- RESIDENT-AUTHORED columns and the IDENTITY columns. Defect 2 is the reason.

-- ============================================================ REQUESTS: RLS ==

-- INSERT. Three positive statements, no denylist: it is yours, you live there,
-- and it starts at the bottom of the ladder.
--
-- `is_resident_of` requires an APPROVED link and a non-suspended profile
-- (verified in its definition), so a pending link cannot file.
--
-- `status = 'draft'` is deliberate and has a visible consequence: the column
-- DEFAULTS to 'pending', so an insert that does not name 'draft' explicitly is
-- REFUSED. That is loud rather than silent, which is what we want — a request
-- that skipped `draft` skipped the window in which its documents can be
-- attached, and there is no honest way to guess which was meant.
drop policy if exists accom_resident_insert on public.accommodation_requests;
create policy accom_resident_insert on public.accommodation_requests
  for insert to authenticated
  with check (
    resident_id = auth.uid()
    and public.is_resident_of(building_id)
    and status = 'draft'
  );

-- SELECT. The resident's own arm stays unconditional — including drafts, which
-- are theirs. The manager and admin arms are gated on the request having
-- actually been filed.
--
-- Written as `status <> 'draft'` AND-ed in front of the disjunction rather than
-- as a NOT over the whole thing, so there is no arrangement of NULLs in which
-- the manager arm opens: `status` is NOT NULL, and even if it were not, a NULL
-- here makes the whole conjunct NULL, which RLS treats as a refusal.
drop policy if exists accom_select on public.accommodation_requests;
create policy accom_select on public.accommodation_requests
  for select
  using (
    resident_id = auth.uid()
    or (status <> 'draft' and (public.manages_building(building_id) or public.is_admin()))
  );

-- UPDATE, manager arm. Narrowed to exclude drafts — a manager who cannot READ a
-- draft must not be able to write one either, and RLS's UPDATE policy is
-- consulted independently of SELECT.
--
-- This policy survives ONLY so a manager can write `legal_note`, which is their
-- own guidance. Everything that matters about a request — status, the
-- resident's words, the identity columns — is now frozen by the trigger below,
-- token or no token. The policy is no longer the control; it is the door the
-- control stands behind.
drop policy if exists accom_manager_update on public.accommodation_requests;
create policy accom_manager_update on public.accommodation_requests
  for update to authenticated
  using  (status <> 'draft' and (public.manages_building(building_id) or public.is_admin()))
  with check (status <> 'draft' and (public.manages_building(building_id) or public.is_admin()));

-- UPDATE, resident arm. THIS DID NOT EXIST BEFORE and the plan does not name
-- it, but without it Task 7's form cannot work: there was no resident UPDATE
-- policy on this table at all, so a resident could create a draft and then
-- never edit it. Scoped to the two states in which a request is still the
-- resident's to correct; the trigger below re-states the same window over the
-- specific columns, so this policy failing open would not open the columns.
drop policy if exists accom_resident_update on public.accommodation_requests;
create policy accom_resident_update on public.accommodation_requests
  for update to authenticated
  using  (resident_id = auth.uid() and status in ('draft','info_requested'))
  with check (resident_id = auth.uid() and status in ('draft','info_requested'));

-- ============================================== REQUESTS: the freeze trigger ==

create or replace function public.accommodation_requests_freeze()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
declare
  v_token boolean;
  v_owner boolean;
begin
  -- The token is a SINGLE-USE CAPABILITY, NOT A MODE.
  --
  -- `set_config(..., true)` is transaction-local, not statement-local: a GUC
  -- set inside a SECURITY DEFINER function survives that function's return and
  -- is readable two statements later in the same transaction. Left as a mode,
  -- one legitimate RPC call would license unlimited direct UPDATEs for the rest
  -- of the transaction.
  --
  -- So it is read once and SPENT IMMEDIATELY, before any branch that could
  -- raise, and unconditionally. Phase 6 leaked a token by clearing it inside a
  -- branch of a trigger that carried a WHEN clause and therefore did not always
  -- fire; this trigger has NO WHEN CLAUSE and clears on every single pass.
  v_token := pg_catalog.current_setting('pet10x.accom_write', true) is not distinct from 'ok';
  perform pg_catalog.set_config('pet10x.accom_write', '', true);

  -- `is not distinct from` rather than `=`, because an unset GUC reads NULL and
  -- `NULL = 'ok'` is NULL. A guard that evaluates to NULL is not a guard.

  -- 1. IDENTITY. Refused for EVERYONE, token or not. There is no legitimate
  --    caller for any of these: a request belongs to one resident, in one
  --    building, opened at one instant. Defect 2 moved a request between
  --    buildings and thereby moved who may read its doctor's letter.
  if new.resident_id  is distinct from old.resident_id
     or new.building_id is distinct from old.building_id
     or new.created_at  is distinct from old.created_at then
    raise exception
      'accommodation_requests identity columns cannot be changed'
      using errcode = '42501',
            detail  = pg_catalog.format(
                        'Request %s: attempted change to resident_id/building_id/created_at.', old.id),
            hint    = 'These are identity, not state. Moving building_id also moves who may read the supporting documents, because the accommodation-docs read policy joins through it. File a new request instead.';
  end if;

  -- 2. DECISION STATE. Only the RPCs may move the ladder or write what a
  --    decision consists of. `decision_note` is in this list on purpose and
  --    beyond what the plan asked for: a manager who can rewrite the reasoning
  --    after the fact is the same defect as one who can rewrite the request,
  --    and the reasoning is what defends the decision at the CRT.
  if (new.status        is distinct from old.status
      or new.decision_note is distinct from old.decision_note
      or new.decided_by    is distinct from old.decided_by
      or new.decided_at    is distinct from old.decided_at
      or new.submitted_at  is distinct from old.submitted_at
      or new.withdrawn_at  is distinct from old.withdrawn_at)
     and not v_token then
    raise exception
      'accommodation_requests.status and the decision columns cannot be changed by a direct UPDATE'
      using errcode = '42501',
            detail  = pg_catalog.format('Request %s: attempted %s -> %s outside an accommodation RPC.',
                                        old.id, old.status, new.status),
            hint    = 'Call submit_accommodation_request, withdraw_accommodation_request or manager_decide_accommodation. They check the transition, write audit_log and notify.';
  end if;

  -- 3. THE RESIDENT'S OWN WORDS. Changeable only by the resident who filed it,
  --    and only while the request is still theirs to correct. A manager may
  --    never rewrite it; nobody may rewrite it after a decision. Note that this
  --    holds WITH the token too — the RPCs have no business here either.
  v_owner := coalesce(old.resident_id = auth.uid(), false);
  if (new.animal_desc is distinct from old.animal_desc
      or new.type     is distinct from old.type
      or new.pet_id   is distinct from old.pet_id
      or new.unit_id  is distinct from old.unit_id)
     and not (v_owner and old.status in ('draft','info_requested')) then
    raise exception
      'accommodation_requests content may only be edited by the resident who filed it, before a decision'
      using errcode = '42501',
            detail  = pg_catalog.format('Request %s (%s): attempted change to animal_desc/type/pet_id/unit_id.',
                                        old.id, old.status),
            hint    = 'animal_desc is the resident''s own account of why they need the animal. A manager rewriting it rewrites the request they are deciding.';
  end if;

  return new;
end;
$guard$;

comment on function public.accommodation_requests_freeze() is
  'BEFORE UPDATE guard on accommodation_requests. Refuses identity changes (resident_id, building_id, created_at) outright; refuses ladder/decision changes without the single-use pet10x.accom_write token minted by the accommodation RPCs; refuses content changes (animal_desc, type, pet_id, unit_id) by anyone but the owning resident while draft or info_requested. Spends the token unconditionally on every pass. Raises 42501. A trigger is not RLS: is_admin() transcends the policies and transcends nothing here.';

-- No WHEN clause. See the token paragraph above: a trigger that does not always
-- fire cannot always spend.
drop trigger if exists accom_freeze_guard on public.accommodation_requests;
create trigger accom_freeze_guard
  before update on public.accommodation_requests
  for each row execute function public.accommodation_requests_freeze();

-- A denial without reasoning is not a decision. Enforced here rather than only
-- in the RPC so it is true of every writer forever.
--
-- `coalesce(..., '') ~ '\S'` and not `btrim(...) <> ''`: btrim strips only
-- ASCII spaces, so a note of E'\n\n\t\n' passed Phase 6's equivalent check.
-- The coalesce is load-bearing too — `null ~ '\S'` is NULL, and a CHECK that
-- evaluates to NULL PASSES.
alter table public.accommodation_requests
  drop constraint if exists accommodation_requests_denial_note_ck;
alter table public.accommodation_requests
  add constraint accommodation_requests_denial_note_ck
  check (status <> 'denied' or coalesce(decision_note, '') ~ '\S');

-- =========================================================== DOCUMENTS: RLS ==

-- `accomdoc_rw` was `FOR ALL`. That form WAS the bug: DELETE consults only
-- USING, so the manager arm that belongs in a read reached a destroy. Split per
-- command, and the command that nobody may run gets no policy at all.
drop policy if exists accomdoc_rw on public.accommodation_documents;

-- SELECT: the owning resident always; a manager or super-admin only once the
-- parent request has actually been filed. Same draft gate as accom_select, for
-- the same reason.
drop policy if exists accomdoc_select on public.accommodation_documents;
create policy accomdoc_select on public.accommodation_documents
  for select
  using (
    exists (
      select 1 from public.accommodation_requests r
      where r.id = accommodation_documents.request_id
        and (
          r.resident_id = auth.uid()
          or (r.status <> 'draft' and (public.manages_building(r.building_id) or public.is_admin()))
        )
    )
  );

-- INSERT: the owning resident only, and only while the request is non-terminal.
-- Stated as the three states that ARE open rather than as "not terminal", so a
-- future enum label defaults to closed instead of open.
drop policy if exists accomdoc_insert on public.accommodation_documents;
create policy accomdoc_insert on public.accommodation_documents
  for insert to authenticated
  with check (
    exists (
      select 1 from public.accommodation_requests r
      where r.id = accommodation_documents.request_id
        and r.resident_id = auth.uid()
        and r.status in ('draft','pending','info_requested')
    )
  );

-- DELETE: the owning resident, same window. A manager deleting a resident's
-- document is defect 3 and has no legitimate form — a manager who thinks a
-- letter is wrong REJECTS it, which is a verdict with their name on it.
drop policy if exists accomdoc_delete on public.accommodation_documents;
create policy accomdoc_delete on public.accommodation_documents
  for delete to authenticated
  using (
    exists (
      select 1 from public.accommodation_requests r
      where r.id = accommodation_documents.request_id
        and r.resident_id = auth.uid()
        and r.status in ('draft','pending','info_requested')
    )
  );

-- UPDATE: DELIBERATELY NO POLICY.
-- With RLS enabled and no UPDATE policy, no client session can update this
-- table at all. Verification goes through manager_verify_accommodation_document
-- (SECURITY DEFINER, 20260827000003); retention goes through the service role
-- (Task 9). An empty `for update using (false)` policy would say the same thing
-- but would also appear in pg_policies as an UPDATE row, and Task 10 asserts
-- the shape of that catalogue. Absence is the assertion.
