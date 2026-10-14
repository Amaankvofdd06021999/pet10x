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
--      It decides only a PENDING registration (22023 otherwise): the live
--      version would re-decide anything, so a second tap re-notified the
--      owner. Every manager queue lists pending pets only
--      (lib/data/manager-queues.ts), so a denied pet is not re-decided from
--      the app — the owner applies again, which puts it back to pending.
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
--      Anything else is 22023. Approving a resident who already holds an
--      approved link to the same building returns {ok:false,
--      error:'already_member'} instead of a raw unique-violation.
--      It stamps decided_at/decided_by, notifies the resident (opening
--      link-building), quotes the optional reason as "Reason: …", and writes
--      audit_log `resident_link.decided`.
--      Returns {ok:true, status, from} or {ok:false, error: not_found |
--      already_member}.
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
set search_path = public, pg_temp
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

  -- FOR UPDATE, then the state check: two taps (or two managers) cannot both
  -- decide, and the second gets a sentence instead of a second notification.
  select * into v_pet from public.pets where id = p_pet for update;
  if not coalesce(v_pet.registration_status = 'pending', false) then
    -- The code rides in DETAIL; the message is the sentence the manager sees.
    raise exception 'This registration has already been decided (it is %).',
                    v_pet.registration_status
      using errcode = '22023',
            detail  = 'not_pending',
            hint    = 'Only a pending registration can be approved or denied.';
  end if;

  update public.pets
     set registration_status = case when p_approve then 'approved'::public.registration_status
                                     else 'denied'::public.registration_status end
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
              || coalesce(' Note: ' || v_note, '')
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
  'Manager (of the pet''s building) or admin approves or denies a pet''s registration (20261015000001). Only a pending registration (else 22023 not_pending). Deny REQUIRES p_note (trimmed, <= 2000 chars); approve takes an optional one, quoted as "Note: <note>". Notifies the owner (kind building, pet-detail:<pet>; a deny quotes "Reason: <note>") and audits pet.registration_decided. Raises 42501 forbidden, 22023 for a missing or over-long note.';

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
  if p_decision = 'approve' and v_link.status = 'pending' and exists (
    select 1 from public.resident_links rl
     where rl.profile_id = v_link.profile_id and rl.building_id = v_link.building_id
       and rl.status = 'approved' and rl.id <> v_link.id
  ) then
    -- Approving would collide with resident_links_active_uniq (23505). Say
    -- what is true instead: they are already in.
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end if;

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
  'Manager (of the link''s building) or admin decides a resident link (20261015000001). approve: pending -> approved; deny: pending -> denied; remove: approved -> left (left_at). Anything else raises 22023; a non-manager raises 42501. Stamps decided_at/decided_by, notifies the resident (kind building, link-building) quoting the optional p_reason (<= 2000 chars) as "Reason: …", audits resident_link.decided. trg_sync_pets_on_link moves the pets. Returns {ok:true, status, from} or {ok:false, error: not_found | already_member}.';

revoke all on function public.manager_decide_link(uuid, text, text) from public, anon;
grant execute on function public.manager_decide_link(uuid, text, text) to authenticated;


-- ===== migration 20261015000002_admin_delete_business.sql =====
-- Pet10x — deleting a business says what it holds, needs its name typed, and
-- refuses while clinic records exist.
--
-- THE GAP. `delete from businesses` cascades through 36 tables (clinic_patients,
-- visits, invoices, appointments, record_shares, …) and sets business_id NULL
-- on four more (pet_documents, pet_vaccinations, service_bookings,
-- record_desk_codes). Two client roles could start that from the browser:
--
--   * an admin, from the console's trash icon (lib/data/admin.ts
--     deleteBusiness), after one window.confirm that said "removes their
--     listings" — nothing about patients, visits or invoices;
--   * the business's OWNER, with a direct PostgREST delete — nothing in the
--     app does it, nothing in the database stopped it.
--
-- The policies that allowed it, read from production on 2026-10-14
-- (`select policyname, cmd, qual, with_check from pg_policies
--   where tablename = 'businesses' and cmd in ('DELETE','ALL')`):
--
--   businesses_admin_all    ALL  USING is_admin()               WITH CHECK is_admin()
--   businesses_owner_write  ALL  USING (owner_id = auth.uid())  WITH CHECK (owner_id = auth.uid())
--
-- Both are `for all`, so each one is also a DELETE policy. (The other two,
-- businesses_select and businesses_staff_read, are SELECT only and stay.)
--
-- WHAT THIS DOES
--
--   1. NO CLIENT ROLE DELETES A BUSINESS. Each `for all` policy is replaced by
--      select / insert / update policies with the IDENTICAL predicate, and no
--      delete policy. A direct delete by an admin or an owner now matches no
--      rows (RLS filters; it does not raise). Reads, the owner's inserts and
--      edits are untouched: every predicate is the one it replaces. The replaced
--      policies are checked before they are dropped (name, ALL, PERMISSIVE,
--      roles {public}, USING and WITH CHECK text): if either is not what this
--      was written against, or a third DELETE/ALL policy exists, the migration
--      stops rather than replace something unseen.
--
--      Still able to delete: the account-deletion route
--      (app/api/account/delete/route.ts), which runs as service_role after its
--      own deletionBlocker checks, and admin_delete_business below. Neither is
--      a client role under RLS.
--
--   2. admin_business_footprint(p_business) -> jsonb
--        {patients, visits, invoices, staff, open_bookings, appointments}
--      What deleting would take with it, for the console's confirmation.
--        patients       clinic_patients rows
--        visits         visits rows
--        invoices       invoices rows (any status)
--        staff          ACTIVE business_staff other than the owner — the
--                       owner's own row is made by business_bootstrap for
--                       every business, so counting it would say "1" always
--        open_bookings  service_bookings requested | confirmed | in_progress —
--                       the same set lib/account-deletion.ts OPEN_BOOKING uses
--        appointments   starts_at in the future and not cancelled
--      Admin only (42501); a missing business is P0002.
--
--   3. admin_delete_business(p_business, p_confirm_name) -> jsonb
--      Locks the business row FOR UPDATE first: a child row's foreign key
--      takes FOR KEY SHARE on it, so no patient, visit or booking can be added
--      between the count and the delete. Then, in order:
--        not found                    {ok:false, error:'not_found'}
--        name does not match          {ok:false, error:'name_mismatch'}
--          — exact after trimming both sides; case-sensitive; a blank name
--            never matches
--        patients + visits + invoices > 0, or open_bookings > 0
--                                     {ok:false, error:'has_records', footprint}
--        otherwise                    delete, audit_log business.deleted
--                                     (name, owner, tier, footprint),
--                                     {ok:true}
--      Admin only (42501). A business with clinic records is set to
--      Registered instead (admin_set_business_tier) — that keeps its records
--      and takes it out of owner search.
--
-- HOW THIS DIFFERS FROM THE ACCOUNT ROUTE'S deletionBlocker (lib/account-deletion.ts)
--
--   same       clinic patients block; open bookings (same three statuses) block
--   wider      visits and invoices block here too. A visit needs a patient
--              (visits.patient_id is NOT NULL), so it adds nothing today; an
--              invoice may name no patient, and is a financial record either way.
--   narrower   other active staff do NOT block here. The route refuses because
--              an owner leaving would strand colleagues; an admin deleting an
--              empty business removes only staff ROWS — those people keep their
--              accounts — and the count is shown in the confirmation.
--   shown only future appointments are counted, never blocking (as in the route,
--              which does not look at them at all).
--
-- WHAT IT DOES NOT TOUCH
--
--   * Table privileges. DELETE stays granted to authenticated; RLS answers it
--     with zero rows, which is the same answer it gives for any row a caller
--     cannot see.
--   * The account-deletion route and its blocker.

-- ---------------------------------------------------------------------------
-- 1. Businesses: no delete policy for any client role
-- ---------------------------------------------------------------------------

do $$
declare
  v record;
  v_expected constant jsonb := jsonb_build_object(
    'businesses_admin_all',   jsonb_build_object('qual', 'is_admin()',              'check', 'is_admin()'),
    'businesses_owner_write', jsonb_build_object('qual', '(owner_id = auth.uid())', 'check', '(owner_id = auth.uid())'));
  v_seen int := 0;
begin
  for v in
    select policyname, cmd, permissive, roles, qual, with_check
      from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'businesses' and cmd in ('DELETE', 'ALL')
  loop
    if not (v_expected ? v.policyname::text) then
      raise exception 'policy public.businesses.% (%) was not expected; nothing was replaced', v.policyname, v.cmd
        using detail = pg_catalog.format('USING %s WITH CHECK %s', v.qual, v.with_check);
    end if;
    if v.cmd <> 'ALL' or v.permissive <> 'PERMISSIVE' or v.roles <> '{public}'::name[]
       or v.qual is distinct from (v_expected -> v.policyname::text ->> 'qual')
       or v.with_check is distinct from (v_expected -> v.policyname::text ->> 'check') then
      raise exception 'policy public.businesses.% is not the shape this was written against; nothing was replaced', v.policyname
        using detail = pg_catalog.format('cmd %s %s roles %s USING %s WITH CHECK %s',
                                         v.cmd, v.permissive, v.roles, v.qual, v.with_check);
    end if;
    v_seen := v_seen + 1;
  end loop;
  if v_seen <> 2 then
    raise exception 'expected businesses_admin_all and businesses_owner_write, found % of them; nothing was replaced', v_seen;
  end if;
end $$;

drop policy businesses_admin_all on public.businesses;
drop policy businesses_owner_write on public.businesses;

-- Admins: everything except delete.
create policy businesses_admin_select on public.businesses
  for select using (public.is_admin());
create policy businesses_admin_insert on public.businesses
  for insert with check (public.is_admin());
create policy businesses_admin_update on public.businesses
  for update using (public.is_admin()) with check (public.is_admin());

-- Owners: their own business, everything except delete. The clinic onboarding
-- screen inserts from the browser with owner_id = the caller (an INSERT …
-- RETURNING also needs the select policy, which this keeps); lib/data/business.ts
-- updates the owner's row. tier and is_verified stay guarded by
-- trg_business_verification_guard, a trigger, which this does not touch.
create policy businesses_owner_select on public.businesses
  for select using (owner_id = auth.uid());
create policy businesses_owner_insert on public.businesses
  for insert with check (owner_id = auth.uid());
create policy businesses_owner_update on public.businesses
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

do $$
declare v text;
begin
  select string_agg(policyname || ' (' || cmd || ')', ', ') into v
    from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'businesses' and cmd in ('DELETE', 'ALL');
  if v is not null then
    raise exception 'public.businesses still has a delete path for a client role: %', v;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. admin_business_footprint
-- ---------------------------------------------------------------------------

create or replace function public.admin_business_footprint(p_business uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can see what a business holds'
      using errcode = '42501';
  end if;

  select b.owner_id into v_owner from public.businesses b where b.id = p_business;
  if not found then
    raise exception 'That business no longer exists' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'patients',      (select count(*) from public.clinic_patients cp where cp.business_id = p_business),
    'visits',        (select count(*) from public.visits v where v.business_id = p_business),
    'invoices',      (select count(*) from public.invoices i where i.business_id = p_business),
    -- The owner's own staff row exists for every business (business_bootstrap).
    'staff',         (select count(*) from public.business_staff s
                       where s.business_id = p_business and s.is_active and s.profile_id <> v_owner),
    -- lib/account-deletion.ts OPEN_BOOKING: what the business still has to act on.
    'open_bookings', (select count(*) from public.service_bookings sb
                       where sb.business_id = p_business
                         and sb.status in ('requested', 'confirmed', 'in_progress')),
    'appointments',  (select count(*) from public.appointments a
                       where a.business_id = p_business and a.starts_at > now()
                         and a.status <> 'cancelled')
  );
end;
$$;

comment on function public.admin_business_footprint(uuid) is
  'Admin only (20261015000002). What deleting a business would take with it: {patients, visits, invoices, staff (active, not the owner), open_bookings (requested|confirmed|in_progress), appointments (future, not cancelled)}. Raises 42501 not admin, P0002 missing business.';

