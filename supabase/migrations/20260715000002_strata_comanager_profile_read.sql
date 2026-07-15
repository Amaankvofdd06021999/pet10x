-- A manager needs to see the name/email of co-managers who share a building with
-- them (for the Team/delegation tab). profiles_select only exposes residents of
-- managed buildings, not fellow managers. SECURITY DEFINER avoids RLS recursion.
create or replace function public.shares_managed_building_with(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.building_managers a
    join public.building_managers b on a.building_id = b.building_id
    where a.profile_id = auth.uid() and b.profile_id = p
  );
$$;

create policy profiles_comanager_read on public.profiles for select
  using (public.shares_managed_building_with(id));
