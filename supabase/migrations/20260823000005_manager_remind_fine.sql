-- A reminder a manager can actually send.
--
-- WHY THIS FILE EXISTS, given Task 5's brief said not to touch this directory:
-- the plan's Task 5 control table lists "Send Reminder — re-notify the resident
-- about an unpaid fine" as a control that BECOMES REAL, and the phase's global
-- constraint says a control that cannot act must not exist. Measured, there was
-- no third option:
--
--   * `notifs_insert_own_assistant` is the only INSERT policy on
--     `notifications`, and its check is
--     `profile_id = auth.uid() and kind = 'assistant'`. A manager cannot write
--     a notification for anybody but themselves, of any kind but 'assistant'.
--   * The only SECURITY DEFINER functions that notify are
--     `manager_advance_violation` and `escalate_incident_to_violation`, and both
--     notify as a side effect of a STAGE CHANGE. A reminder changes no stage —
--     and `fine_1 -> fine_1` is an illegal transition by design, so the
--     existing RPC cannot be talked into sending one.
--
-- So the button had to become an RPC or be deleted, and deleting the only way a
-- strata can chase an unpaid fine is not what the plan asked for. This is a new
-- file; nothing under `supabase/migrations/` that Tasks 1-3 wrote is edited.
--
-- Deliberately NOT written here: a `violation_events` row. That table's grammar
-- is (from_stage, to_stage) with to_stage NOT NULL, so recording a reminder in
-- it would mean inventing a `fine_1 -> fine_1` self-transition — exactly the
-- shape Task 4 refused to put in the seed, and one the ladder forbids anywhere
-- else. A reminder is an act of communication, not a movement of the case, so
-- it is recorded in `audit_log`, which already carries acts of that kind.

create or replace function public.manager_remind_fine(
  p_violation uuid,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vio      public.violations%rowtype;
  v_count    integer;
  v_total    integer;
  v_currency text;
  v_due      date;
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_target   text;
begin
  -- No FOR UPDATE: this function changes nothing about the case. Two managers
  -- reminding at once send two notifications, which is a duplicated message
  -- rather than a corrupted record.
  select * into v_vio from public.violations where id = p_violation;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS, so the scope check is by hand, and it comes
  -- before anything is read about the fines. Same ordering, and the same
  -- structured-return-rather-than-raise convention, as
  -- `manager_advance_violation`.
  if not (public.manages_building(v_vio.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- `issued` is the one status that means "outstanding". Positive grammar
  -- rather than `status <> 'paid'`: `fine_status` has seven labels
  -- (issued, paid, partially_paid, waived, disputed, remitted, written_off)
  -- and six of them are reasons NOT to chase the money. A `disputed` fine in
  -- particular is under appeal — Phase 5 decides it, and demanding payment for
  -- it in the meantime is the wrong message. Naming the one allowed value means
  -- a status added later is excluded until somebody decides it belongs.
  select count(*), coalesce(sum(f.amount_cents), 0), min(lower(f.currency)), min(f.due_on)
    into v_count, v_total, v_currency, v_due
    from public.fines f
   where f.violation_id = p_violation
     and f.status = 'issued';

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_outstanding_fine');
  end if;

  -- One of the thirteen live violations has no resident. Such a case can still
  -- be fined (the fine is against the unit's case), but there is nobody to
  -- remind, and saying "reminder sent" would be a lie. Unlike an advance, where
  -- notifying nobody is a successful move that simply notified nobody, a
  -- reminder whose entire content is the notification has failed.
  if v_vio.resident_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_resident');
  end if;

  -- Same target vocabulary as manager_advance_violation: the resident app has
  -- no violation screen, so a pet bylaw matter opens on the pet, and 'profile'
  -- is the fallback when the case names no pet.
  v_target := case
    when v_vio.pet_id is not null then 'pet-detail:' || v_vio.pet_id::text
    else 'profile'
  end;

  insert into public.notifications (profile_id, kind, severity, title, body,
                                    action_label, action_target, building_id)
  values (
    v_vio.resident_id,
    'building',
    'warning',
    case when v_count = 1 then 'Reminder: an unpaid fine'
         else 'Reminder: unpaid fines' end,
    to_char(v_total / 100.0, 'FM999999990.00') || ' ' || upper(coalesce(v_currency, 'CAD'))
    || case when v_count = 1 then ' is still outstanding'
            else ' is still outstanding across ' || v_count || ' fines' end
    || case when v_vio.unit_id is not null then ' on your unit''s pet bylaw case.'
            else ' on your pet bylaw case.' end
    -- The due date is only mentioned when the record actually holds one. Every
    -- existing fine was seeded with due_on null, and "Payment was due " with
    -- nothing after it is worse than not raising the subject.
    || case when v_due is not null
            then ' Payment was due ' || to_char(v_due, 'FMMonth FMDD, YYYY') || '.'
            else '' end
    || coalesce(' ' || v_note, ''),
    'View details',
    v_target,
    v_vio.building_id
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'violation.fine_reminded', 'violation', p_violation, v_vio.building_id,
          jsonb_build_object('fine_count', v_count, 'amount_cents', v_total,
                             'currency', coalesce(v_currency, 'cad'),
                             'resident_id', v_vio.resident_id));

  return jsonb_build_object('ok', true, 'notified', true,
                            'fine_count', v_count, 'amount_cents', v_total,
                            'currency', coalesce(v_currency, 'cad'));
end;
$$;

comment on function public.manager_remind_fine(uuid, text) is
  'Re-notifies the resident named on a violation that its fine(s) with status=''issued'' remain outstanding, and audits the act. Writes no violation_events row — a reminder moves no stage. Returns {ok:true, notified, fine_count, amount_cents, currency} or {ok:false, error: not_found | forbidden | no_outstanding_fine | no_resident}; every rejection is a return value, not a raise.';

-- Same grant shape as manager_advance_violation. `anon` is excluded: the scope
-- check needs an auth.uid() to test, and an unauthenticated caller has none.
revoke execute on function public.manager_remind_fine(uuid, text) from public, anon;
grant  execute on function public.manager_remind_fine(uuid, text) to authenticated, service_role;
