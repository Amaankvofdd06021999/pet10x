-- APPLY — generated 2026-10-14 from branch ux-required-fixes by bundles/build.sh. Run dry-run.sql first.
-- One transaction: either every migration lands or none does.
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


-- Record them, so the Supabase CLI / MCP know they are applied.
do $$ begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    insert into supabase_migrations.schema_migrations (version, name) values ('20261015000001', 'decision_reasons') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261015000002', 'admin_delete_business') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261015000003', 'verification_needs_info') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261015000004', 'admin_building_activity') on conflict (version) do nothing;
  end if;
end $$;
commit;
