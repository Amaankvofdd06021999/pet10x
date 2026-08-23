-- Pet10x — Phase 7, Task 4: one way into the bucket, and every segment pinned.
--
-- WHAT `accommodation-docs` PERMITTED BEFORE THIS FILE, measured 2026-08-23:
--
--   * `file_size_limit = null` and `allowed_mime_types = null`. No cap on
--     either. A private bucket with a doctor's letter in it and no limits.
--   * Two policies, `accommodation-docs read` (SELECT) and
--     `accommodation-docs resident write` (INSERT), applied by
--     20260821000001_storage_policies.sql:22-44 and NOT reconciled by
--     20260821000003, so neither carries the positive-grammar path guard the
--     other buckets were given.
--   * Both key on `(storage.foldername(name))[2]` ALONE — segment 1 and the
--     filename are entirely unconstrained. Measured as the owning resident:
--     an object at `anything-at-all/{theirRequestId}/../x.pdf` was ADMITTED.
--
-- The design document (AD-1) signs upload URLs because "a guest has no JWT".
-- That rationale does not carry here — a resident DOES have a JWT. The reasons
-- that do carry are the three above, and one more: with no INSERT policy at all
-- the shape of the path stops being a convention and becomes a fact, because
-- the only thing that can create an object is a URL the server composed.

-- ---------------------------------------------------------------------------
-- 1. THE BUCKET IS THE ENFORCEMENT POINT
--
-- A signed upload token binds path, upsert, scope and expiry — NEVER
-- Content-Type and NEVER length. A client declaring 1 KB of application/pdf can
-- PUT 500 MB of anything through the URL it is handed. What actually stops that
-- is the bucket's own two settings, which is why they are set here and not
-- merely checked in the route.
--
-- These two values MIRROR CONSTANTS IN app/api/accommodations/docs/sign/route.ts
-- (MAX_BYTES and ALLOWED) and must be changed together with them, exactly as
-- 20260822000001 says of `guest-evidence`. Drift either way and the browser
-- accepts a file storage then rejects, or refuses one it would have kept.
--
-- 10 MB, PDF plus the image set the rest of the product already uses.
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf','image/jpeg','image/png',
                                  'image/webp','image/heic','image/heif']
 where id = 'accommodation-docs';

-- ---------------------------------------------------------------------------
-- 2. THERE IS NO CLIENT WRITE
--
-- Dropped entirely. From here an object can only appear through a signed upload
-- URL minted by app/api/accommodations/docs/sign/route.ts, which composes the
-- whole path from the database — the resident supplies bytes and a kind, never
-- a filename. This is the structural guarantee `guest-evidence` already has.
--
-- There is no UPDATE and no DELETE policy either, and there never was. Deletion
-- is done with the service role by /api/accommodations/docs (a resident
-- removing or replacing an attachment) and by the retention sweep.
drop policy if exists "accommodation-docs resident write" on storage.objects;

-- ---------------------------------------------------------------------------
-- 3. THE READ, WITH THE WHOLE GRAMMAR STATED
--
-- Four things about the policy below, each learned from a specific defect in
-- this repository:
--
--  1. THE REGEX IS THE GUARD, NOT THE CHARACTER CLASS. 20260822000001's header
--     is explicit: `.` is a literal inside [A-Za-z0-9._-], so `..` is a valid
--     segment there and a three-segment pattern built from that class still
--     admits {building}/../evil.pdf. What closes it is pinning both leading
--     segments to shapes that CANNOT BE `..` — two uuids — and requiring the
--     filename to begin alphanumeric.
--
--  2. SEGMENT 1 MUST EQUAL THE REQUEST'S OWN building_id. Without that, segment
--     1 is decoration and the documented convention is a lie. With it, a
--     request that somehow moved between buildings stops matching its own
--     objects — a second lock on the hole 20260827000002's trigger closes.
--
--  3. `storage.objects.name` STAYS FULLY QUALIFIED INSIDE THE SUBQUERY.
--     `pet-media manager read` shipped inert for exactly this reason: an
--     unqualified `name` bound to `pets.name`. The old accommodation-docs
--     policies got away with the bare form only because `accommodation_requests`
--     has no `name` column — a collision, not a design. Not relied on here.
--
--  4. NO `::uuid` CAST APPEARS ANYWHERE. The case-guards 20260821000003 added
--     elsewhere exist because a cast on a malformed segment raises 22P02 and
--     takes the whole bucket offline for every reader including a super-admin.
--     Comparing `r.id::text` to the segment casts the TRUSTED side and never
--     the path, so that failure mode cannot arise and no guard is needed.
--
-- The `r.status <> 'draft'` arm is the same confidentiality rule accom_select
-- and accomdoc_select carry: a manager who cannot see a draft request cannot
-- see the file attached to one either.
drop policy if exists "accommodation-docs read" on storage.objects;
create policy "accommodation-docs read"
  on storage.objects for select
  using (
    bucket_id = 'accommodation-docs'
    and storage.objects.name ~
        ('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
      || '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
      || '/[A-Za-z0-9][A-Za-z0-9._-]*$')
    and exists (
      select 1 from public.accommodation_requests r
      where r.id::text = (storage.foldername(storage.objects.name))[2]
        and r.building_id::text = (storage.foldername(storage.objects.name))[1]
        and (
          r.resident_id = auth.uid()
          or (r.status <> 'draft' and (public.manages_building(r.building_id) or public.is_admin()))
        )
    )
  );
