-- Pet10x — Phase 7, Task 3: the five ways an accommodation request may move,
-- and no sixth.
--
-- 20260827000002 froze `status`, the decision columns and the resident's own
-- words behind a single-use token. This migration is what mints that token.
-- The two halves belong together in the sense that a guard with no minter
-- breaks the product and a minter with no guard enforces nothing; they are in
-- separate files only because the guard had to land with the policies it
-- backstops.
--
-- CONVENTIONS, ALL FOLLOWING manager_advance_violation RATHER THAN THE OLDER
-- RAISING STYLE OF manager_decide_registration:
--
--   * They RETURN a structured error, they do not raise. A caller holding a
--     half-filled form needs a sentence to show, not an exception.
--   * They take `for update` on the row before reading its state, so two
--     managers pressing Approve at the same moment do not both succeed.
--   * They mint `pet10x.accom_write` IMMEDIATELY before their own UPDATE —
--     after every early return, so a refused call mints nothing — and CLEAR IT
--     IMMEDIATELY AFTER, unconditionally.
--
--     That second clear is not redundant with the trigger spending it.
--     20260825000004 records the measured leak this rule comes from: a minter
--     that trusts a WHEN-gated guard to collect leaks the token on any UPDATE
--     the WHEN clause skips. `accom_freeze_guard` carries NO WHEN clause, so it
--     always collects — but the invariant worth stating is the local one:
--     A MINTER CLOSES ITS OWN WINDOW, whether or not any trigger chose to run.
--     Reading one function is then enough to see that the capability is dead
--     before it returns.
--
--   * SECURITY DEFINER bypasses RLS, so every one of them re-checks the
--     caller's scope by hand before the first write.
--
-- WHAT NEVER LEAVES THIS FILE (the phase's confidentiality contract):
--   * `audit_log.metadata` carries the OUTCOME and nothing clinical. No
--     `decision_note`, no `animal_desc`, no filename — AND NO `kind`, because
--     the doc_kind label `esa_letter` contains the word "letter" and would put
--     the nature of the request into a table the note was kept out of.
--   * `notifications` carry a title and a target and NEVER the reason. "Your
--     accommodation request was decided" and "Open Accommodation Requests to
--     read the decision." A push preview is readable on a lock screen.
--   * There is no email path. /api/manager/request-info sends one for
--     registrations; this phase deliberately does not, because email is the one
--     channel whose contents leave the product's access control behind.

-- ---------------------------------------------------------------------------
-- 0. THE REQUIRED-DOCUMENT RULE, IN ONE PLACE
--
-- Derived once so the resident's form and the manager's checklist cannot
-- disagree. Its TypeScript twin is REQUIRED_KINDS in lib/data/accommodations.ts
-- and the two must be changed together; lib/data/accommodations.test.ts pins
-- the TS side, and submit_accommodation_request below pins this one.
--
-- The labels are live `doc_kind` values — the enum is vaccination,
-- municipal_license, liability_insurance, building_registration,
-- microchip_registration, esa_letter, provider_license, other. No label is
-- invented here.
--
--   esa            -> esa_letter        required; vaccination, other optional
--   service_animal -> provider_license  required; esa_letter, vaccination,
--                                       other optional
create or replace function public.accommodation_required_kinds(p_type public.accommodation_type)
returns public.doc_kind[]
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'esa'            then array['esa_letter']::public.doc_kind[]
    when 'service_animal' then array['provider_license']::public.doc_kind[]
    -- Positive grammar: a type nobody has taught this function about requires
    -- nothing, rather than silently requiring the ESA letter.
    else array[]::public.doc_kind[]
  end;
$$;

comment on function public.accommodation_required_kinds(public.accommodation_type) is
  'The doc_kind labels a request of this type must carry before it may be submitted. Mirrored by REQUIRED_KINDS in lib/data/accommodations.ts; change both together.';

-- ---------------------------------------------------------------------------
-- 0b. TRIMMING, DONE ONCE AND DONE RIGHT
--
-- `nullif(btrim(x), '')` is the idiom the rest of this repository uses and it
-- is WRONG for anything a person types into a textarea. `btrim(string)` strips
-- only ASCII SPACES by default, so E'\n\n\t\n' survives it non-empty — the
-- exact defect Phase 6 shipped and then fixed with `!~ '\S'`.
--
-- Here it is not cosmetic. `manager_decide_accommodation` refuses a denial with
-- a blank note; if a note of E'\n\n' were accepted as non-blank, the UPDATE
-- would then hit `accommodation_requests_denial_note_ck`, which is written
-- correctly as `~ '\S'`, and raise 23514 out of a function whose entire
-- contract is to RETURN errors rather than raise them. Two checks disagreeing
-- about what "blank" means is how a structured error becomes a 500.
--
-- Positive grammar: text is present when it contains a non-whitespace
-- character. Then, and only then, strip whitespace from both ends.
create or replace function public.text_present(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p, '') ~ '\S'
              then pg_catalog.regexp_replace(p, '^\s+|\s+$', '', 'g')
         end;
$$;

comment on function public.text_present(text) is
  'Null unless the argument contains a non-whitespace character; otherwise the argument with leading and trailing whitespace stripped. btrim() strips only ASCII spaces and is not a blank test.';

-- ---------------------------------------------------------------------------
-- 1. SUBMIT — draft | info_requested -> pending

create or replace function public.submit_accommodation_request(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req     public.accommodation_requests%rowtype;
  v_missing public.doc_kind[];
begin
  select * into v_req from public.accommodation_requests where id = p_request for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Ownership before anything else. A request is not a queue item until its
  -- own resident says so.
  if v_req.resident_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if v_req.status not in ('draft', 'info_requested') then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition',
                              'from', v_req.status::text, 'to', 'pending');
  end if;

  -- `!~ '\S'` and not `btrim(...) = ''`: btrim strips only ASCII spaces, so a
  -- description of E'\n\n\t\n' passed the equivalent check in Phase 6.
  if coalesce(v_req.animal_desc, '') !~ '\S' then
    return jsonb_build_object('ok', false, 'error', 'description_required');
  end if;

  -- A required kind counts only when a FILE is actually attached. A row whose
  -- storage_path is null is either a retention-purged record or a bug; neither
  -- is a document a manager can read.
  select coalesce(array_agg(k), array[]::public.doc_kind[]) into v_missing
    from unnest(public.accommodation_required_kinds(v_req.type)) k
   where not exists (
     select 1 from public.accommodation_documents d
      where d.request_id = v_req.id and d.kind = k and d.storage_path is not null
   );

  if array_length(v_missing, 1) is not null then
    return jsonb_build_object('ok', false, 'error', 'checklist_incomplete',
                              'missing', to_jsonb(v_missing::text[]));
  end if;

  perform set_config('pet10x.accom_write', 'ok', true);
  update public.accommodation_requests
     set status = 'pending',
         submitted_at = now()
   where id = p_request;
  perform set_config('pet10x.accom_write', '', true);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'accommodation.submitted', 'accommodation_request', p_request, v_req.building_id,
          jsonb_build_object('from', v_req.status::text, 'to', 'pending',
                             'documents', (select count(*) from public.accommodation_documents d
                                            where d.request_id = p_request and d.storage_path is not null)));

  -- No notification. The building's managers see it in their queue, and a
  -- push saying "a resident filed a disability accommodation request" is a
  -- lock-screen preview naming a resident's disability status to whoever is
  -- looking at the phone.
  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. WITHDRAW — draft | pending | info_requested -> withdrawn

