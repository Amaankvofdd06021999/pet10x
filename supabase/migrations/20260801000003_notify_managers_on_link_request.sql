-- Tell the building's managers when a resident asks to join.
--
-- request_building_link inserted the pending row and returned. Nothing was
-- written to notifications, so the request sat in the Approvals queue with no
-- signal anywhere that it had arrived — a resident could wait indefinitely on
-- a manager who had no reason to look.
--
-- Only the body changes; the signature, return shape and SECURITY DEFINER are
-- as before. Being definer is what lets it write a notification addressed to
-- someone other than the caller, which RLS would otherwise refuse.

create or replace function public.request_building_link(p_code text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_building public.buildings;
  v_existing public.resident_links;
  v_who      text;
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

  -- Re-submitting an existing request must not notify again, or a resident
  -- tapping twice would notify every manager twice.
  if v_existing.id is not null then
    return json_build_object('ok', true, 'already', true, 'status', v_existing.status,
      'building_id', v_building.id, 'building_name', v_building.name);
  end if;

  insert into public.resident_links (profile_id, building_id, status, requested_at)
    values (auth.uid(), v_building.id, 'pending', now());

  select coalesce(nullif(trim(full_name), ''), email, 'A resident')
    into v_who
  from public.profiles where id = auth.uid();

  -- One per manager of this building. No managers means no rows, which is a
  -- valid state, not an error.
  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target, building_id)
  select
    bm.profile_id,
    'building',
    'info',
    coalesce(v_who, 'A resident') || ' wants to join ' || v_building.name,
    'A new resident link is waiting for review in Approvals.',
    'Review request',
    'approvals',
    v_building.id
  from public.building_managers bm
  where bm.building_id = v_building.id;

  return json_build_object('ok', true, 'status', 'pending',
    'building_id', v_building.id, 'building_name', v_building.name);
end;
$function$;
