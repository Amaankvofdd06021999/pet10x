-- Every segment named, and a bucket that finally says no.
--
-- READ 20260821000001_storage_policies.sql:46-72 AND
-- 20260821000003_storage_policy_reconciliation.sql BEFORE CHANGING ANYTHING
-- HERE. Between them they record a self-service, bucket-wide read OUTAGE that
-- this bucket already shipped once: the uploader policy validated only path
-- segment 2 while the read policies cast segment 1 to uuid, so any
-- authenticated user could upload ONE object under a non-uuid first segment and
-- from then on every select over community-media aborted with 22P02 for every
-- reader, super-admins included.
--
-- IT WAS CLOSED WITH A `CASE`, NOT AN `AND`, AND THE `CASE` STAYS. Postgres
-- does not promise left-to-right evaluation of AND operands and may reorder
-- them, so `seg ~ shape and seg::uuid = x` can still reach the cast. CASE
-- guarantees ordered evaluation of its arms, which is what makes the predicate
-- total. Do not "simplify" these back into a flat AND chain.
--
-- ---------------------------------------------------------------------------
-- WHAT THE BUCKET PERMITTED BEFORE THIS FILE, READ LIVE 2026-08-23
--
--   community-media building read
--     CASE WHEN seg1 ~ uuid THEN is_resident_of(seg1) OR manages_building(seg1)
--          ELSE false END OR is_admin()
--   community-media uploader write
--     seg2 = auth.uid()::text AND CASE WHEN seg1 ~ uuid THEN … ELSE false END
--   community-media uploader delete
--     seg2 = auth.uid()::text        -- no uuid guard, no manager or admin
--
--   bucket: public = false, file_size_limit = NULL, allowed_mime_types = NULL
--
-- So: nothing said how many segments a path had or what a filename looked like
-- ({building}/{uid}/a/b/../c satisfied both of the write predicates), a
-- moderator could not remove an image at all, and the bucket would have
-- accepted a 2 GB executable from any resident. Compare guest-evidence: 15 MB,
-- five image types, set in 20260822000001_evidence_path_hardening.sql.
--
-- community-media held 0 objects when this ran, so tightening READ as well as
-- WRITE strands nothing.
--
-- ---------------------------------------------------------------------------
-- THE TWO DEFENCES, AND WHY NEITHER IS SUFFICIENT ALONE
--
-- THE REGEX IS THE GRAMMAR. Anchored at both ends, exactly three segments, no
-- '.' and no '/' admitted anywhere inside a segment, a filename minted from 128
-- bits of randomness, and an extension from a closed list. It states what a
-- path may BE rather than enumerating what it may not contain — Phase 1's
-- lesson: enumerating the payload is not the same as characterising the class.
--
-- THE `CASE` IS THE CRASH GUARD. It is what makes a misshapen or NULL segment
-- evaluate to FALSE instead of raising 22P02 and taking every other reader's
-- query down with it.
--
-- Removing either does not leave the other sufficient. The regex without the
-- CASE is a predicate the planner may evaluate after the cast; the CASE without
-- the regex is what shipped, and admitted `{building}/{uid}/../escape.jpg`.

-- ===========================================================================
-- 1. The bucket says no
-- ===========================================================================
-- Mirrors guest-evidence exactly. app/api/community/media/sign/route.ts
-- re-declares both of these as MAX_BYTES and ALLOWED and must be changed
-- together with them: the route exists to fail early with a sentence a person
-- can act on, THE BUCKET IS THE ENFORCEMENT POINT.
update storage.buckets
   set file_size_limit = 15728640,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
 where id = 'community-media';

-- ===========================================================================
-- 2. One regex over the whole name, then the CASE-guarded scope checks
-- ===========================================================================
-- The grammar, spelled once here and mirrored in report_lost_found
-- (20260826000003) which decides whether a path may be STORED. These two must
-- change together.
--
--   {buildingId}/{uploaderUid}/(post|lf)-{32 hex}.(jpg|png|webp|heic)
--
-- Lower-case hex only, in both the uuid segments and the filename, because the
-- server mints all three and mints them lower-case; accepting [A-F] as well
-- would admit two distinct object names for the same logical file.

drop policy if exists "community-media building read" on storage.objects;

create policy "community-media building read"
  on storage.objects for select
  using (
    bucket_id = 'community-media'
    and (
      (
        name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(post|lf)-[0-9a-f]{32}\.(jpg|png|webp|heic)$'
        and case
          when (storage.foldername(name))[1] ~
               '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            then public.is_resident_of(((storage.foldername(name))[1])::uuid)
                 or public.manages_building(((storage.foldername(name))[1])::uuid)
          else false
        end
      )
      -- is_admin() deliberately stays OUTSIDE both the regex and the CASE, as
      -- 20260821000003 put it: a super-admin must still be able to SEE a
      -- malformed object in order to delete it. An object nobody can see is an
      -- object nobody can clean up.
      or public.is_admin()
    )
  );

drop policy if exists "community-media uploader write" on storage.objects;

create policy "community-media uploader write"
  on storage.objects for insert
  with check (
    bucket_id = 'community-media'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(post|lf)-[0-9a-f]{32}\.(jpg|png|webp|heic)$'
    and (storage.foldername(name))[2] = (auth.uid())::text
    and case
      when (storage.foldername(name))[1] ~
           '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then public.is_resident_of(((storage.foldername(name))[1])::uuid)
             or public.manages_building(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

drop policy if exists "community-media uploader delete" on storage.objects;

create policy "community-media uploader delete"
  on storage.objects for delete
  using (
    bucket_id = 'community-media'
    and (
      (
        name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(post|lf)-[0-9a-f]{32}\.(jpg|png|webp|heic)$'
        and (
          (storage.foldername(name))[2] = (auth.uid())::text
          -- ADDED: a moderator could not remove an image at all before this.
          -- Removing a post but leaving its picture in the bucket is half a
          -- removal, and the half that is left is the half people can see.
          or case
            when (storage.foldername(name))[1] ~
                 '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then public.manages_building(((storage.foldername(name))[1])::uuid)
            else false
          end
        )
      )
      or public.is_admin()
    )
  );

-- NO UPDATE POLICY, and that is deliberate. Uploads are write-once: the
-- filename carries 128 bits of randomness, so nothing ever needs to overwrite
-- anything. createCommunityPost's `{ upsert: true }` never worked here anyway —
-- there has never been an UPDATE policy on this bucket, and it only appeared to
-- work because the old path carried Date.now() and therefore never collided.