create or replace function public.withdraw_accommodation_request(
  p_request uuid,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req      public.accommodation_requests%rowtype;
  v_was_open boolean;
  v_notified integer := 0;
begin
  select * into v_req from public.accommodation_requests where id = p_request for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_req.resident_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_req.status not in ('draft', 'pending', 'info_requested') then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition',
                              'from', v_req.status::text, 'to', 'withdrawn');
  end if;

  -- Whether the managers ever knew about it decides whether they are told it
  -- is gone. THIS IS A CONFIDENTIALITY RULE, NOT A TIDINESS ONE: a draft is
  -- invisible to the building's managers by policy, so notifying them that a
  -- draft was withdrawn would announce the existence of a request the resident
  -- never filed — through the one channel that bypasses RLS entirely.
  v_was_open := v_req.status in ('pending', 'info_requested');

  perform set_config('pet10x.accom_write', 'ok', true);
  update public.accommodation_requests
     set status = 'withdrawn',
         withdrawn_at = now(),
         -- The resident's own reason is stored where the resident and their
         -- manager can both read it, which is where the decision note lives.
         decision_note = coalesce(public.text_present(p_reason), v_req.decision_note)
   where id = p_request;
  perform set_config('pet10x.accom_write', '', true);

  if v_was_open then
    insert into public.notifications (profile_id, kind, severity, title, body,
                                      action_label, action_target, building_id)
    select bm.profile_id, 'building', 'info',
           'An accommodation request was withdrawn',
           'A resident has withdrawn a request from your queue.',
           'Open approvals', 'accommodations', v_req.building_id
      from public.building_managers bm
      join public.profiles p on p.id = bm.profile_id
     where bm.building_id = v_req.building_id and not p.is_suspended;
    get diagnostics v_notified = row_count;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'accommodation.withdrawn', 'accommodation_request', p_request, v_req.building_id,
          jsonb_build_object('from', v_req.status::text, 'to', 'withdrawn',
                             'was_submitted', v_was_open, 'managers_told', v_notified));

  return jsonb_build_object('ok', true, 'status', 'withdrawn', 'managers_notified', v_notified);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. DECIDE — pending | info_requested -> approved | denied | info_requested

