-- Pet10x — "a case has at most one open appeal", as a constraint rather than a
-- convention, and a deterministic pick if one ever slips past it.
--
-- WHAT WAS FOUND. `manager_resolve_dispute` locks the appeal it is about to
-- decide with
--
--     select * into v_dispute from public.violation_disputes
--      where violation_id = v_vio.id and outcome is null
--      for update;
--
-- with no ordering and no `limit`. `select ... into` in plpgsql takes the FIRST
-- row of an unordered result and discards the rest silently. Three facts had to
-- line up for that to be safe and only two did:
--
--   1. `dispute_violation` refuses with `dispute_open` when ANY open dispute
--      exists on the case, whatever stage it names. True — so nothing can
--      currently create a second one.
--   2. `violation_disputes_one_per_degree unique (violation_id, stage)` stops a
--      resident disputing the same rung twice. True — but it permits two OPEN
--      disputes at DIFFERENT stages, which is a different claim.
--   3. Something structural forbids two open disputes on one case. FALSE. The
--      index `violation_disputes_open_idx` on `(violation_id) where outcome is
--      null` is a plain index, not a unique one, so (2) is the only structural
--      statement and it is the wrong one.
--
-- So the property rested entirely on (1) — one RPC's procedural check — while
-- the table's own header argues the opposite discipline: "one CHECK makes the
-- decision atomic ... a uniqueness constraint, and three nullable columns
-- cannot express one". A backfill, a support script or a future RPC that writes
-- `violation_disputes` without repeating (1) would produce two open rows, and
-- `manager_resolve_dispute` would then decide an arbitrary one and leave the
-- other open — which, because `manager_advance_violation` refuses every stage
-- move while any dispute is open, FREEZES THE LADDER on that case with no
-- surface reporting why. Measured today: 0 cases with more than one open
-- dispute, so this is a latent gap, not live corruption.
--
-- THE FIX, IN TWO LAYERS.
--
-- 1. Structural. The plain index becomes a UNIQUE partial index, so "at most
--    one open appeal per case" is enforced by the database instead of promised
--    by one function. It costs nothing — the partial index already existed and
--    already had exactly the right predicate; it was simply not declared
--    unique. It also keeps serving the same queries.
--
-- 2. Deterministic anyway. `manager_resolve_dispute` gains `order by filed_at,
--    id` and `limit 1`. With the index above this can now only ever match one
--    row, so the ordering is unreachable in practice — which is the point: if
--    the constraint is ever dropped, relaxed, or bypassed by a superuser
--    backfill, the function decides the OLDEST appeal first (the one the
--    resident has waited longest for) rather than an arbitrary one, and a
--    second call decides the next. The ladder unfreezes after N decisions
--    instead of never.
--
-- WHAT IS NOT CHANGED. The function's behaviour on every reachable input today
-- is byte-identical: one open dispute in, the same one out. This is a
-- `create or replace` of the three-argument form with no signature change, so
-- no grant, comment or overload is disturbed. The applied DDL of
-- `20260824000000` and `20260824000002` is untouched.

-- 1. The structural half.
--
-- Dropped and recreated rather than altered: an index's uniqueness cannot be
-- changed in place. Both statements name the index explicitly so a replay
-- cannot leave two.
drop index if exists public.violation_disputes_open_idx;

create unique index violation_disputes_open_idx
  on public.violation_disputes (violation_id)
  where outcome is null;

comment on index public.violation_disputes_open_idx is
  'AT MOST ONE OPEN APPEAL PER CASE, structurally. The partial predicate is also the open-dispute signal itself (`outcome is null`), so this serves the manager''s Disputed tab and the resident''s screen as well as constraining them. Unique because manager_resolve_dispute and manager_advance_violation both assume the property and only dispute_violation was checking it.';

