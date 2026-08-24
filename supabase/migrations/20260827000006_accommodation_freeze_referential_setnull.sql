-- Pet10x — Phase 7: a referential SET NULL is not an edit, and the guard was
-- treating it as one.
--
-- WHAT BROKE, MEASURED IMMEDIATELY AFTER 20260827000005 WAS APPLIED:
--
--   delete from public.pets where id = '9b1b972a-…';
--   -> 42501 "accommodation_requests content may only be edited by the
--             resident who filed it, before a decision"
--
-- 20260827000005 changed `accommodation_requests_pet_id_fkey` to
-- `on delete set null` so that a resident with an accommodation request naming
-- one of their pets could delete their account. That fix was INERT. An
-- `on delete set null` referential action is implemented as an UPDATE on the
-- referencing table, and `accommodation_requests_freeze` refuses any change to
-- `pet_id` by anyone but the owning resident while the request is still theirs
-- to correct. So the constraint stopped raising 23503 and started raising
-- 42501, one layer along, and the account deletion was still blocked.
--
-- The same hole sits under `decided_by`, which 20260827000005 also set to
-- `set null`: that column is guarded behind the single-use token, and a
-- referential action carries no token, so deleting a manager who has decided a
-- request would have raised 42501 too. Nobody has hit it because `decided_by`
-- is null on all four live rows — which is exactly the kind of bug that ships.
--
-- THE FIX IS A POSITIVE GRAMMAR, NOT A `pg_trigger_depth()` ESCAPE HATCH.
-- Depth is a fact about HOW the write arrived, and any nested write would
-- inherit the exemption. What is actually permitted is narrower and can be
-- stated as a fact about the ROW:
--
--     a reference column may go NULL when the row it named no longer exists.
--
-- That cannot be used to clear `pet_id` on a whim — the pet would have to be
-- genuinely gone from `public.pets` first — and it is exactly and only what a
-- referential SET NULL does. Everything else the guard refused, it still
-- refuses: `pet_id` moved from one pet to another, `pet_id` nulled while the
-- pet still exists, `decided_by` rewritten to a colleague.
--
-- This replaces the function body only. The trigger, its name, and its
-- WHEN-clause-free registration are untouched.

create or replace function public.accommodation_requests_freeze()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
declare
  v_token   boolean;
  v_owner   boolean;
  v_ri_pet  boolean;
  v_ri_unit boolean;
  v_ri_dec  boolean;
begin
  -- Single-use capability, not a mode. Read once, spent immediately and
  -- unconditionally, before any branch that could raise. The trigger carries no
  -- WHEN clause, because a trigger that does not always fire cannot always
  -- spend. `is not distinct from`, because an unset GUC reads NULL and
  -- `NULL = 'ok'` is NULL — a guard that evaluates to NULL is not a guard.
  v_token := pg_catalog.current_setting('pet10x.accom_write', true) is not distinct from 'ok';
  perform pg_catalog.set_config('pet10x.accom_write', '', true);

  -- The three referential SET NULLs, stated as facts about the row rather than
  -- as an exemption for a caller. Each is true only when the referenced row has
  -- actually gone.
  v_ri_pet := new.pet_id is null and old.pet_id is not null
              and not exists (select 1 from public.pets p where p.id = old.pet_id);
  v_ri_unit := new.unit_id is null and old.unit_id is not null
               and not exists (select 1 from public.units u where u.id = old.unit_id);
  v_ri_dec := new.decided_by is null and old.decided_by is not null
              and not exists (select 1 from public.profiles pr where pr.id = old.decided_by);

  -- 1. IDENTITY. Refused for everyone, token or not. `building_id` and
  --    `resident_id` are both `on delete cascade`, so neither has a referential
  --    SET NULL to allow for: the row goes, and a DELETE does not fire a BEFORE
  --    UPDATE trigger.
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
  --    decision consists of — plus the one referential case above.
  if (new.status        is distinct from old.status
      or new.decision_note is distinct from old.decision_note
      or new.decided_at    is distinct from old.decided_at
      or new.submitted_at  is distinct from old.submitted_at
      or new.withdrawn_at  is distinct from old.withdrawn_at
      or (new.decided_by is distinct from old.decided_by and not v_ri_dec))
     and not v_token then
    raise exception
      'accommodation_requests.status and the decision columns cannot be changed by a direct UPDATE'
      using errcode = '42501',
            detail  = pg_catalog.format('Request %s: attempted %s -> %s outside an accommodation RPC.',
                                        old.id, old.status, new.status),
            hint    = 'Call submit_accommodation_request, withdraw_accommodation_request or manager_decide_accommodation. They check the transition, write audit_log and notify.';
  end if;

  -- 3. THE RESIDENT'S OWN WORDS. Changeable only by the resident who filed it,
  --    and only while the request is still theirs to correct — plus the two
  --    referential cases above.
  v_owner := coalesce(old.resident_id = auth.uid(), false);
  if (new.animal_desc is distinct from old.animal_desc
      or new.type     is distinct from old.type
      or (new.pet_id  is distinct from old.pet_id  and not v_ri_pet)
      or (new.unit_id is distinct from old.unit_id and not v_ri_unit))
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
  'BEFORE UPDATE guard on accommodation_requests. Refuses identity changes (resident_id, building_id, created_at) outright; refuses ladder/decision changes without the single-use pet10x.accom_write token minted by the accommodation RPCs; refuses content changes (animal_desc, type, pet_id, unit_id) by anyone but the owning resident while draft or info_requested. Permits exactly one further thing: a reference column going NULL when the row it named no longer exists, which is what an `on delete set null` referential action does. Spends the token unconditionally on every pass. Raises 42501. A trigger is not RLS: is_admin() transcends the policies and transcends nothing here.';
