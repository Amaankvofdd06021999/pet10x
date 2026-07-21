-- Campaign targeting: a business picks a building and sees its reach. Returns
-- AGGREGATE counts only — never a resident list. buildings_select doesn't cover
-- business owners, so this is a definer RPC with a deliberately narrow shape.
create or replace function public.targetable_buildings()
returns table (id uuid, name text, city text, pet_owners bigint, dogs bigint, cats bigint)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.city,
    (select count(distinct rl.profile_id) from public.resident_links rl
      where rl.building_id = b.id and rl.status = 'approved'),
    (select count(*) from public.pets p
      where p.building_id = b.id and p.species = 'dog' and p.deleted_at is null),
    (select count(*) from public.pets p
      where p.building_id = b.id and p.species = 'cat' and p.deleted_at is null)
  from public.buildings b
  order by b.name;
$$;
grant execute on function public.targetable_buildings() to authenticated;
