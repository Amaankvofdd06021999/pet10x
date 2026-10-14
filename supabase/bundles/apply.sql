-- APPLY — generated 2026-10-14 from branch ux-required-fixes by bundles/build.sh. Run dry-run.sql first.
-- One transaction: either every migration lands or none does.
begin;

-- ===== migration 20261015000001_decision_reasons.sql =====
-- Pet10x — a denied registration or a refused link says why, and the person
-- it is about is told either way.
--
-- THE GAP. Two manager decisions recorded nothing about themselves:
--
--   * manager_decide_registration(p_pet, p_approve) flipped
--     pets.registration_status and returned. No reason could be given, no
--     notification was sent, no audit row was written. An owner whose pet was
--     denied found out — if at all — by noticing a badge had changed, with no
--     way to learn what to fix.
--   * Resident links had no function at all. lib/data/live.ts decideLink() did
--     a direct UPDATE of resident_links (status, decided_at, decided_by,
--     left_at). A resident who was refused, or removed from their building,
--     was never told, and the building's audit log never heard of it.
--
-- The definition replaced below is the one read from production on
-- 2026-10-14 (pg_get_functiondef), not a migration file — local files have
-- drifted (docs/superpowers/2026-08-23-migration-drift.md).
--
-- WHAT THIS DOES
--
--   1. manager_decide_registration gains `p_note text default null`.
--      Deny REQUIRES a note (trimmed; whitespace is not a reason), at most
--      2000 characters — the same rule pet document rejections and
--      accommodation denials follow, for the same reason: a "no" the owner
--      cannot learn the reason for is a dead end. Approve takes an optional
--      note. Both outcomes now notify the owner (kind `building`, opening
--      pet-detail:<pet>) and write audit_log `pet.registration_decided`.
--      The 'forbidden' refusal keeps its words and gains errcode 42501.
--      It decides only a PENDING registration (22023 otherwise): the live
--      version would re-decide anything, so a second tap re-notified the
--      owner. Every manager queue lists pending pets only
--      (lib/data/manager-queues.ts), so a denied pet is not re-decided from
--      the app — the owner applies again, which puts it back to pending.
--      The old 2-argument overload is DROPPED, not left beside the new one:
--      two overloads would make a 2-argument call ambiguous. A client still
--      sending only (p_pet, p_approve) resolves to the new function through
--      the default — and a deny sent that way is now refused (22023).
--
--   2. manager_decide_link(p_link, p_decision, p_reason) is new, and is the
--      manager's way to decide a resident's link. The moves that exist:
--
--          approve   pending  -> approved
--          deny      pending  -> denied
--          remove    approved -> left      (left_at = now())
--
--      Anything else is 22023. Approving a resident who already holds an
--      approved link to the same building returns {ok:false,
--      error:'already_member'} instead of a raw unique-violation.
--      It stamps decided_at/decided_by, notifies the resident (opening
--      link-building), quotes the optional reason as "Reason: …", and writes
--      audit_log `resident_link.decided`.
--      Returns {ok:true, status, from} or {ok:false, error: not_found |
--      already_member}.
--
-- WHAT IT DOES NOT TOUCH
--
--   * Pets on a link change: trg_sync_pets_on_link (sync_pets_on_link_change)
--     already attaches a resident's pets on approve and detaches them on
--     deny/left from approved. This function only moves the status, so that
--     trigger keeps doing it, once.
--   * The direct UPDATE path on resident_links stays open (its RLS policies
--     are unchanged); the client simply stops using it for these decisions.
--   * request_building_link, info_requested_at, and the registration enum.

-- ---------------------------------------------------------------------------
-- 1. Registration decisions
-- ---------------------------------------------------------------------------

drop function if exists public.manager_decide_registration(uuid, boolean);