create or replace function public.manager_decide_accommodation(
  p_request uuid,
  p_outcome public.accommodation_status,
  p_note    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req      public.accommodation_requests%rowtype;
  v_note     text := public.text_present(p_note);
  v_pet_done boolean := false;
  v_pet_skip text := null;
  v_pet      public.pets%rowtype;
begin
  select * into v_req from public.accommodation_requests where id = p_request for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not (public.manages_building(v_req.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- A draft is not in anyone's queue. Reaching one by id is either a stale tab
  -- or a probe; either way it is not a decision.
  if v_req.status not in ('pending', 'info_requested') then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition',
                              'from', v_req.status::text, 'to', p_outcome::text);
  end if;

  -- The three outcomes a manager may reach, written out. `coalesce(..., false)`
  -- because `null in (...)` is NULL, and `if not NULL` does not branch — the
  -- three-valued-logic hole manager_advance_violation was corrected for.
  if not coalesce(p_outcome in ('approved', 'denied', 'info_requested'), false) then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition',
                              'from', v_req.status::text, 'to', coalesce(p_outcome::text, 'null'));
  end if;

  -- A denial without reasoning is not a decision. The CHECK constraint added in
  -- 20260827000002 says the same thing to every writer forever; this returns it
  -- as something the form can render instead of a 23514.
  if p_outcome = 'denied' and v_note is null then
    return jsonb_build_object('ok', false, 'error', 'note_required');
  end if;

  perform set_config('pet10x.accom_write', 'ok', true);
  update public.accommodation_requests
     set status        = p_outcome,
         decision_note = coalesce(v_note, decision_note),
         decided_by    = auth.uid(),
         -- info_requested is not a decision; it is a question. Leaving
         -- decided_at null keeps the retention clock unstarted and keeps the
         -- request out of any "decided" count.
         decided_at    = case when p_outcome in ('approved', 'denied') then now() else null end
   where id = p_request;
  perform set_config('pet10x.accom_write', '', true);

  -- THE CONSEQUENCE. An approved accommodation that leaves a row nobody reads
  -- is a record of a decision, not a decision. The building has agreed the
  -- animal may live there, so the pet stops being an unregistered pet: it
  -- leaves the manager's Registrations queue and the resident's missing-info
  -- card, both of which read `registration_status` today.
  --
  -- What approval deliberately does NOT do: it does not dismiss existing
  -- violations (a manager does that on purpose through manager_advance_violation,
  -- which writes the violation_events row that defends it), it does not change
  -- compliance_pct or waive a vaccination — an assistance animal still needs
  -- its rabies shot — and it does not waive a pet count or weight limit,
  -- because nothing in this product enforces one. `buildings.pet_rules` carries
  -- max_pets_per_unit and max_weight_kg at Maple Court Residences and no code
  -- reads either; an approval cannot waive a limit that does not exist.
  if p_outcome = 'approved' and v_req.pet_id is not null then
    select * into v_pet from public.pets where id = v_req.pet_id for update;
    if not found then
      v_pet_skip := 'pet_missing';
    elsif v_pet.deleted_at is not null then
      -- Do not resurrect a soft-deleted pet. Say so instead.
      v_pet_skip := 'pet_deleted';
    elsif v_pet.registration_status = 'approved' then
      v_pet_skip := 'already_approved';
    else
      update public.pets set registration_status = 'approved' where id = v_req.pet_id;
      v_pet_done := true;
    end if;
  end if;

  -- Tell the resident THAT it was decided, never what was decided or why.
  -- kind = 'building' because the notifications insert policy admits only
  -- kind = 'assistant' for self — a manager cannot notify a resident from the
  -- browser at all, which is the same constraint that forces the RPC here.
  insert into public.notifications (profile_id, kind, severity, title, body,
                                    action_label, action_target, building_id)
  values (v_req.resident_id, 'building',
          case when p_outcome = 'approved' then 'info' else 'warning' end,
          case when p_outcome = 'info_requested'
               then 'More information is needed for your accommodation request'
               else 'Your accommodation request was decided' end,
          'Open Accommodation Requests to read the decision.',
          'View request', 'accommodations', v_req.building_id);

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'accommodation.decided', 'accommodation_request', p_request, v_req.building_id,
          jsonb_build_object('from', v_req.status::text, 'to', p_outcome::text,
                             'resident_id', v_req.resident_id,
                             'pet_registration_approved', v_pet_done,
                             'pet_skipped', v_pet_skip));

  return jsonb_build_object('ok', true, 'status', p_outcome::text,
                            'pet_registration_approved', v_pet_done,
                            'pet_skipped', v_pet_skip);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3b. TWO SMALL SCHEMA CORRECTIONS THIS FILE'S FUNCTIONS REQUIRE
