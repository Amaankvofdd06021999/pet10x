-- APPLY — generated 2026-10-14 from branch ux-required-fixes by bundles/build.sh. Run dry-run.sql first.
-- One transaction: either every migration lands or none does.
begin;
set local lock_timeout = '5s';

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
--      Deny REQUIRES a note (trimmed of all whitespace — tabs and
--      newlines too, regexp `\s`; whitespace is not a reason), at most
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
  v_note text := nullif(regexp_replace(coalesce(p_note, ''), '^\s+|\s+$', '', 'g'), '');
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
  v_reason   text := nullif(regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g'), '');
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
--          — exact after trimming both sides of all whitespace (regexp
--            `\s`, so a pasted tab or newline does not break the match);
--            case-sensitive; a blank name never matches
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
  v_given text := regexp_replace(coalesce(p_confirm_name, ''), '^\s+|\s+$', '', 'g');
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
  if v_given = '' or v_given <> regexp_replace(coalesce(v_biz.name, ''), '^\s+|\s+$', '', 'g') then
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
--      Admin only (42501). The note is required, trimmed of all whitespace (regexp `\s`), 2000 characters at
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
--      characters; phone empty or ^[+0-9 ()-]{7,20}$; contact name empty or
--      at most 80 characters, trimmed of all whitespace like the note, so a
--      tab alone is no name), 22023 on anything else.
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
  v_note text := nullif(regexp_replace(coalesce(p_note, ''), '^\s+|\s+$', '', 'g'), '');
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
  v_name    text := nullif(regexp_replace(coalesce(p_contact_name, ''), '^\s+|\s+$', '', 'g'), '');
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
  if length(v_name) > 80 then
    raise exception 'The contact name is too long (80 characters at most)' using errcode = '22023';
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


