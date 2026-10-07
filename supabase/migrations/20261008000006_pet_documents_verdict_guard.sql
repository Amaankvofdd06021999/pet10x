-- Pet10x — Part B review fix: an owner cannot forge a manager's approval, and
-- approving cannot hide an expired document.
--
-- 1. THE FORGERY. `pet_documents_rw` (20260601000001) lets the owner write
--    EVERY column of their pet's documents. 20261008000003 made `approved` /
--    `manager_verified` mean "a manager of this building looked at it" — and
--    an owner could simply `update pet_documents set status = 'approved',
--    provenance = 'manager_verified'` from the browser, or insert a row born
--    that way. The verdict columns are now guarded, on the same `current_user`
--    test as pets_archive_guard (20261007000002): a client role
--    (authenticated, anon) that is not is_admin() may not
--      * set status to `approved`,
--      * set or change provenance to anything but `self_reported`,
--      * set or change verified_by, verified_at or verified_by_business.
--    manager_review_pet_document and clinic publishing run as their definer,
--    so they are not client roles and are unaffected.
--
--    A downgrade is allowed — an owner may move their own document away from
--    approved — and so is replacing the file. But a CHANGED FILE OR EXPIRY on
--    a verified document is a different document from the one that was
--    verified, so the trigger resets it rather than refusing: status back to
--    what the expiry says (current / expiring / expired), verified_* cleared,
--    provenance back to self_reported. The owner's re-upload works; the stamp
--    does not travel with it.
--
--    The owner paths in lib/data/live.ts (addPetDocument inserts with a
--    status derived from the expiry and no verdict columns; deletePetDocument
--    deletes) touch none of this.
--
-- 2. THE HIDDEN EXPIRY. manager_review_pet_document approved an `expired`
--    document, overwriting the one status that said so — and approved
--    documents left the review list, so it was never seen again. Approve is
--    now refused (`expired`) when expires_on is before today. Copied verbatim
--    from 20261008000003; the only change is the block marked EXPIRED. The
--    review queues (client) also bring back approved documents whose expiry
--    is past or within 30 days.

create or replace function public.pet_documents_verdict_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'approved'
       or coalesce(new.provenance, 'self_reported') <> 'self_reported'
       or new.verified_by is not null or new.verified_at is not null
       or new.verified_by_business is not null then
      raise exception 'a document cannot be created already verified'
        using errcode = '42501',
              detail  = pg_catalog.format('Insert by %s offered status=%s provenance=%s.',
                                          auth.uid(), new.status, new.provenance),
              hint    = 'Upload the document; your building''s manager approves it.';
    end if;
    return new;
  end if;

  -- UPDATE. Upgrades of the verdict are refused outright.
  if (new.status = 'approved' and old.status is distinct from 'approved')
     or (new.provenance is distinct from old.provenance and new.provenance <> 'self_reported')
     or (new.verified_by is distinct from old.verified_by and new.verified_by is not null)
     or (new.verified_at is distinct from old.verified_at and new.verified_at is not null)
     or (new.verified_by_business is distinct from old.verified_by_business
         and new.verified_by_business is not null) then
    raise exception 'only your building''s manager can approve or verify a document'
      using errcode = '42501',
            detail  = pg_catalog.format('Document %s by %s: status %s -> %s, provenance %s -> %s.',
                                        old.id, auth.uid(), old.status, new.status,
                                        old.provenance, new.provenance);
  end if;

  -- A different file or expiry is a different document: the stamp is void.
  -- Also when the owner moves it away from approved themselves, so no row is
  -- left saying "manager verified" over a status that no longer agrees.
  if (old.status = 'approved' or old.provenance in ('manager_verified', 'clinic_confirmed'))
     and (new.storage_path is distinct from old.storage_path
          or new.expires_on is distinct from old.expires_on
          or (old.status = 'approved' and new.status is distinct from 'approved')) then
    -- Re-derived from the expiry only when the document itself changed; an
    -- owner who merely stepped it down keeps the status they chose.
    if new.storage_path is distinct from old.storage_path
       or new.expires_on is distinct from old.expires_on then
      new.status := case
                      when new.expires_on is null then 'current'
                      when new.expires_on < current_date then 'expired'
                      when new.expires_on < current_date + 30 then 'expiring'
                      else 'current'
                    end::public.doc_status;
    end if;
    new.provenance           := 'self_reported';
    new.verified_by          := null;
    new.verified_at          := null;
    new.verified_by_business := null;
  end if;

  return new;
end;
$guard$;

revoke all on function public.pet_documents_verdict_guard() from public, anon, authenticated;

