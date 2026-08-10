-- Carry the building's address to the resident.
--
-- A linked resident's address IS the building's address plus their unit —
-- asking them to retype it produces a second, drifting copy, and means a
-- manager correcting the building's address changes nothing on the resident's
-- side. The building is the source of truth; the resident supplies the unit.
create or replace function public.my_building_link()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'link_id', rl.id, 'building_id', rl.building_id, 'building_name', b.name,
    'status', rl.status, 'unit', u.unit_number, 'requested_at', rl.requested_at,
    'building_address', b.address,
    'building_city', b.city,
    'building_region', b.region,
    'building_postal_code', b.postal_code
  )
  from (
    select * from public.resident_links
    where profile_id = auth.uid() and status in ('pending','approved') and left_at is null
    order by requested_at desc limit 1
  ) rl
  left join public.buildings b on b.id = rl.building_id
  left join public.units u on u.id = rl.unit_id;
$$;
