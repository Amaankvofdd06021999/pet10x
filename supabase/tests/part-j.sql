-- Part J — notification snooze and delete, in ONE rolled-back transaction.
--
-- Covers 20261018000001:
--   * snooze_notification / dismiss_notification / restore_notification work
--     on the caller's own row; another account gets 'forbidden'; anon
--     cannot execute any of them (42501).
--   * a snooze in the past, or more than 7 days out, raises 22023.
--   * snoozing clears read_at, so the row wakes unread.
--   * the inbox filter every read uses — dismissed_at is null and
--     (snoozed_until is null or snoozed_until <= now()) — leaves out a
--     dismissed row and a sleeping one, and keeps a row whose snooze is over.
--   * both dispatcher claims carry the same two filters.
--   * a new appointment type with no colour defaults to brand orange, not teal.
--
-- The actor and the stranger are any two non-admin profiles, chosen from live
-- data; the rows are inserted here. Nothing survives: the file ends in
-- ROLLBACK.

begin;

reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare v_actor uuid; v_stranger uuid; v_fn text; v_def text;
begin
  select pr.id into v_actor from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  select pr.id into v_stranger from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended and pr.id <> v_actor
   order by pr.created_at, pr.id limit 1;
  if v_actor is null or v_stranger is null then raise exception 'FIXTURE: need two non-admin profiles'; end if;
  perform set_config('part_j.actor', v_actor::text, true);
  perform set_config('part_j.stranger', v_stranger::text, true);

  -- Four rows for the actor: one to act on (already read), one dismissed,
  -- one asleep, one whose snooze has ended. Written as the table owner, the
  -- way the app's triggers and crons write notifications.
  insert into public.notifications (id, profile_id, kind, severity, title, read_at, dismissed_at, snoozed_until) values
    ('00000000-0000-4000-8000-0000000a0001', v_actor, 'system', 'info', 'Part J target',    now(), null,  null),
    ('00000000-0000-4000-8000-0000000a0002', v_actor, 'system', 'info', 'Part J dismissed', null,  now(), null),
    ('00000000-0000-4000-8000-0000000a0003', v_actor, 'system', 'info', 'Part J asleep',    null,  null,  now() + interval '1 hour'),
    ('00000000-0000-4000-8000-0000000a0004', v_actor, 'system', 'info', 'Part J awake',     null,  null,  now() - interval '1 minute');

  -- The dispatcher must not send what the inbox hides.
  foreach v_fn in array array['claim_notification_emails', 'claim_notification_pushes'] loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = v_fn;
    if v_def is null
       or position('n.dismissed_at is null' in v_def) = 0
       or position('(n.snoozed_until is null or n.snoozed_until <= now())' in v_def) = 0 then
      raise exception 'FAIL: % does not skip dismissed and sleeping rows', v_fn;
    end if;
  end loop;
  raise notice 'ok: both dispatcher claims skip dismissed and sleeping rows';
end $$;

-- The owner.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_j.actor'), 'role', 'authenticated')::text, true);
do $$
declare
  v_id constant uuid := '00000000-0000-4000-8000-0000000a0001';
  r jsonb; v_until timestamptz; v_read timestamptz; v_dismissed timestamptz; v_n int;
