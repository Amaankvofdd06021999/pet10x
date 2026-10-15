-- Pet10x — an admin can ask a clinic for more information, and the clinic can
-- answer without a new request.
--
-- THE GAP. The console could only approve or reject a verification request.
-- A request missing a licence number had to be rejected, and the clinic then
-- started again. A direct `needs_info` update by the admin worked
-- (business_verifications_status_check allows it; bver_admin is FOR ALL) but
-- told the owner nothing, and left the clinic stuck: needs_info counts as open
-- under business_verifications_one_open, there is no clinic UPDATE policy, so
-- a second insert hit 23505.
--
-- WHAT THIS DOES (no table, policy or index changes)
--
--   1. admin_request_verification_info(p_request, p_note) -> jsonb
--      Admin only (42501). The note is required, trimmed of all whitespace (regexp `\s`), 2000 characters at
--      most (22023). Allowed only from 'submitted' or 'in_review'; anything
--      else is {ok:false, error:'not_open'} (a second question on a
--      needs_info row is not a thing: the clinic has not answered yet).
--      Sets status needs_info, note, reviewed_by, reviewed_at; notifies the
--      owner the way admin_review_business_verification does for a rejection;
--      audit_log `business.verification_info_requested`.
--
--   2. business_resubmit_verification(p_request, p_licence_number,
--      p_issuing_body, p_contact_name, p_contact_phone) -> jsonb
--      The caller must can_admin_business(the request's business) (42501).
--      Only from 'needs_info' ({ok:false, error:'not_needs_info'} otherwise).
--      The details are re-checked with the grammar lib/data/verification-form.ts
--      uses (licence ^[A-Za-z0-9][A-Za-z0-9 ./-]{2,39}$; issuing body 2-80
--      characters; phone empty or ^[+0-9 ()-]{7,20}$; contact name empty or
--      at most 80 characters, trimmed of all whitespace like the note, so a
--      tab alone is no name), 22023 on anything else.
--      Updates the details, status back to submitted, clears reviewed_by,
--      reviewed_at and the note (the audit row keeps the admin's question).
--      audit_log `business.verification_resubmitted`.
--
-- Both are SECURITY DEFINER because neither role may update the row directly
-- under bver_* (the clinic has no UPDATE policy at all).

create or replace function public.admin_request_verification_info(p_request uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req  record;
  v_biz  record;
  v_note text := nullif(regexp_replace(coalesce(p_note, ''), '^\s+|\s+$', '', 'g'), '');
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can ask for more information' using errcode = '42501';
  end if;
  if v_note is null then
    raise exception 'Say what you need — the business sees this note' using errcode = '22023';
  end if;
  if length(v_note) > 2000 then
    raise exception 'The note is too long (2000 characters at most)' using errcode = '22023';
  end if;

  select * into v_req from public.business_verifications where id = p_request for update;
  if not found then
    raise exception 'That request no longer exists' using errcode = 'P0002';
  end if;
  if v_req.status not in ('submitted', 'in_review') then
    return jsonb_build_object('ok', false, 'error', 'not_open');
  end if;

  update public.business_verifications
     set status = 'needs_info', note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_request;

  select id, name, owner_id into v_biz from public.businesses where id = v_req.business_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'business.verification_info_requested', 'business', v_req.business_id,
          jsonb_build_object('request_id', p_request, 'note', v_note));

  insert into public.notifications (profile_id, kind, severity, title, body)
  values (v_biz.owner_id, 'system', 'warning',
          'Pet10x needs more information: ' || v_biz.name, v_note);

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.admin_request_verification_info(uuid, text) is
  'Admin only (20261015000003). submitted|in_review -> needs_info with a required note (<= 2000), reviewed_by/at stamped, system notification to the owner, audit business.verification_info_requested. Returns {ok:true} or {ok:false,error:not_open}. Raises 42501 not admin, 22023 note missing/too long, P0002 missing request.';

revoke all on function public.admin_request_verification_info(uuid, text) from public, anon;
grant execute on function public.admin_request_verification_info(uuid, text) to authenticated;

create or replace function public.business_resubmit_verification(
  p_request uuid,
  p_licence_number text,
  p_issuing_body text,
  p_contact_name text,
  p_contact_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req     record;
  v_licence text := btrim(coalesce(p_licence_number, ''));
  v_body    text := btrim(coalesce(p_issuing_body, ''));
  v_name    text := nullif(regexp_replace(coalesce(p_contact_name, ''), '^\s+|\s+$', '', 'g'), '');
  v_phone   text := nullif(btrim(coalesce(p_contact_phone, '')), '');
begin
  select * into v_req from public.business_verifications where id = p_request for update;
  if not found then
    raise exception 'That request no longer exists' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not coalesce(public.can_admin_business(v_req.business_id), false) then
    raise exception 'Only the practice''s owner or a manager can answer a verification request'
      using errcode = '42501';
  end if;
  if v_req.status <> 'needs_info' then
    return jsonb_build_object('ok', false, 'error', 'not_needs_info');
  end if;

  if v_licence !~ '^[A-Za-z0-9][A-Za-z0-9 ./-]{2,39}$' then
    raise exception 'The licence number needs 3 to 40 letters, numbers, spaces, dots, slashes or dashes'
      using errcode = '22023';
  end if;
  if length(v_body) not between 2 and 80 then
    raise exception 'The issuing body needs 2 to 80 characters' using errcode = '22023';
  end if;
  if length(v_name) > 80 then
    raise exception 'The contact name is too long (80 characters at most)' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^[+0-9 ()-]{7,20}$' then
    raise exception 'The phone number needs 7 to 20 digits, spaces, brackets, dashes or a leading +'
      using errcode = '22023';
  end if;

  update public.business_verifications
     set licence_number = v_licence, issuing_body = v_body,
         contact_name = v_name, contact_phone = v_phone,
         status = 'submitted', reviewed_by = null, reviewed_at = null, note = null
   where id = p_request;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'business.verification_resubmitted', 'business', v_req.business_id,
          jsonb_build_object('request_id', p_request, 'question', v_req.note));

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.business_resubmit_verification(uuid, text, text, text, text) is
  'Practice owner/manager (can_admin_business) only (20261015000003). needs_info -> submitted with re-validated details; reviewed_by/at and note cleared (audit business.verification_resubmitted keeps the question). Returns {ok:true} or {ok:false,error:not_needs_info}. Raises 42501 not a member, 22023 bad details, P0002 missing request.';

revoke all on function public.business_resubmit_verification(uuid, text, text, text, text) from public, anon;
grant execute on function public.business_resubmit_verification(uuid, text, text, text, text) to authenticated;
