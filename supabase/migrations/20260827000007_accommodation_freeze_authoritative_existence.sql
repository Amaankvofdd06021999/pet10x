-- Pet10x — Phase 7 fix round: `NOT EXISTS` under SECURITY INVOKER is not a
-- question about the database, it is a question about the caller.
--
-- THE LESSON, WHICH IS NEW TO THIS PROJECT AND IS THE REASON THIS FILE EXISTS.
--
-- `20260827000006` gave `accommodation_requests_freeze` one narrow exemption,
-- stated as a fact about the row:
--
--     a reference column may go NULL when the row it named no longer exists
--
-- and implemented it as `not exists (select 1 from public.pets ...)` inside a
-- function declared `security invoker`. Under invoker rights that subquery runs
-- beneath the CALLER'S `pets_select`. **A row the caller cannot read and a row
-- that does not exist return the same answer.** The exemption therefore did not
-- test existence at all; it tested invisibility, and invisibility is something
-- a caller frequently has and can sometimes arrange.
--
-- Its header claimed the opposite in terms — "the pet would have to be
-- genuinely gone from `public.pets` first" — which is exactly the
-- `emergency_directory` / `p.conditions` failure this phase was written to
-- avoid, a comment documenting one rule while the body implements another.
--
-- MEASURED ON PRODUCTION, IN A ROLLED-BACK TRANSACTION, BEFORE THIS FILE:
--
--   -- Rachel Torres, building_manager of b41968f8, id 3aa088d5.
--   -- Pepper (9b1b972a) is a live pet with `building_id is null`, so
--   -- `pets_select` (owner OR manages_building(building_id) OR is_admin())
--   -- admits her to none of it.
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"3aa088d5-...","role":"authenticated"}';
--
--   select count(*) from public.pets where id = '9b1b972a-...';   -> 0
--   update public.accommodation_requests
--      set pet_id = null where id = '7cb1d59f-...';               -> ADMITTED
--   select pet_id from public.accommodation_requests where ...;   -> null
--
-- The pet was never gone. Rachel simply could not see it, and the guard read
-- her blindness as the pet's absence and let her erase the link.
--
-- `unit_id` has the same shape. `decided_by` is the worst of the three, and was
-- protected only by accident: `profiles_select` admits `id = auth.uid()`, so a
-- manager is always visible to themselves. The moment a manager who decided a
-- request LEAVES THE BUILDING they become invisible to the managers who remain,
-- and their name can then be erased from the decision they signed —
-- `accom_manager_update` admits any non-draft status, so this works on an
-- approved or denied request just as well as a pending one.
--
-- THE FIX: EVALUATE THE EXISTENCE TEST IN A DEFINER CONTEXT.
--
-- The function is switched to `security definer`. It is owned by `postgres`,
-- which carries `rolbypassrls`, so the three probes now answer the question the
-- header always claimed they answered.
--
-- WHY THE WHOLE GUARD, AND NOT A HELPER FUNCTION.
--
-- A `public.pet_exists(uuid)` helper would have to be granted to `authenticated`
-- for the trigger to call it, and that grant is a standing existence oracle any
-- client can call directly for any UUID. Promoting the guard itself creates no
-- such surface: PostgreSQL refuses to call a `returns trigger` function from
-- SQL (`0A000: trigger functions can only be called as triggers`), so there is
-- nothing new to invoke and nothing new to grant.
--
-- The promotion is safe to the letter because of what this body does and does
-- not do. It performs NO writes. It returns NEW unmodified on every path. Its
-- only table reads are the three existence probes, and each is keyed by an OLD
-- id the caller already holds. It does not use `current_user` or `session_user`
-- for any decision. `auth.uid()` is unaffected — it reads the
-- `request.jwt.claims` GUC, which is session state and not the executing role —
-- so `v_owner` still identifies the human, not `postgres`. The token GUC is
-- likewise session state. A definer guard that can only refuse or pass through
-- cannot widen anything: the worst a mistake here could do is refuse a write
-- the caller was entitled to make.
--
-- THE EXEMPTION STAYS EXACTLY AS NARROW AS IT WAS WRITTEN TO BE. Re-proved
-- after this file, on production, rolled back:
--
--   * Rachel clearing `pet_id` while Pepper exists but is invisible -> 42501.
--   * Rachel clearing `decided_by` on the denied request           -> 42501.
--   * Rachel moving `pet_id` from one pet to another               -> 42501.
--   * `delete from public.pets` firing the real referential
--     SET NULL, which is what the exemption is for                 -> ADMITTED.
--
-- THE SHAPE, GREPPED REPO-WIDE. Every `create function` in
-- `supabase/migrations` was classified by security clause — remembering that
-- SECURITY INVOKER IS THE POSTGRESQL DEFAULT, so a missing clause is an invoker
-- function and not a definer one. 102 functions: 87 explicit definer, 15
-- invoker. Of the 15, fourteen read no table at all (`updated_at` touchers, GUC
-- token guards, jsonb OLD/NEW comparators, two `immutable` pure helpers) and
-- the fifteenth is this one. Policy expressions, which always evaluate as the
-- caller, were checked separately: all 40 subquery-bearing policies are
-- authorisation checks, where "may this caller see the parent row" IS the
-- intended question and each child policy's arms match the parent's
-- `SELECT` policy arms. The only other `not exists` over an RLS-protected table
-- sits in `submit_accommodation_request`, which is `security definer`.
--
-- So this was the sole instance. The rule to apply next time, before writing
-- one: an `EXISTS` whose intent is "does this row exist" must be evaluated
-- somewhere that bypasses RLS. Only an `EXISTS` whose intent is "may this
-- caller see this row" belongs under invoker rights.
--
-- This replaces the function body and its security clause only. The trigger,
-- its name, and its WHEN-clause-free registration are untouched.

create or replace function public.accommodation_requests_freeze()
returns trigger
language plpgsql
security definer
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
  -- Session state, so `security definer` does not change what this reads.
  v_token := pg_catalog.current_setting('pet10x.accom_write', true) is not distinct from 'ok';
  perform pg_catalog.set_config('pet10x.accom_write', '', true);

  -- The three referential SET NULLs, stated as facts about the row rather than
  -- as an exemption for a caller. Each is true only when the referenced row has
  -- actually gone — AUTHORITATIVELY gone, because this function is now
  -- `security definer` and its owner bypasses RLS. Read under invoker rights
  -- these same three lines answered "the caller cannot see it", which is not
  -- the same fact and is not the one the exemption is entitled to.
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
  --    referential cases above. `auth.uid()` reads the JWT claims GUC, not the
  --    executing role, so this still names the human under `security definer`.
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
  'BEFORE UPDATE guard on accommodation_requests. Refuses identity changes (resident_id, building_id, created_at) outright; refuses ladder/decision changes without the single-use pet10x.accom_write token minted by the accommodation RPCs; refuses content changes (animal_desc, type, pet_id, unit_id) by anyone but the owning resident while draft or info_requested. Permits exactly one further thing: a reference column going NULL when the row it named no longer exists, which is what an `on delete set null` referential action does. SECURITY DEFINER, and that is load-bearing rather than incidental: under SECURITY INVOKER the three `not exists` probes ran beneath the caller''s own RLS, so a pet, unit or departed manager the caller merely could not SEE was indistinguishable from one that was gone, and the exemption could be used to erase a live link. The body writes nothing and returns NEW on every path, so definer rights can only refuse, never widen. Spends the token unconditionally on every pass. Raises 42501. A trigger is not RLS: is_admin() transcends the policies and transcends nothing here.';
