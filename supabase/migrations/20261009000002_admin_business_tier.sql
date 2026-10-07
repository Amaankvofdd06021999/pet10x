-- Pet10x — Part C: an admin verifies clinics and businesses, by tier.
--
-- `businesses.tier` (registered | listed | verified, 20260901000000) gates
-- owner search, online booking, record sharing and emergency access, and until
-- now nothing could set it — while anything could: `businesses_owner_write` is
-- FOR ALL on owner_id = auth.uid(), and guard_business_verification
-- (20260722000001) watched `is_verified` only. An owner could
-- `update businesses set tier = 'verified'` from the browser and start
-- receiving other people's pet records.
--
-- 1. ONE MEANING. `is_verified` (the consumer badge, and what the service
--    directory reads) and `tier` drifted: the admin console flipped is_verified
--    alone after tiers existed, so a business could be "verified" with tier
--    registered, or the reverse. Reconciled here in favour of is_verified —
--    the column that has been guarded since 20260722000001, so it is the one
--    that records an admin's decision — and then pinned by a CHECK:
--    is_verified is true exactly when tier = 'verified'.
--
--      is_verified, tier <> verified  -> tier verified    (admin verified it)
--      not is_verified, tier verified -> tier registered  (self-set, or unverified)
--
--    Rows already at `listed` are demoted by 20261009000003: no client path
--    set it except the unguarded owner write this closes.
--
-- 2. THE GUARD now covers `tier` as well as `is_verified`, on INSERT as well
--    as UPDATE, on the `current_user` test of pets_archive_guard
--    (20261007000002): a client role (authenticated, anon) that is not
--    is_admin() may not create a business above `registered` / verified, nor
--    change either column. admin_set_business_tier runs as its definer, the
--    sign-up route as service_role; neither is a client role. The function was
--    SECURITY DEFINER, under which current_user is the owner — it is SECURITY
--    INVOKER now, or the test would pass everyone.
--
-- 3. `listed` MEANS LISTED. businesses_select (20260615212714) admitted
--    is_verified rows only, so a listed business had bookable services
--    (business_is_public) and no readable business row. The policy now admits
--    tier in (listed, verified) — a superset of what it admitted, since every
--    is_verified row is now tier verified.
--
-- 4. admin_set_business_tier(business, tier, note) — the one door. Keeps
--    is_verified in step, audits, notifies the owner (kind `system`), and on
--    `verified` approves the business's open verification requests so the
--    admin queue does not keep a request the decision has already answered.
--
-- 5. admin_review_business_verification(request, approve, note) — approve =
--    tier verified through (4); reject = status rejected with a REQUIRED note,
--    which the clinic banner shows, and a notification.
--
-- 6. bver_insert (20260901000000) let a business administrator insert a row
--    with reviewed_by / reviewed_at / note already filled — a request that
--    reads as reviewed. A request is now born unreviewed, and one business
--    has at most one open request per kind. Any duplicates already open are
--    settled first — the newest stays open, the rest become `rejected` with
--    note 'superseded' — or the unique index would fail to build.

-- ---------------------------------------------------------------------------
-- 1. Reconcile, then pin
-- ---------------------------------------------------------------------------
update public.businesses set tier = 'verified' where is_verified and tier <> 'verified';
update public.businesses set tier = 'registered' where not is_verified and tier = 'verified';

alter table public.businesses drop constraint if exists businesses_verified_tier_ck;
alter table public.businesses add constraint businesses_verified_tier_ck
  check (is_verified = (tier = 'verified'));

-- ---------------------------------------------------------------------------
-- 2. Guard
-- ---------------------------------------------------------------------------
create or replace function public.guard_business_verification()
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
    if new.tier is distinct from 'registered'::public.business_tier or new.is_verified then
      raise exception 'a business cannot be created already listed or verified'
        using errcode = '42501',
              detail  = pg_catalog.format('Insert by %s offered tier=%s is_verified=%s.',
                                          auth.uid(), new.tier, new.is_verified),
              hint    = 'Create the business; Pet10x reviews it and sets the tier.';
    end if;
    return new;
  end if;

  if new.tier is distinct from old.tier or new.is_verified is distinct from old.is_verified then
    raise exception 'Only Pet10x admins can change verification status'
      using errcode = '42501',
            detail  = pg_catalog.format('Business %s by %s: tier %s -> %s, is_verified %s -> %s.',
                                        old.id, auth.uid(), old.tier, new.tier,
                                        old.is_verified, new.is_verified),
            hint    = 'Request verification; an admin calls admin_set_business_tier.';
  end if;
  return new;
end;
$guard$;

