-- Part K — incident_reports.updated_at, in ONE rolled-back transaction.
--
-- Covers 20261019000001:
--   * the column exists, is timestamptz and not null.
--   * an update bumps it (the row is inserted with an old updated_at, since
--     now() is constant inside one transaction).
--   * a row inserted without one gets a value.
--
-- The building is any existing one; the rows are inserted here. Nothing
-- survives: the file ends in ROLLBACK.

begin;

reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare v_building uuid; v_type text; v_nullable text; v_after timestamptz; v_default timestamptz;
begin
  select data_type, is_nullable into v_type, v_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'incident_reports' and column_name = 'updated_at';
  if v_type is distinct from 'timestamp with time zone' then
    raise exception 'FAIL: incident_reports.updated_at is %, expected timestamptz', v_type;
  end if;
  if v_nullable is distinct from 'NO' then raise exception 'FAIL: incident_reports.updated_at is nullable'; end if;
  raise notice 'ok: incident_reports.updated_at exists and is not null';

  select id into v_building from public.buildings order by created_at, id limit 1;
  if v_building is null then raise exception 'FIXTURE: need a building'; end if;

  insert into public.incident_reports (id, building_id, type, description, updated_at)
  values ('00000000-0000-4000-8000-0000000b0001', v_building, 'other', 'Part K', '2020-01-01');
  update public.incident_reports set status = 'resolved' where id = '00000000-0000-4000-8000-0000000b0001';
  select updated_at into v_after from public.incident_reports where id = '00000000-0000-4000-8000-0000000b0001';
  if v_after <= '2020-01-01' then raise exception 'FAIL: update did not bump updated_at (%)', v_after; end if;
  raise notice 'ok: an update bumps updated_at';

  insert into public.incident_reports (id, building_id, type, description)
  values ('00000000-0000-4000-8000-0000000b0002', v_building, 'other', 'Part K default');
  select updated_at into v_default from public.incident_reports where id = '00000000-0000-4000-8000-0000000b0002';
  if v_default is null then raise exception 'FAIL: default updated_at is null'; end if;
  raise notice 'ok: a new row gets updated_at';
end $$;

rollback;
