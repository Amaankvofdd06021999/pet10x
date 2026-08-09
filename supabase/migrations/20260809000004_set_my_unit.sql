-- Let a resident set their own unit.
--
-- They could not. `resident_links` has an insert-self policy and a
-- manager-update policy and nothing in between, so the unit number — which
-- the completeness check calls BLOCKING, and which the app now asks for on the
-- profile — was only ever settable by a manager. The resident could see the
-- gap and had no way to close it.
--
-- A SECURITY DEFINER function rather than a new UPDATE policy: a policy broad
-- enough to let residents write their own link would also let them change
-- building_id or flip status to 'approved'. This can only ever touch unit_id,
-- on the caller's own active link.
create or replace function public.set_my_unit(p_unit text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link    public.resident_links%rowtype;
  v_unit    text := btrim(p_unit);
  v_unit_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select * into v_link
  from public.resident_links
  where profile_id = auth.uid()
    and status in ('pending', 'approved')
    and left_at is null
  order by requested_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_building');
  end if;

  if v_unit = '' then
    update public.resident_links set unit_id = null where id = v_link.id;
    return jsonb_build_object('ok', true, 'unit', null);
  end if;

  select id into v_unit_id
  from public.units
  where building_id = v_link.building_id
    and lower(btrim(unit_number)) = lower(v_unit)
  limit 1;

  if v_unit_id is null then
    insert into public.units (building_id, unit_number)
    values (v_link.building_id, v_unit)
    returning id into v_unit_id;
  end if;

  update public.resident_links set unit_id = v_unit_id where id = v_link.id;

  return jsonb_build_object('ok', true, 'unit', v_unit, 'unit_id', v_unit_id);
end;
$$;

revoke all on function public.set_my_unit(text) from public, anon;
grant execute on function public.set_my_unit(text) to authenticated;
