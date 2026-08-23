-- Pet10x — Phase 7, Task 9: two foreign keys that refuse to let a resident go.
--
-- WHAT WAS MEASURED, 2026-08-23, on production in rolled-back transactions:
--
--   delete from public.pets where id = '9b1b972a-…'   (a pet named by a request)
--     -> 23503, accommodation_requests_pet_id_fkey
--
-- `app/api/account/delete/route.ts` HARD-deletes the caller's pets before
-- deleting the auth user. All four live accommodation requests name a pet, so
-- for those four residents the PIPEDA / Apple "delete my account" flow answers
-- 400 and the account survives. That is live today, and this phase makes it
-- more common by giving residents a form that files requests naming their pets.
--
-- `accommodation_requests_decided_by_fkey` is the same shape one step along:
-- NO ACTION, so a MANAGER who has decided a request cannot delete their account
-- either. No live row has decided_by set yet, so nobody is blocked by it right
-- now — which is exactly why it is worth fixing before this phase starts
-- writing that column.
--
-- WHY `set null` IS THE RIGHT ACTION AND NOT `cascade`.
--
--   pet_id      The animal is gone. Nothing can read it, and the request's own
--               account of what was decided lives in `type`, `animal_desc` and
--               `decision_note` — none of which is the pet row. A `cascade`
--               here would DELETE THE ACCOMMODATION REQUEST when a pet is
--               removed, destroying the record of a human-rights decision
--               because somebody tidied up a pet profile. The column is already
--               nullable, and a request with no pet is a normal, supported
--               state: an animal not yet registered is exactly what a request
--               may be about.
--
--   decided_by  Same reasoning as `accommodation_documents.uploaded_by` and
--               `verified_by`, which 20260827000001 set to `set null` for it.
--               The decision was the strata's, not a named individual's; the
--               audit_log row still carries `actor_id`, and `decided_at`
--               survives, so "decided on 14 July" remains true. A cascade would
--               delete decided requests when a manager leaves.
--
-- WHAT THIS DOES NOT FIX, and it is bigger than either of these:
--
--   `audit_log_actor_id_fkey` is ALSO NO ACTION. Measured in the same session:
--   inserting one audit_log row for a throwaway profile and then deleting that
--   auth user raised 23503. So ANY account that has ever produced an audit row
--   — every manager who advanced a violation, every resident who filed a
--   dispute, and from this phase on every resident who submits an accommodation
--   request — CANNOT BE DELETED. /api/account/delete answers 400.
--
--   That is a repo-wide, pre-existing defect and it is deliberately NOT touched
--   here. The fix is a real decision, not a one-liner: `set null` makes the
--   audit trail say "somebody" where it used to name a person, which weakens
--   every tribunal-facing record in the product, and the alternative —
--   anonymising to a tombstone id — needs a column that does not exist. It is
--   reported rather than guessed at.

alter table public.accommodation_requests
  drop constraint if exists accommodation_requests_pet_id_fkey;
alter table public.accommodation_requests
  add constraint accommodation_requests_pet_id_fkey
  foreign key (pet_id) references public.pets(id) on delete set null;

alter table public.accommodation_requests
  drop constraint if exists accommodation_requests_decided_by_fkey;
alter table public.accommodation_requests
  add constraint accommodation_requests_decided_by_fkey
  foreign key (decided_by) references public.profiles(id) on delete set null;
