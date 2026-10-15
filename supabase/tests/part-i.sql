-- Part I — Home performance, in ONE rolled-back transaction.
--
-- Covers 20261017000001:
--   * cron_cursors — an authenticated user can neither read nor write it
--     (42501); it is reachable only with the service role.
--   * profiles.suggestions_last_run_at — exists, is timestamptz and nullable.
--
-- The actor is any non-admin profile, chosen from live data. Nothing is
-- written that survives: the whole file ends in ROLLBACK.

begin;

reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare v_actor uuid; v_type text; v_nullable text;
begin
  select pr.id into v_actor from public.profiles pr
   where not coalesce(pr.is_super_admin, false) and not pr.is_suspended
   order by pr.created_at, pr.id limit 1;
  if v_actor is null then raise exception 'FIXTURE: no non-admin profile'; end if;
  perform set_config('part_i.actor', v_actor::text, true);

  select data_type, is_nullable into v_type, v_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name = 'suggestions_last_run_at';
  if v_type is distinct from 'timestamp with time zone' or v_nullable is distinct from 'YES' then
    raise exception 'FAIL: profiles.suggestions_last_run_at is % / nullable=%, expected timestamptz / YES', v_type, v_nullable;
  end if;
  raise notice 'ok: profiles.suggestions_last_run_at exists and is nullable timestamptz';
end $$;

-- The service role can write the cursor; the app roles cannot touch it.
insert into public.cron_cursors (name, cursor) values ('part_i_probe', 'x');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('part_i.actor'), 'role', 'authenticated')::text, true);
do $$
declare v_n int;
begin
  if public.is_admin() then raise exception 'FIXTURE: actor is an admin'; end if;

  begin
    select count(*) into v_n from public.cron_cursors;
    raise exception 'FAIL: authenticated read cron_cursors (% rows)', v_n;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.cron_cursors (name, cursor) values ('part_i_authenticated', 'x');
    raise exception 'FAIL: authenticated inserted into cron_cursors';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.cron_cursors set cursor = 'y' where name = 'part_i_probe';
    raise exception 'FAIL: authenticated updated cron_cursors';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: authenticated cannot read, insert or update cron_cursors (42501)';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

rollback;