revoke all on function public.admin_business_footprint(uuid) from public, anon;
grant execute on function public.admin_business_footprint(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. admin_delete_business
-- ---------------------------------------------------------------------------

create or replace function public.admin_delete_business(p_business uuid, p_confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_biz   record;
  v_given text := btrim(coalesce(p_confirm_name, ''));
  v_fp    jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can delete a business'
      using errcode = '42501';
  end if;

  -- FOR UPDATE before counting: a new patient, visit, invoice or booking takes
  -- FOR KEY SHARE on this row through its foreign key, so it waits until this
  -- transaction ends — the count below is still true when the delete runs.
  select b.id, b.name, b.owner_id, b.tier into v_biz
    from public.businesses b where b.id = p_business for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Typed name, exact after trimming both sides. Case counts: the point is
  -- that the admin looked at WHICH business this is.
  if v_given = '' or v_given <> btrim(v_biz.name) then
    return jsonb_build_object('ok', false, 'error', 'name_mismatch');
  end if;

  v_fp := public.admin_business_footprint(p_business);
  if (v_fp->>'patients')::bigint + (v_fp->>'visits')::bigint + (v_fp->>'invoices')::bigint > 0
     or (v_fp->>'open_bookings')::bigint > 0 then
    return jsonb_build_object('ok', false, 'error', 'has_records', 'footprint', v_fp);
  end if;

  delete from public.businesses where id = p_business;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'business.deleted', 'business', p_business,
          jsonb_build_object('name', v_biz.name, 'owner_id', v_biz.owner_id,
                             'tier', v_biz.tier, 'footprint', v_fp));

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.admin_delete_business(uuid, text) is
  'Admin only (20261015000002); the only way a signed-in client deletes a business (no client delete policy on businesses). Locks the row, then: {ok:false,error:not_found}; {ok:false,error:name_mismatch} unless p_confirm_name equals the name exactly after trimming both (case-sensitive, blank never matches); {ok:false,error:has_records,footprint} when patients+visits+invoices > 0 or open bookings exist; else deletes, audits business.deleted and returns {ok:true}. Raises 42501 not admin.';

revoke all on function public.admin_delete_business(uuid, text) from public, anon;
grant execute on function public.admin_delete_business(uuid, text) to authenticated;


-- ===== migration 20261015000003_verification_needs_info.sql =====
-- Pet10x — an admin can ask a clinic for more information, and the clinic can
-- answer without a new request.
--
-- THE GAP. The console could only approve or reject a verification request.
-- A request missing a licence number had to be rejected, and the clinic then
-- started again. A direct `needs_info` update by the admin worked
-- (business_verifications_status_check allows it; bver_admin is FOR ALL) but
-- told the owner nothing, and left the clinic stuck: needs_info counts as open
-- under business_verifications_one_open, there is no clinic UPDATE policy, so
-- a second insert hit 23505.
--
-- WHAT THIS DOES (no table, policy or index changes)
--
--   1. admin_request_verification_info(p_request, p_note) -> jsonb
--      Admin only (42501). The note is required, trimmed, 2000 characters at
--      most (22023). Allowed only from 'submitted' or 'in_review'; anything
--      else is {ok:false, error:'not_open'} (a second question on a
--      needs_info row is not a thing: the clinic has not answered yet).
--      Sets status needs_info, note, reviewed_by, reviewed_at; notifies the
--      owner the way admin_review_business_verification does for a rejection;
--      audit_log `business.verification_info_requested`.
--
--   2. business_resubmit_verification(p_request, p_licence_number,
--      p_issuing_body, p_contact_name, p_contact_phone) -> jsonb
--      The caller must can_admin_business(the request's business) (42501).
--      Only from 'needs_info' ({ok:false, error:'not_needs_info'} otherwise).
--      The details are re-checked with the grammar lib/data/verification-form.ts
--      uses (licence ^[A-Za-z0-9][A-Za-z0-9 ./-]{2,39}$; issuing body 2-80
--      characters; phone empty or ^[+0-9 ()-]{7,20}$), 22023 on anything else.
--      Updates the details, status back to submitted, clears reviewed_by,
--      reviewed_at and the note (the audit row keeps the admin's question).
--      audit_log `business.verification_resubmitted`.
--
-- Both are SECURITY DEFINER because neither role may update the row directly
-- under bver_* (the clinic has no UPDATE policy at all).

create or replace function public.admin_request_verification_info(p_request uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req  record;
  v_biz  record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can ask for more information' using errcode = '42501';
  end if;
  if v_note is null then
    raise exception 'Say what you need — the business sees this note' using errcode = '22023';
  end if;
  if length(v_note) > 2000 then
    raise exception 'The note is too long (2000 characters at most)' using errcode = '22023';
  end if;

  select * into v_req from public.business_verifications where id = p_request for update;
  if not found then
    raise exception 'That request no longer exists' using errcode = 'P0002';
  end if;
  if v_req.status not in ('submitted', 'in_review') then
    return jsonb_build_object('ok', false, 'error', 'not_open');
  end if;

  update public.business_verifications
     set status = 'needs_info', note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_request;

  select id, name, owner_id into v_biz from public.businesses where id = v_req.business_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'business.verification_info_requested', 'business', v_req.business_id,
          jsonb_build_object('request_id', p_request, 'note', v_note));

  insert into public.notifications (profile_id, kind, severity, title, body)
  values (v_biz.owner_id, 'system', 'warning',
          'Pet10x needs more information: ' || v_biz.name, v_note);

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.admin_request_verification_info(uuid, text) is
  'Admin only (20261015000003). submitted|in_review -> needs_info with a required note (<= 2000), reviewed_by/at stamped, system notification to the owner, audit business.verification_info_requested. Returns {ok:true} or {ok:false,error:not_open}. Raises 42501 not admin, 22023 note missing/too long, P0002 missing request.';

revoke all on function public.admin_request_verification_info(uuid, text) from public, anon;
grant execute on function public.admin_request_verification_info(uuid, text) to authenticated;

create or replace function public.business_resubmit_verification(
  p_request uuid,
  p_licence_number text,
  p_issuing_body text,
  p_contact_name text,
  p_contact_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req     record;
  v_licence text := btrim(coalesce(p_licence_number, ''));
  v_body    text := btrim(coalesce(p_issuing_body, ''));
  v_name    text := nullif(btrim(coalesce(p_contact_name, '')), '');
  v_phone   text := nullif(btrim(coalesce(p_contact_phone, '')), '');
begin
  select * into v_req from public.business_verifications where id = p_request for update;
  if not found then
    raise exception 'That request no longer exists' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not public.can_admin_business(v_req.business_id) then
    raise exception 'Only the practice''s owner or a manager can answer a verification request'
      using errcode = '42501';
  end if;
  if v_req.status <> 'needs_info' then
    return jsonb_build_object('ok', false, 'error', 'not_needs_info');
  end if;

  if v_licence !~ '^[A-Za-z0-9][A-Za-z0-9 ./-]{2,39}$' then
    raise exception 'The licence number needs 3 to 40 letters, numbers, spaces, dots, slashes or dashes'
      using errcode = '22023';
  end if;
  if length(v_body) not between 2 and 80 then
    raise exception 'The issuing body needs 2 to 80 characters' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^[+0-9 ()-]{7,20}$' then
    raise exception 'The phone number needs 7 to 20 digits, spaces, brackets, dashes or a leading +'
      using errcode = '22023';
  end if;

  update public.business_verifications
     set licence_number = v_licence, issuing_body = v_body,
         contact_name = v_name, contact_phone = v_phone,
         status = 'submitted', reviewed_by = null, reviewed_at = null, note = null
   where id = p_request;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'business.verification_resubmitted', 'business', v_req.business_id,
          jsonb_build_object('request_id', p_request, 'question', v_req.note));

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.business_resubmit_verification(uuid, text, text, text, text) is
  'Practice owner/manager (can_admin_business) only (20261015000003). needs_info -> submitted with re-validated details; reviewed_by/at and note cleared (audit business.verification_resubmitted keeps the question). Returns {ok:true} or {ok:false,error:not_needs_info}. Raises 42501 not a member, 22023 bad details, P0002 missing request.';

revoke all on function public.business_resubmit_verification(uuid, text, text, text, text) from public, anon;
grant execute on function public.business_resubmit_verification(uuid, text, text, text, text) to authenticated;


-- ===== migration 20261015000004_admin_building_activity.sql =====
-- Pet10x — what a building is doing now, for the admin console's archive
-- summary.
--
-- THE GAP. admin_building_history (20261008000007) counts every row that
-- references a building, which is the right question for "can this be
-- deleted?" and the wrong one for "is anyone here?": resident_links includes
-- people who left, were denied or were removed, and incident_reports includes
-- closed ones. Archiving a building shows the admin those numbers; a long-dead
-- building looked busy and a live one with a few left-over rows looked the
-- same. The console's "cases" are violations a manager has not resolved, not
-- incident reports.
--
-- admin_building_activity() answers the live question, grouped server-side
-- over every building so the console does one call, not one per card:
--   active_residents  resident_links approved and not left
--   open_cases        violations with resolved_at null
--   open_reports      incident_reports still being looked at and not yet a
--                     case — submitted, triaged, investigating; a report
--                     linked_to_violation is already counted in open_cases
-- Admin only (42501). Returns a row for every building, zeros included.

create or replace function public.admin_building_activity()
returns table (building_id uuid, active_residents int, open_cases int, open_reports int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can see building activity'
      using errcode = '42501';
  end if;

  return query
  select b.id,
         (select count(*)::int from public.resident_links l
           where l.building_id = b.id and l.status = 'approved' and l.left_at is null),
         (select count(*)::int from public.violations v
           where v.building_id = b.id and v.resolved_at is null),
         (select count(*)::int from public.incident_reports r
           where r.building_id = b.id and r.status in ('submitted', 'triaged', 'investigating'))
    from public.buildings b;
end;
$$;
revoke all on function public.admin_building_activity() from public, anon;
grant execute on function public.admin_building_activity() to authenticated;

comment on function public.admin_building_activity() is
  'Per building: active residents, open cases (unresolved violations) and open reports not yet linked to a case (20261015000004). Admin only (42501).';


-- ===== checks part-a-archive =====
-- Part A — owner_archive_pet, impersonated, in ONE rolled-back transaction.
--
-- Covers 20261007000001 and 20261007000002 (the archive guard and
-- clinic_publish_record's refusal).
--
-- Not yet run: written before the migrations were applied (no database was
-- reachable from the session that wrote it). Run it after both are applied,
-- as the project's own
-- connection role (the Supabase SQL editor or MCP `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-a-archive.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written: the fixtures it
-- plants (a share, a desk code, a care task, an emergency token) and the
-- archive itself all roll back.
--
-- Actors are chosen from live data, not invented: a pet in Maple Court
-- Residences (MCR2026) that has a unit, its owner, a manager of that building,
-- and an owner from a different building. Each is asserted is_admin() = false
-- inside its own impersonation, because most policies carry is_admin() as a
-- disjunct and an admin control proves nothing (docs/RBAC_CAPABILITIES.md).
--
-- Fixture ids travel between role switches in transaction-local GUCs
-- (`part_a.*`), which any role can read with current_setting().

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_building uuid; v_pet uuid; v_owner uuid; v_manager uuid; v_other uuid; v_biz uuid;
  v_clinic uuid; v_clinic_owner uuid; v_customer uuid; v_patient uuid;
  v_token text := 'part-a-test-' || replace(gen_random_uuid()::text, '-', '');
begin
  select b.id into v_building from public.buildings b where upper(b.building_code) = 'MCR2026';
  if v_building is null then raise exception 'FIXTURE: building MCR2026 not found'; end if;

  select p.id, p.owner_id into v_pet, v_owner
    from public.pets p join public.profiles pr on pr.id = p.owner_id
   where p.building_id = v_building and p.unit_id is not null and p.deleted_at is null
     and not coalesce(pr.is_super_admin, false)
   order by p.created_at, p.id limit 1;
  if v_pet is null then raise exception 'FIXTURE: no current pet with a unit in MCR2026'; end if;

  select bm.profile_id into v_manager
    from public.building_managers bm join public.profiles pr on pr.id = bm.profile_id
   where bm.building_id = v_building and bm.profile_id <> v_owner
     and not coalesce(pr.is_super_admin, false)
   limit 1;
  if v_manager is null then raise exception 'FIXTURE: no non-admin manager of MCR2026'; end if;

  select p.owner_id into v_other
    from public.pets p join public.profiles pr on pr.id = p.owner_id
   where p.owner_id <> v_owner and p.building_id is distinct from v_building
     and not coalesce(pr.is_super_admin, false)
     and not exists (select 1 from public.building_managers bm
                      where bm.building_id = v_building and bm.profile_id = p.owner_id)
   limit 1;
  if v_other is null then raise exception 'FIXTURE: no owner outside MCR2026'; end if;

  select b.id into v_biz from public.businesses b
   where not exists (select 1 from public.record_shares s
                      where s.pet_id = v_pet and s.business_id = b.id and s.revoked_at is null)
   limit 1;
  if v_biz is null then raise exception 'FIXTURE: no business to share with'; end if;

  -- A practice, run by someone who is neither the owner nor an admin, with a
  -- chart linked to the pet — for clinic_publish_record (20261007000002).
  select b.id, b.owner_id into v_clinic, v_clinic_owner
    from public.businesses b join public.profiles pr on pr.id = b.owner_id
   where b.owner_id <> v_owner and not pr.is_suspended
     and not coalesce(pr.is_super_admin, false)
     and not exists (select 1 from public.clinic_patients cp
                      where cp.business_id = b.id and cp.pet_id = v_pet)
   limit 1;
  if v_clinic is null then raise exception 'FIXTURE: no practice to publish from'; end if;
  insert into public.clinic_customers (business_id, profile_id, first_name)
  values (v_clinic, v_owner, 'Part A') returning id into v_customer;
  insert into public.clinic_patients (business_id, customer_id, pet_id, name)
  values (v_clinic, v_customer, v_pet, 'Part A patient') returning id into v_patient;

  -- Something for the archive to revoke, delete and deactivate.
  insert into public.record_shares (pet_id, business_id, granted_by)
  values (v_pet, v_biz, v_owner);
  insert into public.record_desk_codes (pet_id, profile_id, code)
  values (v_pet, v_owner, 'PA' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));
  insert into public.pet_care_tasks (pet_id, label) values (v_pet, 'Part A test task');
  insert into public.emergency_access_tokens (building_id, token) values (v_building, v_token);

  perform set_config('part_a.building', v_building::text, true);
  perform set_config('part_a.pet', v_pet::text, true);
  perform set_config('part_a.owner', v_owner::text, true);
  perform set_config('part_a.manager', v_manager::text, true);
  perform set_config('part_a.other', v_other::text, true);
  perform set_config('part_a.token', v_token, true);
  perform set_config('part_a.clinic_owner', v_clinic_owner::text, true);
  perform set_config('part_a.patient', v_patient::text, true);
  raise notice 'fixtures: pet % owner % manager % other %', v_pet, v_owner, v_manager, v_other;
end $$;

-- Before: how many pets the emergency directory counts, two ways — its
-- `totals` and the per-unit entries are separate queries with separate filters.
create or replace function pg_temp.part_a_directory_counts()
returns int[] language sql as $$
  with d as (select public.emergency_directory(current_setting('part_a.token')) as j)
  select array[
    (select (j->'totals'->>'total')::int from d),
    (select count(*)::int from d,
            jsonb_array_elements(d.j->'floors') f,
            jsonb_array_elements(f->'units') u,
            jsonb_array_elements(coalesce(u->'pets', '[]'::jsonb)) pe)
  ];
$$;

do $$
declare c int[] := pg_temp.part_a_directory_counts();
begin
  if c[1] < 1 or c[2] < 1 then
    raise exception 'FIXTURE: emergency_directory counts % before archive', c;
  end if;
  perform set_config('part_a.dir_before', array_to_string(c, ','), true);
  raise notice 'ok: emergency_directory counts % before archive', c;
end $$;

-- ---------------------------------------------------------------------------
-- 1. A different user is refused (42501)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_a.other'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: other user is an admin'; end if;
  begin
    perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, 'rehomed');
    raise exception 'FAIL: a different user archived the pet';
  exception when insufficient_privilege then
    raise notice 'ok: different user refused (42501)';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. The building's manager is refused (42501) — and BEFORE archive, their
--    registry query sees the pet
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_a.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: manager is an admin'; end if;
  if (select count(*) from public.pets
       where building_id = current_setting('part_a.building')::uuid
         and id = current_setting('part_a.pet')::uuid and deleted_at is null) <> 1 then
    raise exception 'FAIL: manager registry does not see the pet BEFORE archive';
  end if;
  begin
    perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, 'rehomed');
    raise exception 'FAIL: a manager archived a resident''s pet';
  exception when insufficient_privilege then
    raise notice 'ok: manager refused (42501)';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2b. BEFORE archive, publishing reaches past the pet check (it fails later,
--     on the made-up source id or the practice's tier — anything but
--     pet_archived), so the refusal after archive is the archive's doing
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_a.clinic_owner'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: practice owner is an admin'; end if;
  r := public.clinic_publish_record(current_setting('part_a.patient')::uuid, 'vaccination', gen_random_uuid());
  if r->>'error' = 'pet_archived' or r->>'error' in ('forbidden', 'role_not_permitted', 'not_linked') then
    raise exception 'FAIL: publish before archive answered %', r;
  end if;
  raise notice 'ok: publish before archive gets past the pet (%)', r->>'error';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. The owner: an invalid reason is refused (22023), then the archive works
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_a.owner'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;

  -- The guard (20261007000002): pets_owner_write would otherwise let the
  -- owner archive by hand, skipping every consequence below.
  begin
    update public.pets set deleted_at = now(), archived_reason = 'mistake'
     where id = current_setting('part_a.pet')::uuid;
    raise exception 'FAIL: owner archived by direct UPDATE';
  exception when insufficient_privilege then
    raise notice 'ok: direct archive UPDATE refused (42501)';
  end;

  begin
    insert into public.pets (owner_id, name, species, deleted_at, archived_reason)
    values (auth.uid(), 'Part A ghost', 'dog', now(), 'passed_away');
    raise exception 'FAIL: owner created a pet already archived';
  exception when insufficient_privilege then
    raise notice 'ok: pre-archived INSERT refused (42501)';
  end;

  begin
    perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, 'ran_away');
    raise exception 'FAIL: invalid reason accepted';
  exception when invalid_parameter_value then
    raise notice 'ok: invalid reason refused (22023)';
  end;

  begin
    perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, null);
    raise exception 'FAIL: null reason accepted';
  exception when invalid_parameter_value then
    raise notice 'ok: null reason refused (22023)';
  end;

  perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, 'passed_away');
  raise notice 'ok: owner archived the pet';

  -- The owner still READS it (RLS is the floor) — the In memory list needs that.
  if not exists (select 1 from public.pets
                  where id = current_setting('part_a.pet')::uuid
                    and deleted_at is not null and archived_reason = 'passed_away') then
    raise exception 'FAIL: owner cannot read the archived pet with its reason';
  end if;
  raise notice 'ok: owner reads the archived pet, reason passed_away';

  -- A second archive is refused.
  begin
    perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, 'rehomed');
    raise exception 'FAIL: a second archive was accepted';
  exception when insufficient_privilege then
    raise notice 'ok: second archive refused (42501)';
  end;

  -- The owner cannot un-archive, nor rewrite the reason (the guard).
  begin
    update public.pets set deleted_at = null, archived_reason = null
     where id = current_setting('part_a.pet')::uuid;
    raise exception 'FAIL: owner un-archived by direct UPDATE';
  exception when insufficient_privilege then
    raise notice 'ok: un-archive refused (42501)';
  end;
  begin
    update public.pets set archived_reason = 'mistake' where id = current_setting('part_a.pet')::uuid;
    raise exception 'FAIL: owner rewrote the archive reason';
  exception when insufficient_privilege then
    raise notice 'ok: reason rewrite refused (42501)';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Consequences, read as the connection role (authoritative, no RLS)
-- ---------------------------------------------------------------------------
do $$
declare v_pet uuid := current_setting('part_a.pet')::uuid;
begin
  -- Past the guard (not a client role), the constraint still holds the two
  -- columns together.
  begin
    update public.pets set archived_reason = null where id = v_pet;
    raise exception 'FAIL: archived_reason cleared while deleted_at is set';
  exception when check_violation then
    raise notice 'ok: archived_reason/deleted_at must agree (23514)';
  end;

  if exists (select 1 from public.record_shares where pet_id = v_pet and revoked_at is null) then
    raise exception 'FAIL: an open record share survived the archive';
  end if;
  raise notice 'ok: every record share revoked';

  if exists (select 1 from public.record_desk_codes where pet_id = v_pet and redeemed_at is null) then
    raise exception 'FAIL: an unredeemed desk code survived the archive';
  end if;
  raise notice 'ok: unredeemed desk codes deleted';

  if exists (select 1 from public.pet_care_tasks where pet_id = v_pet and is_active) then
    raise exception 'FAIL: an active care task survived the archive';
  end if;
  raise notice 'ok: care tasks inactive';

  if not exists (select 1 from public.audit_log
                  where action = 'pet.archived' and entity_id = v_pet
                    and actor_id = current_setting('part_a.owner')::uuid
                    and metadata->>'reason' = 'passed_away') then
    raise exception 'FAIL: no audit_log row for the archive';
  end if;
  raise notice 'ok: audit_log written';

  if pg_temp.part_a_directory_counts() <> array[
       split_part(current_setting('part_a.dir_before'), ',', 1)::int - 1,
       split_part(current_setting('part_a.dir_before'), ',', 2)::int - 1] then
    raise exception 'FAIL: emergency_directory counts % after archive, % before',
      pg_temp.part_a_directory_counts(), current_setting('part_a.dir_before');
  end if;
  raise notice 'ok: emergency_directory no longer lists the pet';
end $$;

-- ---------------------------------------------------------------------------
-- 5. The manager's registry query no longer returns it — though RLS alone
--    still would, which is exactly why the query filters
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_a.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  if (select count(*) from public.pets
       where building_id = current_setting('part_a.building')::uuid
         and id = current_setting('part_a.pet')::uuid and deleted_at is null) <> 0 then
    raise exception 'FAIL: manager registry still returns the archived pet';
  end if;
  raise notice 'ok: manager registry query no longer returns the pet';
  raise notice 'info: unfiltered, RLS still shows the manager % row(s) — the floor, not the filter',
    (select count(*) from public.pets where id = current_setting('part_a.pet')::uuid);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5b. The practice cannot publish onto the removed pet
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_a.clinic_owner'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.clinic_publish_record(current_setting('part_a.patient')::uuid, 'vaccination', gen_random_uuid());
  if r->>'error' is distinct from 'pet_archived' then
    raise exception 'FAIL: publish after archive answered %', r;
  end if;
  raise notice 'ok: publish onto an archived pet refused (pet_archived)';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. anon cannot call it at all
-- ---------------------------------------------------------------------------
set local role anon;
do $$
begin
  begin
    perform public.owner_archive_pet(current_setting('part_a.pet')::uuid, 'mistake');
    raise exception 'FAIL: anon executed owner_archive_pet';
  exception when insufficient_privilege then
    raise notice 'ok: anon has no EXECUTE (42501)';
  end;
end $$;
reset role;

rollback to savepoint checks; reset role;


-- ===== checks part-b =====
-- Part B — manager tools, impersonated, in ONE rolled-back transaction.
--
-- Not yet run: written before 20261008000001…000007 were applied (no database
-- was reachable from the session that wrote it). Run it after they are, as the
-- project's own connection role (the Supabase SQL editor or MCP `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-b.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written: the fixtures it
-- plants (two fines, pet documents, an empty building) and the archive all
-- roll back.
--
-- Actors come from live data: Maple Court Residences (MCR2026), a non-admin
-- manager of it, a current pet in it with its owner, and a non-admin owner
-- from a different building. Each is asserted is_admin() = false inside its
-- own impersonation, because most checks carry is_admin() as a disjunct.

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_building uuid; v_pet uuid; v_owner uuid; v_manager uuid; v_other uuid;
  v_vio uuid; v_fine uuid; v_fine2 uuid; v_doc uuid; v_doc2 uuid; v_doc3 uuid; v_admin uuid; v_empty uuid;
begin
  select b.id into v_building from public.buildings b where upper(b.building_code) = 'MCR2026';
  if v_building is null then raise exception 'FIXTURE: building MCR2026 not found'; end if;

  select p.id, p.owner_id into v_pet, v_owner
    from public.pets p join public.profiles pr on pr.id = p.owner_id
   where p.building_id = v_building and p.deleted_at is null
     and not coalesce(pr.is_super_admin, false)
   order by p.created_at, p.id limit 1;
  if v_pet is null then raise exception 'FIXTURE: no current pet in MCR2026'; end if;

  select bm.profile_id into v_manager
    from public.building_managers bm join public.profiles pr on pr.id = bm.profile_id
   where bm.building_id = v_building and bm.profile_id <> v_owner
     and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   limit 1;
  if v_manager is null then raise exception 'FIXTURE: no non-admin manager of MCR2026'; end if;

  select p.owner_id into v_other
    from public.pets p join public.profiles pr on pr.id = p.owner_id
   where p.owner_id <> v_owner and p.building_id is distinct from v_building
     and not coalesce(pr.is_super_admin, false)
     and not exists (select 1 from public.building_managers bm
                      where bm.building_id = v_building and bm.profile_id = p.owner_id)
   limit 1;
  if v_other is null then raise exception 'FIXTURE: no owner outside MCR2026'; end if;

  -- A case to hang the fine on, when the building has one; the RPC handles a
  -- fine without a case too, and that path is exercised by the second fine.
  select v.id into v_vio from public.violations v
   where v.building_id = v_building and v.resolved_at is null
   order by v.created_at limit 1;

  insert into public.fines (violation_id, building_id, resident_id, amount_cents, currency, status)
  values (v_vio, v_building, v_owner, 12345, 'cad', 'issued')
  returning id into v_fine;
  insert into public.fines (violation_id, building_id, resident_id, amount_cents, currency, status)
  values (null, v_building, v_owner, 5000, 'cad', 'issued')
  returning id into v_fine2;

  insert into public.pet_documents (pet_id, kind, name, status, storage_path)
  values (v_pet, 'municipal_license', 'Part B licence', 'current', v_owner || '/' || v_pet || '/partb.pdf')
  returning id into v_doc;
  insert into public.pet_documents (pet_id, kind, name, status, storage_path)
  values (v_pet, 'liability_insurance', 'Part B insurance (no file)', 'current', null)
  returning id into v_doc2;
  -- Lapsed yesterday, with a file: approve must be refused.
  insert into public.pet_documents (pet_id, kind, name, status, storage_path, expires_on)
  values (v_pet, 'vaccination', 'Part B lapsed', 'expired', v_owner || '/' || v_pet || '/lapsed.pdf', current_date - 1)
  returning id into v_doc3;

  -- An admin, for admin_building_history (it returns nothing to anyone else).
  select pr.id into v_admin from public.profiles pr
   where pr.is_super_admin and not pr.is_suspended limit 1;
  if v_admin is null then raise exception 'FIXTURE: no active super admin'; end if;

  -- A building nobody has used: the only kind Delete is offered for.
  insert into public.buildings (name, building_code)
  values ('Part B empty building', 'PB' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)))
  returning id into v_empty;

  perform set_config('part_b.building', v_building::text, true);
  perform set_config('part_b.pet', v_pet::text, true);
  perform set_config('part_b.owner', v_owner::text, true);
  perform set_config('part_b.manager', v_manager::text, true);
  perform set_config('part_b.other', v_other::text, true);
  perform set_config('part_b.vio', coalesce(v_vio::text, ''), true);
  perform set_config('part_b.fine', v_fine::text, true);
  perform set_config('part_b.fine2', v_fine2::text, true);
  perform set_config('part_b.doc', v_doc::text, true);
  perform set_config('part_b.doc2', v_doc2::text, true);
  perform set_config('part_b.doc3', v_doc3::text, true);
  perform set_config('part_b.admin', v_admin::text, true);
  perform set_config('part_b.empty', v_empty::text, true);
  raise notice 'fixtures: building % manager % owner % other % case %', v_building, v_manager, v_owner, v_other, v_vio;
end $$;

-- ===========================================================================
-- 1. Fines
-- ===========================================================================

-- 1a. A non-manager is refused, and the fine does not move.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: other user is an admin'; end if;
  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'paid');
  if r->>'error' is distinct from 'forbidden' then
    raise exception 'FAIL: non-manager got % from manager_set_fine_status', r;
  end if;
  raise notice 'ok: non-manager refused (forbidden)';
end $$;
reset role;

-- 1b. The manager: direct UPDATE now changes nothing; illegal targets refused;
--     issued -> paid works; paid -> waived refused.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; n integer;
begin
  if public.is_admin() then raise exception 'FIXTURE: manager is an admin'; end if;

  update public.fines set status = 'waived' where id = current_setting('part_b.fine')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a manager''s direct UPDATE on fines touched % row(s)', n; end if;
  raise notice 'ok: direct UPDATE on fines refused (0 rows; fines_manager_update is gone)';

  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'disputed');
  if r->>'error' is distinct from 'illegal_transition' then
    raise exception 'FAIL: issued -> disputed returned %', r;
  end if;
  raise notice 'ok: issued -> disputed refused (illegal_transition)';

  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'issued');
  if r->>'error' is distinct from 'illegal_transition' then
    raise exception 'FAIL: issued -> issued returned %', r;
  end if;
  raise notice 'ok: issued -> issued refused (illegal_transition)';

  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'paid', 'Cheque received');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL: issued -> paid returned %', r;
  end if;
  raise notice 'ok: issued -> paid accepted %', r;

  r := public.manager_set_fine_status(current_setting('part_b.fine')::uuid, 'waived');
  if r->>'error' is distinct from 'illegal_transition' or r->>'from' is distinct from 'paid' then
    raise exception 'FAIL: paid -> waived returned %', r;
  end if;
  raise notice 'ok: paid -> waived refused (illegal_transition, from paid)';

  r := public.manager_set_fine_status(current_setting('part_b.fine2')::uuid, 'waived');
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'FAIL: issued -> waived on a fine with no case returned %', r;
  end if;
  raise notice 'ok: issued -> waived accepted on a fine with no case';
