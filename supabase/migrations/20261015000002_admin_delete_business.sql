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