revoke all on function public.guard_business_verification() from public, anon, authenticated;

comment on function public.guard_business_verification() is
  'BEFORE INSERT OR UPDATE on businesses (20260722000001, widened 20261009000002). A client role (authenticated/anon) that is not is_admin() may not create a business with tier <> registered or is_verified, nor change tier or is_verified. SECURITY INVOKER so current_user is the executing role; admin_set_business_tier (definer) and service_role are not client roles. Raises 42501.';

drop trigger if exists trg_business_verification_guard on public.businesses;
create trigger trg_business_verification_guard
  before insert or update on public.businesses
  for each row execute function public.guard_business_verification();

-- ---------------------------------------------------------------------------
-- 3. Listed businesses are readable
-- ---------------------------------------------------------------------------
drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses
  for select using (tier in ('listed', 'verified'));

-- ---------------------------------------------------------------------------
-- 4. admin_set_business_tier
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_business_tier(
  p_business uuid, p_tier public.business_tier, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_biz  record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_title text;
  v_body  text;
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can change a business''s tier'
      using errcode = '42501';
  end if;
  if p_tier is null then
    raise exception 'Choose a tier' using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'The note is too long (2000 characters at most)' using errcode = '22023';
  end if;

  select id, name, owner_id, tier into v_biz from public.businesses where id = p_business for update;
  if not found then
    raise exception 'That business no longer exists' using errcode = 'P0002';
  end if;

  if p_tier = 'verified' then
    -- The decision answers any open request; leaving it open would keep the
    -- business in the admin queue and the clinic banner on "requested".
    update public.business_verifications
       set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
           note = coalesce(v_note, note)
     where business_id = p_business and status in ('submitted', 'in_review', 'needs_info');
  end if;

  if v_biz.tier = p_tier then
    return;
  end if;

  update public.businesses
     set tier = p_tier, is_verified = (p_tier = 'verified')
   where id = p_business;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'business.tier_set', 'business', p_business,
          jsonb_build_object('from', v_biz.tier, 'to', p_tier, 'note', v_note));

  v_title := case p_tier
    when 'verified' then v_biz.name || ' is verified'
    when 'listed'   then v_biz.name || ' is listed'
    else v_biz.name || ' is no longer listed'
  end;
  v_body := case p_tier
    when 'verified' then 'Owners can find and book you, share their pets'' records with you, and you can send records back.'
    when 'listed'   then 'Owners can now find you in Pet10x search and book online.'
    else 'Your business is back to Registered: it is not shown in owner search.'
  end || coalesce(' ' || v_note, '');

  insert into public.notifications (profile_id, kind, severity, title, body)
  values (v_biz.owner_id, 'system',
          case when p_tier = 'registered' then 'warning' else 'info' end,
          v_title, v_body);
end;
$$;

comment on function public.admin_set_business_tier(uuid, public.business_tier, text) is
  'Admin only (20261009000002). Sets businesses.tier and keeps is_verified = (tier = verified). On verified, approves the business''s open business_verifications. When the tier changes: audit_log business.tier_set and a system notification to the owner (note appended). Raises 42501 not admin, P0002 missing business, 22023 bad input.';

revoke all on function public.admin_set_business_tier(uuid, public.business_tier, text) from public, anon;
grant execute on function public.admin_set_business_tier(uuid, public.business_tier, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. admin_review_business_verification
-- ---------------------------------------------------------------------------
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
  'Admin only (20261009000002). Approve: admin_set_business_tier(business, verified, note), which approves the request. Reject: note REQUIRED; status rejected with reviewed_by/at/note, audit business.verification_rejected, system notification to the owner. Raises 42501 not admin, P0002 missing request, 22023 already decided / note missing / note too long.';

revoke all on function public.admin_review_business_verification(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_business_verification(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. A request is born unreviewed, one open per kind
-- ---------------------------------------------------------------------------
drop policy if exists bver_insert on public.business_verifications;
create policy bver_insert on public.business_verifications for insert
  with check (public.can_admin_business(business_id)
              and status = 'submitted'
              and reviewed_by is null and reviewed_at is null and note is null);

with ranked as (
  select id, row_number() over (partition by business_id, kind
                                order by created_at desc, id desc) as rn
    from public.business_verifications
   where status in ('submitted', 'in_review', 'needs_info')
)
update public.business_verifications v
   set status = 'rejected', note = 'superseded', reviewed_at = now()
  from ranked r
 where r.id = v.id and r.rn > 1;

create unique index if not exists business_verifications_one_open
  on public.business_verifications (business_id, kind)
  where status in ('submitted', 'in_review', 'needs_info');