end $$;
reset role;

-- 1c. What it wrote, read as the connection role.
do $$
declare v_vio text := current_setting('part_b.vio');
begin
  if (select status from public.fines where id = current_setting('part_b.fine')::uuid) <> 'paid' then
    raise exception 'FAIL: fine is not paid';
  end if;
  if not exists (select 1 from public.audit_log
                  where action = 'fine.status_changed' and entity_id = current_setting('part_b.fine')::uuid
                    and metadata->>'from' = 'issued' and metadata->>'to' = 'paid') then
    raise exception 'FAIL: trg_fines_settlement_event wrote no audit row';
  end if;
  raise notice 'ok: settlement audit row written by the existing trigger';

  if v_vio <> '' then
    if not exists (select 1 from public.violation_events
                    where violation_id = v_vio::uuid and from_stage = to_stage
                      and note like 'Fine of 123.45 CAD marked paid: Cheque received') then
      raise exception 'FAIL: no violation_events self-transition for the payment';
    end if;
    raise notice 'ok: violation_events row written on the case';
  else
    raise notice 'info: MCR2026 has no open case; the violation_events path was not exercised';
  end if;

  if not exists (select 1 from public.notifications
                  where profile_id = current_setting('part_b.owner')::uuid and kind = 'compliance'
                    and title = 'Fine recorded as paid' and body like '%Cheque received%') then
    raise exception 'FAIL: the resident was not notified of the payment';
  end if;
  raise notice 'ok: resident notified (compliance)';
end $$;

-- ===========================================================================
-- 2. Municipal reports
-- ===========================================================================
do $$
declare v_result text := pg_get_function_result('public.manager_municipal_reports(uuid)'::regprocedure);
begin
  -- 20261008000005: an area summary. Nothing a reporter could be recognised
  -- by — no description, location, reference, evidence, nor reporter fields.
  if v_result ~* '(reporter|anonymous|ip_hash|latitude|longitude|postal|evidence|description|location|reference)' then
    raise exception 'FAIL: manager_municipal_reports exposes %', v_result;
  end if;
  raise notice 'ok: manager_municipal_reports returns only %', v_result;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform * from public.manager_municipal_reports(current_setting('part_b.building')::uuid);
    raise exception 'FAIL: a non-manager read municipal reports for MCR2026';
  exception when insufficient_privilege then
    raise notice 'ok: non-manager refused municipal reports (42501)';
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
declare n integer;
begin
  select count(*) into n from public.manager_municipal_reports(current_setting('part_b.building')::uuid);
  raise notice 'ok: manager reads % municipal report(s) for MCR2026', n;
  -- The table itself stays closed to them.
  if exists (select 1 from public.municipal_reports where reporter_id is distinct from auth.uid()) then
    raise exception 'FAIL: a manager can read municipal_reports rows directly';
  end if;
  raise notice 'ok: municipal_reports itself is still unreadable to the manager';

  -- The area is admin-set. Changing the postal code (which a manager may) does
  -- not move it; changing municipality_id is refused.
  perform set_config('part_b.muni_before', n::text, true);
  update public.buildings set postal_code = 'V5H 0A1' where id = current_setting('part_b.building')::uuid;
  select count(*) into n from public.manager_municipal_reports(current_setting('part_b.building')::uuid);
  if n <> current_setting('part_b.muni_before')::int then
    raise exception 'FAIL: editing the postal code changed which reports the manager sees (% -> %)',
      current_setting('part_b.muni_before'), n;
  end if;
  raise notice 'ok: postal code edit does not move the manager''s area';

  begin
    update public.buildings set municipality_id = (select m.id from public.municipalities m
                                                     where m.id is distinct from
                                                       (select b.municipality_id from public.buildings b
                                                         where b.id = current_setting('part_b.building')::uuid)
                                                     limit 1)
     where id = current_setting('part_b.building')::uuid;
    raise exception 'FAIL: a manager changed their building''s municipality';
  exception when insufficient_privilege then
    raise notice 'ok: manager cannot change municipality_id (42501)';
  end;
end $$;
reset role;

-- ===========================================================================
-- 3. Pet document review
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.manager_review_pet_document(current_setting('part_b.doc')::uuid, 'approve');
  if r->>'error' is distinct from 'forbidden' then
    raise exception 'FAIL: non-manager review returned %', r;
  end if;
  raise notice 'ok: non-manager refused document review (forbidden)';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb; n integer;
begin
  -- Still no direct write: since 20261014000001 a manager's UPDATE matches no
  -- row (pet_documents_update admits owner|admin only).
  update public.pet_documents set status = 'approved' where id = current_setting('part_b.doc')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a manager''s direct UPDATE on pet_documents touched % row(s)', n; end if;
  raise notice 'ok: direct UPDATE on pet_documents matches nothing for a manager';

  -- A delete produces no row, so WITH CHECK never saw it (20261014000001).
  delete from public.pet_documents where id = current_setting('part_b.doc')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a manager''s direct DELETE on pet_documents removed % row(s)', n; end if;
  raise notice 'ok: direct DELETE on pet_documents matches nothing for a manager';

  r := public.manager_review_pet_document(current_setting('part_b.doc2')::uuid, 'approve');
  if r->>'error' is distinct from 'no_file' then raise exception 'FAIL: approve without a file returned %', r; end if;
  raise notice 'ok: approve without a file refused (no_file)';

  r := public.manager_review_pet_document(current_setting('part_b.doc2')::uuid, 'reject');
  if r->>'error' is distinct from 'note_required' then raise exception 'FAIL: reject without a note returned %', r; end if;
  raise notice 'ok: reject without a note refused (note_required)';

  r := public.manager_review_pet_document(current_setting('part_b.doc')::uuid, 'maybe');
  if r->>'error' is distinct from 'verdict_required' then raise exception 'FAIL: bad verdict returned %', r; end if;
  raise notice 'ok: unknown verdict refused (verdict_required)';

  r := public.manager_review_pet_document(current_setting('part_b.doc')::uuid, 'approve');
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL: approve returned %', r; end if;
  raise notice 'ok: approve accepted';

  r := public.manager_review_pet_document(current_setting('part_b.doc')::uuid, 'approve');
  if r->>'error' is distinct from 'already_reviewed' then raise exception 'FAIL: second approve returned %', r; end if;
  raise notice 'ok: second approve refused (already_reviewed)';

  r := public.manager_review_pet_document(current_setting('part_b.doc2')::uuid, 'reject', 'Please upload the certificate itself.');
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'FAIL: reject returned %', r; end if;
  raise notice 'ok: reject with a note accepted';
end $$;
reset role;

do $$
begin
  if not exists (select 1 from public.pet_documents
                  where id = current_setting('part_b.doc')::uuid and status = 'approved'
                    and provenance = 'manager_verified'
                    and verified_by = current_setting('part_b.manager')::uuid and verified_at is not null) then
    raise exception 'FAIL: approved document lacks status/provenance/verifier';
  end if;
  raise notice 'ok: approved document carries manager_verified provenance';

  if not exists (select 1 from public.notifications
                  where profile_id = current_setting('part_b.owner')::uuid and kind = 'compliance'
                    and action_target = 'pet-detail:' || current_setting('part_b.pet')
                    and body like '%Please upload the certificate itself.%') then
    raise exception 'FAIL: owner not notified of the rejection';
  end if;
  raise notice 'ok: owner notified of the rejection, with the note and the pet';

  if (select count(*) from public.audit_log
       where entity_id in (current_setting('part_b.doc')::uuid, current_setting('part_b.doc2')::uuid)
         and action in ('pet_document.approved', 'pet_document.rejected')) <> 2 then
    raise exception 'FAIL: expected two pet_document audit rows';
  end if;
  raise notice 'ok: both verdicts audited';
end $$;

-- 3b. Approving a lapsed document is refused.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.manager_review_pet_document(current_setting('part_b.doc3')::uuid, 'approve');
  if r->>'error' is distinct from 'expired' then raise exception 'FAIL: approving a lapsed document returned %', r; end if;
  raise notice 'ok: lapsed document cannot be approved (expired)';
end $$;
reset role;

-- 3c. The owner cannot forge a verdict, and a new file voids the real one.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.owner'), 'role', 'authenticated')::text, true);
do $$
declare v_new uuid;
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;

  -- The ordinary upload path (lib/data/live.ts addPetDocument) still works.
  insert into public.pet_documents (pet_id, kind, name, status, storage_path, expires_on)
  values (current_setting('part_b.pet')::uuid, 'other', 'Part B owner upload', 'current', null, null)
  returning id into v_new;
  raise notice 'ok: owner upload with no verdict columns accepted';

  begin
    insert into public.pet_documents (pet_id, kind, name, status)
    values (current_setting('part_b.pet')::uuid, 'other', 'Forged', 'approved');
    raise exception 'FAIL: owner inserted an approved document';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot insert an approved document (42501)';
  end;

  begin
    insert into public.pet_documents (pet_id, kind, name, status, provenance)
    values (current_setting('part_b.pet')::uuid, 'other', 'Forged', 'current', 'clinic_confirmed');
    raise exception 'FAIL: owner inserted a clinic_confirmed document';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot insert a clinic_confirmed document (42501)';
  end;

  begin
    update public.pet_documents set status = 'approved' where id = v_new;
    raise exception 'FAIL: owner approved their own document';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot set status approved (42501)';
  end;

  begin
    update public.pet_documents set provenance = 'manager_verified' where id = v_new;
    raise exception 'FAIL: owner set provenance manager_verified';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot set provenance (42501)';
  end;

  begin
    update public.pet_documents set verified_at = now(), verified_by = auth.uid() where id = v_new;
    raise exception 'FAIL: owner stamped verified_at/verified_by';
  exception when insufficient_privilege then
    raise notice 'ok: owner cannot stamp verified_* (42501)';
  end;

  -- The manager approved part_b.doc in section 3. A new file voids that.
  update public.pet_documents set storage_path = storage_path || '.v2'
   where id = current_setting('part_b.doc')::uuid;
  if not exists (select 1 from public.pet_documents
                  where id = current_setting('part_b.doc')::uuid
                    and status = 'current' and provenance = 'self_reported'
                    and verified_by is null and verified_at is null) then
    raise exception 'FAIL: replacing the file kept the manager''s approval';
  end if;
  raise notice 'ok: a replaced file resets status, provenance and verified_*';
