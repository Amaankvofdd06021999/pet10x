-- Pet10x — Veterinary platform: the clinic persona.
--
-- `my_personas` is how this codebase answers "what may this account BE". A
-- persona is a view, never a permission — RLS is unchanged and unchangeable
-- from the client. Adding `clinics` lets the app route a staff member to
-- /clinic without inventing a `profiles.role`, exactly as `managed_buildings`
-- routes a manager without one.
--
-- NOTE ON WHAT WAS APPLIED: this function change was applied to the live
-- project inside a migration named `vet_personas_and_seed`, which also carried
-- the Westside demo data. The demo half is NOT in this file — it is
-- `supabase/seed_vet.sql`, because seed rows do not belong in a migration that
-- has to replay on an empty database.

create or replace function public.my_personas()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'profile_id', auth.uid(),
    'default_role', (select role::text from public.profiles where id = auth.uid()),
    'is_suspended', coalesce((select is_suspended from public.profiles where id = auth.uid()), false),
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
    ), '[]'::jsonb),
    'clinics', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', b.id, 'name', b.name, 'role', s.role::text,
                                  'tier', b.tier::text, 'kind', b.business_kind)
               order by b.name
             )
      from public.business_staff s
      join public.businesses b on b.id = s.business_id
      where s.profile_id = auth.uid() and s.is_active
    ), '[]'::jsonb)
  );
$$;
