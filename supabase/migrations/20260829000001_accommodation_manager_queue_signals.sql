-- Pet10x — pre-merge sweep: the accommodation queue told its managers the wrong
-- two things. It named a screen that cannot show them the queue, and it stayed
-- silent at the one moment a queue item appears.
--
-- BODIES ONLY. Two `create or replace function` statements. No policy, no grant,
-- no schema change, and nothing in 20260827000003 is edited — that file is
-- applied and its DDL stands.
--
-- ---------------------------------------------------------------------------
-- ONE. `withdraw_accommodation_request` sent every manager to `accommodations`.
--
-- The button read "Open approvals" and the target routed to
-- `AccommodationRequestScreen`. That screen lists the VIEWER'S OWN requests,
-- resolved from an approved resident link — so a manager who is not also a
-- resident of the building they manage (which is the ordinary case; it is what
-- manager@pet10x.com is) got the "Join your building first / Link my building"
-- affordance instead of a queue. `lib/navigation.ts` registers `accommodations`
-- as BOTH surfaces, so the button rendered and navigated and did nothing useful:
-- the label and the target disagreed, and nothing in the codebase could have
-- noticed, because both halves are valid strings.
--
-- The manager's accommodation queue is the Approvals screen's Accommodations
-- tab. The target for it is `approvals` — MANAGER-only in `lib/navigation.ts`,
-- and already what `request_building_link` (20260801000003) writes for exactly
-- the same audience and exactly the same reason.
--
-- Measured before writing this: production holds 16 notifications targeting
-- `approvals`, all 16 addressed to a manager, and 2 targeting `accommodations`,
-- neither addressed to a manager (both are `manager_decide_accommodation`
-- telling a RESIDENT their request was decided, where `accommodations` is the
-- right screen and stays). No withdrawal has ever fired on production, so there
-- is no wrong row to correct — only the code that would have written the next
-- one.
--
-- ---------------------------------------------------------------------------
-- TWO. `submit_accommodation_request` notified nobody at all.
--
-- It wrote the status change and one audit_log row and returned. So a manager
-- learned when a request was WITHDRAWN from their queue and never when one
-- ARRIVED — the first signal that anything had been filed was a resident asking
-- why nobody had answered. Residents can file ESA and service-animal requests
-- end to end; a queue nobody is told about is not a queue.
--
-- The original body carried a reason for the silence, and it is the part worth
-- reading twice:
--
--     "No notification. The building's managers see it in their queue, and a
--      push saying 'a resident filed a disability accommodation request' is a
--      lock-screen preview naming a resident's disability status to whoever is
--      looking at the phone."
--
-- The hazard is real. The conclusion did not survive contact with the rest of
-- the file, because `withdraw_accommodation_request` already sends every manager
-- of the building "An accommodation request was withdrawn" through that same
-- lock screen. If the exposure argument held, the withdrawal notification was
-- the violation and had to go; it was kept and shipped. One of the two had to
-- change, and the one that leaves residents unanswered is the one that had to.
--
-- WHAT IS ACTUALLY DISCLOSED, AND WHAT THE PHASE'S CONTRACT SAYS. The file
-- header states it: notifications "carry a title and a target and NEVER the
-- reason". The reason is the clinical content — `animal_desc`, `decision_note`,
-- the `esa_letter` filename, and the request's `type`, which is why not even
-- `kind` reaches `audit_log.metadata`. That contract is kept here in full: this
-- notification names no type, no animal, no note, and no resident. It says a
-- request is waiting and points at the screen that shows it.
--
-- And it discloses nothing the recipient could not already read. It fires on
-- draft -> pending, which is the exact transition that makes the row visible to
-- the building's managers under `accom_manager_read`; every addressee is a
-- manager of `v_req.building_id` and so is already entitled to open the row,
-- its type and its documents. The lock screen is a wider audience than the app,
-- which is why the wording carries nothing the app is the gate for.
--
-- THE TWO GUARDS THE WITHDRAWAL NOTIFICATION USES ARE BOTH KEPT:
--
--   * Managers of THIS building only, `is_suspended` excluded. A suspended
--     profile fails `manages_building`, so notifying one would push a queue item
--     at somebody the policies would refuse the row to.
--   * It fires only on the transition into the queue. Unlike withdrawal, there
--     is no `v_was_open` to compute: this function's only legal starting states
--     are `draft` and `info_requested`, and both END at `pending`, so every
--     successful call is an arrival. A `pending -> pending` re-submit is refused
--     as `illegal_transition` above and notifies nobody — the same double-tap
--     protection `request_building_link` spells out.
--
-- Proved on production in a rolled-back transaction, as the resident, against a
-- real draft: 0 manager notifications before, `{"ok":true,"status":"pending",
-- "managers_notified":2}` returned, 2 rows written, both to managers of that
-- building and both carrying action_target = 'approvals'. Rolled back. No real
-- person was notified.