end $$;
reset role;

-- ===========================================================================
-- 4. Archiving a building
-- ===========================================================================

-- 4a. Its manager cannot archive it (they may otherwise update the row).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    update public.buildings set archived_at = now() where id = current_setting('part_b.building')::uuid;
    raise exception 'FAIL: a manager archived their own building';
  exception when insufficient_privilege then
    raise notice 'ok: manager cannot archive (42501)';
  end;
end $$;
reset role;

-- 4b. Archived (as the connection role, no JWT — the admin path), the code no
--     longer resolves, and joining and reporting say invalid_code. The claims
--     are cleared first: set_config(..., true) outlives `reset role`, and the
--     guard would otherwise see the manager's uid.
select set_config('request.jwt.claims', '', true);
do $$
begin
  if (public.resolve_building_code('MCR2026')->>'valid')::boolean is distinct from true then
    raise exception 'FIXTURE: MCR2026 does not resolve before archiving';
  end if;
  update public.buildings set archived_at = now() where id = current_setting('part_b.building')::uuid;
  if (public.resolve_building_code('mcr2026')->>'valid')::boolean is distinct from false then
    raise exception 'FAIL: an archived building still resolves by code';
  end if;
  raise notice 'ok: archived building not resolvable by code';

  if public.submit_incident_report('MCR2026', 'noise', 'Part B test')->>'error' is distinct from 'invalid_code' then
    raise exception 'FAIL: an archived building accepted an incident report';
  end if;
  raise notice 'ok: archived building refuses incident reports (invalid_code)';

  if exists (select 1 from public.targetable_buildings() t where t.id = current_setting('part_b.building')::uuid) then
    raise exception 'FAIL: an archived building is still targetable';
  end if;
  raise notice 'ok: archived building not targetable';
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.request_building_link('MCR2026')->>'error' is distinct from 'invalid_code' then
    raise exception 'FAIL: an archived building accepted a join request';
  end if;
  raise notice 'ok: archived building refuses join requests (invalid_code)';
end $$;
reset role;

-- 4c. The guest pet picker no longer resolves it, and a direct pending
--     resident_links insert into it is refused.
select set_config('request.jwt.claims', '', true);
do $$
begin
  if (public.building_pets_for_report('MCR2026')->>'valid')::boolean is distinct from false then
    raise exception 'FAIL: building_pets_for_report still lists an archived building''s pets';
  end if;
  raise notice 'ok: building_pets_for_report refuses an archived building';
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.other'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    insert into public.resident_links (profile_id, building_id, status)
    values (auth.uid(), current_setting('part_b.building')::uuid, 'pending');
    raise exception 'FAIL: a direct resident_links insert into an archived building was accepted';
  exception when insufficient_privilege then
    raise notice 'ok: links_insert_self refuses an archived building (42501)';
  end;
end $$;
reset role;

-- 4d. admin_building_history counts cascading tables too: MCR2026 (pets,
--     residents, units…) has history; a building nobody used has none; and a
--     non-admin gets nothing.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.admin'), 'role', 'authenticated')::text, true);
do $$
declare v_used record; v_empty record;
begin
  if not public.is_admin() then raise exception 'FIXTURE: admin is not is_admin()'; end if;
  select * into v_used from public.admin_building_history() h
   where h.building_id = current_setting('part_b.building')::uuid;
  if v_used.total is null or v_used.total = 0 or (v_used.counts->>'pets')::int = 0 then
    raise exception 'FAIL: MCR2026 history %', v_used;
  end if;
  raise notice 'ok: MCR2026 has history (total %, pets %)', v_used.total, v_used.counts->>'pets';
  select * into v_empty from public.admin_building_history() h
   where h.building_id = current_setting('part_b.empty')::uuid;
  if v_empty.total is distinct from 0 then
    raise exception 'FAIL: an unused building reports history %', v_empty;
  end if;
  raise notice 'ok: an unused building has none (only it may be deleted)';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_b.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  if exists (select 1 from public.admin_building_history()) then
    raise exception 'FAIL: a manager read admin_building_history';
  end if;
  raise notice 'ok: admin_building_history returns nothing to a non-admin';
end $$;
reset role;

-- ===========================================================================
-- 5. A pet's records: managers read, never write (20261014000001)
-- ===========================================================================
do $$
declare v text;
begin
  select string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', ') into v
    from pg_catalog.pg_policies
   where schemaname = 'public'
     and tablename in ('care_entries', 'care_targets', 'pet_activity', 'pet_care_tasks',
                       'pet_documents', 'pet_emergency_contacts', 'pet_feeding', 'pet_medications',
                       'pet_photos', 'pet_vaccinations', 'pet_vet_visits')
     and cmd <> 'SELECT'
     and (coalesce(qual, '') like '%manages_building%' or coalesce(with_check, '') like '%manages_building%');
  if v is not null then raise exception 'FAIL: a write policy admits managers: %', v; end if;
  raise notice 'ok: no write policy on a pet''s records admits a manager';
end $$;

rollback to savepoint checks; reset role;


-- ===== checks part-c =====
-- Part C — business tiers and sign-up intent, impersonated, in ONE rolled-back
-- transaction.
--
-- Not yet run: written before 20261009000001…000003 were applied (no database
-- was reachable from the session that wrote it). Run it after they are, as the
-- project's own connection role (the Supabase SQL editor or MCP `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-c.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written: the two businesses,
-- the requests and the pending signup it plants all roll back.
--
-- Actors come from live data: two non-admin, unsuspended profiles (the owners
-- of two fresh businesses) and an active super admin. Each is asserted
-- is_admin() inside its own impersonation.

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare v_owner uuid; v_other uuid; v_admin uuid; v_biz uuid; v_biz2 uuid;
begin
  select pr.id into v_owner from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_other from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended and pr.id <> v_owner
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_admin from public.profiles pr
   where pr.is_super_admin and not pr.is_suspended limit 1;
  if v_owner is null or v_other is null then raise exception 'FIXTURE: need two non-admin profiles'; end if;
  if v_admin is null then raise exception 'FIXTURE: no active super admin'; end if;

  insert into public.businesses (owner_id, name, category)
  values (v_owner, 'Part C Clinic', 'Veterinary') returning id into v_biz;
  insert into public.businesses (owner_id, name, category)
  values (v_other, 'Part C Groomer', 'Grooming') returning id into v_biz2;

  perform set_config('part_c.owner', v_owner::text, true);
  perform set_config('part_c.other', v_other::text, true);
  perform set_config('part_c.admin', v_admin::text, true);
  perform set_config('part_c.biz', v_biz::text, true);
  perform set_config('part_c.biz2', v_biz2::text, true);
  raise notice 'fixtures: owner % other % admin % biz % biz2 %', v_owner, v_other, v_admin, v_biz, v_biz2;
end $$;

-- ===========================================================================
-- 1. A non-admin cannot move a tier — not by RPC, not directly
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_c.owner'), 'role', 'authenticated')::text, true);
do $$
declare v_biz uuid := current_setting('part_c.biz')::uuid; refused boolean;
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;

  refused := false;
  begin
    perform public.admin_set_business_tier(v_biz, 'verified');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: owner called admin_set_business_tier'; end if;
  raise notice 'ok: admin_set_business_tier refused for the owner (42501)';

  refused := false;
  begin
    update public.businesses set tier = 'verified' where id = v_biz;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: owner updated their own tier'; end if;
  raise notice 'ok: direct UPDATE of tier refused (42501)';

  refused := false;
  begin
    update public.businesses set is_verified = true where id = v_biz;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: owner updated their own is_verified'; end if;
  raise notice 'ok: direct UPDATE of is_verified refused (42501)';

  refused := false;
  begin
    insert into public.businesses (owner_id, name, category, tier)
    values (auth.uid(), 'Born verified', 'Other', 'listed');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: owner created a business already listed'; end if;
  raise notice 'ok: INSERT above registered refused (42501)';

  -- An ordinary edit still works.
  update public.businesses set description = 'Part C edit' where id = v_biz;
  if not found then raise exception 'FAIL: owner could not edit their own business'; end if;
  raise notice 'ok: owner still edits other columns';
end $$;
reset role;

-- ===========================================================================
-- 2. Verification requests: own business only, born unreviewed, one open
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_c.owner'), 'role', 'authenticated')::text, true);
do $$
declare v_biz uuid := current_setting('part_c.biz')::uuid; v_biz2 uuid := current_setting('part_c.biz2')::uuid;
        refused boolean; v_req uuid;
begin
  insert into public.business_verifications (business_id, kind, status)
  values (v_biz, 'licence', 'submitted') returning id into v_req;
  perform set_config('part_c.req', v_req::text, true);
  raise notice 'ok: owner requested verification for their own business';

  refused := false;
  begin
    insert into public.business_verifications (business_id, kind, status) values (v_biz2, 'licence', 'submitted');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: owner requested verification for someone else''s business'; end if;
  raise notice 'ok: request for another business refused (RLS)';

  refused := false;
  begin
    insert into public.business_verifications (business_id, kind, status, note)
    values (v_biz, 'listing', 'submitted', 'Approved by me');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: a request was born with a review note'; end if;
  raise notice 'ok: a request cannot arrive pre-reviewed';

  refused := false;
  begin
    insert into public.business_verifications (business_id, kind, status) values (v_biz, 'licence', 'submitted');
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'FAIL: a second open licence request was accepted'; end if;
  raise notice 'ok: one open request per kind';
end $$;
reset role;

-- ===========================================================================
-- 3. The admin: reject needs a note; approve verifies; tier moves stay in step
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_c.admin'), 'role', 'authenticated')::text, true);
do $$
declare v_biz uuid := current_setting('part_c.biz')::uuid; v_biz2 uuid := current_setting('part_c.biz2')::uuid;
        v_req uuid := current_setting('part_c.req')::uuid; refused boolean; b record;
begin
  if not public.is_admin() then raise exception 'FIXTURE: admin is not is_admin()'; end if;

  refused := false;
  begin
    perform public.admin_review_business_verification(v_req, false, '   ');
  exception when invalid_parameter_value then refused := true;
  end;
  if not refused then raise exception 'FAIL: a rejection without a note was accepted'; end if;
  raise notice 'ok: reject requires a note';

  perform public.admin_review_business_verification(v_req, true);
  select tier, is_verified into b from public.businesses where id = v_biz;
  if b.tier <> 'verified' or not b.is_verified then
    raise exception 'FAIL: approval left tier=% is_verified=%', b.tier, b.is_verified;
  end if;
  if (select status from public.business_verifications where id = v_req) <> 'approved' then
    raise exception 'FAIL: approved request is not approved';
  end if;
  raise notice 'ok: approve → tier verified, is_verified true, request approved';

  refused := false;
  begin
    perform public.admin_review_business_verification(v_req, false, 'late');
  exception when invalid_parameter_value then refused := true;
  end;
  if not refused then raise exception 'FAIL: a decided request was decided again'; end if;
  raise notice 'ok: a decided request stays decided';

  perform public.admin_set_business_tier(v_biz2, 'listed', 'Looks good');
  select tier, is_verified into b from public.businesses where id = v_biz2;
  if b.tier <> 'listed' or b.is_verified then
    raise exception 'FAIL: listed left tier=% is_verified=%', b.tier, b.is_verified;
  end if;
  raise notice 'ok: admin sets listed (is_verified false)';

  perform public.admin_set_business_tier(v_biz, 'registered');
  select tier, is_verified into b from public.businesses where id = v_biz;
  if b.tier <> 'registered' or b.is_verified then
    raise exception 'FAIL: lowering left tier=% is_verified=%', b.tier, b.is_verified;
  end if;
  raise notice 'ok: admin lowers to registered (is_verified false)';
end $$;
reset role;

-- 3b. What the admin's calls wrote, as the connection role; then the CHECK.
do $$
declare v_biz uuid := current_setting('part_c.biz')::uuid; v_biz2 uuid := current_setting('part_c.biz2')::uuid;
        refused boolean;
begin
  if (select count(*) from public.audit_log where action = 'business.tier_set' and entity_id = v_biz) <> 2 then
    raise exception 'FAIL: expected two tier_set audit rows for the clinic';
  end if;
  if not exists (select 1 from public.notifications
                  where profile_id = current_setting('part_c.other')::uuid and kind = 'system'
                    and title = 'Part C Groomer is listed' and body like '%Looks good%') then
    raise exception 'FAIL: the groomer''s owner was not notified';
  end if;
  if not exists (select 1 from public.audit_log
                  where action = 'business.verification_approved' and entity_id = v_biz
                    and metadata->>'request_id' = current_setting('part_c.req')) then
    raise exception 'FAIL: the request approval was not audited';
  end if;
  raise notice 'ok: audited and notified';

  refused := false;
  begin
    update public.businesses set is_verified = true where id = v_biz2;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'FAIL: is_verified drifted from tier'; end if;
  raise notice 'ok: businesses_verified_tier_ck pins is_verified to tier';
end $$;

-- 3c. A listed business is readable by an unrelated signed-in user.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_c.owner'), 'role', 'authenticated')::text, true);
do $$
begin
  if not exists (select 1 from public.businesses where id = current_setting('part_c.biz2')::uuid) then
    raise exception 'FAIL: a listed business is not readable by owners';
  end if;
  raise notice 'ok: listed business readable (businesses_select)';
end $$;
reset role;

-- ===========================================================================
-- 4. pending_signups carries a business intent
-- ===========================================================================
do $$
declare r record; refused boolean;
begin
  insert into public.pending_signups (email, code_hash, full_name, expires_at, intent, business)
  values ('part-c@example.invalid', 'x', 'Part C', now() + interval '15 minutes', 'business',
          jsonb_build_object('businessName', 'Part C Paws', 'category', 'Grooming'));
  select intent, business into r from public.pending_signups where email = 'part-c@example.invalid';
  if r.intent <> 'business' or r.business->>'businessName' <> 'Part C Paws' or r.business->>'category' <> 'Grooming' then
    raise exception 'FAIL: pending business row read back as %', r;
  end if;
  raise notice 'ok: business pending row round-trips';

  insert into public.pending_signups (email, code_hash, expires_at)
  values ('part-c-resident@example.invalid', 'x', now() + interval '15 minutes');
  if (select intent from public.pending_signups where email = 'part-c-resident@example.invalid') <> 'resident' then
    raise exception 'FAIL: intent did not default to resident';
  end if;
  raise notice 'ok: intent defaults to resident';

  refused := false;
  begin
    insert into public.pending_signups (email, code_hash, expires_at, intent)
    values ('part-c-bad@example.invalid', 'x', now() + interval '15 minutes', 'business');
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'FAIL: a business intent without details was accepted'; end if;
  raise notice 'ok: business intent requires details';
end $$;

-- 4b. Still unreachable from a client role.
set local role authenticated;
do $$
declare refused boolean := false;
begin
  begin
    perform 1 from public.pending_signups limit 1;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: authenticated can read pending_signups'; end if;
  raise notice 'ok: pending_signups stays service-role only';
end $$;
reset role;

rollback to savepoint checks; reset role;


-- ===== checks part-e =====
-- Part E — owner bills, impersonated, in ONE rolled-back transaction.
--
-- Covers 20261010000001 (owners never read drafts; owner_approve_estimate
-- takes an estimate only and notifies the practice; clinic_set_invoice_status
-- notifies the owner on draft -> sent) and 20261010000002 (business_staff_guard:
-- a manager cannot promote themselves, touch the owner's row, or hand out
-- `owner`).
--
-- Not yet run: written before 20261010000001 was applied (no database was
-- reachable from the session that wrote it). Run it after it is, as the
-- project's own connection role (the Supabase SQL editor or MCP `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-e.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written: the practice, its
-- chart, the invoices and the notifications all roll back.
--
-- Actors come from live data: a non-admin owner of a current pet, and three
-- other non-admin, unsuspended profiles — the practice's owner, a manager on
-- its staff, and an unrelated person. Each impersonation asserts
-- is_admin() = false, since policies carry is_admin() as a disjunct.

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_pet uuid; v_owner uuid; v_clinic_owner uuid; v_manager uuid; v_other uuid;
  v_biz uuid; v_customer uuid; v_patient uuid;
  v_draft uuid; v_est uuid; v_inv uuid; v_est_draft uuid;
