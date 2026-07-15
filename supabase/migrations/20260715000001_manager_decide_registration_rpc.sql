-- Managers have no RLS UPDATE policy on pets, so a client-side
-- pets.update(registration_status) silently no-ops for a non-admin manager.
-- This SECURITY DEFINER RPC (mirrors escalate_incident_to_violation) lets a
-- manager who manages the pet's building approve/deny a pending registration.
create or replace function public.manager_decide_registration(p_pet uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.pets p
    where p.id = p_pet and (public.manages_building(p.building_id) or public.is_admin())
  ) then
    raise exception 'forbidden: not a manager of this pet''s building';
  end if;
  update public.pets
     set registration_status = case when p_approve then 'approved'::registration_status
                                     else 'denied'::registration_status end
   where id = p_pet;
end; $$;

grant execute on function public.manager_decide_registration(uuid, boolean) to authenticated;
