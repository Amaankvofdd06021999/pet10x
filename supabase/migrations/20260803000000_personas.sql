-- Personas: what a signed-in account is actually entitled to be.
--
-- `profiles.role` is one enum value, so it cannot express a person who manages
-- a building AND owns a dog, or an admin who is also a resident. The app read
-- that column while RLS read `is_super_admin`, and the two are free to
-- disagree — which is exactly what happened: an account with
-- role = 'pet_owner' and is_super_admin = true rendered the owner UI while
-- every policy's `OR is_admin()` branch handed it the whole database. Manager
-- alerts showed up in a pet owner's feed.
--
-- The grants that matter already exist as rows:
--
--   pet owner        every account (anyone may add a pet)
--   building manager >= 1 row in building_managers
--   strata manager   >= 2 buildings in building_managers
--   super admin      profiles.is_super_admin
--   business         profiles.role = 'business'
--
-- This function reports them, computed server-side under SECURITY DEFINER so a
-- browser cannot claim a persona it was never granted. It is descriptive, not
-- an authorisation boundary: RLS still decides what rows anyone may read. The
-- personas decide which surface the app renders and, crucially, which scope
-- queries must ask for — a super admin wearing the pet-owner persona should be
-- shown their own pets, not everyone's.

create or replace function public.my_personas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profile_id', auth.uid(),
    'default_role', (select role::text from public.profiles where id = auth.uid()),
    -- Suspension is reported separately so the UI can explain itself rather
    -- than silently showing an account with no personas at all.
    'is_suspended', coalesce((select is_suspended from public.profiles where id = auth.uid()), false),
    -- Mirrors is_admin(): a suspended super admin is not an admin.
    'is_super_admin', coalesce(
      (select is_super_admin and not is_suspended from public.profiles where id = auth.uid()),
      false
    ),
    'owns_pets', exists (
      select 1 from public.pets
      where owner_id = auth.uid() and deleted_at is null
    ),
    'managed_buildings', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', b.id, 'name', b.name, 'isPrimary', bm.is_primary)
               order by bm.is_primary desc nulls last, b.name
             )
      from public.building_managers bm
      join public.buildings b on b.id = bm.building_id
      where bm.profile_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;

comment on function public.my_personas() is
  'Personas the calling account actually holds, derived from grant rows. Descriptive only — RLS remains the authorisation boundary.';

revoke all on function public.my_personas() from public;
grant execute on function public.my_personas() to authenticated, service_role;