begin
  select p.id, p.owner_id into v_pet, v_owner
    from public.pets p join public.profiles pr on pr.id = p.owner_id
   where p.deleted_at is null and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by p.created_at, p.id limit 1;
  if v_pet is null then raise exception 'FIXTURE: no current pet with a non-admin owner'; end if;

  select pr.id into v_clinic_owner from public.profiles pr
   where pr.id <> v_owner and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_manager from public.profiles pr
   where pr.id not in (v_owner, v_clinic_owner)
     and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_other from public.profiles pr
   where pr.id not in (v_owner, v_clinic_owner, v_manager)
     and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  if v_clinic_owner is null or v_manager is null or v_other is null then
    raise exception 'FIXTURE: need four non-admin profiles';
  end if;

  -- business_bootstrap gives the owner a `veterinarian` staff row.
  insert into public.businesses (owner_id, name, category, business_kind)
  values (v_clinic_owner, 'Part E Clinic', 'Veterinary', 'veterinary') returning id into v_biz;
  insert into public.business_staff (business_id, profile_id, role, is_active)
  values (v_biz, v_manager, 'manager', true);

  insert into public.clinic_customers (business_id, profile_id, first_name)
  values (v_biz, v_owner, 'Part E') returning id into v_customer;
  insert into public.clinic_patients (business_id, customer_id, pet_id, name)
  values (v_biz, v_customer, v_pet, 'Part E patient') returning id into v_patient;

  insert into public.invoices (business_id, customer_id, patient_id, kind, status)
  values (v_biz, v_customer, v_patient, 'invoice', 'draft') returning id into v_draft;
  insert into public.invoice_lines (invoice_id, business_id, description, quantity, unit_price_cents)
  values (v_draft, v_biz, 'Draft line', 1, 5000);

  insert into public.invoices (business_id, customer_id, patient_id, kind, status, number)
  values (v_biz, v_customer, v_patient, 'estimate', 'sent', 'E-1') returning id into v_est;
  insert into public.invoice_lines (invoice_id, business_id, description, quantity, unit_price_cents)
  values (v_est, v_biz, 'Dental estimate', 1, 42000);

  insert into public.invoices (business_id, customer_id, patient_id, kind, status)
  values (v_biz, v_customer, v_patient, 'invoice', 'sent') returning id into v_inv;

  insert into public.invoices (business_id, customer_id, patient_id, kind, status)
  values (v_biz, v_customer, v_patient, 'estimate', 'draft') returning id into v_est_draft;

  perform set_config('part_e.pet', v_pet::text, true);
  perform set_config('part_e.owner', v_owner::text, true);
  perform set_config('part_e.clinic_owner', v_clinic_owner::text, true);
  perform set_config('part_e.manager', v_manager::text, true);
  perform set_config('part_e.other', v_other::text, true);
  perform set_config('part_e.draft', v_draft::text, true);
  perform set_config('part_e.est', v_est::text, true);
  perform set_config('part_e.inv', v_inv::text, true);
  perform set_config('part_e.est_draft', v_est_draft::text, true);
  perform set_config('part_e.biz', v_biz::text, true);
  raise notice 'fixtures: owner % clinic owner % manager % other % biz %',
    v_owner, v_clinic_owner, v_manager, v_other, v_biz;
end $$;

-- ===========================================================================
-- 1. The owner never reads a draft — invoice or line
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.owner'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;
  if exists (select 1 from public.invoices where id = current_setting('part_e.draft')::uuid) then
    raise exception 'FAIL: owner read a draft invoice';
  end if;
  if exists (select 1 from public.invoice_lines where invoice_id = current_setting('part_e.draft')::uuid) then
    raise exception 'FAIL: owner read a draft invoice''s lines';
  end if;
  if exists (select 1 from public.invoices where id = current_setting('part_e.est_draft')::uuid) then
    raise exception 'FAIL: owner read a draft estimate';
  end if;
  raise notice 'ok: drafts and their lines are invisible to the owner';

  if not exists (select 1 from public.invoices where id = current_setting('part_e.est')::uuid) then
    raise exception 'FAIL: owner cannot read their sent estimate';
  end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = current_setting('part_e.est')::uuid) then
    raise exception 'FAIL: owner cannot read their sent estimate''s lines';
  end if;
  if not exists (select 1 from public.invoices where id = current_setting('part_e.inv')::uuid) then
    raise exception 'FAIL: owner cannot read their sent invoice';
  end if;
  raise notice 'ok: sent estimate, its lines and sent invoice are readable';
end $$;
reset role;

-- ===========================================================================
-- 2. Approving: not an invoice, not someone else's, then the real one
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.owner'), 'role', 'authenticated')::text, true);
do $$
declare res jsonb;
begin
  res := public.owner_approve_estimate(current_setting('part_e.inv')::uuid);
  if coalesce((res->>'ok')::boolean, false) or res->>'error' <> 'not_an_estimate' then
    raise exception 'FAIL: approving an invoice answered %', res;
  end if;
  if (select status from public.invoices where id = current_setting('part_e.inv')::uuid) <> 'sent' then
    raise exception 'FAIL: the invoice moved anyway';
  end if;
  raise notice 'ok: an invoice cannot be approved (not_an_estimate)';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.other'), 'role', 'authenticated')::text, true);
do $$
declare res jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: other is an admin'; end if;
  res := public.owner_approve_estimate(current_setting('part_e.est')::uuid);
  if coalesce((res->>'ok')::boolean, false) or res->>'error' <> 'forbidden' then
    raise exception 'FAIL: another person approving the estimate answered %', res;
  end if;
  raise notice 'ok: another person cannot approve the owner''s estimate (forbidden)';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.owner'), 'role', 'authenticated')::text, true);
do $$
declare res jsonb; r record;
begin
  res := public.owner_approve_estimate(current_setting('part_e.est')::uuid);
  if not coalesce((res->>'ok')::boolean, false) then
    raise exception 'FAIL: owner could not approve their sent estimate: %', res;
  end if;
  select status, owner_approved_at into r from public.invoices where id = current_setting('part_e.est')::uuid;
  if r.status <> 'approved' or r.owner_approved_at is null then
    raise exception 'FAIL: estimate after approval reads %', r;
  end if;
  raise notice 'ok: owner approved their sent estimate';

  res := public.owner_approve_estimate(current_setting('part_e.est')::uuid);
  if coalesce((res->>'ok')::boolean, false) or res->>'error' <> 'not_awaiting_approval' then
    raise exception 'FAIL: approving twice answered %', res;
  end if;
  raise notice 'ok: a second approval is refused (not_awaiting_approval)';
end $$;
reset role;

-- 2b. The practice's administrators heard; the owner did not notify themself.
do $$
declare n int;
begin
  select count(*) into n from public.notifications
   where profile_id = current_setting('part_e.clinic_owner')::uuid
     and kind = 'clinic' and title like 'Estimate approved for %' and created_at = now();
  if n <> 1 then raise exception 'FAIL: business owner got % approval notifications, expected 1', n; end if;
  select count(*) into n from public.notifications
   where profile_id = current_setting('part_e.manager')::uuid
     and kind = 'clinic' and title like 'Estimate approved for %' and created_at = now();
  if n <> 1 then raise exception 'FAIL: manager got % approval notifications, expected 1', n; end if;
  select count(*) into n from public.notifications
   where profile_id = current_setting('part_e.owner')::uuid
     and title like 'Estimate approved for %' and created_at = now();
  if n <> 0 then raise exception 'FAIL: the approving owner was notified of their own approval'; end if;
  raise notice 'ok: business owner and manager notified, once each';
end $$;

-- ===========================================================================
-- 3. Sending a draft tells the owner, with a Bills target
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.clinic_owner'), 'role', 'authenticated')::text, true);
do $$
declare res jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: clinic owner is an admin'; end if;
  res := public.clinic_set_invoice_status(current_setting('part_e.est_draft')::uuid, 'sent');
  if not coalesce((res->>'ok')::boolean, false) then
    raise exception 'FAIL: clinic could not send its draft estimate: %', res;
  end if;
  -- A move that is not draft -> sent notifies nobody.
  res := public.clinic_set_invoice_status(current_setting('part_e.inv')::uuid, 'paid');
  if not coalesce((res->>'ok')::boolean, false) then
    raise exception 'FAIL: clinic could not mark its sent invoice paid: %', res;
  end if;
  raise notice 'ok: clinic sent a draft estimate and marked an invoice paid';
end $$;
reset role;

do $$
declare n int; r record;
begin
  select count(*) into n from public.notifications
   where profile_id = current_setting('part_e.owner')::uuid
     and kind = 'clinic' and action_target = 'my-vets:bills' and created_at = now();
  if n <> 1 then raise exception 'FAIL: owner got % bill notifications, expected exactly 1', n; end if;
  select title, action_label into r from public.notifications
   where profile_id = current_setting('part_e.owner')::uuid
     and action_target = 'my-vets:bills' and created_at = now();
  if r.title <> 'Estimate from Part E Clinic' or r.action_label <> 'Review estimate' then
    raise exception 'FAIL: bill notification reads %', r;
  end if;
  raise notice 'ok: owner notified once, on draft -> sent, pointing at my-vets:bills';
end $$;

-- ===========================================================================
-- 4. business_staff_guard (20261010000002)
-- ===========================================================================
-- A nurse row for the unrelated person, so the manager has an OTHER row to edit.
do $$
begin
  insert into public.business_staff (business_id, profile_id, role, is_active)
  values (current_setting('part_e.biz')::uuid, current_setting('part_e.other')::uuid, 'nurse', true);
end $$;

-- 4a. As the manager.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.manager'), 'role', 'authenticated')::text, true);
do $$
declare
  v_biz uuid := current_setting('part_e.biz')::uuid;
  v_me uuid := current_setting('part_e.manager')::uuid;
  v_owner uuid := current_setting('part_e.clinic_owner')::uuid;
  v_other uuid := current_setting('part_e.other')::uuid;
  refused boolean;
begin
  if public.is_admin() then raise exception 'FIXTURE: manager is an admin'; end if;
  if not public.can_admin_business(v_biz) then raise exception 'FIXTURE: manager cannot administer the practice'; end if;

  refused := false;
  begin
    update public.business_staff set role = 'veterinarian' where business_id = v_biz and profile_id = v_me;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager changed their own role'; end if;
  raise notice 'ok: manager cannot change their own role (42501)';

  refused := false;
  begin
    update public.business_staff set role = 'owner' where business_id = v_biz and profile_id = v_me;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager made themselves owner'; end if;
  raise notice 'ok: manager cannot make themselves owner (42501)';

  refused := false;
  begin
    update public.business_staff set is_active = false where business_id = v_biz and profile_id = v_me;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager deactivated their own row'; end if;
  raise notice 'ok: manager cannot change their own is_active (42501)';

  refused := false;
  begin
    update public.business_staff set role = 'nurse' where business_id = v_biz and profile_id = v_owner;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager changed the owner''s role'; end if;
  refused := false;
  begin
    update public.business_staff set is_active = false where business_id = v_biz and profile_id = v_owner;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager deactivated the owner''s row'; end if;
  raise notice 'ok: manager cannot change the owner''s role or is_active (42501)';

  refused := false;
  begin
    update public.business_staff set role = 'owner' where business_id = v_biz and profile_id = v_other;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager made another member owner'; end if;
  raise notice 'ok: manager cannot hand out owner (42501)';

  refused := false;
  begin
    update public.business_staff set profile_id = current_setting('part_e.owner')::uuid
     where business_id = v_biz and profile_id = v_other;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager moved a staff row to another person'; end if;
  raise notice 'ok: a staff row cannot be moved to another person (42501)';

  refused := false;
  begin
    insert into public.business_staff (business_id, profile_id, role)
    values (v_biz, current_setting('part_e.owner')::uuid, 'owner');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: manager added someone as owner'; end if;
  raise notice 'ok: nobody is added as owner (42501)';

  -- What a manager may still do: change another member's role and access.
  update public.business_staff set role = 'veterinarian' where business_id = v_biz and profile_id = v_other;
  if not found then raise exception 'FAIL: manager could not change another member''s role'; end if;
  update public.business_staff set is_active = false where business_id = v_biz and profile_id = v_other;
  if not found then raise exception 'FAIL: manager could not deactivate another member'; end if;
  update public.business_staff set title = 'Practice lead' where business_id = v_biz and profile_id = v_me;
  if not found then raise exception 'FAIL: manager could not edit their own title'; end if;
  raise notice 'ok: manager edits other members, and their own non-access columns';
end $$;
reset role;

-- 4b. As the business owner.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_e.clinic_owner'), 'role', 'authenticated')::text, true);
do $$
declare
  v_biz uuid := current_setting('part_e.biz')::uuid;
  v_me uuid := current_setting('part_e.clinic_owner')::uuid;
  refused boolean;
begin
  update public.business_staff set role = 'reception'
   where business_id = v_biz and profile_id = current_setting('part_e.manager')::uuid;
  if not found then raise exception 'FAIL: owner could not change the manager''s role'; end if;
  update public.business_staff set role = 'nurse' where business_id = v_biz and profile_id = v_me;
  if not found then raise exception 'FAIL: owner could not change their own role'; end if;
  raise notice 'ok: the owner changes the manager''s role and their own';

  refused := false;
  begin
    update public.business_staff set role = 'owner'
     where business_id = v_biz and profile_id = current_setting('part_e.other')::uuid;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'FAIL: the owner handed out the owner role'; end if;
  raise notice 'ok: not even the owner hands out the owner role (42501)';
end $$;
reset role;

rollback to savepoint checks; reset role;


