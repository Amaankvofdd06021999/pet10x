-- Pet10x — Part C review fixes: no self-listed business stays listed, and
-- every request approval is audited.
--
-- 1. SELF-LISTED BUSINESSES. Until 20261009000002 an owner could set their own
--    businesses.tier through businesses_owner_write; the guard now stops that,
--    but a business that had already set itself `listed` stayed listed —
--    readable by everyone under the widened businesses_select, in owner search,
--    and absent from the admin's "Awaiting review" queue (which looks for
--    `registered`). No admin path ever set `listed` before
--    admin_set_business_tier, so every such row is demoted to `registered` and
--    lands back in the queue. A row an admin listed through the RPC (it has a
--    `business.tier_set` audit row to `listed`) is spared, in case this runs
--    after 20261009000002 has been in use.
--
-- 2. admin_review_business_verification audits the approval itself
--    (`business.verification_approved`). Copied verbatim from
--    20261009000002; the only change is the block marked AUDITED HERE TOO.

update public.businesses b
   set tier = 'registered'
 where b.tier = 'listed'
   and not b.is_verified
   and not exists (select 1 from public.audit_log a
                    where a.action = 'business.tier_set' and a.entity_id = b.id
                      and a.metadata->>'to' = 'listed');

create or replace function public.admin_review_business_verification(
  p_request uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req  record;
  v_biz  record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can review a verification request'
      using errcode = '42501';
  end if;
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'The note is too long (2000 characters at most)' using errcode = '22023';
  end if;

  select * into v_req from public.business_verifications where id = p_request for update;
  if not found then
    raise exception 'That request no longer exists' using errcode = 'P0002';
  end if;
  if v_req.status not in ('submitted', 'in_review', 'needs_info') then
    raise exception 'That request has already been decided' using errcode = '22023';
  end if;

  if coalesce(p_approve, false) then
    -- Approves this request (and any other open one) on the way.
    perform public.admin_set_business_tier(v_req.business_id, 'verified', v_note);
    -- AUDITED HERE TOO: admin_set_business_tier audits only a tier CHANGE, so
    -- approving a request for a business already verified left no trace.
    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'business.verification_approved', 'business', v_req.business_id,
            jsonb_build_object('request_id', p_request, 'note', v_note));
    return;
  end if;

  if v_note is null then
    raise exception 'Say why the request is not approved — the business sees this note'
      using errcode = '22023';
  end if;

  update public.business_verifications
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), note = v_note
   where id = p_request;

  select id, name, owner_id into v_biz from public.businesses where id = v_req.business_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'business.verification_rejected', 'business', v_req.business_id,
          jsonb_build_object('request_id', p_request, 'note', v_note));

  insert into public.notifications (profile_id, kind, severity, title, body)
  values (v_biz.owner_id, 'system', 'warning',
          'Verification not approved: ' || v_biz.name, v_note);
end;
$$;

comment on function public.admin_review_business_verification(uuid, boolean, text) is
  'Admin only (20261009000002, approval audited 20261009000003). Approve: admin_set_business_tier(business, verified, note), which approves the request, plus audit business.verification_approved. Reject: note REQUIRED; status rejected with reviewed_by/at/note, audit business.verification_rejected, system notification to the owner. Raises 42501 not admin, P0002 missing request, 22023 already decided / note missing / note too long.';

revoke all on function public.admin_review_business_verification(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_business_verification(uuid, boolean, text) to authenticated;
