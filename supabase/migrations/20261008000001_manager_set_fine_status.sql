-- Pet10x — settling a fine goes through one function, and only forwards.
--
-- THE GAP. `fines_manager_update` (20260823000004) let a manager UPDATE any
-- fine in their building to any status, so long as nothing but `status`
-- changed. `trg_fines_settle_only` stops the amount being rewritten, and
-- `trg_fines_settlement_event` (20260828000000) records every change — but
-- neither has an opinion about WHICH change. Measured from the policy alone:
-- paid -> waived, waived -> issued (re-charging money the building forgave)
-- and issued -> disputed (filing an appeal on the resident's behalf) were all
-- one `.update({ status })` away from the browser. "No transition rules" was
-- an open item no phase owned.
--
-- THE RULE, stated as the only moves that exist:
--
--   issued | partially_paid | disputed   ->   paid | waived
--
-- Everything else is `illegal_transition`. In particular:
--   * a settled fine (paid, waived, remitted, written_off) stays settled —
--     an offline payment recorded by mistake is corrected by a person with
--     database access, not by a button that can also un-waive;
--   * `disputed` is never a TARGET. Disputes have their own flow
--     (dispute_violation / manager_resolve_dispute), and a manager marking a
--     resident's fine as disputed is the manager writing the resident's appeal.
--
-- "Mark paid" records money the manager has RECEIVED offline. Pet10x takes no
-- payment here; there is no checkout and no Stripe call.
--
-- WHAT IT WRITES, in order, in one transaction:
--   1. the status, under a FOR UPDATE lock (two taps cannot both pass the
--      transition check). `trg_fines_settle_only` and
--      `trg_fines_settlement_event` still fire — a trigger is not RLS — so the
--      `fine.status_changed` audit row is written exactly as before;
--   2. a `violation_events` self-transition on the fine's case, when it has
--      one. The stage does not move; the row is there so the case's own
--      history says the money was settled, the same shape
--      manager_resolve_dispute already writes for an upheld appeal;
--   3. a notification to the resident (kind `compliance`), when there is one.
--
-- Then direct UPDATE is revoked: `fines_manager_update` is dropped, so this
-- function is the only client write path to `fines` at all. Definer RPCs that
-- already settle fines (dispute_violation, manager_resolve_dispute) are
-- unaffected — they never relied on the policy.
--
-- Every rejection is a return value, not a raise, matching
-- manager_remind_fine and manager_advance_violation.

create or replace function public.manager_set_fine_status(
  p_fine   uuid,
  p_status public.fine_status,
  p_note   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fine     public.fines%rowtype;
  v_vio      public.violations%rowtype;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_money    text;
  v_resident uuid;
  v_event    text;
begin
  select * into v_fine from public.fines where id = p_fine for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS, so the scope check is by hand and comes
  -- before anything about the fine is revealed — including whether the move
  -- would have been legal.
  if not (public.manages_building(v_fine.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if length(v_note) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'note_too_long',
                              'length', length(v_note), 'max', 2000);
  end if;

  -- Positive grammar on both ends. `coalesce(..., false)`: `null in (...)` is
  -- NULL and `if not NULL` does not branch.
  if not coalesce(v_fine.status in ('issued', 'partially_paid', 'disputed'), false)
     or not coalesce(p_status in ('paid', 'waived'), false) then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition',
                              'from', v_fine.status, 'to', p_status);
  end if;

  update public.fines set status = p_status where id = p_fine;

  v_money := to_char(v_fine.amount_cents / 100.0, 'FM999999990.00') || ' ' || upper(v_fine.currency);

  if v_fine.violation_id is not null then
    select * into v_vio from public.violations where id = v_fine.violation_id for update;
  end if;

  -- 2. The case's own history. A self-transition: the stage is unchanged.
  if v_vio.id is not null then
    v_event := case when p_status = 'paid' then 'Fine of ' || v_money || ' marked paid'
                    else 'Fine of ' || v_money || ' waived' end
               || coalesce(': ' || v_note, '');
    insert into public.violation_events (violation_id, from_stage, to_stage, note, actor_id, occurred_on)
    values (v_vio.id, v_vio.stage, v_vio.stage, v_event, auth.uid(), current_date);
  end if;

  -- 3. The resident. The fine names them; an older fine may only carry them on
  -- its case.
  v_resident := coalesce(v_fine.resident_id, v_vio.resident_id);
  if v_resident is not null then
    insert into public.notifications (profile_id, kind, severity, title, body,
                                      action_label, action_target, building_id)
    values (
      v_resident,
      'compliance',
      'info',
      case when p_status = 'paid' then 'Fine recorded as paid' else 'Fine waived' end,
      case when p_status = 'paid'
           then 'Your building recorded your ' || v_money || ' fine as paid.'
           else 'Your building waived your ' || v_money || ' fine. Nothing is owed on it.' end
      || coalesce(' ' || v_note, ''),
      case when v_vio.id is not null then 'View details' end,
      case when v_vio.id is not null then 'my-cases:' || v_vio.id::text end,
      v_fine.building_id
    );
  end if;

  return jsonb_build_object('ok', true, 'status', p_status, 'from', v_fine.status,
                            'notified', v_resident is not null);
end;
$$;

comment on function public.manager_set_fine_status(uuid, public.fine_status, text) is
  'The only client write path to fines.status (20261008000001). Manager of the fine''s building or admin. Allowed: issued|partially_paid|disputed -> paid|waived; nothing else. Writes the status (trg_fines_settlement_event audits it), a violation_events self-transition on the fine''s case when it has one, then a compliance notification to the resident when there is one. p_note (<= 2000 chars) is quoted to the resident. Returns {ok:true, status, from, notified} or {ok:false, error: not_found | forbidden | note_too_long | illegal_transition}; never raises for those.';

revoke all on function public.manager_set_fine_status(uuid, public.fine_status, text) from public, anon;
grant execute on function public.manager_set_fine_status(uuid, public.fine_status, text) to authenticated;

-- The RPC is now the only way in. With no UPDATE policy left on `fines`, a
-- client `.update()` matches zero rows; nothing else in the app issues one
-- (lib/data/portfolio.ts setFineStatus calls the function above).
drop policy if exists fines_manager_update on public.fines;
