-- Strata delegation: let a PRIMARY manager add/remove co-managers on buildings
-- they primary-manage. Additive to the existing bm_admin_all (super-admin) policy.

create or replace function public.is_primary_manager(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.building_managers bm
    where bm.building_id = b and bm.profile_id = auth.uid() and bm.is_primary
  );
$$;

-- A primary manager may add a co-manager to a building they already primary-manage
-- (building_id must be one they primary-manage — no escalation to new buildings).
create policy bm_primary_insert on public.building_managers for insert
  with check (public.is_primary_manager(building_id));

-- ...and remove a co-manager from such a building.
create policy bm_primary_delete on public.building_managers for delete
  using (public.is_primary_manager(building_id));
