-- Three defects the review of Task 5 measured, fixed forward.
--
-- This is a NEW file. Nothing under supabase/migrations/ that has already been
-- applied is edited; 20260823000005 is superseded in place by `create or
-- replace`, which keeps the signature and therefore keeps its grants.
--
--   1. `manager_remind_fine` was an unthrottled notification cannon. Measured
--      on the live database: three calls in one statement produced THREE
--      identical notifications to the same resident. The only limit on it was
--      the manager's click rate.
--   2. It summed `amount_cents` across currencies and labelled the total with
--      `min(lower(currency))`. Measured: 25000 `cad` + 5000 `usd` produced
--      "300.00 CAD is still outstanding across 2 fines" — a resident-facing
--      money statement, in a record meant to survive a tribunal, that was
--      false in both the figure and the unit.
--   3. A violation created by the manager's composer got NO ledger row at all:
--      no `violation_events`, no `audit_log`. It was the only act on the
--      Violations screen that recorded nothing, and the evidence-package export
--      then emitted it with blank Event date / From / To / Note.

-- ---------------------------------------------------------------------------
-- 1. The throttle needs an index, because it reads the audit log on every call.
--
-- `audit_log` had exactly one index (its primary key), so the throttle's lookup
-- would be a sequential scan of a table that only ever grows. 35 rows today;
-- this is the cheapest possible moment to add it.
--
-- (entity_id, action) is the equality pair the throttle asks for, and
-- created_at desc makes "the most recent one" the first row read rather than a
-- sort over every match.
-- ---------------------------------------------------------------------------

