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

begin;

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

rollback;
