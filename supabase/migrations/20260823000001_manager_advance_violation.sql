-- One RPC that moves a case along the ladder, and leaves a record of it.
--
-- Task 1 gave the enforcement ladder a shape: open -> warning -> fine_1 ->
-- fine_2, with resolved and dismissed terminal. Nothing enforced it, and
-- nothing wrote down that a case had moved. A manager pressed a button, a
-- plain UPDATE changed one column, and the only trace was the column's new
-- value — no from-stage, no note, no actor, no date. `violation_events` is the
-- paper trail a strata needs when a fine is challenged at a tribunal, and
-- until now nothing in the application ever inserted into it.
--
-- Three things force this to be a SECURITY DEFINER function rather than a
-- handful of client-side writes:
--
--   1. The `notifications` insert policy admits only `kind = 'assistant'` for
--      the caller's own profile. A manager physically cannot tell a resident
--      anything from the browser. Inside a definer function, RLS is bypassed
--      and the notification can be written for the resident.
--   2. Stage, event, fine, notification and audit row have to land together or
--      not at all. A fine with no event behind it is unprovable; an event with
--      no fine is a lie. One function body is one transaction.
--   3. The ladder can only be checked against the stage the case is ACTUALLY
--      in, read under a lock, in the same statement that changes it. A client
--      that read `warning` a second ago cannot know it is still `warning`.
--
-- Because it is SECURITY DEFINER it re-checks the caller's scope by hand, and
-- it returns a structured `{ok:false, error:...}` rather than raising — the
-- same convention as `escalate_incident_to_violation`, so the client can tell
-- "you may not" from "the network fell over".
--
-- What this migration deliberately does NOT do: close the direct-UPDATE hole.
-- `violations_manager_write` is still FOR ALL, so a manager can still bypass
-- this function entirely with a raw UPDATE. That is the next task's job, and
-- this function is what it will close the hole in favour of.

