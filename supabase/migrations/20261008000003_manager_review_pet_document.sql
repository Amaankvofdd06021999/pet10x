-- Pet10x — a building manager can approve or reject a pet's document.
--
-- `pet_documents_rw` (20260601000001) reads owner|manager|admin and writes
-- owner|admin, so a manager could SEE a licence or an insurance certificate in
-- Approvals -> Documents and do nothing with it. The policy is right to keep
-- managers off the table — an UPDATE policy would let them rewrite the name,
-- the expiry, the file — so the verdict goes through one SECURITY DEFINER
-- function that touches only the verdict columns. Modelled on
-- manager_verify_accommodation_document (20260827000003).
--
--   approve   status = 'approved', verified_by, verified_at,
--             provenance = 'manager_verified'. Refused (`no_file`) when the
--             row has no stored file: approving a document nobody uploaded
--             would put a green tick on a claim.
--   reject    status = 'rejected', and the owner is told why — the note is
--             REQUIRED (`note_required`), because a rejected licence the owner
--             cannot learn the reason for is a dead end they can only escape by
--             guessing (the same rule accommodation denials follow). The
--             notification is kind `compliance` and opens the pet.
--
-- Both write audit_log. Every rejection is a return value, not a raise.

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
  'Manager (of the pet''s building) or admin rules on a pet_documents row (20261008000003). approve: status approved, verified_by/at, provenance manager_verified; refused no_file without a stored file. reject: status rejected, note REQUIRED, compliance notification to the owner opening pet-detail:<pet>. Audits pet_document.approved|rejected. Returns {ok:true, status, notified} or {ok:false, error: not_found | forbidden | verdict_required | note_too_long | already_reviewed | no_file | note_required}.';

revoke all on function public.manager_review_pet_document(uuid, text, text) from public, anon;
grant execute on function public.manager_review_pet_document(uuid, text, text) to authenticated;