-- ===== migration 20261015000005_bookings_contact_and_notices.sql =====
-- Pet10x — bookings carry contact details, cancellations explain themselves,
-- owners can cancel vet visits and decline estimates.
--
-- THE GAPS (UX audit, businesses and their customers):
--   * A business had no phone or email on Pet10x, and could not reach the
--     customer behind a confirmed booking either: the Bookings tab shows a
--     first name and nothing to call.
--   * A business could only decline a request. Cancelling a confirmed booking
--     was a raw status update with no reason, and notify_customer_of_booking_
--     status never covered `cancelled`, so the customer found out by turning
--     up.
--   * A pet owner could book a vet visit and approve an estimate, but not
--     cancel the visit or say no to the estimate — both meant phoning.
--   * bookings_owner_update (20260722000000) lets the business owner update
--     ANY column of their booking — status to cancelled with no reason (so the
--     customer is never told), amount_cents, customer_id, payment_id.
--   * Appointments told nobody anything (VC-3): only trg_appts_updated sits on
--     the table. A request waited unseen until someone opened Today, and the
--     owner never heard it was confirmed, declined, cancelled or missed.
--
-- WHAT THIS DOES
--
--   1. businesses.contact_phone / contact_email — nullable text, each held to
--      a grammar by a CHECK (phone ^[+0-9 ()-]{7,20}$, the one verification
--      uses; email ^[^\s@]+@[^\s@]+\.[^\s@]+$). The owner already updates them
--      through businesses_owner_update (20261015000002) — no policy change.
--      They are business contact details, readable wherever the row is.
--
--   2. service_bookings.cancelled_reason (<= 2000 characters) and
--      cancelled_by ('customer' | 'business'), both set only by the two
--      cancel RPCs below. service_bookings_insert_guard (20261012000008,
--      copied verbatim) also clears both on a client insert.
--
--   3. business_cancel_booking(p_booking, p_reason) -> jsonb. The caller must
--      administer the booking's business — can_admin_business: its owner, or
--      active owner/manager staff — and not be suspended (42501). The reason
--      is required, trimmed, <= 2000 (22023). Only from requested or confirmed;
--      anything else is {ok:false, error:'not_cancellable'}. Sets cancelled,
--      the reason and cancelled_by 'business'; the status trigger (4) tells
--      the customer.
--
--   4. notify_customer_of_booking_status — LIVE definition (as
--      20261012000009) verbatim, plus `cancelled` when cancelled_by is
--      'business': "Booking cancelled — {biz}", warning, quoting the reason.
--      A customer's own cancellation stays silent to them twice over: the
--      auth.uid() guard, and cancelled_by 'customer'.
--
--   5. customer_cancel_booking — LIVE definition (as 20261012000004)
--      verbatim, plus cancelled_by = 'customer' on its one update.
--
--   6. business_booking_contact(p_booking) -> jsonb {email, phone}: the
--      customer's profile email and phone, to someone who administers the
--      booking's business, while the booking is confirmed, in_progress,
--      completed or paid. Anyone else, and any other status, gets
--      {email:null, phone:null} — a request is not yet an introduction.
--
--   7. owner_cancel_appointment(p_appointment, p_reason default null) -> jsonb.
--      Only the pet's owner (appointments -> clinic_patients -> pets.owner_id,
--      the owner_approve_estimate path), and not while suspended (as
--      business_cancel_booking), else 42501. Only from requested or
--      booked ({ok:false, error:'not_cancellable'}), and only while the start
--      is more than 2 hours away ({ok:false, error:'too_late'}) — inside that
--      the slot cannot be re-used and the owner should phone. Stamps
--      cancelled_at and cancel_reason; notifies the practice's administrators
--      (owner_approve_estimate's recipients) with target clinic:today.
--
--   8. owner_decline_estimate(p_invoice, p_note) -> jsonb. Owner only (42501);
--      the note is required, trimmed, <= 2000 (22023); kind estimate and
--      status sent only (not_an_estimate / not_awaiting_approval, the codes
--      owner_approve_estimate uses). Sets status `declined` — added to the
--      invoices status CHECK here — and appends "Owner declined: {note}" to
--      invoices.note, keeping whatever the practice wrote. Notifies the same
--      recipients as approval, target clinic:billing. clinic_set_invoice_
--      status's transition table has no row for `declined`, so a declined
--      estimate is final; the practice writes a new one.
--
--   9. Appointment notifications (VC-3):
--      * AFTER INSERT, status requested, or booked through owner_book_
--        appointment (source online — a type that needs no confirmation
--        lands booked; the front desk's own bookings are not news to the
--        front desk): the business owner and active
--        owner/manager/reception staff hear of it, target clinic:today —
--        "Appointment request" for a request, "New appointment booked
--        online" for a booking.
--      * AFTER UPDATE OF status to booked, cancelled or no_show, made by
--        someone other than the pet's owner: the owner hears, target
--        my-vets:visits. requested -> cancelled reads as a declined request;
--        no_show -> booked as a rebooking. cancel_reason is quoted only when
--        that same change wrote it.
--      Suspended recipients are skipped throughout.
--
--  10. service_bookings_update_guard (written beside the insert guard, in
--      section 2) — BEFORE UPDATE, security invoker, the
--      insert guard's `current_user in ('authenticated', 'anon')` test, so
--      definer RPCs (business_cancel_booking, customer_cancel_booking,
--      business_mark_booking_paid) and the connection role pass untouched.
--      For a client role it states what MAY change — the columns
--      setBookingStatus writes: status, responded_at, declined_reason (and
--      updated_at, which trg_bookings_updated stamps first) — and every other
--      column must equal OLD (42501). The status may only move
--      requested -> confirmed | declined, confirmed -> in_progress |
--      completed (a short job finished without "Start job" — part-d does
--      this), in_progress -> completed; declined_reason only on the move to
--      declined. Never to cancelled (the two cancel RPCs are the doors), never
--      to paid (business_mark_booking_paid writes the payment with it), and
--      never out of cancelled or declined.
--
-- Whitespace: every required reason is trimmed of all whitespace (tabs and
-- newlines too, regexp `\s`), not just spaces — btrim() alone leaves a tab,
-- which is not a reason. The same expression, nullif(regexp_replace(coalesce(x,
-- ''), '^\s+|\s+$', '', 'g'), ''), is used in 20261015000001 and 000003.

-- ---------------------------------------------------------------------------
-- 1. Business contact details
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists contact_phone text,
  add column if not exists contact_email text;

alter table public.businesses
  drop constraint if exists businesses_contact_phone_grammar,
  add constraint businesses_contact_phone_grammar
    check (contact_phone is null or contact_phone ~ '^[+0-9 ()-]{7,20}$'),
  drop constraint if exists businesses_contact_email_grammar,
  add constraint businesses_contact_email_grammar
    check (contact_email is null or contact_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$');

comment on column public.businesses.contact_phone is
  'How customers reach the business (20261015000005). Null, or ^[+0-9 ()-]{7,20}$.';
comment on column public.businesses.contact_email is
  'How customers reach the business (20261015000005). Null, or ^[^\s@]+@[^\s@]+\.[^\s@]+$.';

-- ---------------------------------------------------------------------------
-- 2. Who cancelled a booking, and why
-- ---------------------------------------------------------------------------
alter table public.service_bookings
  add column if not exists cancelled_reason text,
  add column if not exists cancelled_by text;

alter table public.service_bookings
  drop constraint if exists service_bookings_cancelled_reason_length,
  add constraint service_bookings_cancelled_reason_length
    check (cancelled_reason is null or length(cancelled_reason) <= 2000),
  drop constraint if exists service_bookings_cancelled_by_grammar,
  add constraint service_bookings_cancelled_by_grammar
    check (cancelled_by is null or cancelled_by in ('customer', 'business'));

comment on column public.service_bookings.cancelled_reason is
  'Why the business cancelled (business_cancel_booking, 20261015000005). At most 2000 characters.';
comment on column public.service_bookings.cancelled_by is
  'customer (customer_cancel_booking) or business (business_cancel_booking), 20261015000005.';

-- A customer books; they do not pre-cancel. service_bookings_insert_guard
-- (20261012000008, the latest definition) verbatim, plus the two new columns
-- cleared on a client insert, as it clears declined_reason. The trigger is
-- unchanged and is not recreated.
create or replace function public.service_bookings_insert_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
declare
  v_price    integer;
  v_currency text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.service_id is not null then
    select s.price_cents, s.currency into v_price, v_currency
      from public.business_services s
     where s.id = new.service_id and s.business_id = new.business_id and s.active;
    if not found then
      raise exception 'That service isn''t available to book'
        using errcode = '22023',
              hint    = 'The service must belong to the business you are booking and be active.';
    end if;
  end if;

  new.status           := 'requested';
  new.responded_at     := null;
  new.payment_id       := null;
  new.declined_reason  := null;
  new.cancelled_reason := null;
  new.cancelled_by     := null;
  new.amount_cents     := coalesce(v_price, 0);
  new.currency         := coalesce(v_currency, new.currency, 'cad');
  new.commission_cents := round(coalesce(v_price, 0) * 0.15)::integer;
  return new;
end;
$guard$;

comment on function public.service_bookings_insert_guard() is
  'BEFORE INSERT on service_bookings (20261012000008; cancelled_* added 20261015000005). For authenticated/anon callers, rewrites status to requested, clears responded_at / payment_id / declined_reason / cancelled_reason / cancelled_by, and sets amount_cents, currency and commission_cents (15%) from the booked, active business_services row of the same business (0 with no service). Refuses a service that is not that business''s or not active (22023). Service role and definer RPCs pass untouched.';

revoke all on function public.service_bookings_insert_guard() from public, anon, authenticated;

-- What a client may change on an existing booking. Positive grammar: the
-- allowed columns are named, and the rest of the row must come through
-- untouched — compared as jsonb with the allowed keys removed, so a column
-- added later is protected without editing this.
create or replace function public.service_bookings_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (to_jsonb(new) - array['status', 'responded_at', 'declined_reason', 'updated_at'])
     is distinct from
     (to_jsonb(old) - array['status', 'responded_at', 'declined_reason', 'updated_at']) then
    raise exception 'Only Pet10x can change that'
      using errcode = '42501',
            hint    = 'A booking''s status, response time and decline reason are the only client-editable fields.';
  end if;

  if new.status is distinct from old.status
     and (old.status::text, new.status::text) not in (
           ('requested',   'confirmed'),
           ('requested',   'declined'),
           ('confirmed',   'in_progress'),
           ('confirmed',   'completed'),
           ('in_progress', 'completed')) then
    raise exception 'Only Pet10x can change that'
      using errcode = '42501',
            hint    = 'Cancel with business_cancel_booking; mark paid with business_mark_booking_paid.';
  end if;

  if new.declined_reason is distinct from old.declined_reason and new.status is distinct from 'declined' then
    raise exception 'Only Pet10x can change that'
      using errcode = '42501',
            hint    = 'A decline reason is written with the decline.';
  end if;

  return new;
end;
$guard$;

comment on function public.service_bookings_update_guard() is
  'BEFORE UPDATE on service_bookings (20261015000005). For authenticated/anon callers only status, responded_at, declined_reason (and updated_at) may change — every other column must equal OLD — and status only requested->confirmed|declined, confirmed->in_progress|completed, in_progress->completed; declined_reason only with declined. Else 42501. Cancelling and paying go through business_cancel_booking / customer_cancel_booking / business_mark_booking_paid. Service role and definer RPCs pass untouched.';

revoke all on function public.service_bookings_update_guard() from public, anon, authenticated;

-- Named after trg_bookings_updated, so (BEFORE triggers fire by name) it sees
-- updated_at already stamped — which is why updated_at is on the allowed list.
drop trigger if exists trg_service_bookings_update_guard on public.service_bookings;
create trigger trg_service_bookings_update_guard
  before update on public.service_bookings
  for each row execute function public.service_bookings_update_guard();

-- ---------------------------------------------------------------------------
-- 3. A business cancels a booking, with a reason
-- ---------------------------------------------------------------------------
create or replace function public.business_cancel_booking(p_booking uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me     uuid := auth.uid();
  v_row    public.service_bookings%rowtype;
  v_reason text := nullif(regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g'), '');
begin
  if v_me is null then
    raise exception 'Sign in to cancel a booking' using errcode = '42501';
  end if;

  select * into v_row from public.service_bookings where id = p_booking for update;
  -- A missing booking reads the same as someone else's: nothing to learn.
  if not found
     or v_row.business_id is null
     or not public.can_admin_business(v_row.business_id)
     or exists (select 1 from public.profiles where id = v_me and is_suspended) then
    raise exception 'Only the business can cancel this booking' using errcode = '42501';
  end if;

  if v_reason is null then
    raise exception 'Tell the customer why — they see this reason' using errcode = '22023';
  end if;
  if length(v_reason) > 2000 then
    raise exception 'The reason is too long (2000 characters at most)' using errcode = '22023';
  end if;

  if v_row.status not in ('requested', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable', 'status', v_row.status);
  end if;

  -- notify_customer_of_booking_status (below) tells the customer, from the
  -- columns written here.
  update public.service_bookings
     set status = 'cancelled', cancelled_reason = v_reason, cancelled_by = 'business'
   where id = p_booking;

  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

comment on function public.business_cancel_booking(uuid, text) is
  'Business owner or active owner/manager staff (can_admin_business, unsuspended) cancels a requested or confirmed booking with a required reason (trimmed, <= 2000; 22023) (20261015000005). Sets cancelled_reason and cancelled_by business; the status trigger notifies the customer. 42501 for anyone else; {ok:false, error:not_cancellable} from any other status.';

revoke all on function public.business_cancel_booking(uuid, text) from public, anon;
grant execute on function public.business_cancel_booking(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The customer hears about a business's cancellation
-- ---------------------------------------------------------------------------
-- LIVE body (identical to 20261012000009), with `cancelled` added: the status
-- list, one guard (only a business's cancellation), the reason column it
-- quotes (trimmed of all whitespace, as every reason in this migration), and a
-- branch in each CASE.
create or replace function public.notify_customer_of_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_biz     text;
  v_service text;
  v_when    text;
  v_reason  text;
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status not in ('confirmed', 'declined', 'completed', 'cancelled') then return null; end if;
  /* A booking whose customer deleted their account has nobody to tell. */
  if new.customer_id is null then return null; end if;
  /* Customers no longer write their own row (customer_cancel_booking is the
     only door, and it only cancels), but a customer who somehow changes it
     has nothing to be told about. */
  if auth.uid() is not null and auth.uid() = new.customer_id then return null; end if;
  /* 20261015000005: a cancellation is news only when the business made it —
     the customer who cancelled already knows. */
  if new.status = 'cancelled' and new.cancelled_by is distinct from 'business' then return null; end if;
  if exists (select 1 from public.profiles where id = new.customer_id and is_suspended) then return null; end if;

  select b.name into v_biz from public.businesses b where b.id = new.business_id;
  select s.name into v_service from public.business_services s where s.id = new.service_id;
  v_when := public.booking_when(new.scheduled_for, new.customer_id);
  v_reason := nullif(regexp_replace(coalesce(
    case when new.status = 'cancelled' then new.cancelled_reason else new.declined_reason end, ''),
    '^\s+|\s+$', '', 'g'), '');

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target)
  values (
    new.customer_id,
    'appointment',
    case when new.status in ('declined', 'cancelled') then 'warning' else 'success' end,
    case new.status
      when 'confirmed' then 'Booking confirmed'
      when 'declined'  then 'Booking declined'
      when 'cancelled' then 'Booking cancelled'
      else 'Booking completed'
    end || coalesce(' — ' || v_biz, ''),
    case new.status
      when 'confirmed' then coalesce(v_biz, 'The business') || ' confirmed your booking'
                            || coalesce(' for ' || v_service, '') || coalesce(' on ' || v_when, '') || '.'
      when 'declined'  then coalesce(v_biz, 'The business') || ' could not take your booking'
                            || coalesce(' for ' || v_service, '') || '.'
                            || coalesce(' Reason: ' || left(v_reason, 200), '')
      when 'cancelled' then coalesce(v_biz, 'The business') || ' cancelled your booking'
                            || coalesce(' for ' || v_service, '') || coalesce(' on ' || v_when, '') || '.'
                            || coalesce(' Reason: ' || left(v_reason, 200), '')
      else coalesce(v_biz, 'The business') || ' marked your booking'
           || coalesce(' for ' || v_service, '') || ' as completed. You can leave a review.'
    end,
    'My bookings',
    'my-bookings'
  );
  return null;
end;
$$;

revoke all on function public.notify_customer_of_booking_status() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. A customer's cancellation records who made it
-- ---------------------------------------------------------------------------
-- LIVE body (identical to 20261012000004), with cancelled_by = 'customer'
-- added to its update. Nothing else changes; the grants are restated.
create or replace function public.customer_cancel_booking(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me      uuid := auth.uid();
  v_row     public.service_bookings%rowtype;
  v_owner   uuid;
  v_service text;
  v_who     text;
  v_when    text;
begin
  if v_me is null then
    raise exception 'Sign in to cancel a booking' using errcode = '42501';
  end if;

  select * into v_row from public.service_bookings where id = p_booking for update;
  if not found or v_row.customer_id is distinct from v_me then
    raise exception 'That booking isn''t yours' using errcode = '42501';
  end if;
  if v_row.status = 'cancelled' then
    return;
  end if;
  if v_row.status not in ('requested', 'confirmed') then
    raise exception 'This booking can''t be cancelled any more'
      using errcode = '22023',
            hint    = 'Only a requested or confirmed booking can be cancelled. Contact the business about the rest.';
  end if;

  update public.service_bookings set status = 'cancelled', cancelled_by = 'customer' where id = p_booking;

  select b.owner_id into v_owner from public.businesses b where b.id = v_row.business_id;
  if v_owner is null or v_owner = v_me then return; end if;
  if exists (select 1 from public.profiles where id = v_owner and is_suspended) then return; end if;

  select s.name into v_service from public.business_services s where s.id = v_row.service_id;
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_who
    from public.profiles where id = v_me;
  v_when := public.booking_when(v_row.scheduled_for, v_owner);

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target)
  values (
    v_owner,
    'appointment',
    'warning',
    'Booking cancelled' || coalesce(': ' || v_service, ''),
    coalesce(v_who, 'A customer') || ' cancelled'
      || case when v_row.status = 'confirmed' then ' their confirmed booking' else ' their booking request' end
      || coalesce(' for ' || v_service, '')
      || coalesce(' on ' || v_when, '') || '.',
    'Open bookings',
    'business:bookings'
  );
end;
$$;

comment on function public.customer_cancel_booking(uuid) is
  'The one customer write on service_bookings (20261012000004). Moves the caller''s own booking from requested or confirmed to cancelled, with cancelled_by customer (20261015000005) — a repeat on a cancelled booking is a no-op — and notifies the business owner (kind appointment, target business:bookings). bookings_customer_update was dropped in 20261012000004.';

revoke all on function public.customer_cancel_booking(uuid) from public, anon;
grant execute on function public.customer_cancel_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The customer's contact details, once a booking is agreed
-- ---------------------------------------------------------------------------
create or replace function public.business_booking_contact(p_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_nothing constant jsonb := jsonb_build_object('email', null, 'phone', null);
  v_row     public.service_bookings%rowtype;
  v_email   text;
  v_phone   text;
begin
  if auth.uid() is null then return v_nothing; end if;

  select * into v_row from public.service_bookings where id = p_booking;
  if not found or v_row.customer_id is null or v_row.business_id is null then return v_nothing; end if;
  if v_row.status not in ('confirmed', 'in_progress', 'completed', 'paid') then return v_nothing; end if;
  if not public.can_admin_business(v_row.business_id)
     or exists (select 1 from public.profiles where id = auth.uid() and is_suspended) then
    return v_nothing;
  end if;

  select nullif(trim(coalesce(pr.email, '')), ''), nullif(trim(coalesce(pr.phone, '')), '')
    into v_email, v_phone
    from public.profiles pr where pr.id = v_row.customer_id;
  return jsonb_build_object('email', v_email, 'phone', v_phone);
end;
$$;

comment on function public.business_booking_contact(uuid) is
  'The customer''s profile email and phone for a booking (20261015000005) — only to someone who administers its business (can_admin_business, unsuspended) and only while it is confirmed, in_progress, completed or paid. Otherwise {email:null, phone:null}; never raises.';

revoke all on function public.business_booking_contact(uuid) from public, anon;
grant execute on function public.business_booking_contact(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The owner cancels a vet visit
-- ---------------------------------------------------------------------------
create or replace function public.owner_cancel_appointment(p_appointment uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me     uuid := auth.uid();
  v_appt   record;
  v_reason text := nullif(regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g'), '');
  v_who    text;
begin
  if v_me is null then
    raise exception 'Sign in to cancel a visit' using errcode = '42501';
  end if;

  select a.id, a.business_id, a.status, a.starts_at, p.owner_id, p.name as pet_name
    into v_appt
    from public.appointments a
    join public.clinic_patients cp on cp.id = a.patient_id
    join public.pets p on p.id = cp.pet_id
   where a.id = p_appointment
     for update of a;
  if not found or v_appt.owner_id is distinct from v_me then
    raise exception 'That visit isn''t yours to cancel' using errcode = '42501';
  end if;
  -- A suspended account acts on nothing, as in business_cancel_booking.
  if exists (select 1 from public.profiles where id = v_me and is_suspended) then
    raise exception 'Your account is suspended' using errcode = '42501';
  end if;

  if length(v_reason) > 2000 then
    raise exception 'The reason is too long (2000 characters at most)' using errcode = '22023';
  end if;
  if v_appt.status not in ('requested', 'booked') then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable', 'status', v_appt.status);
  end if;
  if v_appt.starts_at <= now() + interval '2 hours' then
    return jsonb_build_object('ok', false, 'error', 'too_late');
  end if;

  update public.appointments
     set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason
   where id = p_appointment;

  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_who
    from public.profiles where id = v_me;

  -- owner_approve_estimate's recipients: the business owner (whose own staff
  -- row may say veterinarian) and active owner/manager staff, de-duplicated
  -- by `union`, unsuspended, not the caller.
  insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
  select r.profile_id, 'clinic', 'warning',
         'Appointment cancelled — ' || v_appt.pet_name,
         coalesce(v_who, 'The owner') || ' cancelled ' || v_appt.pet_name || '''s '
           || case when v_appt.status = 'requested' then 'appointment request' else 'appointment' end
           || coalesce(' on ' || public.booking_when(v_appt.starts_at, r.profile_id), '') || '.'
           || coalesce(' Reason: ' || left(v_reason, 200), ''),
         'Open today',
         'clinic:today'
    from (
      select b.owner_id as profile_id from public.businesses b where b.id = v_appt.business_id
      union
      select s.profile_id from public.business_staff s
       where s.business_id = v_appt.business_id and s.is_active and s.role in ('owner', 'manager')
    ) r
    join public.profiles pr on pr.id = r.profile_id
   where not pr.is_suspended and r.profile_id is distinct from v_me;

  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;

comment on function public.owner_cancel_appointment(uuid, text) is
  'The pet''s owner (unsuspended) cancels a requested or booked appointment more than 2 hours before it starts (20261015000005). Optional reason (trimmed, <= 2000; 22023) stored as cancel_reason. 42501 for anyone else; {ok:false, error: not_cancellable | too_late}. Notifies the business owner and active owner/manager staff (kind clinic, target clinic:today).';

revoke all on function public.owner_cancel_appointment(uuid, text) from public, anon;
grant execute on function public.owner_cancel_appointment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The owner declines an estimate
-- ---------------------------------------------------------------------------
-- invoices.status is text with an inline CHECK (20260901000006), so Postgres
-- named it; find it by what it says rather than trusting the name, and put
-- back the same list plus `declined`. Exactly one must match: none means the
-- table is not what this migration was written against, and two would mean
-- dropping a constraint it does not understand — either way, stop.
do $$
declare
  v_names text[];
begin
  select array_agg(c.conname order by c.conname) into v_names
    from pg_catalog.pg_constraint c
   where c.conrelid = 'public.invoices'::regclass and c.contype = 'c'
     and pg_catalog.pg_get_constraintdef(c.oid) ilike '%status%'
     and pg_catalog.pg_get_constraintdef(c.oid) ilike '%void%';
  if coalesce(array_length(v_names, 1), 0) <> 1 then
    raise exception 'Expected exactly one invoices status CHECK, found %', coalesce(array_length(v_names, 1), 0)
      using detail = 'Matched: ' || coalesce(array_to_string(v_names, ', '), '(none)');
  end if;
  execute format('alter table public.invoices drop constraint %I', v_names[1]);
end $$;

alter table public.invoices
  add constraint invoices_status_check
    check (status in ('draft', 'sent', 'approved', 'declined', 'paid', 'void'));

create or replace function public.owner_decline_estimate(p_invoice uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me   uuid := auth.uid();
  inv    record;
  v_note text := nullif(regexp_replace(coalesce(p_note, ''), '^\s+|\s+$', '', 'g'), '');
begin
  if v_me is null then
    raise exception 'Sign in to decline an estimate' using errcode = '42501';
  end if;

  select i.id, i.business_id, i.kind, i.status, i.number, i.total_cents, i.currency,
         p.owner_id, p.name as pet_name
    into inv
    from public.invoices i
    join public.clinic_patients cp on cp.id = i.patient_id
    join public.pets p on p.id = cp.pet_id
   where i.id = p_invoice
     for update of i;
  if not found or inv.owner_id is distinct from v_me then
    raise exception 'That estimate isn''t yours' using errcode = '42501';
  end if;

  if v_note is null then
    raise exception 'Tell the practice why — they see this note' using errcode = '22023';
  end if;
  if length(v_note) > 2000 then
    raise exception 'The note is too long (2000 characters at most)' using errcode = '22023';
  end if;

  if inv.kind is distinct from 'estimate' then
    return jsonb_build_object('ok', false, 'error', 'not_an_estimate');
  end if;
  if inv.status is distinct from 'sent' then
    return jsonb_build_object('ok', false, 'error', 'not_awaiting_approval');
  end if;

  -- Appended, so the practice's own note on the estimate survives.
  update public.invoices
     set status = 'declined',
         note = concat_ws(E'\n\n', nullif(trim(coalesce(note, '')), ''), 'Owner declined: ' || v_note)
   where id = p_invoice;

  insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
  select r.profile_id, 'clinic', 'warning',
         'Estimate declined for ' || inv.pet_name,
         'The owner declined the ' || coalesce('estimate ' || inv.number, 'estimate') || ' for '
           || inv.pet_name || ' ('
           || to_char(inv.total_cents / 100.0, 'FM999,999,990.00') || ' ' || upper(inv.currency) || ').'
           || ' Reason: ' || left(v_note, 200),
         'Open billing',
         'clinic:billing'
    from (
      select b.owner_id as profile_id from public.businesses b where b.id = inv.business_id
      union
      select s.profile_id from public.business_staff s
       where s.business_id = inv.business_id and s.is_active and s.role in ('owner', 'manager')
    ) r
    join public.profiles pr on pr.id = r.profile_id
   where not pr.is_suspended and r.profile_id is distinct from v_me;

  return jsonb_build_object('ok', true, 'status', 'declined');
end;
$$;

comment on function public.owner_decline_estimate(uuid, text) is
  'The pet''s owner declines a sent estimate with a required note (trimmed, <= 2000; 22023) (20261015000005). Status -> declined; "Owner declined: <note>" appended to invoices.note. 42501 for anyone else; {ok:false, error: not_an_estimate | not_awaiting_approval}. Notifies the business owner and active owner/manager staff (kind clinic, target clinic:billing).';

revoke all on function public.owner_decline_estimate(uuid, text) from public, anon;
grant execute on function public.owner_decline_estimate(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9a. A visit request, or an online booking, reaches the practice (VC-3)
-- ---------------------------------------------------------------------------
create or replace function public.notify_clinic_of_appointment_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pet  text;
  v_who  text;
begin
  if not (new.status = 'requested' or (new.status = 'booked' and new.source = 'online')) then
    return null;
  end if;

  select cp.name into v_pet from public.clinic_patients cp where cp.id = new.patient_id;
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_who
    from public.profiles where id = new.booked_by;

  -- The business owner and the people who answer requests: active owner,
  -- manager and reception staff. Clinical staff hear once it is booked, on
  -- their calendar. Not the person who made the request, should they be staff.
  insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
  select r.profile_id, 'clinic', 'info',
         case when new.status = 'booked' then 'New appointment booked online' else 'Appointment request' end
           || coalesce(' — ' || v_pet, ''),
         coalesce(v_who, 'An owner')
           || case when new.status = 'booked' then ' booked ' else ' asked for ' end
           || coalesce(nullif(trim(coalesce(new.reason, '')), ''), 'an appointment')
           || coalesce(' for ' || v_pet, '')
           || coalesce(' on ' || public.booking_when(new.starts_at, r.profile_id), '')
           || case when new.status = 'booked' then '. It is on Today.' else '. Confirm or decline it on Today.' end,
         'Open today',
         'clinic:today'
    from (
      select b.owner_id as profile_id from public.businesses b where b.id = new.business_id
      union
      select s.profile_id from public.business_staff s
       where s.business_id = new.business_id and s.is_active
         and s.role in ('owner', 'manager', 'reception')
    ) r
    join public.profiles pr on pr.id = r.profile_id
   where not pr.is_suspended and r.profile_id is distinct from auth.uid();
  return null;
end;
$$;

revoke all on function public.notify_clinic_of_appointment_request() from public, anon, authenticated;

drop trigger if exists trg_appts_notify_request on public.appointments;
create trigger trg_appts_notify_request
  after insert on public.appointments
  for each row
  when (new.status = 'requested' or (new.status = 'booked' and new.source = 'online'))
  execute function public.notify_clinic_of_appointment_request();

-- ---------------------------------------------------------------------------
-- 9b. The owner hears what the practice did with their visit (VC-3)
-- ---------------------------------------------------------------------------
create or replace function public.notify_owner_of_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner  uuid;
  v_pet    text;
  v_clinic text;
  v_when   text;
  v_reason text;
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status not in ('booked', 'cancelled', 'no_show') then return null; end if;

  select p.owner_id, p.name into v_owner, v_pet
    from public.clinic_patients cp join public.pets p on p.id = cp.pet_id
   where cp.id = new.patient_id;
  /* A chart with no linked pet has no Pet10x owner to tell. */
  if v_owner is null then return null; end if;
  /* The owner's own change (owner_cancel_appointment) is not news to them. */
  if auth.uid() is not null and auth.uid() = v_owner then return null; end if;
  if exists (select 1 from public.profiles where id = v_owner and is_suspended) then return null; end if;

  select b.name into v_clinic from public.businesses b where b.id = new.business_id;
  v_clinic := coalesce(nullif(trim(coalesce(v_clinic, '')), ''), 'Your vet');
  v_when := public.booking_when(new.starts_at, v_owner);
  /* Quote cancel_reason only when THIS change wrote it. clinic_set_
     appointment_status keeps the old value when no note is given
     (coalesce(p_note, cancel_reason)), so a note the practice left when
     marking a visit missed — possibly internal — would otherwise surface
     on a later, note-less cancel. */
  if new.cancel_reason is distinct from old.cancel_reason then
    v_reason := nullif(regexp_replace(coalesce(new.cancel_reason, ''), '^\s+|\s+$', '', 'g'), '');
  end if;

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target)
  values (
    v_owner,
    'appointment',
    case when new.status = 'booked' then 'success' else 'warning' end,
    case
      when new.status = 'booked' and old.status = 'no_show' then 'Appointment rebooked'
      when new.status = 'booked' then 'Appointment confirmed'
      when new.status = 'no_show' then 'Marked as missed'
      when old.status = 'requested' then 'Appointment request declined'
      else 'Appointment cancelled'
    end,
    case
      when new.status = 'booked' and old.status = 'no_show' then
        v_clinic || ' rebooked ' || v_pet || '''s appointment' || coalesce(' on ' || v_when, '') || '.'
      when new.status = 'booked' then
        v_clinic || ' confirmed ' || v_pet || '''s appointment' || coalesce(' on ' || v_when, '') || '.'
      when new.status = 'no_show' then
        v_clinic || ' marked ' || v_pet || '''s appointment' || coalesce(' on ' || v_when, '')
          || ' as missed. Contact them to book again.'
      when old.status = 'requested' then
        v_clinic || ' couldn''t take your request for ' || v_pet || '.'
          || coalesce(' Reason: ' || left(v_reason, 200), '')
      else
        v_clinic || ' cancelled ' || v_pet || '''s appointment' || coalesce(' on ' || v_when, '') || '.'
          || coalesce(' Reason: ' || left(v_reason, 200), '')
    end,
    'Open visits',
    'my-vets:visits'
  );
  return null;
end;
$$;

revoke all on function public.notify_owner_of_appointment_status() from public, anon, authenticated;

drop trigger if exists trg_appts_notify_status on public.appointments;
create trigger trg_appts_notify_status
  after update of status on public.appointments
  for each row
  when (new.status is distinct from old.status)
  execute function public.notify_owner_of_appointment_status();


-- ===== migration 20261015000006_clinic_defaults.sql =====
-- Pet10x — a new business starts with appointment types and weekday hours,
-- so a new clinic can be booked on day one.
--
-- THE GAP (UX audit, vet clinics):
--   * business_bootstrap (20260901000000) gives a new business its owner's
--     staff row and a primary location, and nothing else. A clinic with no
--     appointment_types has nothing to book, and one with no
--     staff_availability has no slots: clinic_available_slots returns [] until
--     someone finds both settings screens. Seven live businesses have zero
--     appointment types today.
--
-- WHAT THIS DOES
--
--   1. seed_business_defaults(p_business, p_bookable default true) -> void.
--      Internal only: SECURITY
--      DEFINER, search_path public, pg_temp, execute revoked from public,
--      anon and authenticated (only business_bootstrap and this migration's
--      backfill call it). Two independent seeds, each only when the business
--      has none of that thing yet, so calling it again changes nothing:
--
--      * appointment_types, when the business has zero (active or not), by
--        business_kind (text, FK to business_types):
--          veterinary — Wellness exam 30 min, Vaccination 15, Sick visit 30;
--                       online-bookable, each request confirmed by the
--                       practice (requires_confirmation true).
--          grooming   — Bath & brush 60 min, Full groom 90; not online-bookable.
--          any other  — Appointment 30 min; not online-bookable.
--        Only a clinic takes online visit requests through these types, so
--        only veterinary ones are bookable out of the box; everyone else can
--        switch it on. p_bookable false turns even those off
--        (is_online_bookable = d.bookable and p_bookable): the backfill uses
--        it, so an existing clinic does not start taking online requests on
--        the day this migration lands without having chosen to. price_cents is 0, the column's NOT NULL default: 0
--        means "no price set", not "free". sort_order 0, 1, 2.
--
--      * staff_availability, when the business has zero rows: Monday to
--        Friday (weekday 1..5, extract(dow) — 0 is Sunday, as
--        clinic_available_slots reads it) 09:00–17:00 for the owner's own
--        business_staff row, location_id null (every location). The times
--        are local to the business: clinic_available_slots reads them in
--        businesses.timezone. A business whose owner has no staff row gets
--        no hours (nothing to attach them to).
--
--   2. business_bootstrap — LIVE definition (as 20260901000000) verbatim,
--      plus a call to seed_business_defaults(new.id) after the staff row
--      exists, with the default p_bookable true: a NEW clinic is online-
--      bookable on day one. The trigger is unchanged and is not recreated.
--
--   3. Backfill: only the existing businesses with zero appointment types,
--      through the same helper with p_bookable false — types that are not
--      online-bookable, and hours only when the business also has none. A
--      business that already has types is not touched at all, so whatever it
--      chose about hours (including none) stands.

-- ---------------------------------------------------------------------------
-- 1. The defaults
-- ---------------------------------------------------------------------------
create or replace function public.seed_business_defaults(p_business uuid, p_bookable boolean default true)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind  text;
  v_owner uuid;
begin
  select b.business_kind, b.owner_id into v_kind, v_owner
    from public.businesses b where b.id = p_business;
  if not found then
    return;
  end if;

  if not exists (select 1 from public.appointment_types t where t.business_id = p_business) then
    insert into public.appointment_types
      (business_id, name, duration_min, price_cents, is_online_bookable, requires_confirmation, sort_order)
    select p_business, d.name, d.duration_min, 0, d.bookable and coalesce(p_bookable, true), true, d.sort_order
      from (values
              ('veterinary', 'Wellness exam', 30, true,  0),
              ('veterinary', 'Vaccination',   15, true,  1),
              ('veterinary', 'Sick visit',    30, true,  2),
              ('grooming',   'Bath & brush',  60, false, 0),
              ('grooming',   'Full groom',    90, false, 1),
              ('other',      'Appointment',   30, false, 0)
           ) as d(kind, name, duration_min, bookable, sort_order)
     where d.kind = case when v_kind in ('veterinary', 'grooming') then v_kind else 'other' end;
  end if;

  if not exists (select 1 from public.staff_availability a where a.business_id = p_business) then
    insert into public.staff_availability (business_id, staff_id, location_id, weekday, start_time, end_time)
    select p_business, s.id, null, wd.weekday::smallint, '09:00'::time, '17:00'::time
      from public.business_staff s
      cross join generate_series(1, 5) as wd(weekday)
     where s.business_id = p_business and s.profile_id = v_owner;
  end if;
end;
$$;

revoke all on function public.seed_business_defaults(uuid, boolean) from public, anon, authenticated;

comment on function public.seed_business_defaults(uuid, boolean) is
  'Internal (20261015000006); called by business_bootstrap (p_bookable true) and the backfill (false), not by clients. When the business has no appointment_types: veterinary gets Wellness exam 30, Vaccination 15, Sick visit 30 (online-bookable unless p_bookable is false); grooming Bath & brush 60, Full groom 90; any other kind Appointment 30 (not online-bookable); price_cents 0 means no price set. When it has no staff_availability: Mon-Fri (dow 1..5) 09:00-17:00 for the owner''s business_staff row, every location. Idempotent.';

-- ---------------------------------------------------------------------------
-- 2. business_bootstrap seeds them for every new business
-- ---------------------------------------------------------------------------
-- LIVE definition verbatim, plus the call at the end: the owner's staff row
-- must exist before hours can hang off it.
create or replace function public.business_bootstrap()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.business_staff (business_id, profile_id, role, is_active, is_bookable, joined_at)
  values (new.id, new.owner_id,
          case when new.business_kind = 'veterinary' then 'veterinarian'::public.clinic_staff_role
               else 'owner'::public.clinic_staff_role end,
          true, true, now())
  on conflict (business_id, profile_id) do nothing;
  insert into public.business_locations
    (business_id, name, address, city, region, postal_code, country, latitude, longitude, is_primary)
  values (new.id, coalesce(new.name,'Main location'), new.address, new.city, new.region,
          new.postal_code, coalesce(new.country,'CA'), new.latitude, new.longitude, true);
  perform public.seed_business_defaults(new.id);
  return new;
end; $$;

comment on function public.business_bootstrap() is
  'AFTER INSERT on businesses (20260901000000, 20261015000006): the owner''s staff row, a primary location, then seed_business_defaults — appointment types and Mon-Fri 09:00-17:00 hours — so a new business can be booked on day one.';

-- ---------------------------------------------------------------------------
-- 3. Backfill the businesses that already exist
-- ---------------------------------------------------------------------------
-- Only businesses with no types at all, and never online-bookable: an
-- existing clinic switches online requests on itself, when it is ready.
select public.seed_business_defaults(b.id, false)
  from public.businesses b
 where not exists (select 1 from public.appointment_types t where t.business_id = b.id);


-- Record them, so the Supabase CLI / MCP know they are applied.
do $$ begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    insert into supabase_migrations.schema_migrations (version, name) values ('20261015000001', 'decision_reasons') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261015000002', 'admin_delete_business') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261015000003', 'verification_needs_info') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261015000004', 'admin_building_activity') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261015000005', 'bookings_contact_and_notices') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261015000006', 'clinic_defaults') on conflict (version) do nothing;
  end if;
end $$;
commit;
