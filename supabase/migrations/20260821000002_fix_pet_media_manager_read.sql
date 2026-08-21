-- "pet-media manager read", added in 20260821000001, shipped inert: it could
-- never match a row. Inside the exists() subquery an unqualified `name` binds
-- to the inner relation, and public.pets HAS a name column — so the policy
-- split the pet's name ("Buddy") into path segments and compared segment 2,
-- which is null, against the pet id. False for every row, always. A manager of
-- the building a pet lives in still saw none of that pet's photos, which is
-- exactly the blank pet picker this policy existed to fix.
--
-- The qualification below is load-bearing. storage.objects.name must stay
-- fully qualified so the inner scope cannot capture it; do NOT "simplify" it
-- back to a bare `name`. The sibling accommodation-docs policies write the
-- same syntax and bind correctly only because accommodation_requests happens
-- to have no name column to collide with — same code, different outcome,
-- decided entirely by the joined table's columns.

drop policy if exists "pet-media manager read" on storage.objects;

create policy "pet-media manager read"
  on storage.objects for select
  using (
    bucket_id = 'pet-media'
    and exists (
      select 1 from public.pets p
      where p.id::text = (storage.foldername(storage.objects.name))[2]
        and (public.manages_building(p.building_id) or public.is_admin())
    )
  );
