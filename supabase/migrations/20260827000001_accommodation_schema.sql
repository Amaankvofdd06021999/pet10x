-- Pet10x — Phase 7, Task 1b: the columns a real accommodation checklist needs.
--
-- The design document (2026-08-21-completing-manager-resident-flows-design.md,
-- Migration G at :417) says "No DDL". Measured against this database on
-- 2026-08-22, that is false. `accommodation_documents` had six columns —
-- id, request_id, kind, status, storage_path, verified — and no timestamp of
-- any sort, no uploader, no mime type, no size and no verifier. A manager
-- cannot work a checklist made of that, and a retention sweep cannot age a row
-- that has never recorded when it arrived. The schema wins; this is the DDL.
--
-- WHAT THIS MIGRATION DOES NOT DO
--   * It does not touch `status` on any existing row. The four live requests
--     stay exactly where they are.
--   * It does not change `accommodation_documents.status`'s default of
--     'missing'. That default is now DEAD: from this phase on a row exists if
--     and only if a file was uploaded, and a "missing" kind is derived from the
--     ABSENCE of a row, never from a row saying so. The default is left alone
--     rather than changed, because changing a default on a live table for
--     cosmetic reasons is not worth a migration. Readers: do not write
--     'missing' here.
--   * It adds no `condition`, `diagnosis` or `impairment` column, and never
--     will. `animal_desc` stays free text in the resident's own words. A
--     structured clinical column invites a report, and a report is how
--     `emergency_directory` ended up returning `p.conditions` while its own
--     header said medical history was withheld (Phase 0 finding).

-- ---------------------------------------------------------------- requests --

alter table public.accommodation_requests
  -- When it entered the manager's queue. `created_at` is when the DRAFT was
  -- opened, which is a different instant and a different fact.
  add column if not exists submitted_at  timestamptz,
  -- The retention clock for a withdrawal, mirroring `decided_at` for a decision.
  add column if not exists withdrawn_at  timestamptz,
  -- "The reasoning is what defends this at the CRT" is already a comment at
  -- lib/data/manager-queues.ts:233. Making it a column is what makes it true.
  add column if not exists decision_note text,
  add column if not exists updated_at    timestamptz not null default now();

comment on column public.accommodation_requests.submitted_at is
  'When the resident submitted it. Null while draft.';
comment on column public.accommodation_requests.withdrawn_at is
  'When the resident withdrew it. Starts the 400-day retention clock for that outcome.';
comment on column public.accommodation_requests.decision_note is
  'The manager''s reasoning. Readable by the resident (accom_select admits resident_id = auth.uid()). Never copied into audit_log metadata or a notification.';

drop trigger if exists trg_accommodation_requests_updated on public.accommodation_requests;
create trigger trg_accommodation_requests_updated
  before update on public.accommodation_requests
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------- documents --

alter table public.accommodation_documents
  add column if not exists label       text,
  add column if not exists mime_type   text,
  add column if not exists size_bytes  integer,
  add column if not exists uploaded_at timestamptz not null default now(),
  -- `on delete set null`, stated deliberately. The document must SURVIVE its
  -- uploader's account deletion in the row sense, because a cascade here would
  -- destroy a manager's verified evidence the moment a resident closed their
  -- account. The FILE is a separate question and is handled by Task 9:
  -- /api/account/delete removes the storage objects explicitly, so the bytes go
  -- and the record that a letter existed stays.
  add column if not exists uploaded_by uuid references public.profiles(id) on delete set null,
  -- Same reasoning. `pet_documents.verified_by` states no on-delete action at
  -- all; this one states it.
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists verified_at timestamptz,
  -- Stamped when retention removes the file. The ROW STAYS, so
  -- "an ESA letter was provided on 14 July and verified by Rachel Torres"
  -- remains provable after the letter itself is gone.
  add column if not exists purged_at   timestamptz;

comment on column public.accommodation_documents.purged_at is
  'When retention removed the file. storage_path goes null; the row and its verdict stay.';
comment on column public.accommodation_documents.status is
  'DEAD DEFAULT: still defaults to ''missing'', which this phase never writes. A missing kind is the absence of a row. Written values are ''approved'' or ''rejected'' by manager_verify_accommodation_document.';

-- One letter of each kind per request. Re-uploading replaces rather than
-- accumulating, which is also what makes `checklistFor` a function of the kind
-- rather than of an ordering.
create unique index if not exists accommodation_documents_request_kind_uniq
  on public.accommodation_documents (request_id, kind);

-- ----------------------------------------------------------------- backfill --

-- The four live rows are already submitted; they have been since July. Give
-- them a submitted_at so the queue can sort and so retention has an anchor.
-- `status` is not touched.
update public.accommodation_requests
   set submitted_at = created_at
 where submitted_at is null
   and status in ('pending','info_requested');
