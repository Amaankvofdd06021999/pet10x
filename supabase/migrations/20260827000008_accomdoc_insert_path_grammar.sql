-- Pet10x — Phase 7 fix round: the RPC validates the storage path, the policy
-- did not, and the policy is the thing a client can reach directly.
--
-- `attach_accommodation_document` (20260827000003:509-511) builds the only path
-- it will accept from the request itself:
--
--     v_expected := '^' || v_req.building_id::text || '/' || v_req.id::text
--                || '/[A-Za-z0-9][A-Za-z0-9._-]*$';
--
-- `accomdoc_insert` accepted ANY `storage_path` whatsoever. It still checked the
-- only thing that matters for confidentiality — that the caller owns the parent
-- request and that the request is still open — so this grants no read: the
-- storage policy re-derives the reader from the two id segments of the object's
-- own name, so a row naming somebody else's object does not make that object
-- readable, and a row naming nothing at all resolves to nothing.
--
-- What it does buy is a LIE ON A MANAGER'S CHECKLIST. A resident could insert a
-- row for their own open request with `storage_path` pointing at another
-- building's folder, at a path with no object behind it, or at a plausible-
-- looking name they invented — and the manager's document checklist would show
-- an ESA letter attached and verified-pending against a request that has none.
-- The manager clicks it, the signed URL fails, and the disagreement between the
-- checklist and the bucket is discovered by the person deciding a human-rights
-- request.
--
-- Same grammar as the RPC, and same shape as the `accommodation-docs read`
-- storage policy: a POSITIVE statement of the one path that is allowed, built
-- from the parent row, not a denylist of paths that are not. `r` is already in
-- scope in this policy, so the building and the request come from the request
-- being written to and cannot be supplied by the caller.
--
-- Null is not permitted on INSERT. A null `storage_path` is a
-- retention-purged record, which is something the sweep WRITES by UPDATE onto a
-- row that already exists; it is never how a document arrives.
--
-- This replaces one policy. Nothing else in 20260827000002 is touched.

drop policy if exists accomdoc_insert on public.accommodation_documents;
create policy accomdoc_insert on public.accommodation_documents
  for insert
  with check (
    exists (
      select 1 from public.accommodation_requests r
      where r.id = accommodation_documents.request_id
        and r.resident_id = auth.uid()
        and r.status in ('draft', 'pending', 'info_requested')
        and accommodation_documents.storage_path ~
            ('^' || r.building_id::text || '/' || r.id::text || '/[A-Za-z0-9][A-Za-z0-9._-]*$')
    )
  );

comment on policy accomdoc_insert on public.accommodation_documents is
  'INSERT: the owning resident only, while the parent request is draft, pending or info_requested, and only naming a storage_path under that request''s own {building_id}/{request_id}/ folder with a filename the storage policy''s regex also admits. The three open states are named rather than excluded, so a future accommodation_status label defaults to closed. The path grammar is the same expression attach_accommodation_document builds, so the RPC and the policy now refuse the same set instead of the RPC alone doing the work.';