comment on function public.pet_documents_verdict_guard() is
  'BEFORE INSERT OR UPDATE on pet_documents (20261008000006). A client role (authenticated/anon) that is not is_admin() may not set status approved, a provenance other than self_reported, or verified_by/verified_at/verified_by_business. Changing storage_path or expires_on on an approved or verified row resets it: status from the expiry, provenance self_reported, verified_* null. manager_review_pet_document runs as definer and is unaffected. Raises 42501.';

drop trigger if exists trg_pet_documents_verdict_guard on public.pet_documents;
create trigger trg_pet_documents_verdict_guard
  before insert or update on public.pet_documents
  for each row execute function public.pet_documents_verdict_guard();

-- ---------------------------------------------------------------------------
-- manager_review_pet_document, verbatim from 20261008000003 plus EXPIRED.
-- ---------------------------------------------------------------------------
create or replace function public.manager_review_pet_document(
  p_doc     uuid,
  p_verdict text,
  p_note    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc   public.pet_documents%rowtype;
  v_pet   public.pets%rowtype;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_label text;
begin
  select * into v_doc from public.pet_documents where id = p_doc for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- A removed pet's documents are nobody's to review.
  select * into v_pet from public.pets where id = v_doc.pet_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not (public.manages_building(v_pet.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if not coalesce(p_verdict in ('approve', 'reject'), false) then
    return jsonb_build_object('ok', false, 'error', 'verdict_required');
  end if;

  if length(v_note) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'note_too_long',
                              'length', length(v_note), 'max', 2000);
  end if;

  if (p_verdict = 'approve' and v_doc.status = 'approved')
     or (p_verdict = 'reject' and v_doc.status = 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'already_reviewed', 'status', v_doc.status);
  end if;

  v_label := coalesce(nullif(btrim(v_doc.name), ''), replace(v_doc.kind::text, '_', ' '));

  if p_verdict = 'approve' then
    if v_doc.storage_path is null then
      return jsonb_build_object('ok', false, 'error', 'no_file');
    end if;
    -- EXPIRED (20261008000006): approving would overwrite the one status that
    -- says it has lapsed, and take it off the review list. The owner renews it.
    if v_doc.expires_on is not null and v_doc.expires_on < current_date then
      return jsonb_build_object('ok', false, 'error', 'expired', 'expires_on', v_doc.expires_on);
    end if;

    update public.pet_documents
       set status      = 'approved',
           verified_by = auth.uid(),
           verified_at = now(),
           provenance  = 'manager_verified'
     where id = p_doc;
  else
    if v_note is null then
      return jsonb_build_object('ok', false, 'error', 'note_required');
    end if;

    -- verified_by/verified_at record who ruled and when, whichever way. A
    -- rejected document is not verified, so provenance is left as it was.
    update public.pet_documents
       set status      = 'rejected',
           verified_by = auth.uid(),
           verified_at = now()
     where id = p_doc;

    insert into public.notifications (profile_id, kind, severity, title, body,
                                      action_label, action_target, building_id)
    values (
      v_pet.owner_id,
      'compliance',
      'warning',
      'Document not accepted: ' || v_label,
      'Your building did not accept ' || v_pet.name || '''s ' || v_label || '. ' || v_note,
      'Open ' || v_pet.name,
      'pet-detail:' || v_pet.id::text,
      v_pet.building_id
    );
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(),
          case when p_verdict = 'approve' then 'pet_document.approved' else 'pet_document.rejected' end,
          'pet_document', p_doc, v_pet.building_id,
          jsonb_build_object('pet_id', v_pet.id, 'kind', v_doc.kind,
                             'from', v_doc.status, 'note', v_note));

  return jsonb_build_object('ok', true,
                            'status', case when p_verdict = 'approve' then 'approved' else 'rejected' end,
                            'notified', p_verdict = 'reject');
end;
$$;

comment on function public.manager_review_pet_document(uuid, text, text) is
  'Manager (of the pet''s building) or admin rules on a pet_documents row (20261008000003). approve: status approved, verified_by/at, provenance manager_verified; refused no_file without a stored file. reject: status rejected, note REQUIRED, compliance notification to the owner opening pet-detail:<pet>. Audits pet_document.approved|rejected. Returns {ok:true, status, notified} or {ok:false, error: not_found | forbidden | verdict_required | note_too_long | already_reviewed | no_file | expired | note_required}. Approve is refused (expired) when expires_on is before today (20261008000006).';

revoke all on function public.manager_review_pet_document(uuid, text, text) from public, anon;
grant execute on function public.manager_review_pet_document(uuid, text, text) to authenticated;