begin
  if public.is_admin() then raise exception 'FIXTURE: actor is an admin'; end if;

  -- The inbox filter, exactly as the app's reads apply it.
  select count(*) into v_n from public.notifications n
   where n.profile_id = auth.uid()
     and n.id in ('00000000-0000-4000-8000-0000000a0002', '00000000-0000-4000-8000-0000000a0003')
     and n.dismissed_at is null and (n.snoozed_until is null or n.snoozed_until <= now());
  if v_n <> 0 then raise exception 'FAIL: inbox filter kept % dismissed/sleeping row(s)', v_n; end if;
  select count(*) into v_n from public.notifications n
   where n.profile_id = auth.uid()
     and n.id in ('00000000-0000-4000-8000-0000000a0001', '00000000-0000-4000-8000-0000000a0004')
     and n.dismissed_at is null and (n.snoozed_until is null or n.snoozed_until <= now());
  if v_n <> 2 then raise exception 'FAIL: inbox filter dropped a visible or woken row (% of 2)', v_n; end if;
  raise notice 'ok: inbox filter hides dismissed and sleeping rows, keeps visible and woken ones';

  r := public.snooze_notification(v_id, now() + interval '1 hour');
  select snoozed_until, read_at into v_until, v_read from public.notifications where id = v_id;
  if r is distinct from '{"ok": true}'::jsonb or v_until is distinct from now() + interval '1 hour' or v_read is not null then
    raise exception 'FAIL: owner snooze returned % / until=% read_at=%', r, v_until, v_read;
  end if;
  raise notice 'ok: owner can snooze; read_at cleared';

  begin
    perform public.snooze_notification(v_id, now() - interval '1 minute');
    raise exception 'FAIL: a snooze in the past was accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'That time has passed. Pick another.' then
      raise exception 'FAIL: a past snooze raised the wrong sentence: %', sqlerrm;
    end if;
  end;
  begin
    perform public.snooze_notification(v_id, now() + interval '8 days');
    raise exception 'FAIL: an 8-day snooze was accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'Pick a time within the next 7 days' then
      raise exception 'FAIL: an 8-day snooze raised the wrong sentence: %', sqlerrm;
    end if;
  end;
  begin
    perform public.snooze_notification(v_id, null);
    raise exception 'FAIL: a snooze with no time was accepted';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'ok: past, 8-day and empty snoozes raise 22023';

  r := public.dismiss_notification(v_id);
  select dismissed_at into v_dismissed from public.notifications where id = v_id;
  if r is distinct from '{"ok": true}'::jsonb or v_dismissed is null then
    raise exception 'FAIL: owner dismiss returned % / dismissed_at=%', r, v_dismissed;
  end if;
  r := public.restore_notification(v_id);
  select dismissed_at into v_dismissed from public.notifications where id = v_id;
  if r is distinct from '{"ok": true}'::jsonb or v_dismissed is not null then
    raise exception 'FAIL: owner restore returned % / dismissed_at=%', r, v_dismissed;
  end if;
  raise notice 'ok: owner can dismiss and restore';

  -- Dismiss again, so the stranger has a stamp to try to clear.
  perform public.dismiss_notification(v_id);
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- Someone else.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_j.stranger'), 'role', 'authenticated')::text, true);
do $$
declare v_id constant uuid := '00000000-0000-4000-8000-0000000a0001'; r jsonb;
begin
  if public.is_admin() then raise exception 'FIXTURE: stranger is an admin'; end if;
  r := public.snooze_notification(v_id, now() + interval '1 hour');
  if r is distinct from '{"ok": false, "error": "forbidden"}'::jsonb then raise exception 'FAIL: stranger snooze returned %', r; end if;
  r := public.dismiss_notification(v_id);
  if r is distinct from '{"ok": false, "error": "forbidden"}'::jsonb then raise exception 'FAIL: stranger dismiss returned %', r; end if;
  r := public.restore_notification(v_id);
  if r is distinct from '{"ok": false, "error": "forbidden"}'::jsonb then raise exception 'FAIL: stranger restore returned %', r; end if;
  -- A row that does not exist reads the same as someone else's.
  r := public.dismiss_notification(gen_random_uuid());
  if r is distinct from '{"ok": false, "error": "forbidden"}'::jsonb then raise exception 'FAIL: unknown id returned %', r; end if;
  raise notice 'ok: a stranger is forbidden on every call';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- The stranger's calls changed nothing.
do $$
declare v_dismissed timestamptz; v_until timestamptz;
begin
  select dismissed_at, snoozed_until into v_dismissed, v_until
    from public.notifications where id = '00000000-0000-4000-8000-0000000a0001';
  if v_dismissed is null or v_until is distinct from now() + interval '1 hour' then
    raise exception 'FAIL: the stranger changed the row (dismissed_at=%, snoozed_until=%)', v_dismissed, v_until;
  end if;
  raise notice 'ok: the row is as its owner left it';
end $$;

-- An anonymous caller cannot reach the functions at all.
set local role anon;
do $$
begin
  begin
    perform public.snooze_notification('00000000-0000-4000-8000-0000000a0001', now() + interval '1 hour');
    raise exception 'FAIL: anon executed snooze_notification';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.dismiss_notification('00000000-0000-4000-8000-0000000a0001');
    raise exception 'FAIL: anon executed dismiss_notification';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.restore_notification('00000000-0000-4000-8000-0000000a0001');
    raise exception 'FAIL: anon executed restore_notification';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: anon cannot execute the notification RPCs (42501)';
end $$;
reset role;

-- No teal default: a new appointment type that names no colour is orange.
do $$
declare v_default text;
begin
  select column_default into v_default from information_schema.columns
   where table_schema = 'public' and table_name = 'appointment_types' and column_name = 'colour';
  if v_default is distinct from '''#FD9340''::text' then
    raise exception 'FAIL: appointment_types.colour default is %, expected #FD9340', v_default;
  end if;
  raise notice 'ok: appointment_types.colour defaults to #FD9340';
end $$;

rollback;
