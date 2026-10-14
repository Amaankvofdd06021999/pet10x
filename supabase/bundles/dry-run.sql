-- DRY RUN — generated 2026-10-14 from branch ux-required-fixes by bundles/build.sh.
-- Applies every migration from 20261015000001 on, runs supabase/tests/part-*.sql,
-- then RAISES ON PURPOSE so the whole transaction rolls back. Nothing is saved.
-- SUCCESS looks like the error:  DRY RUN OK — ...
-- Any other error is the first thing that broke; fix it before running apply.sql.
begin;

-- ===== migration 20261015000001_decision_reasons.sql =====
-- Pet10x — a denied registration or a refused link says why, and the person
-- it is about is told either way.
--
-- THE GAP. Two manager decisions recorded nothing about themselves:
--
--   * manager_decide_registration(p_pet, p_approve) flipped
--     pets.registration_status and returned. No reason could be given, no
--     notification was sent, no audit row was written. An owner whose pet was
--     denied found out — if at all — by noticing a badge had changed, with no
--     way to learn what to fix.
--   * Resident links had no function at all. lib/data/live.ts decideLink() did
--     a direct UPDATE of resident_links (status, decided_at, decided_by,
--     left_at). A resident who was refused, or removed from their building,
--     was never told, and the building's audit log never heard of it.
--
-- The definition replaced below is the one read from production on
-- 2026-10-14 (pg_get_functiondef), not a migration file — local files have
-- drifted (docs/superpowers/2026-08-23-migration-drift.md).
--
-- WHAT THIS DOES
--
--   1. manager_decide_registration gains `p_note text default null`.
--      Deny REQUIRES a note (trimmed; whitespace is not a reason), at most
--      2000 characters — the same rule pet document rejections and
--      accommodation denials follow, for the same reason: a "no" the owner
--      cannot learn the reason for is a dead end. Approve takes an optional
--      note. Both outcomes now notify the owner (kind `building`, opening
--      pet-detail:<pet>) and write audit_log `pet.registration_decided`.
--      The 'forbidden' refusal keeps its words and gains errcode 42501.
--      The old 2-argument overload is DROPPED, not left beside the new one:
--      two overloads would make a 2-argument call ambiguous. A client still
--      sending only (p_pet, p_approve) resolves to the new function through
--      the default — and a deny sent that way is now refused (22023).
--
--   2. manager_decide_link(p_link, p_decision, p_reason) is new, and is the
--      manager's way to decide a resident's link. The moves that exist:
--
--          approve   pending  -> approved
--          deny      pending  -> denied
--          remove    approved -> left      (left_at = now())
--
--      Anything else is 22023. It stamps decided_at/decided_by, notifies the
--      resident (opening link-building), quotes the optional reason as
--      "Reason: …", and writes audit_log `resident_link.decided`.
--      Returns {ok:true, status, from} or {ok:false, error:'not_found'}.
--
-- WHAT IT DOES NOT TOUCH
--
--   * Pets on a link change: trg_sync_pets_on_link (sync_pets_on_link_change)
--     already attaches a resident's pets on approve and detaches them on
--     deny/left from approved. This function only moves the status, so that
--     trigger keeps doing it, once.
--   * The direct UPDATE path on resident_links stays open (its RLS policies
--     are unchanged); the client simply stops using it for these decisions.
--   * request_building_link, info_requested_at, and the registration enum.

-- ---------------------------------------------------------------------------
-- 1. Registration decisions
-- ---------------------------------------------------------------------------

drop function if exists public.manager_decide_registration(uuid, boolean);