create or replace function public.manager_decide_registration(
  p_pet     uuid,
  p_approve boolean,
  p_note    text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_pet  public.pets%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  -- The live check, unchanged in meaning: the pet must exist AND the caller
  -- must manage its building (or be an admin). It comes first, so nothing
  -- about the note is evaluated for someone with no right to decide.
  if not exists (
    select 1 from public.pets p
    where p.id = p_pet and (public.manages_building(p.building_id) or public.is_admin())
  ) then
    raise exception 'forbidden: not a manager of this pet''s building'
      using errcode = '42501';
  end if;

  -- `coalesce(p_approve, false)`: a NULL decision is treated as a deny, which
  -- is what the live CASE did — and a deny needs a reason.
  if not coalesce(p_approve, false) and v_note is null then
    raise exception 'A reason is required to deny a registration.'
      using errcode = '22023',
            hint    = 'Tell the owner what to fix, so they can apply again.';
  end if;

  if length(v_note) > 2000 then
    raise exception 'The reason is too long (% characters).', length(v_note)
      using errcode = '22023',
            hint    = 'Keep it to 2000 characters or fewer.';
  end if;

  -- FOR UPDATE, then the state check: two taps (or two managers) cannot both
  -- decide, and the second gets a sentence instead of a second notification.
  select * into v_pet from public.pets where id = p_pet for update;
  if not coalesce(v_pet.registration_status = 'pending', false) then
    -- The code rides in DETAIL; the message is the sentence the manager sees.
    raise exception 'This registration has already been decided (it is %).',
                    v_pet.registration_status
      using errcode = '22023',
            detail  = 'not_pending',
            hint    = 'Only a pending registration can be approved or denied.';
  end if;

  update public.pets
     set registration_status = case when p_approve then 'approved'::public.registration_status
                                     else 'denied'::public.registration_status end
   where id = p_pet;

  insert into public.notifications (profile_id, kind, severity, title, body,
                                    action_label, action_target, building_id)
  values (
    v_pet.owner_id,
    'building',
    case when p_approve then 'success' else 'warning' end,
    case when p_approve then v_pet.name || ' is registered with your building'
         else v_pet.name || '''s registration was not approved' end,
    case when p_approve
         then 'Your building''s management approved ' || v_pet.name || '''s registration.'
              || coalesce(' Note: ' || v_note, '')
         else 'Your building''s management did not approve ' || v_pet.name || '''s registration. '
              || 'Reason: ' || v_note end,
    'Open ' || v_pet.name,
    'pet-detail:' || v_pet.id::text,
    v_pet.building_id
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'pet.registration_decided', 'pet', p_pet, v_pet.building_id,
          jsonb_build_object('from', v_pet.registration_status::text,
                             'to', case when p_approve then 'approved' else 'denied' end,
                             'owner_id', v_pet.owner_id,
                             'note', v_note));
end;
$function$;

comment on function public.manager_decide_registration(uuid, boolean, text) is
  'Manager (of the pet''s building) or admin approves or denies a pet''s registration (20261015000001). Only a pending registration (else 22023 not_pending). Deny REQUIRES p_note (trimmed, <= 2000 chars); approve takes an optional one, quoted as "Note: <note>". Notifies the owner (kind building, pet-detail:<pet>; a deny quotes "Reason: <note>") and audits pet.registration_decided. Raises 42501 forbidden, 22023 for a missing or over-long note.';

revoke all on function public.manager_decide_registration(uuid, boolean, text) from public, anon;
grant execute on function public.manager_decide_registration(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Resident link decisions
-- ---------------------------------------------------------------------------

create or replace function public.manager_decide_link(
  p_link     uuid,
  p_decision text,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link     public.resident_links%rowtype;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_to       public.resident_link_status;
  v_building text;
begin
  -- FOR UPDATE: two managers tapping at once cannot both pass the transition
  -- check below.
  select * into v_link from public.resident_links where id = p_link for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS, so the scope check is by hand, and comes
  -- before anything about the link is revealed — including whether the move
  -- would have been legal.
  if not (public.manages_building(v_link.building_id) or public.is_admin()) then
    raise exception 'forbidden: not a manager of this link''s building'
      using errcode = '42501';
  end if;

  if length(v_reason) > 2000 then
    raise exception 'The reason is too long (% characters).', length(v_reason)
      using errcode = '22023',
            hint    = 'Keep it to 2000 characters or fewer.';
  end if;

  -- The only moves that exist. Anything else — an unknown decision, a NULL
  -- one (`null = 'approve'` is NULL, so no branch matches), removing a link
  -- that was never approved, approving one twice — leaves v_to NULL.
  if p_decision = 'approve' and v_link.status = 'pending' and exists (
    select 1 from public.resident_links rl
     where rl.profile_id = v_link.profile_id and rl.building_id = v_link.building_id
       and rl.status = 'approved' and rl.id <> v_link.id
  ) then
    -- Approving would collide with resident_links_active_uniq (23505). Say
    -- what is true instead: they are already in.
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end if;

  v_to := case
    when p_decision = 'approve' and v_link.status = 'pending'  then 'approved'::public.resident_link_status
    when p_decision = 'deny'    and v_link.status = 'pending'  then 'denied'::public.resident_link_status
    when p_decision = 'remove'  and v_link.status = 'approved' then 'left'::public.resident_link_status
  end;
  if v_to is null then
    raise exception 'You can''t % a link that is %.', coalesce(left(p_decision, 40), '(no decision)'), v_link.status
      using errcode = '22023',
            hint    = 'Pending requests can be approved or denied; approved residents can be removed.';
  end if;

  -- trg_sync_pets_on_link fires on this UPDATE and moves the resident's pets.
  update public.resident_links
     set status     = v_to,
         decided_at = now(),
         decided_by = auth.uid(),
         left_at    = case when v_to = 'left' then now() else left_at end
   where id = p_link;

  select coalesce(nullif(btrim(b.name), ''), 'your building') into v_building
    from public.buildings b where b.id = v_link.building_id;
  v_building := coalesce(v_building, 'your building');

  insert into public.notifications (profile_id, kind, severity, title, body,
                                    action_label, action_target, building_id)
  values (
    v_link.profile_id,
    'building',
    case when v_to = 'approved' then 'success' else 'warning' end,
    case v_to
      when 'approved' then 'Welcome to ' || v_building
      when 'denied'   then 'Your request to join ' || v_building || ' was not approved'
      else 'You were removed from ' || v_building
    end,
    case v_to
      when 'approved' then 'Your building''s management approved your request to join ' || v_building || '.'
      when 'denied'   then 'Your building''s management did not approve your request to join ' || v_building || '.'
      else 'Your building''s management removed you from ' || v_building || '.'
    end || coalesce(' Reason: ' || v_reason, ''),
    'View building',
    'link-building',
    v_link.building_id
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'resident_link.decided', 'resident_link', p_link, v_link.building_id,
          jsonb_build_object('decision', p_decision,
                             'from', v_link.status::text,
                             'to', v_to::text,
                             'resident_id', v_link.profile_id,
                             'reason', v_reason));

  return jsonb_build_object('ok', true, 'status', v_to::text, 'from', v_link.status::text);
end;
$$;

comment on function public.manager_decide_link(uuid, text, text) is
  'Manager (of the link''s building) or admin decides a resident link (20261015000001). approve: pending -> approved; deny: pending -> denied; remove: approved -> left (left_at). Anything else raises 22023; a non-manager raises 42501. Stamps decided_at/decided_by, notifies the resident (kind building, link-building) quoting the optional p_reason (<= 2000 chars) as "Reason: …", audits resident_link.decided. trg_sync_pets_on_link moves the pets. Returns {ok:true, status, from} or {ok:false, error: not_found | already_member}.';

revoke all on function public.manager_decide_link(uuid, text, text) from public, anon;
grant execute on function public.manager_decide_link(uuid, text, text) to authenticated;


-- Record them, so the Supabase CLI / MCP know they are applied.
do $$ begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    insert into supabase_migrations.schema_migrations (version, name) values ('20261015000001', 'decision_reasons') on conflict (version) do nothing;
  end if;
end $$;
commit;
