-- Part F — admin RPCs, account deletion, the audit log, booking cancellation,
-- in ONE rolled-back transaction.
--
-- Covers 20261012000001 (deleting a profile with closed history succeeds and
-- nulls every person column while the records stay; a guard still refuses a
-- non-referential rewrite of the same column), 20261012000002 (the admin RPCs
-- refuse non-admins, and an admin cannot suspend or demote themselves),
-- the audit log's reach (a building's manager reads it, nobody else does) and
-- 20261012000004 (a customer cancels through the RPC, the business is told,
-- and the direct UPDATE path is gone).
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

begin;

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

rollback;
