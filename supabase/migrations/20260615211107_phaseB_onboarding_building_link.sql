-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- Onboarding flag (owner answered "does your building require registration?")
alter table public.profiles add column if not exists onboarded boolean not null default false;

-- Resolve a building code + create a pending resident link (definer: a not-yet-
-- linked user cannot SELECT buildings, so we validate the code server-side).
create or replace function public.request_building_link(p_code text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_building public.buildings;
  v_existing public.resident_links;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_building from public.buildings
    where upper(building_code) = upper(trim(p_code)) limit 1;
  if v_building.id is null then
    return json_build_object('ok', false, 'error', 'invalid_code');
  end if;
  select * into v_existing from public.resident_links
    where profile_id = auth.uid() and building_id = v_building.id
      and status in ('pending','approved') and left_at is null
    limit 1;
  if v_existing.id is not null then
    return json_build_object('ok', true, 'already', true, 'status', v_existing.status,
      'building_id', v_building.id, 'building_name', v_building.name);
  end if;
  insert into public.resident_links (profile_id, building_id, status, requested_at)
    values (auth.uid(), v_building.id, 'pending', now());
  return json_build_object('ok', true, 'status', 'pending',
    'building_id', v_building.id, 'building_name', v_building.name);
end;
$$;

-- The current user's active building link (pending or approved) + building name.
create or replace function public.my_building_link()
returns json
language sql
security definer
set search_path to 'public'
stable
as $$
  select json_build_object(
    'link_id', rl.id, 'building_id', rl.building_id, 'building_name', b.name,
    'status', rl.status, 'unit', u.unit_number, 'requested_at', rl.requested_at
  )
  from (
    select * from public.resident_links
    where profile_id = auth.uid() and status in ('pending','approved') and left_at is null
    order by requested_at desc limit 1
  ) rl
  left join public.buildings b on b.id = rl.building_id
  left join public.units u on u.id = rl.unit_id;
$$;

-- User leaves / cancels their own link.
create or replace function public.leave_my_building_link()
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.resident_links set status = 'left', left_at = now()
  where profile_id = auth.uid() and status in ('pending','approved') and left_at is null;
$$;

revoke execute on function public.request_building_link(text) from anon;
revoke execute on function public.my_building_link() from anon;
revoke execute on function public.leave_my_building_link() from anon;
grant execute on function public.request_building_link(text) to authenticated;
grant execute on function public.my_building_link() to authenticated;
grant execute on function public.leave_my_building_link() to authenticated;
