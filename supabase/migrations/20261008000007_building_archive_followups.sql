-- Pet10x — Part B review fixes to building archiving.
--
-- 1. admin_building_history counted only the NO ACTION tables (fines,
--    notifications, payouts, business_listings) plus violations. Everything
--    else CASCADES: a building with residents, pets, units, incident reports,
--    accommodation requests, posts, events, rules and emergency tokens counted
--    zero, the console offered Delete, and Delete would have erased all of it
--    silently. It now counts every table that references buildings, and the
--    console offers Delete only when the total is zero — in practice a
--    building created by mistake and never used. Units are counted outright,
--    not only occupied ones: a unit list is configuration someone typed, and
--    Archive keeps it. Return type changes, so drop and re-create.
--
-- 2. building_pets_for_report (anon) still resolved an archived building's
--    code and listed its pets. Copied verbatim from
--    20260809000007_incident_pet_identification.sql plus the ARCHIVED filter.
--
-- 3. links_insert_self let a signed-in user insert a pending resident_links
--    row directly — around request_building_link — into an archived building.
--    The policy is replaced with the same check plus "the building is live".

drop function if exists public.admin_building_history();

create function public.admin_building_history()
returns table (building_id uuid, total bigint, counts jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id,
         (select coalesce(sum(v::bigint), 0) from jsonb_each_text(c.counts) e(k, v)),
         c.counts
    from (
      select b.id, jsonb_build_object(
           'units', (select count(*) from public.units x where x.building_id = b.id),
           'resident_links', (select count(*) from public.resident_links x where x.building_id = b.id),
           'building_managers', (select count(*) from public.building_managers x where x.building_id = b.id),
           'pets', (select count(*) from public.pets x where x.building_id = b.id),
           'incident_reports', (select count(*) from public.incident_reports x where x.building_id = b.id),
           'accommodation_requests', (select count(*) from public.accommodation_requests x where x.building_id = b.id),
           'community_posts', (select count(*) from public.community_posts x where x.building_id = b.id),
           'lost_found', (select count(*) from public.lost_found x where x.building_id = b.id),
           'events', (select count(*) from public.events x where x.building_id = b.id),
           'building_subscriptions', (select count(*) from public.building_subscriptions x where x.building_id = b.id),
           'emergency_access_tokens', (select count(*) from public.emergency_access_tokens x where x.building_id = b.id),
           'building_rules', (select count(*) from public.building_rules x where x.building_id = b.id),
           'violations', (select count(*) from public.violations x where x.building_id = b.id),
           'fines', (select count(*) from public.fines x where x.building_id = b.id),
           'notifications', (select count(*) from public.notifications x where x.building_id = b.id),
           'payouts', (select count(*) from public.payouts x where x.building_id = b.id),
           'business_listings', (select count(*) from public.business_listings x where x.building_id = b.id)
      ) as counts
        from public.buildings b
       where public.is_admin()
    ) c;
$$;
revoke all on function public.admin_building_history() from public, anon;
grant execute on function public.admin_building_history() to authenticated;

comment on function public.admin_building_history() is
  'Per building, row counts in every table referencing buildings (cascading and blocking alike) and their total (20261008000007). The admin console offers Delete only when total = 0. Admin only — returns nothing to anyone else.';

-- ---------------------------------------------------------------------------
create or replace function public.building_pets_for_report(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_building uuid; v_pets jsonb;
begin
  select b.id into v_building from public.buildings b
  where upper(b.building_code) = upper(btrim(p_code))
    and b.archived_at is null;  -- ARCHIVED (20261008000007)

  if v_building is null then return jsonb_build_object('valid', false); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'species', p.species, 'breed', p.breed,
           'photo', coalesce(p.image_url,
                      (select ph.path from public.pet_photos ph
                        where ph.pet_id = p.id order by ph.sort_order limit 1))
         ) order by p.name), '[]'::jsonb)
    into v_pets
  from public.pets p
  where p.building_id = v_building and p.deleted_at is null;

  return jsonb_build_object('valid', true, 'pets', v_pets);
end; $$;

-- ---------------------------------------------------------------------------
drop policy if exists links_insert_self on public.resident_links;
create policy links_insert_self on public.resident_links for insert with check (
  profile_id = auth.uid() and status = 'pending'
  -- ARCHIVED (20261008000007): an archived building takes no new residents.
  and exists (select 1 from public.buildings b where b.id = resident_links.building_id and b.archived_at is null)
);