--
-- `review_note`: manager_verify_accommodation_document takes a note and there
-- was nowhere to put it. See its body for why it is stored rather than dropped.
-- Resident-readable, by the same policy that lets them read the document row.
alter table public.accommodation_documents
  add column if not exists review_note text;

comment on column public.accommodation_documents.review_note is
  'Why a manager verified or rejected this document. Readable by the resident who filed the request (accomdoc_select) — deliberately, so a rejection is actionable.';

-- 20260827000001 stated that this phase writes only ''approved'' or ''rejected''
-- here. That became untrue in this migration: record_accommodation_document
-- writes ''current'' on upload, so that a freshly attached document is not
-- indistinguishable from a verified one. Correcting the comment in a NEW
-- migration rather than editing an applied one.
comment on column public.accommodation_documents.status is
  'DEAD DEFAULT: still defaults to ''missing'', which this phase never writes — a missing kind is the ABSENCE of a row. Written values: ''current'' on upload (record_accommodation_document), then ''approved'' or ''rejected'' (manager_verify_accommodation_document).';

-- ---------------------------------------------------------------------------
-- 4. VERIFY A DOCUMENT

create or replace function public.manager_verify_accommodation_document(
  p_document uuid,
  p_verified boolean,
  p_note     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc public.accommodation_documents%rowtype;
  v_req public.accommodation_requests%rowtype;
begin
  select * into v_doc from public.accommodation_documents where id = p_document for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_req from public.accommodation_requests where id = v_doc.request_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not (public.manages_building(v_req.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- A manager cannot READ a draft, so a manager cannot rule on one either.
  if v_req.status = 'draft' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- A verdict is Verify or Reject. `null` is neither, and `set verified = null`
  -- would violate the column's NOT NULL two statements later with a 23502 out
  -- of a function whose whole contract is not to raise.
  if p_verified is null then
    return jsonb_build_object('ok', false, 'error', 'verdict_required');
  end if;

  update public.accommodation_documents
     set verified    = p_verified,
         status      = case when p_verified then 'approved'::public.doc_status
                            else 'rejected'::public.doc_status end,
         verified_by = auth.uid(),
         verified_at = now(),
         review_note = public.text_present(p_note)
   where id = p_document;

  -- No token is minted: `accommodation_documents` has no freeze trigger. What
  -- makes this the only writer is the ABSENCE of any UPDATE policy on that
  -- table (20260827000002), so a client session cannot update it at all.
  --
  -- p_note IS STORED, in `review_note` (added at the head of this migration).
  -- The plan's signature takes a note and its prose does not say where it goes;
  -- accepting a manager's typed reason and then discarding it is the silent
  -- no-op this project keeps finding, so it gets a column. It is deliberately
  -- RESIDENT-READABLE — accomdoc_select admits the owning resident — because a
  -- rejected letter the resident cannot learn the reason for is a dead end they
  -- can only escape by guessing. That is written into the confidentiality
  -- contract rather than left implicit.

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'accommodation.document_verified', 'accommodation_document', p_document, v_req.building_id,
          -- No `kind` here. `esa_letter` contains the word "letter", and the
          -- audit trail is not where the nature of a disability request goes.
          jsonb_build_object('request_id', v_doc.request_id, 'verified', p_verified));

  return jsonb_build_object('ok', true, 'verified', p_verified);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RECORD AN UPLOADED DOCUMENT
--
-- 20260827000004 leaves `accommodation-docs` with no client INSERT policy, so
-- the object can only arrive through a URL the server minted; 20260827000002
-- leaves the resident an INSERT on this table. The row and the object have to
-- agree, and this is where that is checked: the path is validated against a
-- positive grammar pinning EVERY segment, and segment 1 must be the request's
-- own building_id — the same grammar the storage read policy states, so a row
-- this function accepts is a row whose object is readable.
--
-- Folded into this migration rather than given its own, as the plan permits.

create or replace function public.record_accommodation_document(
  p_request uuid,
  p_kind    public.doc_kind,
  p_path    text,
  p_label   text default null,
  p_mime    text default null,
  p_size    integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req      public.accommodation_requests%rowtype;
  v_expected text;
  v_replaced text;
  v_id       uuid;
begin
  select * into v_req from public.accommodation_requests where id = p_request for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_req.resident_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_req.status not in ('draft', 'pending', 'info_requested') then
    return jsonb_build_object('ok', false, 'error', 'request_closed');
  end if;

  -- A POSITIVE GRAMMAR, not a rejection of '..'. Phase 1 measured that `.` is a
  -- literal inside [A-Za-z0-9._-], so '..' is a valid segment under that class
  -- and a three-segment pattern built from it still admits {building}/../evil.
  -- What closes it is pinning both leading segments to shapes that CANNOT be
  -- '..' — two uuids — and requiring the filename to begin alphanumeric.
  v_expected := '^' || v_req.building_id::text || '/' || v_req.id::text
             || '/[A-Za-z0-9][A-Za-z0-9._-]*$';
  if coalesce(p_path, '') !~ v_expected then
    return jsonb_build_object('ok', false, 'error', 'bad_path');
  end if;

  -- One letter of each kind per request; re-uploading REPLACES. The superseded
  -- path is returned so the caller can delete the object it no longer points
  -- at — a client holds no DELETE on the bucket, so /api/accommodations/docs
  -- does that with the service role, and the daily sweep is the backstop.
  select storage_path into v_replaced
    from public.accommodation_documents
   where request_id = p_request and kind = p_kind;

  insert into public.accommodation_documents
    (request_id, kind, storage_path, label, mime_type, size_bytes, uploaded_by, uploaded_at, status, verified)
  values (p_request, p_kind, p_path, public.text_present(p_label), p_mime, p_size,
          auth.uid(), now(), 'current', false)
  on conflict (request_id, kind) do update
     set storage_path = excluded.storage_path,
         label        = excluded.label,
         mime_type    = excluded.mime_type,
         size_bytes   = excluded.size_bytes,
         uploaded_by  = excluded.uploaded_by,
         uploaded_at  = now(),
         -- A replacement is a NEW document. Any verdict the old one carried is
         -- void, and a manager must look again.
         status       = 'current',
         verified     = false,
         verified_by  = null,
         verified_at  = null,
         review_note  = null,
         purged_at    = null
  returning id into v_id;

  return jsonb_build_object('ok', true, 'document_id', v_id,
                            'replaced_path', case when v_replaced is distinct from p_path then v_replaced end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. WHO MAY CALL THEM
--
-- The five SECURITY DEFINER functions bypass RLS, so the execute grant is the
-- only remaining gate. The two pure helpers are granted alongside them so a
-- client can ask what a type requires without guessing. `anon`
-- is excluded by name as well as through PUBLIC: functions are granted EXECUTE
-- to PUBLIC by default and anon INHERITS from PUBLIC, and Phase 0 measured
-- seven `revoke ... from public` statements leaving `anon=X` intact. Naming
-- both costs nothing, and the resulting proacl is asserted rather than trusted.

revoke execute on function public.text_present(text) from public, anon;
grant  execute on function public.text_present(text) to authenticated, service_role;

revoke execute on function public.accommodation_required_kinds(public.accommodation_type) from public, anon;
grant  execute on function public.accommodation_required_kinds(public.accommodation_type) to authenticated, service_role;

revoke execute on function public.submit_accommodation_request(uuid) from public, anon;
grant  execute on function public.submit_accommodation_request(uuid) to authenticated, service_role;

revoke execute on function public.withdraw_accommodation_request(uuid, text) from public, anon;
grant  execute on function public.withdraw_accommodation_request(uuid, text) to authenticated, service_role;

revoke execute on function public.manager_decide_accommodation(uuid, public.accommodation_status, text) from public, anon;
grant  execute on function public.manager_decide_accommodation(uuid, public.accommodation_status, text) to authenticated, service_role;

revoke execute on function public.manager_verify_accommodation_document(uuid, boolean, text) from public, anon;
grant  execute on function public.manager_verify_accommodation_document(uuid, boolean, text) to authenticated, service_role;

revoke execute on function public.record_accommodation_document(uuid, public.doc_kind, text, text, text, integer) from public, anon;
grant  execute on function public.record_accommodation_document(uuid, public.doc_kind, text, text, text, integer) to authenticated, service_role;
