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

begin;

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

rollback;