-- ---------------------------------------------------------------------------
-- 1. SUBMIT — draft | info_requested -> pending, and now the queue is told.

create or replace function public.submit_accommodation_request(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req      public.accommodation_requests%rowtype;
  v_missing  public.doc_kind[];
  v_notified integer := 0;
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

  -- The queue is told, in the words the phase's confidentiality contract
  -- allows: a title, a target, and NEVER the reason. No type, no animal_desc,
  -- no document name, no resident named. Every addressee is a manager of this
  -- building, which is precisely the audience the row itself became readable to
  -- one statement ago. Withdrawal's two guards, both kept: this building's
  -- managers only, suspended profiles excluded.
  insert into public.notifications (profile_id, kind, severity, title, body,
                                    action_label, action_target, building_id)
  select bm.profile_id, 'building', 'info',
         'An accommodation request is waiting for review',
         'A resident has sent a request to your queue.',
         'Open approvals', 'approvals', v_req.building_id
    from public.building_managers bm
    join public.profiles p on p.id = bm.profile_id
   where bm.building_id = v_req.building_id and not p.is_suspended;
  get diagnostics v_notified = row_count;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'accommodation.submitted', 'accommodation_request', p_request, v_req.building_id,
          jsonb_build_object('from', v_req.status::text, 'to', 'pending',
                             'managers_told', v_notified,
                             'documents', (select count(*) from public.accommodation_documents d
                                            where d.request_id = p_request and d.storage_path is not null)));

  return jsonb_build_object('ok', true, 'status', 'pending', 'managers_notified', v_notified);
end;
$$;

comment on function public.submit_accommodation_request(uuid) is
  'draft | info_requested -> pending, for the owning resident only. Refuses a blank animal_desc (by `~ ''\S''`, not btrim) and any missing required doc_kind with a file actually attached. Mints and immediately clears pet10x.accom_write around its own UPDATE. Notifies every non-suspended manager of the building that a request is waiting, targeting `approvals` — the Approvals screen''s Accommodations tab, which is the manager''s queue. The notification names no type, no animal, no note and no resident: the phase contract is that a notification carries a title and a target and never the reason, because a push preview is readable on a lock screen. It discloses no more than the transition itself does — draft -> pending is what makes the row readable to those same managers under accom_manager_read.';

-- ---------------------------------------------------------------------------
-- 2. WITHDRAW — draft | pending | info_requested -> withdrawn.
--
-- Identical to 20260827000003 except for one string: action_target is
-- `approvals`, not `accommodations`. The label always said "Open approvals".

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
           'Open approvals', 'approvals', v_req.building_id
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

comment on function public.withdraw_accommodation_request(uuid, text) is
  'draft | pending | info_requested -> withdrawn, for the owning resident only. Stores an optional reason in decision_note, where the resident and their manager can both read it. Notifies every non-suspended manager of the building ONLY when the request was already in their queue (pending or info_requested) — telling them a DRAFT was withdrawn would announce a request that was never filed, through the one channel that bypasses RLS. Targets `approvals` (20260829000001): the label always read "Open approvals" and the target was `accommodations`, which routes a manager to their OWN request list and, holding no resident link, to a "Join your building first" panel.';
