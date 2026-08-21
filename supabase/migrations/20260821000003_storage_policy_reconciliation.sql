-- Two problems, closed together.
--
-- ONE: the ::uuid casts in the bucket policies raise instead of denying, and
-- the path that plants a bad object is client-reachable. "community-media
-- uploader write" constrains only segment 2, so any authenticated user could
-- upload under a non-UUID FIRST segment; from then on every select over that
-- bucket aborts with 22P02 for every reader, super-admins included — a
-- self-service, bucket-wide read outage. Verified end to end before this
-- migration: the insert was admitted, and the next select over the bucket
-- died with `invalid input syntax for type uuid: "not-a-building"`. Inert only
-- because the bucket is empty, and Phase 1 starts writing guest-evidence next,
-- which carries the identical cast.
--
-- The guard is a CASE, not an `and`, on purpose. Postgres does not promise
-- left-to-right evaluation of AND operands and may reorder them, so
-- `seg ~ shape and seg::uuid = x` can still reach the cast. CASE does
-- guarantee ordered evaluation of its arms, which is what makes the predicate
-- total. A segment that is null or misshapen now yields false. Do not
-- "simplify" these back into a flat AND chain.
--
-- is_admin() deliberately stays outside the guard: a super-admin must still be
-- able to see a malformed object in order to delete it.
--
-- TWO: this table's policy state did not reproduce from migrations at all.
-- "avatars public read" is declared at 20260601000001_functions_rls.sql:400 but
-- does not exist live, and the four live "pet-media owner *" policies appear in
-- no migration file — they were created out of band. A fresh `db reset` gave 10
-- policies instead of 13, silently losing owner pet-photo read and upload. The
-- capture below makes a reset converge on live instead of diverging from it.

-- 1. Fail closed rather than raising ------------------------------------------

drop policy if exists "guest-evidence manager read" on storage.objects;

create policy "guest-evidence manager read"
  on storage.objects for select
  using (
    bucket_id = 'guest-evidence'
    and (
      case
        when (storage.foldername(name))[1] ~
             '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then public.manages_building(((storage.foldername(name))[1])::uuid)
        else false
      end
      or public.is_admin()
    )
  );

drop policy if exists "community-media building read" on storage.objects;

create policy "community-media building read"
  on storage.objects for select
  using (
    bucket_id = 'community-media'
    and (
      case
        when (storage.foldername(name))[1] ~
             '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          then public.is_resident_of(((storage.foldername(name))[1])::uuid)
               or public.manages_building(((storage.foldername(name))[1])::uuid)
        else false
      end
      or public.is_admin()
    )
  );

-- 2. Close the vector, not just survive it ------------------------------------
-- Segment 1 must now be a building the uploader actually belongs to, so a
-- malformed or foreign first segment is rejected at write time.

drop policy if exists "community-media uploader write" on storage.objects;

create policy "community-media uploader write"
  on storage.objects for insert
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[2] = (auth.uid())::text
    and case
      when (storage.foldername(name))[1] ~
           '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then public.is_resident_of(((storage.foldername(name))[1])::uuid)
             or public.manages_building(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

-- 3. Capture the four out-of-band pet-media owner policies --------------------
-- Transcribed from pg_get_expr(pg_policy) on the live database, not rebuilt
-- from memory. Their `to authenticated` role targeting is preserved: these four
-- differ from the policies added in 20260821000001, which are PUBLIC, and that
-- difference is intentionally left as it was.

drop policy if exists "pet-media owner read" on storage.objects;

create policy "pet-media owner read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'pet-media'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "pet-media owner insert" on storage.objects;

create policy "pet-media owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pet-media'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "pet-media owner update" on storage.objects;

create policy "pet-media owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'pet-media'
    and (storage.foldername(name))[1] = (auth.uid())::text
  )
  with check (
    bucket_id = 'pet-media'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "pet-media owner delete" on storage.objects;

create policy "pet-media owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pet-media'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

-- 4. Drop the policy that only ever existed on paper --------------------------
-- Declared in 20260601000001_functions_rls.sql:400, absent live. avatars is a
-- public bucket, so a SELECT policy is redundant there anyway. Dropping it lets
-- a fresh reset land on the same 13 policies the live database carries.

drop policy if exists "avatars public read" on storage.objects;
