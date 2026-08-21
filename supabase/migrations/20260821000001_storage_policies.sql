-- Three buckets existed with no policies at all, so no role could read or
-- write them. A fourth, pet-media, was readable only by the uid that uploaded
-- — which is why the pet picker shown to a reporter renders no photos.

-- guest-evidence: SELECT only, and only for managers of the building the path
-- names. There is deliberately NO client INSERT policy: uploads happen through
-- a signed upload URL minted server-side (Phase 1, AD-1), because a guest
-- reporter has no session and auth.uid() is null for them.
-- Path convention: {buildingId}/{draftId}/{n}.{ext}
create policy "guest-evidence manager read"
  on storage.objects for select
  using (
    bucket_id = 'guest-evidence'
    and (
      public.manages_building(((storage.foldername(name))[1])::uuid)
      or public.is_admin()
    )
  );

-- accommodation-docs: the resident who owns the request, and managers of its
-- building. Path convention: {buildingId}/{requestId}/{filename}
create policy "accommodation-docs read"
  on storage.objects for select
  using (
    bucket_id = 'accommodation-docs'
    and exists (
      select 1 from public.accommodation_requests r
      where r.id::text = (storage.foldername(name))[2]
        and (r.resident_id = auth.uid()
             or public.manages_building(r.building_id)
             or public.is_admin())
    )
  );

create policy "accommodation-docs resident write"
  on storage.objects for insert
  with check (
    bucket_id = 'accommodation-docs'
    and exists (
      select 1 from public.accommodation_requests r
      where r.id::text = (storage.foldername(name))[2]
        and r.resident_id = auth.uid()
    )
  );

-- community-media: residents and managers of the building read; the uploader
-- writes into their own folder.
-- Path convention: {buildingId}/{uploaderUid}/{filename}
create policy "community-media building read"
  on storage.objects for select
  using (
    bucket_id = 'community-media'
    and (
      public.is_resident_of(((storage.foldername(name))[1])::uuid)
      or public.manages_building(((storage.foldername(name))[1])::uuid)
      or public.is_admin()
    )
  );

create policy "community-media uploader write"
  on storage.objects for insert
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[2] = (auth.uid())::text
  );

create policy "community-media uploader delete"
  on storage.objects for delete
  using (
    bucket_id = 'community-media'
    and (storage.foldername(name))[2] = (auth.uid())::text
  );

-- pet-media: a manager of the building a pet lives in may read that pet's
-- files. The existing owner policies are untouched; this only widens SELECT.
-- Path convention is {ownerUid}/{petId}/..., so segment 2 is the pet.
create policy "pet-media manager read"
  on storage.objects for select
  using (
    bucket_id = 'pet-media'
    and exists (
      select 1 from public.pets p
      where p.id::text = (storage.foldername(name))[2]
        and (public.manages_building(p.building_id) or public.is_admin())
    )
  );