-- 2. The deterministic half. One edit to one statement; everything else is the
-- deployed body verbatim.
create or replace function public.manager_resolve_dispute(
  p_violation uuid,
  p_outcome   public.dispute_outcome,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $resolve$
declare
  v_vio      public.violations%rowtype;
  v_dispute  public.violation_disputes%rowtype;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_fines    integer := 0;
  v_adv      jsonb;
  v_stage    public.violation_stage_v2;
  v_notified boolean := false;
begin
  select * into v_vio from public.violations where id = p_violation for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS: re-check scope by hand, after existence and
  -- before anything else is read. `manages_building` is `select exists(...)`
  -- and `is_admin` is `select coalesce(..., false)`; neither can return NULL,
  -- so this guard cannot fall into the three-valued trap that
  -- `dispute_violation`'s first version did.
  if not (public.manages_building(v_vio.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- A NULL outcome is a structured refusal, not a 23502 from the UPDATE below.
  -- This is a FIFTH error code beyond the four the plan named, and it exists
  -- because Phase 2 shipped exactly this shape on `p_to_stage` and had to fix
  -- it in a review round: a function promising "every rejection is a return
  -- value" must collapse the third value before it reaches a write.
  if p_outcome is null then
    return jsonb_build_object('ok', false, 'error', 'outcome_required');
  end if;

  if length(coalesce(v_note, '')) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'note_too_long',
                              'length', length(v_note), 'max', 2000);
  end if;

  -- The open dispute, locked. `outcome is null` IS the open-dispute signal —
  -- the fine's status is never consulted.
  --
  -- ORDERED AND LIMITED. `violation_disputes_open_idx` is unique as of this
  -- migration, so this can match at most one row and the ordering is
  -- unreachable. It is written anyway because `select ... into` takes the first
  -- row of an UNORDERED result and discards the rest without a word: if the
  -- constraint is ever relaxed or bypassed, this decides the OLDEST appeal —
  -- the one the resident has waited longest for — rather than an arbitrary one,
  -- and a second call decides the next. `id` breaks a tie on identical
  -- `filed_at`, because "deterministic" has to mean deterministic.
  select * into v_dispute
    from public.violation_disputes
   where violation_id = v_vio.id and outcome is null
   order by filed_at, id
   limit 1
   for update;
  if not found then
    -- Covers both "never disputed" and "already decided". They are the same
    -- fact from this function's point of view: there is nothing awaiting a
    -- decision, and a manager who presses Uphold twice should be told that
    -- rather than shown a second decision overwriting the first.
    return jsonb_build_object('ok', false, 'error', 'no_open_dispute');
  end if;

  -- 1. Stamp the dispute. FIRST — see the header.
  update public.violation_disputes
     set outcome      = p_outcome,
         decided_by   = auth.uid(),
         decided_at   = now(),
         decided_note = v_note
   where id = v_dispute.id;

  -- 2. The money. Filtered on `status = 'disputed'`, which is the exact inverse
  -- of `dispute_violation`'s `status = 'issued'` filter — so the round trip is
  -- lossless: a fine that was `partially_paid` when the appeal was filed was
  -- never marked disputed and is not touched now either.
  if p_outcome = 'upheld' then
    update public.fines set status = 'issued'
     where violation_id = v_vio.id and status = 'disputed';
  else
    update public.fines set status = 'waived'
     where violation_id = v_vio.id and status = 'disputed';
  end if;
  get diagnostics v_fines = row_count;

  -- 3. The stage and the ledger.
  if p_outcome = 'upheld' then
    -- The case does not move. One self-transition row, the same shape the
    -- filing wrote.
    v_stage := v_vio.stage;
    insert into public.violation_events (violation_id, from_stage, to_stage,
                                         note, actor_id, occurred_on)
    values (v_vio.id, v_vio.stage, v_vio.stage,
            'Dispute upheld: ' || coalesce(v_note, 'no reason given'),
            auth.uid(), current_date);
  else
    -- DO NOT REIMPLEMENT ANY OF THIS. `manager_advance_violation` writes the
    -- `X -> dismissed` event, sets resolved_at and resolution_outcome, mints
    -- the stage-guard token the trigger requires, and writes its own audit row.
    -- `auth.uid()` is unchanged across a nested definer call, so its scope
    -- check passes for the same caller that passed ours.
    v_adv := public.manager_advance_violation(
               p_violation    => p_violation,
               p_to_stage     => 'dismissed',
               p_note         => 'Dispute overturned: '
                                 || coalesce(v_note, 'no reason given'),
               p_amount_cents => null,
               p_due_on       => null,
               p_notify       => false);
    if not coalesce((v_adv ->> 'ok')::boolean, false) then
      raise exception
        'manager_resolve_dispute: dismissal refused after the dispute was stamped'
        using errcode = 'internal_error',
              detail  = v_adv::text,
              hint    = 'This is an assertion, not a user error: a disputable stage is non-terminal by construction and dismissed is legal from all four non-terminal rungs. The whole transaction has rolled back, so the dispute is NOT decided.';
    end if;
    v_stage := 'dismissed';
  end if;

  -- 4. Tell the resident. EXACTLY ONE, in both branches — which is what
  -- `p_notify => false` above buys. A case with no resident notifies nobody,
  -- which is a valid state rather than an error; the backfilled legacy dispute
  -- is the only row that could be in it, and it has a resident.
  if v_vio.resident_id is not null then
    insert into public.notifications (profile_id, kind, severity, title, body,
                                      action_label, action_target, building_id)
    values (
      v_vio.resident_id,
      'building',
      case when p_outcome = 'upheld' then 'warning' else 'success' end,
      case when p_outcome = 'upheld' then 'Your appeal was not successful'
           else 'Your appeal succeeded' end,
      case when p_outcome = 'upheld' then
        'The strata reviewed your appeal and the finding stands.'
        || case when v_fines > 0 then ' The fine remains payable.' else '' end
      else
        'The strata reviewed your appeal and the case has been dismissed.'
        || case when v_fines > 0 then ' The fine has been waived.' else '' end
      end
      -- The manager's note is included because it is the REASON, and a
      -- decision delivered without one is not a decision a resident can act on.
      -- It is the manager's own words, written knowing the resident reads them.
      || coalesce(' ' || v_note, ''),
      'View the case',
      'my-cases:' || v_vio.id::text,
      v_vio.building_id
    );
    v_notified := true;
  end if;

  -- 5. The audit row. ONE from this function. The transaction as a whole writes
  -- more, and the count is worth stating because a reviewer will check it:
  --   upheld,     one fine   -> 2  (this, + fine.status_changed disputed->issued)
  --   overturned, one fine   -> 3  (this, + violation.advanced, + fine.status_changed
  --                                 disputed->waived)
  -- The second and third come from `manager_advance_violation` and from Phase
  -- 3's `trg_fines_settlement_event` (20260828000000). This phase's plan
  -- originally said 1 and 2; it predates that trigger.
  insert into public.audit_log (actor_id, action, entity_type, entity_id,
                                building_id, metadata)
  values (auth.uid(), 'manager_resolve_dispute', 'violation', v_vio.id,
          v_vio.building_id,
          jsonb_build_object('dispute_id', v_dispute.id,
                             'outcome', p_outcome::text,
                             'disputed_stage', v_dispute.stage::text,
                             'stage', v_stage::text,
                             'fines_settled', v_fines,
                             'notified', v_notified));

  return jsonb_build_object('ok', true,
                            'outcome', p_outcome::text,
                            'stage', v_stage::text,
                            case when p_outcome = 'upheld'
                                 then 'fines_restored' else 'fines_waived' end, v_fines,
                            'notified', v_notified);
end;
$resolve$;