create or replace function public.manager_decide_registration(
  p_pet     uuid,
  p_approve boolean,
  p_note    text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pet  public.pets%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  -- The live check, unchanged in meaning: the pet must exist AND the caller
  -- must manage its building (or be an admin). It comes first, so nothing
  -- about the note is evaluated for someone with no right to decide.
  if not exists (
    select 1 from public.pets p
    where p.id = p_pet and (public.manages_building(p.building_id) or public.is_admin())
  ) then
    raise exception 'forbidden: not a manager of this pet''s building'
      using errcode = '42501';
  end if;

  -- `coalesce(p_approve, false)`: a NULL decision is treated as a deny, which
  -- is what the live CASE did — and a deny needs a reason.
  if not coalesce(p_approve, false) and v_note is null then
    raise exception 'A reason is required to deny a registration.'
      using errcode = '22023',
            hint    = 'Tell the owner what to fix, so they can apply again.';
  end if;

  if length(v_note) > 2000 then
    raise exception 'The reason is too long (% characters).', length(v_note)
      using errcode = '22023',
            hint    = 'Keep it to 2000 characters or fewer.';
  end if;

  select * into v_pet from public.pets where id = p_pet for update;

  update public.pets
     set registration_status = case when p_approve then 'approved'::registration_status
                                     else 'denied'::registration_status end
   where id = p_pet;

  insert into public.notifications (profile_id, kind, severity, title, body,
                                    action_label, action_target, building_id)
  values (
    v_pet.owner_id,
    'building',
    case when p_approve then 'success' else 'warning' end,
    case when p_approve then v_pet.name || ' is registered with your building'
         else v_pet.name || '''s registration was not approved' end,
    case when p_approve
         then 'Your building''s management approved ' || v_pet.name || '''s registration.'
              || coalesce(' ' || v_note, '')
         else 'Your building''s management did not approve ' || v_pet.name || '''s registration. '
              || 'Reason: ' || v_note end,
    'Open ' || v_pet.name,
    'pet-detail:' || v_pet.id::text,
    v_pet.building_id
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'pet.registration_decided', 'pet', p_pet, v_pet.building_id,
          jsonb_build_object('from', v_pet.registration_status::text,
                             'to', case when p_approve then 'approved' else 'denied' end,
                             'owner_id', v_pet.owner_id,
                             'note', v_note));
end;
$function$;

comment on function public.manager_decide_registration(uuid, boolean, text) is
  'Manager (of the pet''s building) or admin approves or denies a pet''s registration (20261015000001). Deny REQUIRES p_note (trimmed, <= 2000 chars); approve takes an optional one. Notifies the owner (kind building, pet-detail:<pet>; a deny quotes "Reason: <note>") and audits pet.registration_decided. Raises 42501 forbidden, 22023 for a missing or over-long note.';

revoke all on function public.manager_decide_registration(uuid, boolean, text) from public, anon;
grant execute on function public.manager_decide_registration(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Resident link decisions
-- ---------------------------------------------------------------------------

create or replace function public.manager_decide_link(
  p_link     uuid,
  p_decision text,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link     public.resident_links%rowtype;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_to       public.resident_link_status;
  v_building text;
begin
  -- FOR UPDATE: two managers tapping at once cannot both pass the transition
  -- check below.
  select * into v_link from public.resident_links where id = p_link for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS, so the scope check is by hand, and comes
  -- before anything about the link is revealed — including whether the move
  -- would have been legal.
  if not (public.manages_building(v_link.building_id) or public.is_admin()) then
    raise exception 'forbidden: not a manager of this link''s building'
      using errcode = '42501';
  end if;

  if length(v_reason) > 2000 then
    raise exception 'The reason is too long (% characters).', length(v_reason)
      using errcode = '22023',
            hint    = 'Keep it to 2000 characters or fewer.';
  end if;

  -- The only moves that exist. Anything else — an unknown decision, a NULL
  -- one (`null = 'approve'` is NULL, so no branch matches), removing a link
  -- that was never approved, approving one twice — leaves v_to NULL.
  v_to := case
    when p_decision = 'approve' and v_link.status = 'pending'  then 'approved'::public.resident_link_status
    when p_decision = 'deny'    and v_link.status = 'pending'  then 'denied'::public.resident_link_status
    when p_decision = 'remove'  and v_link.status = 'approved' then 'left'::public.resident_link_status
  end;
  if v_to is null then
    raise exception 'You can''t % a link that is %.', coalesce(left(p_decision, 40), '(no decision)'), v_link.status
      using errcode = '22023',
            hint    = 'Pending requests can be approved or denied; approved residents can be removed.';
  end if;

  -- trg_sync_pets_on_link fires on this UPDATE and moves the resident's pets.
  update public.resident_links
     set status     = v_to,
         decided_at = now(),
         decided_by = auth.uid(),
         left_at    = case when v_to = 'left' then now() else left_at end
   where id = p_link;

  select coalesce(nullif(btrim(b.name), ''), 'your building') into v_building
    from public.buildings b where b.id = v_link.building_id;
  v_building := coalesce(v_building, 'your building');

  insert into public.notifications (profile_id, kind, severity, title, body,
                                    action_label, action_target, building_id)
  values (
    v_link.profile_id,
    'building',
    case when v_to = 'approved' then 'success' else 'warning' end,
    case v_to
      when 'approved' then 'Welcome to ' || v_building
      when 'denied'   then 'Your request to join ' || v_building || ' was not approved'
      else 'You were removed from ' || v_building
    end,
    case v_to
      when 'approved' then 'Your building''s management approved your request to join ' || v_building || '.'
      when 'denied'   then 'Your building''s management did not approve your request to join ' || v_building || '.'
      else 'Your building''s management removed you from ' || v_building || '.'
    end || coalesce(' Reason: ' || v_reason, ''),
    'View building',
    'link-building',
    v_link.building_id
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'resident_link.decided', 'resident_link', p_link, v_link.building_id,
          jsonb_build_object('decision', p_decision,
                             'from', v_link.status::text,
                             'to', v_to::text,
                             'resident_id', v_link.profile_id,
                             'reason', v_reason));

  return jsonb_build_object('ok', true, 'status', v_to::text, 'from', v_link.status::text);
end;
$$;

comment on function public.manager_decide_link(uuid, text, text) is
  'Manager (of the link''s building) or admin decides a resident link (20261015000001). approve: pending -> approved; deny: pending -> denied; remove: approved -> left (left_at). Anything else raises 22023; a non-manager raises 42501. Stamps decided_at/decided_by, notifies the resident (kind building, link-building) quoting the optional p_reason (<= 2000 chars) as "Reason: …", audits resident_link.decided. trg_sync_pets_on_link moves the pets. Returns {ok:true, status, from} or {ok:false, error:''not_found''}.';

revoke all on function public.manager_decide_link(uuid, text, text) from public, anon;
grant execute on function public.manager_decide_link(uuid, text, text) to authenticated;


-- ===== checks part-g =====
-- Part G — building managers' decisions carry reasons, and the person decided
-- about is told, in ONE rolled-back transaction.
--
-- Covers 20261015000001:
--   * manager_decide_registration — a deny with a note notifies the owner and
--     the body quotes the note; a whitespace-only note, and a 2-argument deny
--     with no note at all, are refused (22023); an approve with no note is
--     allowed and notifies too; a non-manager is refused (42501); both
--     decisions are audit-logged.
--   * manager_decide_link — approve, remove and deny each move the link,
--     stamp decided_at/decided_by, notify the resident (the reason quoted when
--     given) and write audit_log; removing a link that is still pending, and a
--     decision outside the grammar, are refused (22023); a non-manager is
--     refused (42501).
--
-- Actors are chosen from live data, not invented: Maple Court Residences
-- (MCR2026), a non-admin manager of it, and two non-admin profiles that manage
-- no building (an owner and an outsider). Each is asserted is_admin() = false
-- inside its own impersonation, because every check here carries is_admin() as
-- a disjunct and an admin control proves nothing. The pet and the two links
-- are fixtures planted in this transaction.
--
-- Not yet run: written before the migration was applied (no database was
-- reachable from the session that wrote it). Run it after it is, as the
-- project's own connection role (the Supabase SQL editor or MCP
-- `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-g.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written.
--
-- Rows this transaction writes are found by `created_at >= now()`: now() is
-- the transaction's start time, and column defaults use the same clock, so
-- that matches only what was written here.

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_building uuid; v_manager uuid; v_owner uuid; v_outsider uuid;
  v_pet uuid; v_link_a uuid; v_link_b uuid;
begin
  select b.id into v_building from public.buildings b where upper(b.building_code) = 'MCR2026';
  if v_building is null then raise exception 'FIXTURE: building MCR2026 not found'; end if;

  select bm.profile_id into v_manager
    from public.building_managers bm join public.profiles pr on pr.id = bm.profile_id
   where bm.building_id = v_building and not pr.is_suspended
     and not coalesce(pr.is_super_admin, false)
   order by bm.created_at, bm.profile_id limit 1;
  if v_manager is null then raise exception 'FIXTURE: no non-admin manager of MCR2026'; end if;

  select pr.id into v_owner from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_outsider from public.profiles pr
   where pr.id <> v_owner and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
   order by pr.created_at, pr.id limit 1;
  if v_owner is null or v_outsider is null then
    raise exception 'FIXTURE: need two non-admin profiles that manage no building';
  end if;

  -- A pet waiting on a registration decision in MCR2026.
  insert into public.pets (owner_id, name, species, building_id, registration_status)
  values (v_owner, 'Part G Biscuit', 'dog', v_building, 'pending')
  returning id into v_pet;

  -- Two pending link requests: A will be approved then removed; B will be
  -- refused an illegal removal, then denied with a reason.
  insert into public.resident_links (profile_id, building_id, status)
  values (v_owner, v_building, 'pending') returning id into v_link_a;
  insert into public.resident_links (profile_id, building_id, status)
  values (v_outsider, v_building, 'pending') returning id into v_link_b;

  perform set_config('part_g.building', v_building::text, true);
  perform set_config('part_g.manager', v_manager::text, true);
  perform set_config('part_g.owner', v_owner::text, true);
  perform set_config('part_g.outsider', v_outsider::text, true);
  perform set_config('part_g.pet', v_pet::text, true);
  perform set_config('part_g.link_a', v_link_a::text, true);
  perform set_config('part_g.link_b', v_link_b::text, true);
  raise notice 'fixtures: building % manager % owner % outsider % pet % links % %',
    v_building, v_manager, v_owner, v_outsider, v_pet, v_link_a, v_link_b;
end $$;

-- ===========================================================================
-- 1. A non-manager decides nothing
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: outsider is an admin'; end if;
  begin
    perform public.manager_decide_registration(current_setting('part_g.pet')::uuid, false, 'Not my building');
    raise exception 'FAIL: a non-manager denied a registration';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.manager_decide_registration(current_setting('part_g.pet')::uuid, true);
    raise exception 'FAIL: a non-manager approved a registration';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.manager_decide_link(current_setting('part_g.link_a')::uuid, 'approve');
    raise exception 'FAIL: a non-manager approved a link';
  exception when insufficient_privilege then null;
  end;
  begin
    -- Their own link, too: being the resident is not being the manager.
    perform public.manager_decide_link(current_setting('part_g.link_b')::uuid, 'approve');
    raise exception 'FAIL: a resident approved their own link';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: a non-manager is refused (42501) on registrations and links';
end $$;

-- ===========================================================================
-- 2. Registration: a deny needs a reason; an approve does not
-- ===========================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.manager'), 'role', 'authenticated')::text, true);
do $$
declare v_pet uuid := current_setting('part_g.pet')::uuid;
begin
  if public.is_admin() then raise exception 'FIXTURE: manager is an admin'; end if;
  if not public.manages_building(current_setting('part_g.building')::uuid) then
    raise exception 'FIXTURE: manager does not manage MCR2026';
  end if;

  begin
    perform public.manager_decide_registration(v_pet, false, E'   \t  ');
    raise exception 'FAIL: a whitespace-only note was accepted as a reason';
  exception when invalid_parameter_value then null;
  end;
  begin
    -- The 2-argument call an old client sends: it resolves (the default), and
    -- is refused because a deny has no reason.
    perform public.manager_decide_registration(v_pet, false);
    raise exception 'FAIL: a deny with no note was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.manager_decide_registration(v_pet, false, repeat('x', 2001));
    raise exception 'FAIL: a 2001-character note was accepted';
  exception when invalid_parameter_value then null;
  end;
  if (select registration_status from public.pets where id = v_pet) <> 'pending' then
    raise exception 'FAIL: a refused deny still changed the registration';
  end if;

  perform public.manager_decide_registration(v_pet, false, '  Over the weight limit  ');
  if (select registration_status from public.pets where id = v_pet) <> 'denied' then
    raise exception 'FAIL: the deny did not deny';
  end if;

  perform public.manager_decide_registration(v_pet, true);
  if (select registration_status from public.pets where id = v_pet) <> 'approved' then
    raise exception 'FAIL: the approve with no note did not approve';
  end if;
  raise notice 'ok: blank, missing and over-long reasons are refused (22023); a reasoned deny and a bare approve go through';
end $$;

-- ===========================================================================
-- 3. Links: approve, remove and deny move along the grammar and no further
-- ===========================================================================
do $$
declare
  v_a uuid := current_setting('part_g.link_a')::uuid;
  v_b uuid := current_setting('part_g.link_b')::uuid;
  v jsonb;
begin
  begin
    perform public.manager_decide_link(v_b, 'remove', 'Never lived here');
    raise exception 'FAIL: a pending link was removed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.manager_decide_link(v_b, 'revoke');
    raise exception 'FAIL: a decision outside the grammar was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.manager_decide_link(v_b, null);
    raise exception 'FAIL: a null decision was accepted';
  exception when invalid_parameter_value then null;
  end;

  v := public.manager_decide_link(gen_random_uuid(), 'approve');
  if coalesce((v->>'ok')::boolean, true) or v->>'error' <> 'not_found' then
    raise exception 'FAIL: a missing link did not answer not_found: %', v;
  end if;

  v := public.manager_decide_link(v_a, 'approve');
  if not coalesce((v->>'ok')::boolean, false) or v->>'status' <> 'approved' then
    raise exception 'FAIL: approve was refused: %', v;
  end if;
  begin
    perform public.manager_decide_link(v_a, 'approve');
    raise exception 'FAIL: an approved link was approved again';
  exception when invalid_parameter_value then null;
  end;

  v := public.manager_decide_link(v_a, 'remove', 'Moved out in September');
  if not coalesce((v->>'ok')::boolean, false) or v->>'status' <> 'left' then
    raise exception 'FAIL: remove was refused: %', v;
  end if;

  v := public.manager_decide_link(v_b, 'deny', '  Unit number does not match  ');
  if not coalesce((v->>'ok')::boolean, false) or v->>'status' <> 'denied' then
    raise exception 'FAIL: deny was refused: %', v;
  end if;
  raise notice 'ok: approve, remove and deny go through; illegal moves are refused (22023); a missing link is not_found';
end $$;

-- ===========================================================================
-- 4. What was written: statuses, notifications, audit rows
-- ===========================================================================
reset role;
do $$
declare
  v_pet uuid := current_setting('part_g.pet')::uuid;
  v_owner uuid := current_setting('part_g.owner')::uuid;
  v_outsider uuid := current_setting('part_g.outsider')::uuid;
  v_manager uuid := current_setting('part_g.manager')::uuid;
  v_a uuid := current_setting('part_g.link_a')::uuid;
  v_b uuid := current_setting('part_g.link_b')::uuid;
  v_n int;
  v_link record;
begin
  -- Registration: the owner was told both times, and the deny quotes the note.
  select count(*) into v_n from public.notifications
   where profile_id = v_owner and created_at >= now()
     and action_target = 'pet-detail:' || v_pet::text
     and kind = 'building' and severity = 'warning'
     and body like '%Reason: Over the weight limit';
  if v_n <> 1 then raise exception 'FAIL: the owner got % deny notifications quoting the note, expected 1', v_n; end if;

  select count(*) into v_n from public.notifications
   where profile_id = v_owner and created_at >= now()
     and action_target = 'pet-detail:' || v_pet::text
     and kind = 'building' and severity = 'success';
  if v_n <> 1 then raise exception 'FAIL: the owner got % approve notifications, expected 1', v_n; end if;

  select count(*) into v_n from public.audit_log
   where action = 'pet.registration_decided' and entity_id = v_pet and actor_id = v_manager
     and created_at >= now();
  if v_n <> 2 then raise exception 'FAIL: % registration audit rows, expected 2', v_n; end if;
  if not exists (select 1 from public.audit_log
                  where action = 'pet.registration_decided' and entity_id = v_pet
                    and metadata->>'to' = 'denied' and metadata->>'note' = 'Over the weight limit') then
    raise exception 'FAIL: the deny''s audit row does not carry the trimmed note';
  end if;
  raise notice 'ok: the owner is notified on approve and deny, the deny quotes the reason, both are audited';

  -- Link A: approved, then removed.
  select * into v_link from public.resident_links where id = v_a;
  if v_link.status <> 'left' or v_link.left_at is null
     or v_link.decided_by is distinct from v_manager or v_link.decided_at is null then
    raise exception 'FAIL: link A is not a stamped removal: %', row_to_json(v_link);
  end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_owner and created_at >= now() and action_target = 'link-building'
     and severity = 'success' and title like 'Welcome to %';
  if v_n <> 1 then raise exception 'FAIL: the resident got % welcome notifications, expected 1', v_n; end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_owner and created_at >= now() and action_target = 'link-building'
     and severity = 'warning' and title like 'You were removed from %'
     and body like '%Reason: Moved out in September';
  if v_n <> 1 then raise exception 'FAIL: the resident got % removal notifications quoting the reason, expected 1', v_n; end if;

  -- Link B: denied, with the trimmed reason quoted.
  select * into v_link from public.resident_links where id = v_b;
  if v_link.status <> 'denied' or v_link.left_at is not null
     or v_link.decided_by is distinct from v_manager or v_link.decided_at is null then
    raise exception 'FAIL: link B is not a stamped denial: %', row_to_json(v_link);
  end if;
  select count(*) into v_n from public.notifications
   where profile_id = v_outsider and created_at >= now() and action_target = 'link-building'
     and severity = 'warning' and body like '%Reason: Unit number does not match';
  if v_n <> 1 then raise exception 'FAIL: the denied resident got % notifications quoting the reason, expected 1', v_n; end if;

  select count(*) into v_n from public.audit_log
   where action = 'resident_link.decided' and entity_id in (v_a, v_b) and actor_id = v_manager
     and created_at >= now();
  if v_n <> 3 then raise exception 'FAIL: % link audit rows, expected 3', v_n; end if;
  raise notice 'ok: each link decision is stamped, notified (reason quoted) and audited';
end $$;

rollback to savepoint checks; reset role;


do $$ begin raise exception 'DRY RUN OK — all migrations applied and every check passed; rolled back, nothing saved'; end $$;