-- ===== checks part-d =====
-- Part D — notifications that reach people, in ONE rolled-back transaction.
--
-- Covers 20261011000001 (an incident notifies exactly its building's
-- managers; a booking notifies the business owner; confirmed / declined /
-- completed notify the customer, and the customer's own change does not),
-- 20261011000002 (preferences are the account's to change; push
-- subscriptions are own-rows only, and registering takes an endpoint over;
-- the dispatcher's claims are service-role only and never hand the same row
-- out twice) and 20261011000003/20261011000004 (no rule may choose SMS; a historic sms rule
-- stays editable) and 20261011000005 (a permanently refused email is not
-- retried).
--
-- Not yet run: written before these migrations were applied (no database was
-- reachable from the session that wrote it). Run it after they are, as the
-- project's own connection role (the Supabase SQL editor or MCP
-- `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-d.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written.
--
-- Actors come from live data: a live building that has at least one
-- unsuspended manager, and three non-admin, unsuspended profiles who manage
-- nothing — a business owner, a customer, and an unrelated person. Each
-- impersonation asserts is_admin() = false, since policies carry is_admin()
-- as a disjunct.

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_building uuid; v_code text;
  v_owner uuid; v_customer uuid; v_other uuid;
  v_biz uuid; v_service uuid;
begin
  select b.id, b.building_code into v_building, v_code
    from public.buildings b
   where b.archived_at is null and b.building_code is not null
     and exists (select 1 from public.building_managers bm
                   join public.profiles p on p.id = bm.profile_id
                  where bm.building_id = b.id and not p.is_suspended)
   order by b.created_at, b.id limit 1;
  if v_building is null then raise exception 'FIXTURE: no live building with an unsuspended manager'; end if;

  select pr.id into v_owner from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_customer from public.profiles pr
   where pr.id <> v_owner and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_other from public.profiles pr
   where pr.id not in (v_owner, v_customer) and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
   order by pr.created_at, pr.id limit 1;
  if v_owner is null or v_customer is null or v_other is null then
    raise exception 'FIXTURE: need three non-admin, non-manager profiles';
  end if;

  insert into public.businesses (owner_id, name, category)
  values (v_owner, 'Part D Grooming', 'Grooming') returning id into v_biz;
  insert into public.business_services (business_id, name, price_cents)
  values (v_biz, 'Full groom', 6500) returning id into v_service;

  -- Both on, whatever the live rows say, so the claims below can see them.
  update public.profiles set notify_email = true, notify_push = true
   where id in (v_owner, v_customer, v_other);

  perform set_config('part_d.building', v_building::text, true);
  perform set_config('part_d.code', v_code, true);
  perform set_config('part_d.owner', v_owner::text, true);
  perform set_config('part_d.customer', v_customer::text, true);
  perform set_config('part_d.other', v_other::text, true);
  perform set_config('part_d.biz', v_biz::text, true);
  perform set_config('part_d.service', v_service::text, true);
  raise notice 'fixtures: building % owner % customer % other % biz %',
    v_building, v_owner, v_customer, v_other, v_biz;
end $$;

-- ===========================================================================
-- 1. A guest's incident report notifies exactly the building's managers
-- ===========================================================================
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
do $$
declare v jsonb;
begin
  v := public.submit_incident_report(
    current_setting('part_d.code'), 'off_leash',
    'Part D test: call me on 555-0100, I am the reporter', 'Lobby', null, true);
  if not coalesce((v->>'ok')::boolean, false) then
    raise exception 'FAIL: guest report refused: %', v;
  end if;
  perform set_config('part_d.ref', v->>'reference', true);
  raise notice 'ok: a guest filed a report (%)', v->>'reference';
end $$;

reset role;
do $$
declare
  v_expected int; v_got int; v_stray int; v_leak int;
begin
  select count(*) into v_expected
    from public.building_managers bm join public.profiles p on p.id = bm.profile_id
   where bm.building_id = current_setting('part_d.building')::uuid and not p.is_suspended;

  select count(*) into v_got
    from public.notifications n
   where n.kind = 'incident'
     and n.building_id = current_setting('part_d.building')::uuid
     and n.title like '%' || current_setting('part_d.ref')
     and n.action_target = 'incidents'
     and n.profile_id in (select bm.profile_id from public.building_managers bm
                           where bm.building_id = current_setting('part_d.building')::uuid);
  if v_got <> v_expected then
    raise exception 'FAIL: % managers should be told, % were', v_expected, v_got;
  end if;

  select count(*) into v_stray
    from public.notifications n
   where n.title like '%' || current_setting('part_d.ref')
     and n.profile_id not in (select bm.profile_id from public.building_managers bm
                               join public.profiles p on p.id = bm.profile_id
                              where bm.building_id = current_setting('part_d.building')::uuid
                                and not p.is_suspended);
  if v_stray <> 0 then raise exception 'FAIL: % non-managers were told about the incident', v_stray; end if;

  -- WHERE, never WHO: the description (which carries a phone number) is not in it.
  select count(*) into v_leak
    from public.notifications n
   where n.title like '%' || current_setting('part_d.ref')
     and (coalesce(n.body, '') like '%555-0100%' or n.title like '%555-0100%');
  if v_leak <> 0 then raise exception 'FAIL: the reporter''s words reached the notification'; end if;
  raise notice 'ok: exactly the % unsuspended managers were told, and nothing the reporter wrote', v_expected;
end $$;

-- ===========================================================================
-- 2. A booking notifies the business owner
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.customer'), 'role', 'authenticated')::text, true);
do $$
declare v_id uuid;
begin
  if public.is_admin() then raise exception 'FIXTURE: customer is an admin'; end if;
  insert into public.service_bookings (business_id, customer_id, service_id, amount_cents, scheduled_for)
  values (current_setting('part_d.biz')::uuid, auth.uid(), current_setting('part_d.service')::uuid,
          6500, now() + interval '3 days')
  returning id into v_id;
  perform set_config('part_d.booking', v_id::text, true);
  raise notice 'ok: the customer booked';
end $$;

reset role;
do $$
declare v_n int; v_customer_n int;
begin
  select count(*) into v_n from public.notifications
   where profile_id = current_setting('part_d.owner')::uuid
     and kind = 'appointment' and action_target = 'business:bookings'
     and title like 'New booking request%Full groom%';
  if v_n <> 1 then raise exception 'FAIL: the business owner got % booking notifications, expected 1', v_n; end if;

  select count(*) into v_customer_n from public.notifications
   where profile_id = current_setting('part_d.customer')::uuid and kind = 'appointment';
  if v_customer_n <> 0 then raise exception 'FAIL: the customer was told about their own booking'; end if;
  raise notice 'ok: the owner, and only the owner, heard about the booking';
end $$;

-- ===========================================================================
-- 3. confirmed / declined / completed notify the customer; their own change does not
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.owner'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;
  update public.service_bookings set status = 'confirmed', responded_at = now()
   where id = current_setting('part_d.booking')::uuid;
  if not found then raise exception 'FAIL: the owner could not confirm their own booking'; end if;
  -- Writing the same status again is not news.
  update public.service_bookings set status = 'confirmed'
   where id = current_setting('part_d.booking')::uuid;
  update public.service_bookings set status = 'completed'
   where id = current_setting('part_d.booking')::uuid;
end $$;

reset role;
do $$
declare v_confirmed int; v_completed int;
begin
  select count(*) into v_confirmed from public.notifications
   where profile_id = current_setting('part_d.customer')::uuid
     and kind = 'appointment' and action_target = 'my-bookings' and title like 'Booking confirmed%';
  select count(*) into v_completed from public.notifications
   where profile_id = current_setting('part_d.customer')::uuid
     and kind = 'appointment' and action_target = 'my-bookings' and title like 'Booking completed%';
  if v_confirmed <> 1 then raise exception 'FAIL: % "confirmed" notifications, expected 1', v_confirmed; end if;
  if v_completed <> 1 then raise exception 'FAIL: % "completed" notifications, expected 1', v_completed; end if;
  raise notice 'ok: the customer was told once per real status change';
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.customer'), 'role', 'authenticated')::text, true);
do $$
begin
  -- bookings_customer_update lets the customer write their own row; whatever
  -- they set, they are not notified about their own action.
  update public.service_bookings set status = 'declined'
   where id = current_setting('part_d.booking')::uuid;
end $$;

reset role;
do $$
declare v int;
begin
  select count(*) into v from public.notifications
   where profile_id = current_setting('part_d.customer')::uuid and title like 'Booking declined%';
  if v <> 0 then raise exception 'FAIL: the customer was notified about their own change'; end if;
  raise notice 'ok: the customer''s own change notifies nobody';
end $$;

-- ===========================================================================
-- 4. Preferences are the account's own to change
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.customer'), 'role', 'authenticated')::text, true);
do $$
begin
  update public.profiles set notify_email = false, notify_push = false where id = auth.uid();
  if not found then raise exception 'FAIL: the account could not change its own preferences'; end if;
  if (select notify_email or notify_push from public.profiles where id = auth.uid()) then
    raise exception 'FAIL: preferences did not stick';
  end if;
  update public.profiles set notify_email = false where id = current_setting('part_d.other')::uuid;
  if found then raise exception 'FAIL: an account changed someone else''s preferences'; end if;
  update public.profiles set notify_email = true, notify_push = true where id = auth.uid();
  raise notice 'ok: preferences are own-row only, and guard_profile_privilege allows them';
end $$;

-- ===========================================================================
-- 5. Push subscriptions: own rows only; registering takes an endpoint over
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.other'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.register_web_push_subscription('https://push.example.test/part-d-shared', 'k1', 'a1', 'test');
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: register refused: %', v; end if;
  insert into public.web_push_subscriptions (profile_id, endpoint, p256dh, auth)
  values (auth.uid(), 'https://push.example.test/part-d-other', 'k', 'a');
  raise notice 'ok: an account registers and inserts its own subscriptions';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.customer'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  if exists (select 1 from public.web_push_subscriptions where endpoint like 'https://push.example.test/part-d-%') then
    raise exception 'FAIL: an account can see another''s push subscriptions';
  end if;

  begin
    insert into public.web_push_subscriptions (profile_id, endpoint, p256dh, auth)
    values (current_setting('part_d.other')::uuid, 'https://push.example.test/part-d-forged', 'k', 'a');
    raise exception 'FAIL: inserted a subscription for someone else';
  exception when insufficient_privilege then null;
  end;

  delete from public.web_push_subscriptions where endpoint = 'https://push.example.test/part-d-other';
  if found then raise exception 'FAIL: deleted another account''s subscription'; end if;

  v := public.register_web_push_subscription('http://insecure.example.test/x', 'k', 'a', null);
  if (v->>'error') is distinct from 'invalid_subscription' then
    raise exception 'FAIL: a non-https endpoint was accepted: %', v;
  end if;

  -- The same browser, now signed in as someone else.
  v := public.register_web_push_subscription('https://push.example.test/part-d-shared', 'k2', 'a2', 'test');
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: takeover refused: %', v; end if;
  if not exists (select 1 from public.web_push_subscriptions
                  where endpoint = 'https://push.example.test/part-d-shared' and profile_id = auth.uid()) then
    raise exception 'FAIL: the endpoint was not taken over by the signed-in account';
  end if;
  raise notice 'ok: own rows only, and a shared browser moves to whoever is signed in';
end $$;

reset role;
do $$
begin
  if (select count(*) from public.web_push_subscriptions
       where endpoint = 'https://push.example.test/part-d-shared') <> 1 then
    raise exception 'FAIL: the taken-over endpoint is held twice';
  end if;
  raise notice 'ok: one endpoint, one row';
end $$;

-- ===========================================================================
-- 6. The dispatcher's claims: service role only, and never the same row twice
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_d.customer'), 'role', 'authenticated')::text, true);
do $$
begin
  if has_function_privilege('authenticated', 'public.claim_notification_emails(public.notification_kind[], integer)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_notification_pushes(integer)', 'execute') then
    raise exception 'FAIL: a signed-in account can lease notifications';
  end if;
  begin
    perform public.claim_notification_pushes(10);
    raise exception 'FAIL: claim_notification_pushes ran for authenticated';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: only the service role can claim';
end $$;

reset role;
do $$
declare
  v_old uuid; v_fresh uuid; v_read uuid; v_care uuid;
  v_first uuid[]; v_second uuid[]; v_push1 uuid[]; v_push2 uuid[];
begin
  insert into public.notifications (profile_id, kind, title, created_at)
  values (current_setting('part_d.customer')::uuid, 'billing', 'Part D old enough', now() - interval '10 minutes')
  returning id into v_old;
  insert into public.notifications (profile_id, kind, title, created_at)
  values (current_setting('part_d.customer')::uuid, 'billing', 'Part D too fresh', now() - interval '30 seconds')
  returning id into v_fresh;
  insert into public.notifications (profile_id, kind, title, created_at, read_at)
  values (current_setting('part_d.customer')::uuid, 'billing', 'Part D already read', now() - interval '10 minutes', now())
  returning id into v_read;
  insert into public.notifications (profile_id, kind, title, created_at)
  values (current_setting('part_d.customer')::uuid, 'care', 'Part D push-only', now() - interval '10 minutes')
  returning id into v_care;

  select array_agg(c.id) into v_first
    from public.claim_notification_emails(array['billing', 'appointment']::public.notification_kind[], 1000) c;
  if not (v_old = any (coalesce(v_first, '{}'))) then raise exception 'FAIL: an eligible row was not claimed'; end if;
  if v_fresh = any (coalesce(v_first, '{}')) then raise exception 'FAIL: a row under two minutes old was claimed'; end if;
  if v_read = any (coalesce(v_first, '{}')) then raise exception 'FAIL: a read row was claimed for email'; end if;
  if v_care = any (coalesce(v_first, '{}')) then raise exception 'FAIL: a push-only kind was claimed for email'; end if;

  select array_agg(c.id) into v_second
    from public.claim_notification_emails(array['billing', 'appointment']::public.notification_kind[], 1000) c;
  if coalesce(v_second, '{}') && v_first then raise exception 'FAIL: a leased row was handed out twice'; end if;
  raise notice 'ok: email claims respect age, read and kind, and lease each row once';

  -- The customer holds a subscription (section 5), so push sees every kind.
  select array_agg(c.id) into v_push1 from public.claim_notification_pushes(1000) c;
  if not (v_care = any (coalesce(v_push1, '{}'))) then raise exception 'FAIL: a push-only kind was not pushed'; end if;
  if v_read = any (coalesce(v_push1, '{}')) then raise exception 'FAIL: a read row was claimed for push'; end if;
  select array_agg(c.id) into v_push2 from public.claim_notification_pushes(1000) c;
  if coalesce(v_push2, '{}') && v_push1 then raise exception 'FAIL: a push lease was handed out twice'; end if;
  raise notice 'ok: push claims take every kind and lease each row once';

  -- 20261011000005: a message Resend refused for good is never claimed again.
  update public.notifications set email_claimed_at = null, email_failed_at = now() where id = v_old;
  if exists (select 1 from public.claim_notification_emails(array['billing']::public.notification_kind[], 1000) c
              where c.id = v_old) then
    raise exception 'FAIL: a permanently refused email was claimed again';
  end if;
  update public.notifications set email_failed_at = null where id = v_old;
  raise notice 'ok: email_failed_at stops the retries';

  update public.profiles set notify_email = false where id = current_setting('part_d.customer')::uuid;
  update public.notifications set email_claimed_at = null where id = v_old;
  if exists (select 1 from public.claim_notification_emails(array['billing']::public.notification_kind[], 1000) c
              where c.id = v_old) then
    raise exception 'FAIL: email was claimed for an account that turned it off';
  end if;
  raise notice 'ok: notify_email = false stops the email claim';
end $$;

-- ===========================================================================
-- 7. No new SMS reminder rule
-- ===========================================================================
do $$
begin
  begin
    insert into public.reminder_rules (business_id, name, trigger_kind, channel)
    values (current_setting('part_d.biz')::uuid, 'Part D SMS', 'vaccination_due', 'sms');
    raise exception 'FAIL: an SMS reminder rule was saved';
  exception when check_violation then null;
  end;
  insert into public.reminder_rules (business_id, name, trigger_kind, channel)
  values (current_setting('part_d.biz')::uuid, 'Part D email', 'vaccination_due', 'email');
  begin
    update public.reminder_rules set channel = 'sms'
     where business_id = current_setting('part_d.biz')::uuid and name = 'Part D email';
    raise exception 'FAIL: a rule was switched to SMS';
  exception when check_violation then null;
  end;
  raise notice 'ok: SMS is refused on insert and on a channel change, email is accepted';
end $$;

-- A rule saved as sms before 20261011000004 is history: it stays editable.
alter table public.reminder_rules disable trigger trg_reminder_rules_refuse_sms;
insert into public.reminder_rules (business_id, name, trigger_kind, channel)
values (current_setting('part_d.biz')::uuid, 'Part D historic sms', 'vaccination_due', 'sms');
alter table public.reminder_rules enable trigger trg_reminder_rules_refuse_sms;
do $$
begin
  update public.reminder_rules set is_active = false, name = 'Part D historic sms (off)'
   where business_id = current_setting('part_d.biz')::uuid and name = 'Part D historic sms';
  if not found then raise exception 'FAIL: a historic sms rule could not be switched off'; end if;
  update public.reminder_rules set channel = 'email'
   where business_id = current_setting('part_d.biz')::uuid and name = 'Part D historic sms (off)';
  if not found then raise exception 'FAIL: a historic sms rule could not move to email'; end if;
  raise notice 'ok: a historic sms rule can be switched off and moved off sms';
end $$;

rollback to savepoint checks; reset role;


-- ===== checks part-f =====
-- Part F — admin RPCs, account deletion, the audit log, booking cancellation,
-- in ONE rolled-back transaction.
--
-- Covers 20261012000001 (deleting a profile with closed history succeeds and
-- nulls every person column while the records stay; a guard still refuses a
-- non-referential rewrite of the same column), 20261012000002 (the admin RPCs
-- refuse non-admins, and an admin cannot suspend or demote themselves),
-- the audit log's reach (a building's manager reads it, nobody else does) and
-- 20261012000004 (a customer cancels through the RPC, the business is told,
-- and the direct UPDATE path is gone). The review round added 20261012000006
-- (no direct PATCH of admin/suspension flags, admins included),
-- 20261012000007 (anonymous reports name nobody in audit_log) and
-- 20261012000008 (a client's booking insert is rewritten by the server).
--
-- Not yet run: written before these migrations were applied (no database was
-- reachable from the session that wrote it). Run it after they are, as the
-- project's own connection role (the Supabase SQL editor or MCP
-- `execute_sql`):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/part-f.sql
--
-- Every assertion RAISES on failure, so a clean run that ends in ROLLBACK and
-- prints only `ok:` notices is a pass. Nothing is written.

savepoint checks;

-- ---------------------------------------------------------------------------
-- Fixtures, as the connection role
-- ---------------------------------------------------------------------------
do $$
declare
  v_building uuid; v_manager uuid; v_outsider uuid; v_owner uuid; v_admin uuid;
  v_gone uuid := gen_random_uuid();
  v_pet uuid; v_vio uuid; v_biz uuid; v_service uuid;
begin
  select bm.building_id, bm.profile_id into v_building, v_manager
    from public.building_managers bm
    join public.profiles p on p.id = bm.profile_id
    join public.buildings b on b.id = bm.building_id
   where not p.is_suspended and not p.is_super_admin and b.archived_at is null
   order by bm.created_at, bm.id limit 1;
  if v_building is null then raise exception 'FIXTURE: no live building with a non-admin manager'; end if;

  select pr.id into v_outsider from public.profiles pr
   where not pr.is_super_admin and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_owner from public.profiles pr
   where pr.id <> v_outsider and not pr.is_super_admin and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
   order by pr.created_at, pr.id limit 1;
  if v_outsider is null or v_owner is null then raise exception 'FIXTURE: need two non-admin, non-manager profiles'; end if;

  -- An admin to impersonate: a live one, or the outsider promoted for the
  -- length of this transaction (trg_profiles_guard admits a write with no JWT).
  select id into v_admin from public.profiles where is_super_admin and not is_suspended order by created_at limit 1;
  if v_admin is null then
    update public.profiles set is_super_admin = true where id = v_outsider;
    select pr.id into v_outsider from public.profiles pr
     where pr.id not in (v_owner, v_outsider) and not pr.is_super_admin and not pr.is_suspended
       and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
     order by pr.created_at, pr.id limit 1;
    select id into v_admin from public.profiles where is_super_admin and not is_suspended order by created_at limit 1;
  end if;

  -- The person who will be deleted: a fresh account (handle_new_user makes
  -- the profile) with a history that touches every kind of column.
  insert into auth.users (id, instance_id, aud, role, email)
  values (v_gone, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'part-f-' || v_gone || '@example.invalid');
  if not exists (select 1 from public.profiles where id = v_gone) then
    raise exception 'FIXTURE: handle_new_user did not create the profile';
  end if;

  insert into public.pets (owner_id, name, species, building_id)
  values (v_gone, 'Part F Rex', 'dog', v_building) returning id into v_pet;

  -- subject + actor on a closed case, its fine, a decided appeal
  insert into public.violations (building_id, resident_id, pet_id, opened_by, type, stage, resolved_at)
  values (v_building, v_gone, v_pet, v_gone, 'off_leash', 'resolved', now()) returning id into v_vio;
  insert into public.violation_events (violation_id, from_stage, to_stage, actor_id, note)
  values (v_vio, 'open', 'resolved', v_gone, 'Part F');
  insert into public.fines (violation_id, building_id, resident_id, issued_by, amount_cents, status)
  values (v_vio, v_building, v_gone, v_gone, 5000, 'paid');
  insert into public.violation_disputes (violation_id, stage, filed_by, reason, outcome, decided_by, decided_at)
  values (v_vio, 'warning', v_gone, 'Part F appeal', 'upheld', v_gone, now());

  -- reports, community, audit, payments
  insert into public.incident_reports (building_id, reporter_id, triaged_by, type, description)
  values (v_building, v_gone, v_gone, 'off_leash', 'Part F incident');
  insert into public.community_posts (building_id, author_id, content) values (v_building, v_gone, 'Part F post');
  insert into public.lost_found (building_id, reporter_id, kind, pet_name) values (v_building, v_gone, 'lost', 'Part F');
  insert into public.events (building_id, created_by, title, starts_at)
  values (v_building, v_gone, 'Part F event', now() + interval '1 day');
  insert into public.audit_log (actor_id, action, entity_type, building_id, metadata)
  values (v_gone, 'violation.opened', 'violation', v_building, '{}'::jsonb);
  insert into public.payments (profile_id, purpose, amount_cents, provider) values (v_gone, 'fine', 5000, 'stripe');
  insert into public.emergency_access_tokens (building_id, token, issued_by)
  values (v_building, 'part-f-' || v_gone, v_gone);

  -- a business and a booking for section 4
  insert into public.businesses (owner_id, name, category) values (v_owner, 'Part F Grooming', 'Grooming')
  returning id into v_biz;
  insert into public.business_services (business_id, name, price_cents) values (v_biz, 'Bath', 4000)
  returning id into v_service;
  -- the deleted person's booking there, so customer_id goes NULL too
  insert into public.service_bookings (business_id, customer_id, service_id, amount_cents, status)
  values (v_biz, v_gone, v_service, 4000, 'completed');

  perform set_config('part_f.building', v_building::text, true);
  perform set_config('part_f.manager', v_manager::text, true);
  perform set_config('part_f.outsider', v_outsider::text, true);
  perform set_config('part_f.owner', v_owner::text, true);
  perform set_config('part_f.admin', v_admin::text, true);
  perform set_config('part_f.gone', v_gone::text, true);
  perform set_config('part_f.vio', v_vio::text, true);
  perform set_config('part_f.biz', v_biz::text, true);
  perform set_config('part_f.service', v_service::text, true);
  raise notice 'fixtures: building % manager % outsider % owner % admin % gone %',
    v_building, v_manager, v_outsider, v_owner, v_admin, v_gone;
end $$;

-- ===========================================================================
-- 1. A guard still refuses a rewrite that is not the referential SET NULL
-- ===========================================================================
do $$
begin
  begin
    update public.fines set resident_id = null where violation_id = current_setting('part_f.vio')::uuid;
    raise exception 'FAIL: a fine''s resident was nulled while the resident still exists';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.events set created_by = null where title = 'Part F event';
    raise exception 'FAIL: an event''s author was nulled while the author still exists';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: nulling a live person''s column is still a rewrite';
end $$;

-- ===========================================================================
-- 2. Deleting a profile with closed history succeeds and de-identifies it
-- ===========================================================================
do $$
declare
  v_gone uuid := current_setting('part_f.gone')::uuid;
  v_vio uuid := current_setting('part_f.vio')::uuid;
  v_left int;
begin
  delete from auth.users where id = v_gone;

  if exists (select 1 from public.profiles where id = v_gone) then raise exception 'FAIL: the profile survived'; end if;
  if exists (select 1 from public.pets where owner_id = v_gone) then raise exception 'FAIL: the pet survived'; end if;

  select count(*) into v_left from public.violations
   where id = v_vio and resident_id is null and opened_by is null and pet_id is null;
  if v_left <> 1 then raise exception 'FAIL: the case is gone or still names the person or pet'; end if;
  if not exists (select 1 from public.violation_events where violation_id = v_vio and actor_id is null) then
    raise exception 'FAIL: the case history lost its event or kept the actor';
  end if;
  if not exists (select 1 from public.fines where violation_id = v_vio and resident_id is null and issued_by is null and status = 'paid') then
    raise exception 'FAIL: the fine is gone or still names the person';
  end if;
  if not exists (select 1 from public.violation_disputes
                  where violation_id = v_vio and filed_by is null and decided_by is null and outcome = 'upheld') then
    raise exception 'FAIL: the decided appeal is gone or still names the person';
  end if;
  if not exists (select 1 from public.incident_reports where description = 'Part F incident' and reporter_id is null and triaged_by is null) then
    raise exception 'FAIL: the incident report is gone or still names the person';
  end if;
  if not exists (select 1 from public.community_posts where content = 'Part F post' and author_id is null) then
    raise exception 'FAIL: the post is gone or still names its author';
  end if;
  if not exists (select 1 from public.lost_found where pet_name = 'Part F' and reporter_id is null) then
    raise exception 'FAIL: the lost-and-found report is gone or still names its reporter';
  end if;
  if not exists (select 1 from public.events where title = 'Part F event' and created_by is null) then
    raise exception 'FAIL: the event is gone or still names its author';
  end if;
  if exists (select 1 from public.audit_log where actor_id = v_gone)
     or exists (select 1 from public.payments where profile_id = v_gone)
     or exists (select 1 from public.emergency_access_tokens where issued_by = v_gone)
     or exists (select 1 from public.service_bookings where customer_id = v_gone) then
    raise exception 'FAIL: a row still names the deleted person';
  end if;
  if not exists (select 1 from public.service_bookings
                  where business_id = current_setting('part_f.biz')::uuid and customer_id is null) then
    raise exception 'FAIL: the booking history is gone';
  end if;
  raise notice 'ok: the account is deleted; every record stays and names nobody';
end $$;

-- ===========================================================================
-- 3. Admin RPCs refuse non-admins, and an admin cannot lock themselves out
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FIXTURE: outsider is an admin'; end if;
  begin
    perform public.admin_platform_stats();
    raise exception 'FAIL: a non-admin read platform stats';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.admin_list_users(null, 10, 0);
    raise exception 'FAIL: a non-admin listed users';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_set_user_flags(auth.uid(), null, true);
    raise exception 'FAIL: a non-admin made themselves an admin';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: the admin RPCs refuse a non-admin';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.admin'), 'role', 'authenticated')::text, true);
do $$
declare v_stats jsonb; v_n int;
begin
  if not public.is_admin() then raise exception 'FIXTURE: admin is not an admin'; end if;
  begin
    perform public.admin_set_user_flags(auth.uid(), true, null);
    raise exception 'FAIL: an admin suspended themselves';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_set_user_flags(auth.uid(), null, false);
    raise exception 'FAIL: an admin demoted themselves';
  exception when insufficient_privilege then null;
  end;

  perform public.admin_set_user_flags(current_setting('part_f.outsider')::uuid, true, null);
  if not (select is_suspended from public.profiles where id = current_setting('part_f.outsider')::uuid) then
    raise exception 'FAIL: the admin could not suspend another account';
  end if;
  if not exists (select 1 from public.audit_log where action = 'user.suspended'
                  and entity_id = current_setting('part_f.outsider')::uuid and actor_id = auth.uid()) then
    raise exception 'FAIL: the suspension was not audit-logged';
  end if;
  perform public.admin_set_user_flags(current_setting('part_f.outsider')::uuid, false, null);

  v_stats := public.admin_platform_stats();
  if (v_stats->>'users')::int < 1 or v_stats->'businesses_by_tier' is null then
    raise exception 'FAIL: platform stats look wrong: %', v_stats;
  end if;
  select count(*) into v_n from public.admin_list_users('Part F', 50, 0);
  raise notice 'ok: admins act on others, never on themselves; stats %; % "Part F" users', v_stats->>'users', v_n;
end $$;

-- ===========================================================================
-- 4. The audit log: the building's manager reads it, an outsider does not
-- ===========================================================================
reset role;
insert into public.audit_log (actor_id, action, entity_type, building_id, metadata)
values (current_setting('part_f.manager')::uuid, 'building.fine_schedule_set', 'building',
        current_setting('part_f.building')::uuid, '{"part_f": true}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  if not exists (select 1 from public.audit_log
                  where building_id = current_setting('part_f.building')::uuid and metadata ? 'part_f') then
    raise exception 'FAIL: the building''s manager cannot read its audit log';
  end if;
  raise notice 'ok: the manager reads the building''s audit log';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  if exists (select 1 from public.audit_log where building_id = current_setting('part_f.building')::uuid) then
    raise exception 'FAIL: an outsider read the building''s audit log';
  end if;
  raise notice 'ok: an outsider reads none of it';
end $$;

-- ===========================================================================
-- 5. A customer cancels through the RPC; the direct UPDATE path is gone
-- ===========================================================================
do $$
declare v_id uuid; v_n int;
begin
  insert into public.service_bookings (business_id, customer_id, service_id, amount_cents, scheduled_for)
  values (current_setting('part_f.biz')::uuid, auth.uid(), current_setting('part_f.service')::uuid,
          4000, now() + interval '2 days')
  returning id into v_id;

  update public.service_bookings set status = 'paid', amount_cents = 0 where id = v_id;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: the customer rewrote their own booking'; end if;

  perform public.customer_cancel_booking(v_id);
  perform public.customer_cancel_booking(v_id);  -- a repeat is a no-op
  perform set_config('part_f.booking', v_id::text, true);
  raise notice 'ok: the customer could not rewrite the booking, and cancelled it';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.manager'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.customer_cancel_booking(current_setting('part_f.booking')::uuid);
    raise exception 'FAIL: someone else cancelled the customer''s booking';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: only the customer can cancel';
end $$;

reset role;
do $$
declare v_n int;
begin
  if (select status from public.service_bookings where id = current_setting('part_f.booking')::uuid) <> 'cancelled' then
    raise exception 'FAIL: the booking is not cancelled';
  end if;
  select count(*) into v_n from public.notifications
   where profile_id = current_setting('part_f.owner')::uuid
     and action_target = 'business:bookings' and title like 'Booking cancelled%Bath%';
  if v_n <> 1 then raise exception 'FAIL: the business was told % times, expected once', v_n; end if;

  update public.service_bookings set status = 'completed' where id = current_setting('part_f.booking')::uuid;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.customer_cancel_booking(current_setting('part_f.booking')::uuid);
    raise exception 'FAIL: a completed booking was cancelled';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'ok: a completed booking cannot be cancelled';
end $$;

-- ===========================================================================
-- 6. (review) Admin flags have one door, for admins too
-- ===========================================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.admin'), 'role', 'authenticated')::text, true);
do $$
begin
  if not public.is_admin() then raise exception 'FIXTURE: admin is not an admin'; end if;
  begin
    update public.profiles set is_suspended = true, suspended_at = now()
     where id = current_setting('part_f.outsider')::uuid;
    raise exception 'FAIL: an admin suspended someone by a direct PATCH';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set is_super_admin = false where id = auth.uid();
    raise exception 'FAIL: an admin demoted themselves by a direct PATCH';
  exception when insufficient_privilege then null;
  end;
  -- An ordinary profile edit still works, and the RPC still does.
  update public.profiles set full_name = full_name where id = auth.uid();
  perform public.admin_set_user_flags(current_setting('part_f.outsider')::uuid, true, null);
  perform public.admin_set_user_flags(current_setting('part_f.outsider')::uuid, false, null);
  raise notice 'ok: flags change only through admin_set_user_flags';
end $$;

-- ===========================================================================
-- 7. (review) An anonymous report names nobody in the audit log
-- ===========================================================================
reset role;
select set_config('part_f.code',
  (select building_code from public.buildings where id = current_setting('part_f.building')::uuid), true);
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.outsider'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.submit_incident_report(current_setting('part_f.code'), 'off_leash', 'Part F anonymous report', null, null, true);
  if not coalesce((v->>'ok')::boolean, false) then raise exception 'FAIL: the report was refused: %', v; end if;
  perform set_config('part_f.anon_ref', v->>'reference', true);
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.audit_log
              where action = 'incident.submitted'
                and metadata->>'reference' = current_setting('part_f.anon_ref')
                and actor_id is not null) then
    raise exception 'FAIL: the anonymous report''s audit row names the reporter';
  end if;
  if exists (select 1 from public.audit_log a join public.incident_reports ir on ir.id = a.entity_id
              where a.action = 'incident.submitted' and ir.is_anonymous and a.actor_id is not null) then
    raise exception 'FAIL: an older anonymous report''s audit row still names its reporter';
  end if;
  raise notice 'ok: anonymous reports name nobody, old or new';
end $$;

-- ===========================================================================
-- 8. (review) A customer's booking is written by the server, not the customer
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_f.outsider'), 'role', 'authenticated')::text, true);
do $$
declare v record;
begin
  insert into public.service_bookings
    (business_id, customer_id, service_id, amount_cents, commission_cents, status, responded_at, scheduled_for)
  values (current_setting('part_f.biz')::uuid, auth.uid(), current_setting('part_f.service')::uuid,
          1, 0, 'paid', now(), now() + interval '4 days')
  returning status, amount_cents, commission_cents, responded_at, payment_id into v;
  if v.status <> 'requested' or v.amount_cents <> 4000 or v.commission_cents <> 600
     or v.responded_at is not null or v.payment_id is not null then
    raise exception 'FAIL: the customer''s values survived: %', row_to_json(v);
  end if;
  begin
    insert into public.service_bookings (business_id, customer_id, service_id)
    values (current_setting('part_f.biz')::uuid, auth.uid(), gen_random_uuid());
    raise exception 'FAIL: a booking for a service that is not the business''s was accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'ok: status, amount and commission come from the server';
end $$;

rollback to savepoint checks; reset role;


-- ===== checks part-g =====
-- Part G — building managers' decisions carry reasons, and the person decided
-- about is told, in ONE rolled-back transaction.
--
-- Covers 20261015000001:
--   * manager_decide_registration — a deny with a note notifies the owner and
--     the body quotes the note; a whitespace-only note, and a 2-argument deny
--     with no note at all, are refused (22023); an approve with no note is
--     allowed and notifies too; deciding a registration that is no longer
--     pending is refused (22023) and notifies nobody again; a non-manager is
--     refused (42501); both decisions are audit-logged.
--   * manager_decide_link — approve, remove and deny each move the link,
--     stamp decided_at/decided_by, notify the resident (the reason quoted when
--     given) and write audit_log; removing a link that is still pending, and a
--     decision outside the grammar, are refused (22023); a non-manager is
--     refused (42501).
--
-- Covers 20261015000002 (sections 5-9):
--   * admin_business_footprint / admin_delete_business — a non-admin (an
--     outsider, and the business's own owner) is refused (42501); a name that
--     differs (case, blank, null) is name_mismatch; a business with a clinic
--     patient, or with an open booking, is has_records and survives with its
--     rows; an empty business — one active colleague, who is counted and does
--     not block — is deleted by its name typed with spaces around it, and
--     audited once.
--   * businesses has no client delete path: a direct delete by an admin, and
--     by the owner, matches 0 rows; the admin can still update, and the owner
--     can still update and insert (the select/insert/update split kept them).
--     The fixture businesses and an active super admin join the actors below.
--
-- Covers 20261015000004: admin_building_activity — a non-admin is refused
--   (42501); an admin gets MCR2026's live counts (active residents at least
--   the approved, not-left links).
--
-- Actors are chosen from live data, not invented: Maple Court Residences
-- (MCR2026), a non-admin manager of it, and two non-admin profiles that manage
-- no building and hold no pending or approved link anywhere (an owner and an
-- outsider) — so the fixture links cannot collide with
-- resident_links_active_uniq, whatever its exact columns. Each is asserted is_admin() = false
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
  v_pet uuid; v_pet_b uuid; v_link_a uuid; v_link_b uuid;
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
     and not exists (select 1 from public.resident_links rl
                      where rl.profile_id = pr.id and rl.status in ('pending', 'approved'))
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_outsider from public.profiles pr
   where pr.id <> v_owner and not coalesce(pr.is_super_admin, false) and not pr.is_suspended
     and not exists (select 1 from public.building_managers bm where bm.profile_id = pr.id)
     and not exists (select 1 from public.resident_links rl
                      where rl.profile_id = pr.id and rl.status in ('pending', 'approved'))
   order by pr.created_at, pr.id limit 1;
  if v_owner is null or v_outsider is null then
    raise exception 'FIXTURE: need two non-admin profiles that manage no building and hold no active link';
  end if;

  -- Two pets waiting on a registration decision in MCR2026: Biscuit will be
  -- denied, Pepper approved.
  insert into public.pets (owner_id, name, species, building_id, registration_status)
  values (v_owner, 'Part G Biscuit', 'dog', v_building, 'pending')
  returning id into v_pet;
  insert into public.pets (owner_id, name, species, building_id, registration_status)
  values (v_owner, 'Part G Pepper', 'cat', v_building, 'pending')
  returning id into v_pet_b;

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
  perform set_config('part_g.pet_b', v_pet_b::text, true);
  perform set_config('part_g.link_a', v_link_a::text, true);
  perform set_config('part_g.link_b', v_link_b::text, true);
  raise notice 'fixtures: building % manager % owner % outsider % pets % % links % %',
    v_building, v_manager, v_owner, v_outsider, v_pet, v_pet_b, v_link_a, v_link_b;
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
    perform public.manager_decide_registration(current_setting('part_g.pet_b')::uuid, true);
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
-- 2. Registration: a deny needs a reason; an approve does not; a decided
--    registration is not decided again
-- ===========================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.manager'), 'role', 'authenticated')::text, true);
do $$
declare
  v_pet uuid := current_setting('part_g.pet')::uuid;
  v_pet_b uuid := current_setting('part_g.pet_b')::uuid;
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

  perform public.manager_decide_registration(v_pet_b, true);
  if (select registration_status from public.pets where id = v_pet_b) <> 'approved' then
    raise exception 'FAIL: the approve with no note did not approve';
  end if;

  -- A second tap on either: refused, and (checked in section 4) nobody is
  -- notified twice.
  begin
    perform public.manager_decide_registration(v_pet, false, 'Still over the limit');
    raise exception 'FAIL: a denied registration was denied again';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.manager_decide_registration(v_pet, true);
    raise exception 'FAIL: a denied registration was approved without a new application';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.manager_decide_registration(v_pet_b, true);
    raise exception 'FAIL: an approved registration was approved again';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'ok: blank, missing and over-long reasons are refused (22023); a reasoned deny and a bare approve go through; a decided registration is not decided again (22023)';
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
  v_pet_b uuid := current_setting('part_g.pet_b')::uuid;
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
     and action_target = 'pet-detail:' || v_pet::text;
  if v_n <> 1 then raise exception 'FAIL: the denied pet''s owner got % notifications, expected 1 (a refused retry notified)', v_n; end if;

  select count(*) into v_n from public.notifications
   where profile_id = v_owner and created_at >= now()
     and action_target = 'pet-detail:' || v_pet_b::text
     and kind = 'building' and severity = 'success';
  if v_n <> 1 then raise exception 'FAIL: the owner got % approve notifications, expected 1', v_n; end if;

  select count(*) into v_n from public.audit_log
   where action = 'pet.registration_decided' and entity_id in (v_pet, v_pet_b) and actor_id = v_manager
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

-- ===========================================================================
-- 5. Guarded business deletion (20261015000002): fixtures, as the connection
--    role
-- ===========================================================================
-- Three businesses owned by the Part G owner (non-admin, asserted in section
-- 8): one empty but for a colleague, one with a clinic patient, one with a
-- booking still to answer. An active super admin from live data runs the
-- console's side.
do $$
declare
  v_owner uuid := current_setting('part_g.owner')::uuid;
  v_outsider uuid := current_setting('part_g.outsider')::uuid;
  v_admin uuid; v_empty uuid; v_clinic uuid; v_booked uuid; v_customer uuid; v_patient uuid;
begin
  select pr.id into v_admin from public.profiles pr
   where pr.is_super_admin and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  if v_admin is null then raise exception 'FIXTURE: no active super admin'; end if;

  -- business_bootstrap gives each one the owner's staff row and a location.
  insert into public.businesses (owner_id, name, category)
  values (v_owner, 'Part G Empty', 'Grooming') returning id into v_empty;
  -- A colleague: counted as staff, and not a reason to refuse.
  insert into public.business_staff (business_id, profile_id, role, is_active)
  values (v_empty, v_outsider, 'manager', true);

  insert into public.businesses (owner_id, name, category)
  values (v_owner, 'Part G Clinic', 'Veterinary') returning id into v_clinic;
  insert into public.clinic_customers (business_id, first_name)
  values (v_clinic, 'Part G') returning id into v_customer;
  insert into public.clinic_patients (business_id, customer_id, name)
  values (v_clinic, v_customer, 'Part G patient') returning id into v_patient;

  insert into public.businesses (owner_id, name, category)
  values (v_owner, 'Part G Booked', 'Grooming') returning id into v_booked;
  insert into public.service_bookings (business_id, customer_id, status)
  values (v_booked, v_outsider, 'requested');

  perform set_config('part_g.admin', v_admin::text, true);
  perform set_config('part_g.biz_empty', v_empty::text, true);
  perform set_config('part_g.biz_clinic', v_clinic::text, true);
  perform set_config('part_g.biz_booked', v_booked::text, true);
  perform set_config('part_g.patient', v_patient::text, true);
  raise notice 'fixtures: admin % businesses empty % clinic % booked % patient %',
    v_admin, v_empty, v_clinic, v_booked, v_patient;
end $$;

-- ===========================================================================
-- 6. A non-admin neither counts nor deletes — not even the owner
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.outsider'), 'role', 'authenticated')::text, true);
do $$
declare v_empty uuid := current_setting('part_g.biz_empty')::uuid;
begin
  if public.is_admin() then raise exception 'FIXTURE: outsider is an admin'; end if;
  begin
    perform public.admin_business_footprint(v_empty);
    raise exception 'FAIL: a non-admin read a business footprint';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_delete_business(v_empty, 'Part G Empty');
    raise exception 'FAIL: a non-admin deleted a business';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.owner'), 'role', 'authenticated')::text, true);
do $$
declare v_empty uuid := current_setting('part_g.biz_empty')::uuid;
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;
  begin
    perform public.admin_business_footprint(v_empty);
    raise exception 'FAIL: the owner read their business footprint through the admin function';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_delete_business(v_empty, 'Part G Empty');
    raise exception 'FAIL: the owner deleted their business through the admin function';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: a non-admin, owner included, is refused footprint and delete (42501)';
end $$;

-- ===========================================================================
-- 7. The admin: counts, a typed name, refusals while records exist, and no
--    direct delete
-- ===========================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.admin'), 'role', 'authenticated')::text, true);
do $$
declare
  v_empty uuid := current_setting('part_g.biz_empty')::uuid;
  v_clinic uuid := current_setting('part_g.biz_clinic')::uuid;
  v_booked uuid := current_setting('part_g.biz_booked')::uuid;
  v jsonb;
  v_n int;
begin
  if not public.is_admin() then raise exception 'FIXTURE: admin is not is_admin()'; end if;

  v := public.admin_business_footprint(v_empty);
  if v is distinct from '{"patients":0,"visits":0,"invoices":0,"staff":1,"open_bookings":0,"appointments":0}'::jsonb then
    raise exception 'FAIL: the empty business''s footprint is %, expected one colleague and nothing else', v;
  end if;
  v := public.admin_business_footprint(v_clinic);
  if (v->>'patients')::int <> 1 or (v->>'staff')::int <> 0 then
    raise exception 'FAIL: the clinic''s footprint is %, expected 1 patient and no staff beyond the owner', v;
  end if;
  v := public.admin_business_footprint(v_booked);
  if (v->>'open_bookings')::int <> 1 then
    raise exception 'FAIL: the booked business''s footprint is %, expected 1 open booking', v;
  end if;
  begin
    perform public.admin_business_footprint(gen_random_uuid());
    raise exception 'FAIL: a missing business had a footprint';
  exception when no_data_found then null;
  end;
  raise notice 'ok: the footprint counts patients, open bookings and staff other than the owner; a missing business is P0002';

  -- A direct delete, as the console used to do it: RLS matches nothing.
  delete from public.businesses where id = v_empty;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: an admin''s direct delete removed % business rows', v_n; end if;
  -- …while the admin's other writes still go through.
  update public.businesses set description = 'Part G admin edit' where id = v_clinic;
  if not found then raise exception 'FAIL: the admin could no longer update a business'; end if;
  raise notice 'ok: an admin''s direct delete matches 0 rows; an admin update still works';

  v := public.admin_delete_business(v_empty, 'part g empty');
  if v->>'error' is distinct from 'name_mismatch' then
    raise exception 'FAIL: a name in the wrong case did not answer name_mismatch: %', v;
  end if;
  v := public.admin_delete_business(v_empty, '   ');
  if v->>'error' is distinct from 'name_mismatch' then
    raise exception 'FAIL: a blank name did not answer name_mismatch: %', v;
  end if;
  v := public.admin_delete_business(v_empty, null);
  if v->>'error' is distinct from 'name_mismatch' then
    raise exception 'FAIL: a null name did not answer name_mismatch: %', v;
  end if;
  raise notice 'ok: a name that differs in case, or is blank or null, is name_mismatch';

  v := public.admin_delete_business(v_clinic, 'Part G Clinic');
  if v->>'error' is distinct from 'has_records' or (v->'footprint'->>'patients')::int <> 1 then
    raise exception 'FAIL: a business with a clinic patient did not answer has_records with its footprint: %', v;
  end if;
  v := public.admin_delete_business(v_booked, 'Part G Booked');
  if v->>'error' is distinct from 'has_records' or (v->'footprint'->>'open_bookings')::int <> 1 then
    raise exception 'FAIL: a business with an open booking did not answer has_records: %', v;
  end if;
  raise notice 'ok: a clinic patient or an open booking answers has_records, with the footprint';

  v := public.admin_delete_business(gen_random_uuid(), 'Anything');
  if v->>'error' is distinct from 'not_found' then
    raise exception 'FAIL: a missing business did not answer not_found: %', v;
  end if;

  -- Trimmed on both sides; the colleague does not block.
  v := public.admin_delete_business(v_empty, '  Part G Empty  ');
  if not coalesce((v->>'ok')::boolean, false) then
    raise exception 'FAIL: the empty business was not deleted: %', v;
  end if;
  raise notice 'ok: the empty business is deleted by its name typed with surrounding spaces';
end $$;

-- ===========================================================================
-- 8. The owner: no direct delete, but edits and sign-up inserts still work
-- ===========================================================================
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.owner'), 'role', 'authenticated')::text, true);
do $$
declare
  v_clinic uuid := current_setting('part_g.biz_clinic')::uuid;
  v_new uuid;
  v_n int;
begin
  if public.is_admin() then raise exception 'FIXTURE: owner is an admin'; end if;

  delete from public.businesses where id = v_clinic;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: the owner''s direct delete removed % business rows', v_n; end if;

  update public.businesses set description = 'Part G owner edit' where id = v_clinic;
  if not found then raise exception 'FAIL: the owner could no longer update their business'; end if;

  -- What clinic onboarding does from the browser: insert, and read the id back.
  insert into public.businesses (owner_id, name, category)
  values (auth.uid(), 'Part G New', 'Grooming') returning id into v_new;
  if v_new is null then raise exception 'FAIL: the owner could not create a business'; end if;

  delete from public.businesses where id = v_new;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FAIL: the owner deleted the business they just created (% rows)', v_n; end if;
  raise notice 'ok: an owner''s direct delete matches 0 rows; an owner still updates and inserts';
end $$;

-- ===========================================================================
-- 9. What happened: one business gone and audited, the others intact
-- ===========================================================================
reset role;
do $$
declare
  v_admin uuid := current_setting('part_g.admin')::uuid;
  v_empty uuid := current_setting('part_g.biz_empty')::uuid;
  v_n int;
begin
  if exists (select 1 from public.businesses where id = v_empty) then
    raise exception 'FAIL: the empty business still exists';
  end if;
  if exists (select 1 from public.business_staff where business_id = v_empty) then
    raise exception 'FAIL: the deleted business left staff rows behind';
  end if;
  if not exists (select 1 from public.businesses where id = current_setting('part_g.biz_clinic')::uuid
                    and description = 'Part G owner edit') then
    raise exception 'FAIL: the clinic is gone, or the owner''s edit did not land';
  end if;
  if not exists (select 1 from public.clinic_patients where id = current_setting('part_g.patient')::uuid) then
    raise exception 'FAIL: the clinic''s patient did not survive the refused delete';
  end if;
  if not exists (select 1 from public.service_bookings
                  where business_id = current_setting('part_g.biz_booked')::uuid and status = 'requested') then
    raise exception 'FAIL: the open booking did not survive the refused delete';
  end if;
  if not exists (select 1 from public.businesses where owner_id = current_setting('part_g.owner')::uuid
                    and name = 'Part G New') then
    raise exception 'FAIL: the owner''s new business is gone';
  end if;

  select count(*) into v_n from public.audit_log
   where action = 'business.deleted' and created_at >= now();
  if v_n <> 1 then raise exception 'FAIL: % business.deleted audit rows, expected 1 (refusals audit nothing)', v_n; end if;
  if not exists (select 1 from public.audit_log
                  where action = 'business.deleted' and entity_id = v_empty and actor_id = v_admin
                    and metadata->>'name' = 'Part G Empty'
                    and (metadata->'footprint'->>'staff')::int = 1) then
    raise exception 'FAIL: the audit row does not name the business, the admin and its footprint';
  end if;
  raise notice 'ok: the deleted business is audited; the refused ones keep their patient and booking';
end $$;

-- ---------------------------------------------------------------------------
-- 20261015000003 — asking a clinic for information, and its answer
-- ---------------------------------------------------------------------------
reset role;
do $$
declare v_clinic uuid := current_setting('part_g.biz_clinic')::uuid; v_r uuid; v_old uuid;
begin
  -- A fixture request on the clinic (any older open one is closed first), and
  -- an approved one for the not_open check.
  update public.business_verifications set status = 'rejected'
   where business_id = v_clinic and status in ('submitted', 'in_review', 'needs_info');
  insert into public.business_verifications (business_id, kind, status)
  values (v_clinic, 'licence', 'approved') returning id into v_old;
  insert into public.business_verifications (business_id, kind, status, licence_number, issuing_body)
  values (v_clinic, 'licence', 'submitted', 'VET-1', 'College') returning id into v_r;
  perform set_config('part_g.vreq', v_r::text, true);
  perform set_config('part_g.vreq_old', v_old::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.owner'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.admin_request_verification_info(current_setting('part_g.vreq')::uuid, 'Please send more');
    raise exception 'FAIL: a non-admin asked for information';
  exception when sqlstate '42501' then null; end;
  raise notice 'ok: a non-admin cannot ask for information (42501)';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.admin'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  v := public.admin_request_verification_info(current_setting('part_g.vreq_old')::uuid, 'Anything');
  if v->>'error' is distinct from 'not_open' then raise exception 'FAIL: ask on an approved row gave %', v; end if;
  v := public.admin_request_verification_info(current_setting('part_g.vreq')::uuid, 'Send a clearer licence number');
  if (v->>'ok')::boolean is not true then raise exception 'FAIL: ask on a submitted row gave %', v; end if;
  if not exists (select 1 from public.business_verifications
                  where id = current_setting('part_g.vreq')::uuid and status = 'needs_info'
                    and note = 'Send a clearer licence number' and reviewed_by = current_setting('part_g.admin')::uuid) then
    raise exception 'FAIL: the request did not move to needs_info with the note and reviewer';
  end if;
  raise notice 'ok: ask on submitted works; on an approved row it is not_open';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.business_resubmit_verification(current_setting('part_g.vreq')::uuid, 'VET-22', 'College', null, null);
    raise exception 'FAIL: a non-member resubmitted';
  exception when sqlstate '42501' then null; end;
  raise notice 'ok: a non-member cannot resubmit (42501)';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.owner'), 'role', 'authenticated')::text, true);
do $$
declare v jsonb;
begin
  begin
    perform public.business_resubmit_verification(current_setting('part_g.vreq')::uuid, '#!', 'College', null, null);
    raise exception 'FAIL: a bad licence number was accepted';
  exception when sqlstate '22023' then null; end;
  v := public.business_resubmit_verification(current_setting('part_g.vreq')::uuid, 'VET-22', 'College', 'Dr Lee', '604 555 0100');
  if (v->>'ok')::boolean is not true then raise exception 'FAIL: resubmit gave %', v; end if;
  if not exists (select 1 from public.business_verifications
                  where id = current_setting('part_g.vreq')::uuid and status = 'submitted'
                    and licence_number = 'VET-22' and note is null and reviewed_by is null) then
    raise exception 'FAIL: the resubmitted request is not submitted with the new details';
  end if;
  v := public.business_resubmit_verification(current_setting('part_g.vreq')::uuid, 'VET-22', 'College', null, null);
  if v->>'error' is distinct from 'not_needs_info' then raise exception 'FAIL: second resubmit gave %', v; end if;
  raise notice 'ok: bad licence 22023; resubmit moves needs_info -> submitted; a second is not_needs_info';
end $$;

reset role;
do $$
begin
  if not exists (select 1 from public.notifications
                  where profile_id = current_setting('part_g.owner')::uuid
                    and title like 'Pet10x needs more information:%' and created_at >= now()) then
    raise exception 'FAIL: the owner was not notified';
  end if;
  if not exists (select 1 from public.audit_log where action = 'business.verification_info_requested' and created_at >= now())
     or not exists (select 1 from public.audit_log where action = 'business.verification_resubmitted' and created_at >= now()) then
    raise exception 'FAIL: the ask and the resubmit were not both audited';
  end if;
  raise notice 'ok: owner notified; both audited';
end $$;

-- ===========================================================================
-- 10. admin_building_activity (20261015000004): admin only, live numbers
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.outsider'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform * from public.admin_building_activity();
    raise exception 'FAIL: a non-admin read building activity';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: a non-admin is refused building activity (42501)';
end $$;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_g.admin'), 'role', 'authenticated')::text, true);
do $$
declare
  v_building uuid := current_setting('part_g.building')::uuid;
  v_expected int;
  v_row record;
begin
  -- Computed under the admin's own role, which reads every link.
  select count(*) into v_expected from public.resident_links l
   where l.building_id = v_building and l.status = 'approved' and l.left_at is null;
  select * into v_row from public.admin_building_activity() a where a.building_id = v_building;
  if not found then raise exception 'FAIL: no activity row for MCR2026'; end if;
  if v_row.active_residents < v_expected then
    raise exception 'FAIL: active_residents % is below the % approved, not-left links', v_row.active_residents, v_expected;
  end if;
  raise notice 'ok: admin sees MCR2026 with % active residents, % open cases, % open reports',
    v_row.active_residents, v_row.open_cases, v_row.open_reports;
end $$;
reset role;

rollback to savepoint checks; reset role;


do $$ begin raise exception 'DRY RUN OK — all migrations applied and every check passed; rolled back, nothing saved'; end $$;