create index if not exists audit_log_entity_action_recent_idx
  on public.audit_log (entity_id, action, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. manager_remind_fine, with a throttle and one currency at a time.
-- ---------------------------------------------------------------------------

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
  -- How long a case is left alone after a reminder.
  --
  -- The number is a judgement, and the judgement is: a resident who has been
  -- told once today does not need telling again today, and no legitimate use of
  -- this button is blocked by waiting until tomorrow. A shorter window would
  -- not have stopped the measured abuse (three sends in one statement); a
  -- longer one starts refusing a manager who genuinely needs to chase weekly.
  c_cooldown constant interval := interval '24 hours';

  v_vio        public.violations%rowtype;
  v_count      integer;
  v_total      integer;
  v_currencies text[];
  v_currency   text;
  v_due        date;
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_target     text;
  v_last       timestamptz;
begin
  -- FOR UPDATE, and this REVERSES the decision in 20260823000005, which said
  -- "no FOR UPDATE: this function changes nothing about the case". That was
  -- true and is no longer sufficient. The throttle is a read-then-write, so
  -- without a lock two concurrent calls both read "no recent reminder" and both
  -- send — the exact defect the throttle exists to close, just narrowed to a
  -- race. Locking the case row serialises reminders per case, and because
  -- READ COMMITTED takes a fresh snapshot after the lock is granted, the second
  -- caller sees the first caller's audit row rather than the one it started
  -- with. It is the same row `manager_advance_violation` locks, so a reminder
  -- and an advance on one case also serialise, which is the correct ordering.
  select * into v_vio from public.violations where id = p_violation for update;
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

  -- `issued` is the one status that means "outstanding and chaseable".
  -- Positive grammar rather than `status <> 'paid'`: `fine_status` has seven
  -- labels (issued, paid, partially_paid, waived, disputed, remitted,
  -- written_off) and six of them are reasons NOT to chase the money. A
  -- `disputed` fine is under appeal — Phase 5 decides it, and demanding payment
  -- for it in the meantime is the wrong message. `partially_paid` is excluded
  -- because `fines` has no paid-to-date column, so this function would state
  -- the full amount as outstanding, and a resident-facing money claim it cannot
  -- make truthfully is one it does not make at all. Naming the one allowed
  -- value means a status added later is excluded until somebody decides it
  -- belongs. `lib/data/violations.ts:CHASEABLE_FINE_STATUSES` mirrors this, so
  -- the button renders on exactly the cases this function will act on.
  --
  -- Currencies are collected BEFORE anything is summed. The previous version
  -- summed `amount_cents` across every issued fine and then labelled the total
  -- with `min(lower(currency))` — so a case holding 25000 cad and 5000 usd told
  -- the resident "300.00 CAD is still outstanding". `fines.currency` has no
  -- CHECK and no default beyond 'cad', there is no FX rate anywhere in this
  -- system, and inventing one inside a notification would be worse than
  -- refusing. Not reachable on today's data (all four live fines are cad), and
  -- that is precisely why it had to be closed now rather than after somebody
  -- issues the first usd fine.
  select coalesce(array_agg(distinct lower(f.currency)), array[]::text[])
    into v_currencies
    from public.fines f
   where f.violation_id = p_violation
     and f.status = 'issued';

  if coalesce(array_length(v_currencies, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_outstanding_fine');
  end if;

  if array_length(v_currencies, 1) > 1 then
    return jsonb_build_object('ok', false, 'error', 'mixed_currency',
                              'currencies', to_jsonb(v_currencies));
  end if;

  v_currency := v_currencies[1];

  select count(*), coalesce(sum(f.amount_cents), 0), min(f.due_on)
    into v_count, v_total, v_due
    from public.fines f
   where f.violation_id = p_violation
     and f.status = 'issued'
     and lower(f.currency) = v_currency;

  -- One of the thirteen live violations has no resident. Such a case can still
  -- be fined (the fine is against the unit's case), but there is nobody to
  -- remind, and saying "reminder sent" would be a lie. Unlike an advance, where
  -- notifying nobody is a successful move that simply notified nobody, a
  -- reminder whose entire content is the notification has failed.
  if v_vio.resident_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_resident');
  end if;

  -- The throttle.
  --
  -- The record it consults is the one this function already wrote: the
  -- `violation.fine_reminded` audit row. No new table, no new column, and no
  -- possibility of the throttle and the record disagreeing about whether a
  -- reminder happened — a reminder that was sent has an audit row by
  -- construction, because the two are inserted in the same transaction.
  --
  -- It is keyed on the CASE, not on the caller. Two co-managers reminding the
  -- same resident an hour apart is exactly as much noise to that resident as
  -- one manager doing it twice, and the resident is who the limit protects.
  --
  -- It is checked last, after every other rejection, so that a manager who
  -- cannot send for a real reason (wrong building, no fine, no resident) is
  -- told the real reason rather than being told to wait for something that
  -- would fail anyway.
  select max(a.created_at)
    into v_last
    from public.audit_log a
   where a.entity_id = p_violation
     and a.action = 'violation.fine_reminded';

  if v_last is not null and v_last > now() - c_cooldown then
    return jsonb_build_object(
      'ok', false, 'error', 'reminded_recently',
      'last_reminded_at', v_last,
      'retry_after_seconds', ceil(extract(epoch from (v_last + c_cooldown - now())))::int);
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
    to_char(v_total / 100.0, 'FM999999990.00') || ' ' || upper(v_currency)
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
                             'currency', v_currency,
                             'resident_id', v_vio.resident_id));

  return jsonb_build_object('ok', true, 'notified', true,
                            'fine_count', v_count, 'amount_cents', v_total,
                            'currency', v_currency);
end;
$$;

comment on function public.manager_remind_fine(uuid, text) is
  'Re-notifies the resident named on a violation that its fine(s) with status=''issued'' remain outstanding, and audits the act. At most one reminder per case per 24 hours, enforced against the violation.fine_reminded audit rows under a FOR UPDATE lock on the case. Refuses rather than guesses when the outstanding fines are in more than one currency. Writes no violation_events row — a reminder moves no stage. Returns {ok:true, notified, fine_count, amount_cents, currency} or {ok:false, error: not_found | forbidden | no_outstanding_fine | mixed_currency | no_resident | reminded_recently}; every rejection is a return value, not a raise.';

-- Grants are unchanged by `create or replace`. Re-issued anyway so that
-- replaying this file onto a database where 20260823000005 never ran leaves the
-- same state, rather than a function `authenticated` cannot execute.
revoke execute on function public.manager_remind_fine(uuid, text) from public, anon;
grant  execute on function public.manager_remind_fine(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Every case gets a first ledger row, whoever opens it.
--
-- A TRIGGER, not an RPC, and that is the whole point of the fix.
--
-- The reported defect was that `openViolation` — the composer's plain INSERT —
-- left no record. Wrapping that one call site in a SECURITY DEFINER function
-- would have fixed the reported defect and left the same hole open next to it:
-- `escalate_incident_to_violation` also inserts a violation, and it also writes
-- no `violation_events` row. So a case escalated from an incident report was
-- equally blank in the evidence export, and nobody had noticed because Task 1's
-- backfill had given every case that existed at the time an opening row.
--
-- An AFTER INSERT trigger covers both, covers the seed, and covers whatever
-- opens a case next year without that author having to know this rule exists.
-- The `violations_manager_insert` policy already constrains WHO may open a case
-- and at which stage; this constrains what is true afterwards.
--
-- SECURITY DEFINER is required, not decorative: a trigger runs as the invoking
-- role, and 20260823000004 deliberately left `violation_events` and `audit_log`
-- with no INSERT policy for any JWT-bearing role. As definer the function runs
-- as the owner (postgres), which is the table owner, and `relforcerowsecurity`
-- is false on both tables — the same route `manager_advance_violation` already
-- takes to write the ledger.
--
-- `search_path = ''` with everything schema-qualified, matching
-- `fines_settle_only_guard`.
-- ---------------------------------------------------------------------------

create or replace function public.violations_opening_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $opening$
begin
  -- (null -> stage) is the shape Task 1's backfill used for the ten cases that
  -- existed then: from_stage null means "this is where the case started", as
  -- distinct from a move. `to_stage` is NEW.stage rather than the literal
  -- 'open' so that a row inserted at another stage by a future migration or by
  -- service_role still records where it truly began.
  insert into public.violation_events (violation_id, from_stage, to_stage, note, actor_id, occurred_on)
  values (
    new.id,
    null,
    new.stage,
    case when new.origin_incident_id is not null
         then 'Case opened from an escalated incident report'
         else 'Case opened' end,
    coalesce(new.opened_by, auth.uid()),
    -- `current_date` and not `pg_catalog.current_date`: it is an SQL keyword,
    -- not a schema-qualified function, so the prefix is a syntax error
    -- (42P01, "missing FROM-clause entry for table pg_catalog") — which is how
    -- this was caught, on the first insert probe. Being a keyword, it is
    -- unaffected by `search_path = ''` and needs no qualification.
    current_date
  );

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (
    coalesce(new.opened_by, auth.uid()),
    'violation.opened',
    'violation',
    new.id,
    new.building_id,
    pg_catalog.jsonb_build_object(
      'type', new.type,
      'stage', new.stage,
      'pet_id', new.pet_id,
      'resident_id', new.resident_id,
      'unit_id', new.unit_id,
      'origin_incident_id', new.origin_incident_id)
  );

  return null;  -- AFTER trigger; the return value is ignored.
end;
$opening$;

comment on function public.violations_opening_event() is
  'AFTER INSERT on violations: writes the case''s first violation_events row (null -> stage, the same shape as Task 1''s backfill) and a violation.opened audit_log row. SECURITY DEFINER because neither table has a client INSERT policy. Covers every path that opens a case — the manager composer''s direct insert, escalate_incident_to_violation, and seeds — so no case can exist without an opening record.';

create or replace trigger trg_violations_opening_event
  after insert on public.violations
  for each row
  execute function public.violations_opening_event();