create or replace function public.manager_advance_violation(
  p_violation    uuid,
  p_to_stage     public.violation_stage_v2,
  p_note         text    default null,
  p_amount_cents integer default null,
  p_due_on       date    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vio      public.violations%rowtype;
  v_from     public.violation_stage_v2;
  v_rules    jsonb;
  v_bylaw    jsonb;
  v_amount   integer;
  v_currency text;
  v_fine     uuid;
  v_notified boolean := false;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_target   text;
  v_result   jsonb;
begin
  -- FOR UPDATE is the whole concurrency story. Two managers pressing "issue
  -- fine" on the same case at the same moment both read `warning`; the second
  -- one blocks here, and when the lock is released READ COMMITTED re-reads the
  -- row it has just been granted — so it sees `fine_1`, and the ladder check
  -- below rejects fine_1 -> fine_1. Without the lock the building sends two
  -- fines for one breach.
  select * into v_vio from public.violations where id = p_violation for update;
  if not found then
    -- Existence is answered before scope, so a caller who manages nothing can
    -- still tell a real violation id from a fabricated one. Kept deliberately:
    -- ids are uuids rather than guessable integers, `not_found` and `forbidden`
    -- have to stay distinguishable for the client to say anything useful, and
    -- escalate_incident_to_violation orders its two checks the same way. The
    -- leak is existence only — nothing about the case is returned.
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS, so re-check the caller's scope by hand.
  -- Nothing has been written at this point, and nothing will be: every write
  -- below this line is unreachable for a caller who does not manage the
  -- building the case belongs to.
  if not (public.manages_building(v_vio.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_from := v_vio.stage;

  -- The ladder, written out rather than derived.
  --
  -- The enum's sort order does happen to run open < warning < fine_1 < fine_2,
  -- so escalation alone could have been expressed as `p_to_stage > v_from`.
  -- That is not the rule, though: `resolved` and `dismissed` are reachable
  -- from every rung and from each other's left, and nothing at all is
  -- reachable FROM them. An ordinal test would quietly permit
  -- resolved -> dismissed and forbid nothing that matters. The table is the
  -- specification, so the table is what is written.
  --
  -- Note that a stage cannot move to itself: re-pressing "issue fine" on a
  -- case already at fine_1 is an illegal transition, not a silent no-op, so
  -- the manager finds out that the case had already moved.
  --
  -- The coalesce is load-bearing, not decoration. `x in (...)` is NULL, not
  -- false, when x is NULL, so a null p_to_stage made `if not (...)` a NULL
  -- condition — the branch was not taken, the guard was skipped, and control
  -- fell through into the writes to be stopped only by the NOT NULL on
  -- violations.stage. That rolled back cleanly but raised 23502 at the client
  -- instead of returning something it could branch on, which contradicts this
  -- function's whole no-raise contract. Three-valued logic has to be collapsed
  -- to two before a boolean guard is trusted.
  if not coalesce(
    case v_from
      when 'open'    then p_to_stage in ('warning', 'resolved', 'dismissed')
      when 'warning' then p_to_stage in ('fine_1', 'resolved', 'dismissed')
      when 'fine_1'  then p_to_stage in ('fine_2', 'resolved', 'dismissed')
      when 'fine_2'  then p_to_stage in ('resolved', 'dismissed')
      -- resolved and dismissed are terminal. Reopening is a new violation,
      -- because a closed case that reopens under the same id destroys the
      -- meaning of its own history.
      else false
    end,
    false
  ) then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition',
                              'from', v_from::text, 'to', p_to_stage::text);
  end if;

  -- The fine amount is settled BEFORE the first write, so that a case with no
  -- amount available does not advance a stage and then fail to fine.
  --
  -- AD-5: the schedule lives in `buildings.pet_rules`, keys `fine_1_cents`,
  -- `fine_2_cents`, `fine_currency`. That column is already jsonb holding rule
  -- toggles, so a schedule needs no DDL — this function and a later bylaw
  -- editor simply agree on the key names.
  if p_to_stage in ('fine_1', 'fine_2') then
    select b.pet_rules into v_rules
      from public.buildings b where b.id = v_vio.building_id;

    v_bylaw := v_rules -> (p_to_stage::text || '_cents');

    if p_amount_cents is not null then
      -- An explicit override wins, including an explicit bad one: a caller who
      -- passes 0 is refused rather than silently charged the bylaw amount.
      v_amount := p_amount_cents;
    elsif jsonb_typeof(v_bylaw) = 'number' then
      -- Positive grammar: accept the one shape a schedule is allowed to take.
      -- A string, a bool or a nested object is not an amount, and casting one
      -- would raise out of a function whose whole contract is not to raise.
      v_amount := floor((v_bylaw #>> '{}')::numeric)::integer;
    end if;

    if coalesce(v_amount, 0) <= 0 then
      -- Refusing beats inserting a zero-dollar fine. A 0 row looks like a
      -- decision somebody made; a refusal tells the manager the building has
      -- no fine schedule yet, which is the actual problem.
      return jsonb_build_object('ok', false, 'error', 'no_fine_amount');
    end if;

    -- `fines.currency` defaults to 'cad' and all four existing rows are
    -- lowercase, so the bylaw's 'CAD' is folded to match rather than starting
    -- a second spelling in the same column.
    v_currency := lower(coalesce(nullif(btrim(v_rules ->> 'fine_currency'), ''), 'CAD'));
  end if;

  -- 1. The stage itself.
  --
  -- resolved_at is set alongside a terminal stage because the app reads it as
  -- the open/closed flag, not the stage column: `lib/data/manager.ts` and
  -- `lib/data/manager-queues.ts` both count active cases with
  -- `.is("resolved_at", null)`. A resolved case with a null resolved_at would
  -- stay in the manager's open-case count forever. Dismissal closes a case
  -- just as finally as resolution, so it stamps the same field.
  --
  -- FOR THE CLIENT: on a terminal step, p_note does double duty — it is the
  -- event's note AND the case's resolution_outcome, which the manager's
  -- resolved-cases queue renders as a short outcome label
  -- (lib/data/manager-queues.ts:459). This is what `resolveViolation` already
  -- does with its `outcome` argument. So pass a label, not a paragraph; with
  -- no note at all the stage name is used.
  update public.violations
     set stage       = p_to_stage,
         resolved_at = case when p_to_stage in ('resolved', 'dismissed')
                            then now() else resolved_at end,
         resolution_outcome = case when p_to_stage in ('resolved', 'dismissed')
                                   then coalesce(v_note, initcap(p_to_stage::text))
                                   else resolution_outcome end
   where id = p_violation;

  -- 2. The paper trail. This is the row the whole phase exists to produce:
  -- where the case came from, where it went, who moved it, what they said.
  insert into public.violation_events (violation_id, from_stage, to_stage, note, actor_id)
  values (p_violation, v_from, p_to_stage, v_note, auth.uid());

  -- 3. The fine, when this step enters a fine degree.
  --
  -- resident_id and unit_id are copied from the violation, which may leave
  -- them null on an unassigned case. That is honest: the fine is against the
  -- unit's case, and naming a resident who has not been identified would be
  -- worse than naming nobody.
  if p_to_stage in ('fine_1', 'fine_2') then
    insert into public.fines (violation_id, building_id, unit_id, resident_id,
                              amount_cents, currency, status, issued_by, due_on)
    values (p_violation, v_vio.building_id, v_vio.unit_id, v_vio.resident_id,
            v_amount, v_currency, 'issued', auth.uid(), p_due_on)
    returning id into v_fine;
  end if;

  -- 4. Tell the resident — when there is one.
  --
  -- A violation escalated from a report that identified no pet has no subject
  -- yet — resident_id stays null until a manager assigns one, which is what
  -- the `open` stage is for. One of the thirteen live violations is in that
  -- state today. Such a case must still be able to move; it simply notifies
  -- nobody, and says so in the return, so the client can tell the manager
  -- "advanced, but nobody was notified" instead of implying a letter went out.
  --
  -- action_target: the resident app has no violation screen, and the alerts
  -- screen's own targets are screen keys — 'profile', 'pet-care',
  -- 'pet-detail:<uuid>'. A pet bylaw matter is shown on the pet, and the
  -- existing compliance notifications already point at 'pet-detail', so that
  -- is the target when the case names a pet. With no pet there is nothing
  -- pet-shaped to open, and 'profile' is where the resident's building
  -- relationship lives — the same fallback `request-info` uses.
  if v_vio.resident_id is not null then
    v_target := case
      when v_vio.pet_id is not null then 'pet-detail:' || v_vio.pet_id::text
      else 'profile'
    end;

    insert into public.notifications (profile_id, kind, severity, title, body,
                                      action_label, action_target, building_id)
    values (
      v_vio.resident_id,
      'building',
      case
        when p_to_stage in ('fine_1', 'fine_2') then 'error'
        when p_to_stage = 'warning'             then 'warning'
        when p_to_stage = 'resolved'            then 'success'
        else 'info'
      end,
      case p_to_stage
        when 'warning'   then 'Bylaw warning issued'
        when 'fine_1'    then 'A fine has been issued'
        when 'fine_2'    then 'A second fine has been issued'
        when 'resolved'  then 'Your bylaw case is closed'
        when 'dismissed' then 'Your bylaw case was dismissed'
      end,
      -- "your unit" is only said when the case actually names one. Two of the
      -- thirteen live violations have a resident but a null unit_id, and
      -- telling one of those residents a fine was issued "against your unit"
      -- names a thing the record does not contain.
      case
        when p_to_stage in ('fine_1', 'fine_2') then
          'A fine of ' || to_char(v_amount / 100.0, 'FM999999990.00')
          || ' ' || upper(v_currency) || ' has been issued'
          || case when v_vio.unit_id is not null then ' against your unit.' else '.' end
        when p_to_stage = 'warning' then
          'Your building has issued a warning about a pet bylaw matter.'
        when p_to_stage = 'resolved' then
          'The pet bylaw matter'
          || case when v_vio.unit_id is not null then ' involving your unit' else '' end
          || ' has been resolved.'
        else
          'The pet bylaw matter'
          || case when v_vio.unit_id is not null then ' involving your unit' else '' end
          || ' has been dismissed. No further action is required.'
      end || coalesce(' ' || v_note, ''),
      'View details',
      v_target,
      v_vio.building_id
    );
    v_notified := true;
  end if;

  -- 5. The audit row, which records the decision rather than its effects —
  -- who moved what, from where to where, and whether a resident heard about it.
  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'violation.advanced', 'violation', p_violation, v_vio.building_id,
          jsonb_build_object('from', v_from::text, 'to', p_to_stage::text,
                             'fine_id', v_fine, 'amount_cents', v_amount,
                             'resident_id', v_vio.resident_id, 'notified', v_notified));

  v_result := jsonb_build_object('ok', true, 'stage', p_to_stage::text, 'notified', v_notified);
  if v_fine is not null then
    v_result := v_result || jsonb_build_object('fine_id', v_fine, 'amount_cents', v_amount);
  end if;
  return v_result;
end;
$$;

comment on function public.manager_advance_violation(uuid, public.violation_stage_v2, text, integer, date) is
  'Moves a violation one legal step along the enforcement ladder: validates the transition, writes a violation_events row, issues a fine on entering fine_1/fine_2, notifies the resident when there is one, and audits. Returns {ok:true, stage, notified, fine_id?} or {ok:false, error: not_found | forbidden | illegal_transition | no_fine_amount} — every rejection it specifies is a return value, not a raise.';

-- The function bypasses RLS, so who may call it is the only remaining gate.
-- `anon` is excluded deliberately: every caller of this is a signed-in
-- manager, and an unauthenticated caller has no auth.uid() for the scope check
-- to test in the first place.
revoke execute on function public.manager_advance_violation(uuid, public.violation_stage_v2, text, integer, date) from public, anon;
grant  execute on function public.manager_advance_violation(uuid, public.violation_stage_v2, text, integer, date) to authenticated, service_role;
