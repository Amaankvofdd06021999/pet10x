-- APPLY — generated 2026-10-14 from branch pet10x-gaps by bundles/build.sh. Run dry-run.sql first.
-- One transaction: either every migration lands or none does.
begin;

-- ===== migration 20261007000001_owner_archive_pet.sql =====
-- Pet10x — an owner can remove a pet without damaging anyone else's records.
--
-- Removing is archiving. `pets.deleted_at` has existed since the first
-- migration and nothing in the app has ever set it; this gives it a writer and
-- a reason, and makes the reason the thing that decides where the pet is still
-- remembered:
--
--   passed_away  the owner's Profile shows it under "In memory"
--   rehomed      shown nowhere
--   mistake      shown nowhere
--
-- WHAT ARCHIVING DOES NOT TOUCH. Violations, incidents, visits, bookings,
-- accommodation requests and clinic records that name the pet keep their
-- pet_id and keep resolving its name — they are other people's records of
-- something that happened, and a pet passing away does not unhappen it. Nothing
-- is deleted; the account data export still includes archived pets.
--
-- WHAT IT DOES, in one transaction, through one SECURITY DEFINER function:
--   1. refuses (42501) unless the caller owns the pet and it is not archived
--   2. refuses (22023) a reason outside the three
--   3. stamps deleted_at and archived_reason together
--   4. revokes every open record share — and deletes unredeemed desk codes,
--      because an open desk code is a share that has not been redeemed yet:
--      clinic_redeem_desk_code checks the code, not the pet
--   5. deactivates the pet's care tasks, so the reminder cron stops
--   6. writes audit_log
--
-- The two practice-side functions that would still address an archived pet
-- are re-created below. Both are copied verbatim from their latest
-- definition (20260901000004_vet_reminders.sql) and differ only by the
-- `deleted_at` filters each ARCHIVED note describes.
--
-- RLS IS THE FLOOR, THE QUERY IS THE FILTER. `pets_select` still lets an owner
-- read their own archived pets (the In memory list needs exactly that), so
-- every read that lists CURRENT pets says `deleted_at is null` itself. Most
-- SQL readers already did; see the commit for the full call-site list.

-- ---------------------------------------------------------------------------
-- The column, and the two facts it must always agree with
-- ---------------------------------------------------------------------------
alter table public.pets add column if not exists archived_reason text;

comment on column public.pets.archived_reason is
  'Why the owner removed this pet: passed_away | rehomed | mistake. Set together with deleted_at by owner_archive_pet() and null exactly when deleted_at is null. Only passed_away is shown anywhere (the owner''s "In memory" list).';

-- No code path has ever set pets.deleted_at, so a row carrying one was set by
-- hand. It needs SOME reason before the constraint below can hold, and
-- `mistake` is the one that surfaces nowhere: guessing `passed_away` would put
-- an animal in somebody's memorial list on the strength of a migration.
update public.pets
   set archived_reason = 'mistake'
 where deleted_at is not null and archived_reason is null;

alter table public.pets drop constraint if exists pets_archived_reason_check;
alter table public.pets add constraint pets_archived_reason_check
  check (archived_reason in ('passed_away', 'rehomed', 'mistake'));

-- Both null, or both set. Without this an owner — who holds pets_owner_write —
-- could stamp deleted_at by hand with no reason, or a reason with no
-- deleted_at, and the In memory list would have to guess which one to believe.
alter table public.pets drop constraint if exists pets_archived_reason_iff_deleted;
alter table public.pets add constraint pets_archived_reason_iff_deleted
  check ((archived_reason is null) = (deleted_at is null));

-- ---------------------------------------------------------------------------
-- The one writer
-- ---------------------------------------------------------------------------
create or replace function public.owner_archive_pet(p_pet_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pet record; v_shares integer; v_codes integer; v_tasks integer;
begin
  -- `for update` so two taps on Remove cannot both pass this check.
  select p.id, p.building_id into v_pet
    from public.pets p
   where p.id = p_pet_id and p.owner_id = auth.uid() and p.deleted_at is null
     for update;
  if not found then
    raise exception 'owner_archive_pet: not your pet, or already removed'
      using errcode = '42501',
            detail  = pg_catalog.format('Pet %s, caller %s.', p_pet_id, auth.uid());
  end if;

  -- `coalesce(..., false)`: `null in (...)` is NULL, and `if not NULL` does not
  -- branch — the same three-valued hole manager_decide_accommodation closes.
  if not coalesce(p_reason in ('passed_away', 'rehomed', 'mistake'), false) then
    raise exception 'owner_archive_pet: reason must be passed_away, rehomed or mistake'
      using errcode = '22023',
            detail  = pg_catalog.format('Offered %s.', coalesce(p_reason, 'null'));
  end if;

  update public.pets
     set deleted_at = now(), archived_reason = p_reason
   where id = p_pet_id;

  update public.record_shares
     set revoked_at = now(), revoked_by = auth.uid()
   where pet_id = p_pet_id and revoked_at is null;
  get diagnostics v_shares = row_count;

  delete from public.record_desk_codes
   where pet_id = p_pet_id and redeemed_at is null;
  get diagnostics v_codes = row_count;

  update public.pet_care_tasks
     set is_active = false
   where pet_id = p_pet_id and is_active;
  get diagnostics v_tasks = row_count;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'pet.archived', 'pet', p_pet_id, v_pet.building_id,
          jsonb_build_object('reason', p_reason,
                             'shares_revoked', v_shares,
                             'desk_codes_deleted', v_codes,
                             'care_tasks_deactivated', v_tasks));
end; $$;
revoke all on function public.owner_archive_pet(uuid, text) from public, anon;
grant execute on function public.owner_archive_pet(uuid, text) to authenticated;

comment on function public.owner_archive_pet(uuid, text) is
  'Owner removes a pet (20261007000001). Refuses 42501 unless the caller owns it and it is not already archived; 22023 for a reason outside passed_away/rehomed/mistake. Sets deleted_at + archived_reason, revokes open record_shares, deletes unredeemed desk codes, deactivates pet_care_tasks, writes audit_log. Never deletes the pet: violations, incidents and clinic records that name it keep resolving.';

-- ---------------------------------------------------------------------------
-- Practice-side readers that would still address an archived pet
-- ---------------------------------------------------------------------------
-- ARCHIVED: the generator skips a patient whose linked pet the owner has
-- removed, and suppresses anything already queued for one. The practice's own
-- patient row is untouched — it is the practice's record, not the owner's to
-- withdraw — but "Rabies due" sent to someone whose dog died last week is the
-- one reminder that must not go out.
create or replace function public.clinic_generate_reminders(p_business uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n_created integer := 0; n_seen integer := 0;
begin
  if not public.staff_of_business(p_business) and not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- Vaccinations coming due.
  for r in
    select v.id as source_id, v.patient_id, cp.customer_id, v.name, v.expires_on, rr.id as rule_id, rr.channel
      from public.patient_vaccinations v
      join public.clinic_patients cp on cp.id = v.patient_id
      join public.reminder_rules rr
        on rr.business_id = p_business and rr.trigger_kind = 'vaccination_due' and rr.is_active
     where v.business_id = p_business
       and v.expires_on is not null
       and not cp.is_deceased and cp.is_active
       and not exists (select 1 from public.pets p
                        where p.id = cp.pet_id and p.deleted_at is not null)
       and v.expires_on <= current_date + rr.lead_days
       and v.expires_on >= current_date - 365
       -- the newest record for that vaccine name wins
       and v.id = (select v2.id from public.patient_vaccinations v2
                    where v2.patient_id = v.patient_id and v2.name = v.name
                    order by v2.given_on desc, v2.created_at desc limit 1)
  loop
    n_seen := n_seen + 1;
    begin
      insert into public.reminder_items
        (business_id, rule_id, customer_id, patient_id, kind, label, due_on, channel, source_kind, source_id)
      values (p_business, r.rule_id, r.customer_id, r.patient_id, 'vaccination_due',
              r.name || ' due', r.expires_on, r.channel, 'patient_vaccination', r.source_id);
      n_created := n_created + 1;
    exception when unique_violation then null;
    end;
  end loop;

  -- Follow-ups a visit asked for.
  for r in
    select vs.id as source_id, vs.patient_id, vs.customer_id, vs.next_due_on, vs.next_due_reason,
           rr.id as rule_id, rr.channel
      from public.visits vs
      join public.clinic_patients cp on cp.id = vs.patient_id
      join public.reminder_rules rr
        on rr.business_id = p_business and rr.trigger_kind = 'visit_follow_up' and rr.is_active
     where vs.business_id = p_business
       and vs.next_due_on is not null
       and not cp.is_deceased and cp.is_active
       and not exists (select 1 from public.pets p
                        where p.id = cp.pet_id and p.deleted_at is not null)
       and vs.next_due_on <= current_date + rr.lead_days
       and vs.next_due_on >= current_date - 365
  loop
    n_seen := n_seen + 1;
    begin
      insert into public.reminder_items
        (business_id, rule_id, customer_id, patient_id, kind, label, due_on, channel, source_kind, source_id)
      values (p_business, r.rule_id, r.customer_id, r.patient_id, 'visit_follow_up',
              coalesce(r.next_due_reason, 'Follow-up visit'), r.next_due_on, r.channel, 'visit', r.source_id);
      n_created := n_created + 1;
    exception when unique_violation then null;
    end;
  end loop;

  -- Suppress anything for a patient that already has a future appointment.
  update public.reminder_items ri set status = 'suppressed', note = 'already booked'
   where ri.business_id = p_business and ri.status = 'pending'
     and exists (select 1 from public.appointments a
                  where a.patient_id = ri.patient_id
                    and a.status in ('requested','booked')
                    and a.starts_at >= now());

  -- Suppress anything for a deceased or archived patient.
  update public.reminder_items ri set status = 'suppressed', note = 'patient inactive'
   where ri.business_id = p_business and ri.status in ('pending','snoozed')
     and exists (select 1 from public.clinic_patients cp
                  where cp.id = ri.patient_id and (cp.is_deceased or not cp.is_active
                        or exists (select 1 from public.pets p
                                    where p.id = cp.pet_id and p.deleted_at is not null)));

  -- Suppress where the household opted out of service reminders.
  update public.reminder_items ri set status = 'suppressed', note = 'opted out'
   where ri.business_id = p_business and ri.status in ('pending','snoozed')
     and exists (select 1 from public.clinic_customers c
                  where c.id = ri.customer_id and not c.service_reminders);

  return jsonb_build_object('ok', true, 'scanned', n_seen, 'created', n_created);
end; $$;
revoke all on function public.clinic_generate_reminders(uuid) from public, anon;
grant execute on function public.clinic_generate_reminders(uuid) to authenticated;

-- ARCHIVED: `notify` reaches an owner only about a pet they still have.
-- Removed returns not_linked, the answer it already gives an unlinked patient.
create or replace function public.clinic_reminder_action(
  p_item uuid, p_action text, p_note text default null, p_days integer default 7)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare it record; v_staff uuid; v_notif uuid; v_owner uuid; v_pet text; v_biz text;
begin
  select * into it from public.reminder_items where id = p_item for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.staff_of_business(it.business_id) and not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select id into v_staff from public.business_staff
    where business_id = it.business_id and profile_id = auth.uid() limit 1;

  if p_action = 'snooze' then
    update public.reminder_items
       set status = 'snoozed', snoozed_until = current_date + greatest(coalesce(p_days,7),1),
           note = coalesce(p_note, note), handled_by = auth.uid()
     where id = p_item;

  elsif p_action = 'done' then
    update public.reminder_items set status = 'done', note = coalesce(p_note, note),
           handled_by = auth.uid() where id = p_item;

  elsif p_action = 'booked' then
    update public.reminder_items set status = 'booked', note = coalesce(p_note, note),
           handled_by = auth.uid() where id = p_item;

  elsif p_action = 'suppress' then
    update public.reminder_items set status = 'suppressed', note = coalesce(p_note, note),
           handled_by = auth.uid() where id = p_item;

  elsif p_action = 'log_call' then
    insert into public.communication_log
      (business_id, customer_id, patient_id, channel, direction, subject, body, outcome, staff_id)
    values (it.business_id, it.customer_id, it.patient_id, 'call', 'out',
            it.label, p_note, 'reached', v_staff);
    update public.reminder_items set status = 'sent', sent_at = now(),
           note = coalesce(p_note, note), handled_by = auth.uid() where id = p_item;

  elsif p_action = 'notify' then
    -- Only reaches an owner whose pet is linked to this practice's patient.
    select p.owner_id, p.name into v_owner, v_pet
      from public.clinic_patients cp join public.pets p on p.id = cp.pet_id
     where cp.id = it.patient_id and p.deleted_at is null;
    if v_owner is null then
      return jsonb_build_object('ok', false, 'error', 'not_linked');
    end if;
    select name into v_biz from public.businesses where id = it.business_id;
    insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
    values (v_owner, 'reminder', 'info',
            coalesce(v_pet,'Your pet') || ': ' || it.label,
            coalesce(v_biz,'Your vet') || ' would like to see ' || coalesce(v_pet,'your pet') ||
            ' — due ' || to_char(it.due_on, 'DD Mon YYYY') || '.',
            'Book a visit', 'my-vets')
    returning id into v_notif;
    insert into public.communication_log
      (business_id, customer_id, patient_id, channel, direction, subject, body, outcome, staff_id)
    values (it.business_id, it.customer_id, it.patient_id, 'app', 'out', it.label, p_note, 'sent', v_staff);
    update public.reminder_items set status = 'sent', sent_at = now(), notification_id = v_notif,
           handled_by = auth.uid() where id = p_item;

  else
    return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end if;

  return jsonb_build_object('ok', true, 'action', p_action);
end; $$;
revoke all on function public.clinic_reminder_action(uuid, text, text, integer) from public, anon;
grant execute on function public.clinic_reminder_action(uuid, text, text, integer) to authenticated;


-- ===== migration 20261007000002_pet_archive_guard_and_publish.sql =====
-- Pet10x — Part A review fixes: archiving has one door, and practices cannot
-- publish onto a removed pet.
--
-- 1. pets_archive_guard. `pets_owner_write` is FOR ALL, so an owner could
--    UPDATE deleted_at / archived_reason directly — archiving without the
--    share revocation, desk-code deletion and care-task shutdown that
--    owner_archive_pet does in the same breath, or UN-archiving a pet whose
--    shares were already revoked. The constraint from 20261007000001 only
--    keeps the two columns in step; it says nothing about who moves them.
--
--    THE CHOSEN TEST: `current_user`, not a transaction-local token.
--    The guard is SECURITY INVOKER, so `current_user` is the role actually
--    executing the write. A PostgREST request runs as `authenticated` or
--    `anon` — fixed by the JWT, not choosable by the client. Inside
--    owner_archive_pet, which is SECURITY DEFINER and owned by the migration
--    role, `current_user` is that owner. So the rule is exactly:
--
--      a client role (authenticated, anon) may not change these columns,
--      unless is_admin() — pets_admin_all already lets admins correct a pet.
--      Every other role — the definer RPC, service_role, the SQL editor —
--      is already trusted with the whole table.
--
--    Why not the `pet10x.accom_write`-style token the accommodation guard
--    uses: a token is state that must be minted and spent exactly once per
--    write, and its safety rests on no exposed function being able to call
--    set_config for a client. The role test has no state to get wrong and
--    cannot be forged from PostgREST at all. WHAT IT COSTS: any future
--    SECURITY DEFINER function owned by the migration role can write these
--    columns. That is true of every column of every table already; the
--    review of that function is the control, and this note is the reminder.
--
--    INSERT is covered too: a client may not create a pet already archived
--    (which would put an animal straight into an In memory list).
--
-- 2. clinic_publish_record refuses a pet the owner has removed, with
--    `pet_archived` (lib/data/clinic/use-live.ts turns it into a sentence).
--    Copied verbatim from its latest definition (20260901000005_vet_sharing.sql);
--    the only change is the block marked ARCHIVED.

create or replace function public.pets_archive_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.deleted_at is not null or new.archived_reason is not null then
        raise exception 'a pet cannot be created already removed'
          using errcode = '42501',
                detail  = pg_catalog.format('Insert by %s offered deleted_at=%s archived_reason=%s.',
                                            auth.uid(), new.deleted_at, new.archived_reason),
                hint    = 'Create the pet, then call owner_archive_pet(pet, reason) if it should be removed.';
      end if;
    elsif new.deleted_at is distinct from old.deleted_at
       or new.archived_reason is distinct from old.archived_reason then
      raise exception 'pets.deleted_at and archived_reason change only through owner_archive_pet'
        using errcode = '42501',
              detail  = pg_catalog.format('Pet %s by %s: deleted_at %s -> %s, archived_reason %s -> %s.',
                                          old.id, auth.uid(), old.deleted_at, new.deleted_at,
                                          old.archived_reason, new.archived_reason),
              hint    = 'Call owner_archive_pet(pet, reason): it also revokes record shares, deletes open desk codes and stops care reminders. A removal is not reversed by the owner.';
    end if;
  end if;
  return new;
end;
$guard$;

-- A trigger function is attached, never called.
revoke all on function public.pets_archive_guard() from public, anon, authenticated;

comment on function public.pets_archive_guard() is
  'BEFORE INSERT OR UPDATE on pets (20261007000002). A client role (authenticated/anon) that is not is_admin() may not create a pet with deleted_at/archived_reason set, nor change either column — those move only through owner_archive_pet, which runs as its definer and so is not a client role. Tests current_user rather than a token: SECURITY INVOKER, so current_user is the executing role, which PostgREST fixes from the JWT. Raises 42501.';

drop trigger if exists trg_pets_archive_guard on public.pets;
create trigger trg_pets_archive_guard
  before insert or update on public.pets
  for each row execute function public.pets_archive_guard();

create or replace function public.clinic_publish_record(
  p_patient uuid, p_source_kind text, p_source_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare cp record; v_pub uuid; v_target uuid; v_title text; v_summary text; v_biz text;
begin
  select * into cp from public.clinic_patients where id = p_patient;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.staff_of_business(cp.business_id) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if not public.can_read_shared_records(cp.business_id) then
    return jsonb_build_object('ok', false, 'error', 'role_not_permitted');
  end if;
  if cp.pet_id is null then return jsonb_build_object('ok', false, 'error', 'not_linked'); end if;
  -- ARCHIVED: the owner removed this pet. Publishing would write a record onto
  -- it and send its owner "New record from …" about an animal they have
  -- removed — for `passed_away`, about one that has died.
  if exists (select 1 from public.pets p where p.id = cp.pet_id and p.deleted_at is not null) then
    return jsonb_build_object('ok', false, 'error', 'pet_archived');
  end if;
  if public.business_tier_of(cp.business_id) <> 'verified' then
    return jsonb_build_object('ok', false, 'error', 'not_verified');
  end if;
  select name into v_biz from public.businesses where id = cp.business_id;

  if p_source_kind = 'vaccination' then
    declare v record;
    begin
      select * into v from public.patient_vaccinations
       where id = p_source_id and business_id = cp.business_id;
      if not found then return jsonb_build_object('ok', false, 'error', 'source_not_found'); end if;

      insert into public.record_publications
        (business_id, patient_id, pet_id, source_kind, source_id, title, summary, published_by)
      values (cp.business_id, cp.id, cp.pet_id, 'vaccination', v.id,
              v.name, 'Given ' || to_char(v.given_on,'DD Mon YYYY') ||
              coalesce(', due ' || to_char(v.expires_on,'DD Mon YYYY'), ''), auth.uid())
      returning id into v_pub;

      insert into public.pet_vaccinations
        (pet_id, name, given_on, expires_on, status, kind, provenance, publication_id, verified_by_business)
      values (cp.pet_id, v.name, v.given_on, v.expires_on,
              case when v.expires_on is null then 'current'
                   when v.expires_on < current_date then 'expired'
                   when v.expires_on < current_date + 30 then 'expiring'
                   else 'current' end::public.doc_status,
              'vaccine', 'clinic_confirmed', v_pub, cp.business_id)
      returning id into v_target;

      update public.record_publications set target_kind = 'pet_vaccination', target_id = v_target
       where id = v_pub;
      v_title := v.name;
    end;

  elsif p_source_kind = 'visit_summary' then
    declare vs record;
    begin
      select * into vs from public.visits where id = p_source_id and business_id = cp.business_id;
      if not found then return jsonb_build_object('ok', false, 'error', 'source_not_found'); end if;
      insert into public.record_publications
        (business_id, patient_id, pet_id, source_kind, source_id, title, summary, published_by)
      values (cp.business_id, cp.id, cp.pet_id, 'visit_summary', vs.id,
              coalesce(vs.reason, 'Visit') || ' — ' || to_char(vs.visited_on, 'DD Mon YYYY'),
              vs.summary, auth.uid())
      returning id into v_pub;
      v_title := coalesce(vs.reason, 'Visit summary');
    end;
  else
    return jsonb_build_object('ok', false, 'error', 'unsupported_kind');
  end if;

  insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
  select p.owner_id, 'clinic', 'success',
         'New record from ' || coalesce(v_biz, 'your vet'),
         coalesce(v_biz,'Your vet') || ' added "' || v_title || '" to ' || p.name || '''s records.',
         'View records', 'my-vets'
    from public.pets p where p.id = cp.pet_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'records.published', 'record_publication', v_pub,
          jsonb_build_object('business_id', cp.business_id, 'pet_id', cp.pet_id, 'kind', p_source_kind));

  return jsonb_build_object('ok', true, 'publication_id', v_pub);
end; $$;
revoke all on function public.clinic_publish_record(uuid, text, uuid) from public, anon;
grant execute on function public.clinic_publish_record(uuid, text, uuid) to authenticated;


-- ===== migration 20261008000001_manager_set_fine_status.sql =====
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


-- ===== migration 20261008000002_manager_municipal_reports.sql =====
-- Pet10x — a building manager can see what was reported to the city about
-- their area, without learning who reported it.
--
-- `municipal_reports` (20260810000006) is city-scoped by design: it has no
-- building_id, and its select policy admits only the reporter and admins. That
-- stays exactly as it is. This adds ONE read path, a SECURITY DEFINER function
-- with a deliberately narrow shape:
--
--   * which reports — those whose `municipality_id` is the municipality the
--     building's postal code resolves to, through the same
--     `resolve_municipality` a reporter's form uses. `buildings` has no stored
--     municipality column, and the resolver only ever matches on postal
--     prefix (coordinates never guess a city), so a building without a postal
--     code, or in a city Pet10x has no row for, sees nothing — which is the
--     truth, not a gap;
--   * which columns — id, type, description, location_text, reference_code,
--     status, created_at and a COUNT of evidence files. Never reporter_id,
--     is_anonymous, ip_hash, the raw postal code or coordinates, or the
--     evidence paths themselves. A manager learns that a dangerous dog was
--     reported on their block; they do not learn by whom;
--   * who — a manager of the building, or an admin. Anyone else is refused
--     42501, the same code RLS would have given them.
--
-- Read-only. Pet10x files nothing with any city; the manager screen says so.
-- Admins change `status` through the existing `municipal_reports_admin_write`
-- policy; there is no manager write path and this adds none.

create or replace function public.manager_municipal_reports(p_building uuid)
returns table (
  id             uuid,
  type           text,
  description    text,
  location_text  text,
  reference_code text,
  status         text,
  created_at     timestamptz,
  evidence_count integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_postal       text;
  v_municipality uuid;
begin
  if not (public.manages_building(p_building) or public.is_admin()) then
    raise exception 'manager_municipal_reports: you do not manage this building'
      using errcode = '42501',
            detail  = pg_catalog.format('Building %s, caller %s.', p_building, auth.uid());
  end if;

  select b.postal_code into v_postal from public.buildings b where b.id = p_building;
  if v_postal is null then
    return;
  end if;

  v_municipality := nullif(public.resolve_municipality(v_postal) ->> 'id', '')::uuid;
  if v_municipality is null then
    return;
  end if;

  return query
    select r.id, r.type, r.description, r.location_text, r.reference_code, r.status,
           r.created_at, coalesce(cardinality(r.evidence_paths), 0)::integer
      from public.municipal_reports r
     where r.municipality_id = v_municipality
     order by r.created_at desc
     limit 200;
end;
$$;

comment on function public.manager_municipal_reports(uuid) is
  'Reports filed with Pet10x about the city a building sits in (20261008000002): municipality resolved from buildings.postal_code via resolve_municipality. Manager of the building or admin, else 42501. Returns id, type, description, location_text, reference_code, status, created_at, evidence_count — never reporter identity, anonymity flag, ip_hash, coordinates or evidence paths. Newest 200. Read-only.';

revoke all on function public.manager_municipal_reports(uuid) from public, anon;
grant execute on function public.manager_municipal_reports(uuid) to authenticated;


-- ===== migration 20261008000003_manager_review_pet_document.sql =====
-- Pet10x — a building manager can approve or reject a pet's document.
--
-- `pet_documents_rw` (20260601000001) reads owner|manager|admin and writes
-- owner|admin, so a manager could SEE a licence or an insurance certificate in
-- Approvals -> Documents and do nothing with it. The policy is right to keep
-- managers off the table — an UPDATE policy would let them rewrite the name,
-- the expiry, the file — so the verdict goes through one SECURITY DEFINER
-- function that touches only the verdict columns. Modelled on
-- manager_verify_accommodation_document (20260827000003).
--
--   approve   status = 'approved', verified_by, verified_at,
--             provenance = 'manager_verified'. Refused (`no_file`) when the
--             row has no stored file: approving a document nobody uploaded
--             would put a green tick on a claim.
--   reject    status = 'rejected', and the owner is told why — the note is
--             REQUIRED (`note_required`), because a rejected licence the owner
--             cannot learn the reason for is a dead end they can only escape by
--             guessing (the same rule accommodation denials follow). The
--             notification is kind `compliance` and opens the pet.
--
-- Both write audit_log. Every rejection is a return value, not a raise.

create or replace function public.manager_review_pet_document(
  p_doc     uuid,
  p_verdict text,
  p_note    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc   public.pet_documents%rowtype;
  v_pet   public.pets%rowtype;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_label text;
begin
  select * into v_doc from public.pet_documents where id = p_doc for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- A removed pet's documents are nobody's to review.
  select * into v_pet from public.pets where id = v_doc.pet_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not (public.manages_building(v_pet.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if not coalesce(p_verdict in ('approve', 'reject'), false) then
    return jsonb_build_object('ok', false, 'error', 'verdict_required');
  end if;

  if length(v_note) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'note_too_long',
                              'length', length(v_note), 'max', 2000);
  end if;

  if (p_verdict = 'approve' and v_doc.status = 'approved')
     or (p_verdict = 'reject' and v_doc.status = 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'already_reviewed', 'status', v_doc.status);
  end if;

  v_label := coalesce(nullif(btrim(v_doc.name), ''), replace(v_doc.kind::text, '_', ' '));

  if p_verdict = 'approve' then
    if v_doc.storage_path is null then
      return jsonb_build_object('ok', false, 'error', 'no_file');
    end if;

    update public.pet_documents
       set status      = 'approved',
           verified_by = auth.uid(),
           verified_at = now(),
           provenance  = 'manager_verified'
     where id = p_doc;
  else
    if v_note is null then
      return jsonb_build_object('ok', false, 'error', 'note_required');
    end if;

    -- verified_by/verified_at record who ruled and when, whichever way. A
    -- rejected document is not verified, so provenance is left as it was.
    update public.pet_documents
       set status      = 'rejected',
           verified_by = auth.uid(),
           verified_at = now()
     where id = p_doc;

    insert into public.notifications (profile_id, kind, severity, title, body,
                                      action_label, action_target, building_id)
    values (
      v_pet.owner_id,
      'compliance',
      'warning',
      'Document not accepted: ' || v_label,
      'Your building did not accept ' || v_pet.name || '''s ' || v_label || '. ' || v_note,
      'Open ' || v_pet.name,
      'pet-detail:' || v_pet.id::text,
      v_pet.building_id
    );
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(),
          case when p_verdict = 'approve' then 'pet_document.approved' else 'pet_document.rejected' end,
          'pet_document', p_doc, v_pet.building_id,
          jsonb_build_object('pet_id', v_pet.id, 'kind', v_doc.kind,
                             'from', v_doc.status, 'note', v_note));

  return jsonb_build_object('ok', true,
                            'status', case when p_verdict = 'approve' then 'approved' else 'rejected' end,
                            'notified', p_verdict = 'reject');
end;
$$;

comment on function public.manager_review_pet_document(uuid, text, text) is
  'Manager (of the pet''s building) or admin rules on a pet_documents row (20261008000003). approve: status approved, verified_by/at, provenance manager_verified; refused no_file without a stored file. reject: status rejected, note REQUIRED, compliance notification to the owner opening pet-detail:<pet>. Audits pet_document.approved|rejected. Returns {ok:true, status, notified} or {ok:false, error: not_found | forbidden | verdict_required | note_too_long | already_reviewed | no_file | note_required}.';

revoke all on function public.manager_review_pet_document(uuid, text, text) from public, anon;
grant execute on function public.manager_review_pet_document(uuid, text, text) to authenticated;


-- ===== migration 20261008000004_building_archive.sql =====
-- Pet10x — a building that has history is archived, not deleted.
--
-- `deleteBuilding` (lib/data/admin.ts) is a bare `.delete()`, and four foreign
-- keys into `buildings` are NO ACTION — fines, payouts, notifications,
-- business_listings — with violation_events RESTRICT behind violations. So on
-- any building anyone has used, Delete fails with raw 23503 text. That
-- refusal is correct: a fine, a notification and a payout are other people's
-- records of something that happened. What was missing was the thing an admin
-- actually wants instead — "this building is no longer on Pet10x".
--
-- `buildings.archived_at`. Set, the building:
--   * cannot be found by its code (resolve_building_code), so the guest
--     report form and the resident join form both say "invalid code";
--   * cannot be joined (request_building_link) or reported to
--     (submit_incident_report) — both answer invalid_code, as for a code
--     that never existed;
--   * is not offered by name (search_buildings_public,
--     buildings_matching_my_address) or to advertisers (targetable_buildings);
--   * cannot receive a lost/found notice (report_lost_found counts only links
--     to live buildings, so a resident of an archived building gets
--     no_building).
-- Everything already in it stays: residents, pets, cases, fines, history.
-- Restoring is clearing the column.
--
-- Each function below is copied VERBATIM from its latest definition (named
-- above it) and differs only by the `archived_at is null` filter, marked
-- `ARCHIVED (20261008000004)`. `create or replace` keeps each function's
-- existing grants, so the guest-facing ones (resolve_building_code,
-- search_buildings_public, submit_incident_report) stay callable by anon as
-- they were — that is their job.
--
-- WHO MAY ARCHIVE. `buildings_admin_all` lets an admin write the column, but
-- `buildings_manager_update` lets a MANAGER update their own building row too,
-- and a policy cannot say which column. A manager archiving (or un-archiving)
-- their own building would be a manager taking it off Pet10x. The guard
-- trigger below refuses that: only an admin — or a JWT-less service-role
-- session — may change archived_at.

alter table public.buildings add column if not exists archived_at timestamptz;

comment on column public.buildings.archived_at is
  'Set by an admin to take a building off Pet10x without deleting its history (20261008000004). An archived building cannot be resolved by code, joined, reported to, searched, targeted or posted to; everything already in it stays. Null = live. Only an admin may change it (buildings_archive_guard).';

create or replace function public.buildings_archive_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'only an admin can archive or restore a building'
      using errcode = '42501',
            detail  = pg_catalog.format('Building %s, caller %s.', old.id, auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.buildings_archive_guard() from public, anon, authenticated;

drop trigger if exists buildings_archive_guard on public.buildings;
create trigger buildings_archive_guard
  before update on public.buildings
  for each row
  when (old.archived_at is distinct from new.archived_at)
  execute function public.buildings_archive_guard();

-- ---------------------------------------------------------------------------
-- What Delete would hit. The admin console offers Delete only where every
-- count is zero, and Archive otherwise. Admin-only; zero rows for anyone else.
-- ---------------------------------------------------------------------------
create or replace function public.admin_building_history()
returns table (building_id uuid, fines bigint, notifications bigint, payouts bigint,
               business_listings bigint, violations bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.id,
         (select count(*) from public.fines f where f.building_id = b.id),
         (select count(*) from public.notifications n where n.building_id = b.id),
         (select count(*) from public.payouts p where p.building_id = b.id),
         (select count(*) from public.business_listings l where l.building_id = b.id),
         (select count(*) from public.violations v where v.building_id = b.id)
    from public.buildings b
   where public.is_admin();
$$;
revoke all on function public.admin_building_history() from public, anon;
grant execute on function public.admin_building_history() to authenticated;

comment on function public.admin_building_history() is
  'Per building, the rows that would block a delete (fines, notifications, payouts, business_listings) plus violations (whose events RESTRICT). Admin only — returns nothing to anyone else. 20261008000004.';

-- ---------------------------------------------------------------------------
-- The seven readers, verbatim plus the filter.
-- ---------------------------------------------------------------------------

-- @@resolve_building_code (20260821000000)
create or replace function public.resolve_building_code(p_code text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select case
    when b.id is null then jsonb_build_object('valid', false)
    else jsonb_build_object('valid', true, 'building_id', b.id, 'name', b.name)
  end
  from (select 1) dummy
  left join public.buildings b
    on upper(b.building_code) = upper(trim(p_code))
   -- ARCHIVED (20261008000004)
   and b.archived_at is null;
$function$;

-- @@search_buildings_public (20260814000001)
create or replace function public.search_buildings_public(q text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_q text; v_rows jsonb;
begin
  v_q := lower(btrim(coalesce(q, '')));

  -- Three characters minimum. Shorter prefixes return most of the table, which
  -- makes this a directory dump rather than a search.
  if length(v_q) < 3 then return jsonb_build_object('matches', '[]'::jsonb); end if;

  select coalesce(jsonb_agg(r order by r->>'name'), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
             'name', b.name,
             'address', b.address,
             'city', b.city,
             'region', b.region,
             'postalCode', b.postal_code
           ) as r
    from public.buildings b
    where b.archived_at is null  -- ARCHIVED (20261008000004)
      and (lower(coalesce(b.name, '')) like '%' || v_q || '%'
       or lower(coalesce(b.address, '')) like '%' || v_q || '%'
       or upper(replace(coalesce(b.postal_code, ''), ' ', '')) like upper(replace(v_q, ' ', '')) || '%')
    -- Capped hard. A wide query should come back short and unhelpful, not
    -- paginate the whole customer list.
    limit 8
  ) s;

  return jsonb_build_object('matches', v_rows);
end; $$;

-- @@buildings_matching_my_address (20260809000006)
create or replace function public.buildings_matching_my_address()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_postal text; v_street text; v_names text[];
begin
  if auth.uid() is null then return jsonb_build_object('matches', '[]'::jsonb); end if;

  select upper(replace(coalesce(postal_code,''),' ','')), lower(btrim(coalesce(street_address,'')))
    into v_postal, v_street from public.profiles where id = auth.uid();

  -- Postal code required. Street alone is far too loose and city would suggest
  -- a building to everyone in Vancouver.
  if v_postal = '' then return jsonb_build_object('matches', '[]'::jsonb); end if;

  select coalesce(array_agg(b.name order by b.name), '{}') into v_names
  from public.buildings b
  where upper(replace(coalesce(b.postal_code,''),' ','')) = v_postal
    and b.archived_at is null  -- ARCHIVED (20261008000004)
    and (v_street = '' or lower(btrim(coalesce(b.address,''))) like '%' || split_part(v_street,' ',1) || '%');

  return jsonb_build_object('matches', to_jsonb(v_names));
end; $$;

-- @@request_building_link (20260801000003)
create or replace function public.request_building_link(p_code text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_building public.buildings;
  v_existing public.resident_links;
  v_who      text;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_building from public.buildings
    where upper(building_code) = upper(trim(p_code))
      and archived_at is null  -- ARCHIVED (20261008000004)
    limit 1;
  if v_building.id is null then
    return json_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select * into v_existing from public.resident_links
    where profile_id = auth.uid() and building_id = v_building.id
      and status in ('pending','approved') and left_at is null
    limit 1;

  -- Re-submitting an existing request must not notify again, or a resident
  -- tapping twice would notify every manager twice.
  if v_existing.id is not null then
    return json_build_object('ok', true, 'already', true, 'status', v_existing.status,
      'building_id', v_building.id, 'building_name', v_building.name);
  end if;

  insert into public.resident_links (profile_id, building_id, status, requested_at)
    values (auth.uid(), v_building.id, 'pending', now());

  select coalesce(nullif(trim(full_name), ''), email, 'A resident')
    into v_who
  from public.profiles where id = auth.uid();

  -- One per manager of this building. No managers means no rows, which is a
  -- valid state, not an error.
  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target, building_id)
  select
    bm.profile_id,
    'building',
    'info',
    coalesce(v_who, 'A resident') || ' wants to join ' || v_building.name,
    'A new resident link is waiting for review in Approvals.',
    'Review request',
    'approvals',
    v_building.id
  from public.building_managers bm
  where bm.building_id = v_building.id;

  return json_build_object('ok', true, 'status', 'pending',
    'building_id', v_building.id, 'building_name', v_building.name);
end;
$function$;

-- @@submit_incident_report (20260822000001)
create or replace function public.submit_incident_report(
  p_building_code text,
  p_type          text,
  p_description   text,
  p_location      text default null,
  p_unit          text default null,
  p_anonymous     boolean default true,
  p_pet_id        uuid default null,
  p_evidence_paths text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_building uuid;
  v_ref      text;
  v_id       uuid;
  v_pet      uuid;
  v_path     text;
begin
  select id into v_building
  from public.buildings
  where upper(building_code) = upper(trim(p_building_code))
    and archived_at is null;  -- ARCHIVED (20261008000004)

  if v_building is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if coalesce(trim(p_description), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'description_required');
  end if;

  -- Evidence lands in guest-evidence under {buildingId}/{draftId}/{name},
  -- uploaded through a signed URL this building's code authorised. Anything
  -- with a different prefix was not ours to attach, and anything that can be
  -- normalised out of that folder is the same problem wearing a disguise.
  -- One anchored regex does both: exactly three segments, segment 1 the
  -- building, segment 2 a uuid, segment 3 starting alphanumeric. See the note
  -- at the top of this migration for why the character class alone is not it.
  if coalesce(cardinality(p_evidence_paths), 0) > 0 then
    if array_ndims(p_evidence_paths) > 1 then
      return jsonb_build_object('ok', false, 'error', 'bad_evidence_path');
    end if;
    if cardinality(p_evidence_paths) > 5 then
      return jsonb_build_object('ok', false, 'error', 'too_many_files');
    end if;
    foreach v_path in array p_evidence_paths loop
      if v_path is null or v_path !~ (
           '^' || v_building::text ||
           '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' ||
           '/[A-Za-z0-9][A-Za-z0-9._-]*$'
         ) then
        return jsonb_build_object('ok', false, 'error', 'bad_evidence_path');
      end if;
    end loop;
  end if;

  -- Only a pet that actually lives in this building. Silently dropped rather
  -- than rejected: a stale id should not lose someone's written report.
  if p_pet_id is not null then
    select p.id into v_pet
    from public.pets p
    where p.id = p_pet_id and p.building_id = v_building and p.deleted_at is null;
  end if;

  v_ref := 'IR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.incident_reports (
    building_id, reporter_id, is_anonymous, type, description,
    location_text, unit_involved, pet_id, status, reference_code,
    evidence_paths
  )
  values (
    v_building,
    case when p_anonymous then null else auth.uid() end,
    p_anonymous,
    p_type::incident_type,
    trim(p_description),
    nullif(trim(coalesce(p_location, '')), ''),
    nullif(trim(coalesce(p_unit, '')), ''),
    v_pet,
    'submitted',
    v_ref,
    -- The column is NOT NULL DEFAULT '{}', and an explicit null argument would
    -- reach it as null rather than falling back to the default.
    coalesce(p_evidence_paths, '{}')
  )
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'incident.submitted', 'incident_report', v_id, v_building,
          jsonb_build_object('anonymous', p_anonymous, 'reference', v_ref,
                             'pet_identified', v_pet is not null,
                             'evidence_count', coalesce(cardinality(p_evidence_paths), 0)));

  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$function$;

-- @@targetable_buildings (20260722000003)
create or replace function public.targetable_buildings()
returns table (id uuid, name text, city text, pet_owners bigint, dogs bigint, cats bigint)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.city,
    (select count(distinct rl.profile_id) from public.resident_links rl
      where rl.building_id = b.id and rl.status = 'approved'),
    (select count(*) from public.pets p
      where p.building_id = b.id and p.species = 'dog' and p.deleted_at is null),
    (select count(*) from public.pets p
      where p.building_id = b.id and p.species = 'cat' and p.deleted_at is null)
  from public.buildings b
  where b.archived_at is null  -- ARCHIVED (20261008000004)
  order by b.name;
$$;

-- @@report_lost_found (20260826000003)
create or replace function public.report_lost_found(
  p_kind         text,
  p_pet_name     text default null,
  p_species      public.pet_species default null,
  p_breed        text default null,
  p_color        text default null,
  p_last_seen    text default null,
  p_reward_cents integer default null,
  p_image_path   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me        uuid := auth.uid();
  v_building  uuid;
  v_links     integer;
  v_recent    integer;
  v_id        uuid;
  v_notified  integer := 0;
  v_name      text;
  v_breed     text;
  v_color     text;
  v_seen      text;
  v_bname     text;
  -- MIRRORS THE STORAGE GRAMMAR PINNED IN 20260826000004. Both must change
  -- together: this one decides whether a path may be STORED, that one decides
  -- whether an object may EXIST. Anchored at both ends, exactly three segments,
  -- no '.' or '/' inside any segment, extension from a closed list.
  v_path_re   text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                   || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                   || '(post|lf)-[0-9a-f]{32}\.(jpg|png|webp|heic)$';
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  -- POSITIVE GRAMMAR. lost_found_kind_check agrees, but failing here gives a
  -- sentence instead of a constraint name three layers down.
  if p_kind is null or p_kind not in ('lost', 'found') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;

  -- THE ONE CHANGED LINE. `min(uuid)` does not exist; array_agg does, for every
  -- type. v_links is what decides no_building vs ambiguous_building, so which
  -- element is picked matters only in the case that is already refused.
  select count(*), (array_agg(rl.building_id))[1]
    into v_links, v_building
    from public.resident_links rl
    join public.profiles pr on pr.id = rl.profile_id
    -- ARCHIVED (20261008000004): a link to an archived building is not a building to post to.
    join public.buildings bl on bl.id = rl.building_id and bl.archived_at is null
   where rl.profile_id = v_me
     and rl.status = 'approved'
     and rl.left_at is null
     and not pr.is_suspended;

  if v_links = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_building');
  end if;
  if v_links > 1 then
    return jsonb_build_object('ok', false, 'error', 'ambiguous_building');
  end if;

  -- The bound, and it is checked BEFORE anything is written, so a refused call
  -- leaves lost_found, notifications and audit_log all untouched.
  select count(*) into v_recent
    from public.lost_found lf
   where lf.reporter_id = v_me
     and lf.created_at > now() - interval '24 hours';
  if v_recent >= 3 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'limit', 3, 'window_hours', 24);
  end if;

  -- `~ '\S'` rather than btrim, because btrim strips only ASCII spaces: a field
  -- containing one non-breaking space is empty to a reader and non-empty to
  -- btrim. Name the thing that must be true — "has a non-space character".
  -- A field that is blank by that test becomes NULL, which is what the column
  -- already means by absent.
  v_name  := case when p_pet_name  ~ '\S' then p_pet_name  else null end;
  v_breed := case when p_breed     ~ '\S' then p_breed     else null end;
  v_color := case when p_color     ~ '\S' then p_color     else null end;
  v_seen  := case when p_last_seen ~ '\S' then p_last_seen else null end;

  -- REFUSED, NOT TRUNCATED. `left(x, 80)` would store something the resident
  -- did not write and report success for it — the same class of quiet lie as a
  -- toast over a write that did not happen. The caller is told which field and
  -- can fix it.
  --
  -- `length(NULL) > 80` is NULL and `if NULL then` does not branch, which is
  -- the intended reading here: an absent field has no length to bound. Written
  -- down because the same three-valued logic HAS been a hole elsewhere in this
  -- repo, and a reader should not have to work out which of the two it is.
  if length(v_name)  > 80  then return jsonb_build_object('ok', false, 'error', 'too_long', 'field', 'pet_name',  'max', 80);  end if;
  if length(v_breed) > 80  then return jsonb_build_object('ok', false, 'error', 'too_long', 'field', 'breed',     'max', 80);  end if;
  if length(v_color) > 40  then return jsonb_build_object('ok', false, 'error', 'too_long', 'field', 'color',     'max', 40);  end if;
  if length(v_seen)  > 500 then return jsonb_build_object('ok', false, 'error', 'too_long', 'field', 'last_seen', 'max', 500); end if;

  -- Null means "no reward". Zero does not: a literal 0 in the column looks like
  -- a decision somebody made rather than an absence, and the screen would badge
  -- it. Upper bound matches manager_set_fine_schedule's, for the same reason —
  -- an unbounded integer in a broadcast is a way to make a notification shout.
  -- Guarded with `is not null` first: `null < 1` is NULL and `if not (NULL)`
  -- does not branch.
  if p_reward_cents is not null and (p_reward_cents < 1 or p_reward_cents > 1000000) then
    return jsonb_build_object('ok', false, 'error', 'bad_reward');
  end if;

  -- AN UNVERIFIED PATH IS A CLAIM. A claim that renders as an image is a way to
  -- point a lost-pet notice at somebody else's object, so the path must match
  -- the grammar AND name an object that actually exists, under THIS caller's
  -- building and THIS caller's uid.
  if p_image_path is not null then
    if p_image_path !~ v_path_re then
      return jsonb_build_object('ok', false, 'error', 'bad_image_path');
    end if;
    if (storage.foldername(p_image_path))[1] is distinct from v_building::text
    or (storage.foldername(p_image_path))[2] is distinct from v_me::text then
      return jsonb_build_object('ok', false, 'error', 'bad_image_path');
    end if;
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'community-media' and o.name = p_image_path
    ) then
      return jsonb_build_object('ok', false, 'error', 'image_not_found');
    end if;
  end if;

  insert into public.lost_found
    (building_id, reporter_id, kind, pet_name, species, breed, color, last_seen,
     reward_cents, image_url, status)
  values
    (v_building, v_me, p_kind, v_name, p_species, v_breed, v_color, v_seen,
     p_reward_cents, p_image_path, 'active')
  returning id into v_id;

  select b.name into v_bname from public.buildings b where b.id = v_building;

  -- Every approved, unsuspended resident of the building EXCEPT the reporter.
  -- A notification telling you about your own report is noise, and it is the
  -- kind of noise that teaches people to ignore the channel.
  with recipients as (
    insert into public.notifications
      (profile_id, kind, severity, title, body, action_label, action_target, building_id)
    select rl.profile_id,
           'community',
           case when p_kind = 'lost' then 'warning' else 'info' end,
           case when p_kind = 'lost'
                then 'Lost pet in ' || coalesce(v_bname, 'your building')
                else 'Found pet in ' || coalesce(v_bname, 'your building') end,
           case when p_kind = 'lost'
                then coalesce(v_name, 'A pet') || ' is missing.'
                else coalesce(v_name, 'A pet') || ' was found.' end
           || coalesce(' Last seen: ' || v_seen || '.', '')
           || coalesce(' ' || v_breed, '')
           || coalesce(' (' || v_color || ')', ''),
           'Open Community',
           -- 'community' is the screen id app/app/page.tsx routes on.
           'community',
           v_building
      from public.resident_links rl
      join public.profiles pr on pr.id = rl.profile_id
     where rl.building_id = v_building
       and rl.status = 'approved'
       and rl.left_at is null
       and not pr.is_suspended
       and rl.profile_id <> v_me
    returning 1
  )
  select count(*) into v_notified from recipients;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (v_me, 'community.lost_found_reported', 'lost_found', v_id, v_building,
          jsonb_build_object('kind', p_kind, 'pet_name', v_name,
                             'has_image', p_image_path is not null,
                             'notified', v_notified));

  return jsonb_build_object('ok', true, 'id', v_id, 'building_id', v_building,
                            'notified', v_notified);
end;
$$;


-- ===== migration 20261008000005_municipal_area_summary.sql =====
-- Pet10x — Part B review fix: a manager's view of city reports is an area
-- summary, and the area is not theirs to choose.
--
-- TWO DEFECTS IN 20261008000002.
--
-- 1. THE AREA WAS MANAGER-CONTROLLED. manager_municipal_reports resolved the
--    municipality from `buildings.postal_code`, and `buildings_manager_update`
--    lets a manager edit their own building's postal code (the settings screen
--    does exactly that). Type a Burnaby prefix, read Burnaby's reports. The
--    area now comes from `buildings.municipality_id`, a stored column only an
--    admin may change — buildings_archive_guard (20261008000004) is extended
--    to cover it, on the same `current_user` test Part A's pets_archive_guard
--    uses (20261007000002): a client role that is not is_admin() may not
--    change it; definer functions, service_role and the SQL editor may.
--
-- 2. IT COULD IDENTIFY A REPORTER. 20260810000006 kept these reports from
--    managers on purpose: in a small building, a free-text description plus a
--    location ("the dog in 4B lunged at me by the mailroom on Tuesday") names
--    the person who wrote it as surely as reporter_id would. Product decision:
--    the manager function returns ONLY id, type, status, the DAY it was made,
--    and the municipality's name. No description, no location, no evidence
--    count, no reference code. The manager screen is an area summary — counts
--    by type and month. Admins keep the full record through RLS.
--
-- The function's return type changes, so it is dropped and re-created rather
-- than replaced.

alter table public.buildings
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

comment on column public.buildings.municipality_id is
  'The city a building is in, for the manager''s area summary of municipal reports (20261008000005). Admin-set only (buildings_archive_guard); backfilled from resolve_municipality on the postal code.';

-- Backfill once, from the same resolver a reporter's form uses. It matches on
-- postal prefix only (coordinates are passed but never guess a city), so a
-- building with no postal code, or in a city with no row, stays null — and its
-- manager sees no reports until an admin picks one.
update public.buildings b
   set municipality_id = nullif(public.resolve_municipality(b.postal_code, b.latitude, b.longitude) ->> 'id', '')::uuid
 where b.municipality_id is null;

-- ---------------------------------------------------------------------------
-- The guard, now covering both admin-only columns, on the role test.
-- (20261008000004's version tested auth.uid(); `current_user` is the stronger
-- statement — PostgREST fixes it from the JWT — and matches pets_archive_guard.)
-- ---------------------------------------------------------------------------
create or replace function public.buildings_archive_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    if new.archived_at is distinct from old.archived_at then
      raise exception 'only an admin can archive or restore a building'
        using errcode = '42501',
              detail  = pg_catalog.format('Building %s, caller %s.', old.id, auth.uid());
    end if;
    if new.municipality_id is distinct from old.municipality_id then
      raise exception 'only an admin can change which city a building is in'
        using errcode = '42501',
              detail  = pg_catalog.format('Building %s, caller %s.', old.id, auth.uid()),
              hint    = 'The city decides which municipal reports the building''s managers see, so it is not theirs to set.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.buildings_archive_guard() from public, anon, authenticated;

comment on function public.buildings_archive_guard() is
  'BEFORE UPDATE on buildings (20261008000004, widened 20261008000005). A client role (authenticated/anon) that is not is_admin() may not change archived_at or municipality_id. buildings_manager_update otherwise lets a manager update their own row. Raises 42501.';

drop trigger if exists buildings_archive_guard on public.buildings;
create trigger buildings_archive_guard
  before update on public.buildings
  for each row
  when (old.archived_at is distinct from new.archived_at
        or old.municipality_id is distinct from new.municipality_id)
  execute function public.buildings_archive_guard();

-- ---------------------------------------------------------------------------
-- The manager function, narrowed.
-- ---------------------------------------------------------------------------
drop function if exists public.manager_municipal_reports(uuid);

create function public.manager_municipal_reports(p_building uuid)
returns table (
  id           uuid,
  type         text,
  status       text,
  reported_on  date,
  municipality text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_municipality uuid;
  v_name         text;
begin
  if not (public.manages_building(p_building) or public.is_admin()) then
    raise exception 'manager_municipal_reports: you do not manage this building'
      using errcode = '42501',
            detail  = pg_catalog.format('Building %s, caller %s.', p_building, auth.uid());
  end if;

  select b.municipality_id, m.name into v_municipality, v_name
    from public.buildings b
    left join public.municipalities m on m.id = b.municipality_id
   where b.id = p_building;
  if v_municipality is null then
    return;
  end if;

  return query
    select r.id, r.type, r.status, (r.created_at at time zone 'America/Vancouver')::date, v_name
      from public.municipal_reports r
     where r.municipality_id = v_municipality
     order by r.created_at desc
     limit 500;
end;
$$;

comment on function public.manager_municipal_reports(uuid) is
  'Area summary of municipal reports for a building''s city (20261008000005): buildings.municipality_id, admin-set. Manager of the building or admin, else 42501. Returns id, type, status, reported_on (a day), municipality name — never description, location, evidence, reference code or anything about the reporter, because in a small building those identify them. Newest 500.';

revoke all on function public.manager_municipal_reports(uuid) from public, anon;
grant execute on function public.manager_municipal_reports(uuid) to authenticated;


-- ===== migration 20261008000006_pet_documents_verdict_guard.sql =====
-- Pet10x — Part B review fix: an owner cannot forge a manager's approval, and
-- approving cannot hide an expired document.
--
-- 1. THE FORGERY. `pet_documents_rw` (20260601000001) lets the owner write
--    EVERY column of their pet's documents. 20261008000003 made `approved` /
--    `manager_verified` mean "a manager of this building looked at it" — and
--    an owner could simply `update pet_documents set status = 'approved',
--    provenance = 'manager_verified'` from the browser, or insert a row born
--    that way. The verdict columns are now guarded, on the same `current_user`
--    test as pets_archive_guard (20261007000002): a client role
--    (authenticated, anon) that is not is_admin() may not
--      * set status to `approved`,
--      * set or change provenance to anything but `self_reported`,
--      * set or change verified_by, verified_at or verified_by_business.
--    manager_review_pet_document and clinic publishing run as their definer,
--    so they are not client roles and are unaffected.
--
--    A downgrade is allowed — an owner may move their own document away from
--    approved — and so is replacing the file. But a CHANGED FILE OR EXPIRY on
--    a verified document is a different document from the one that was
--    verified, so the trigger resets it rather than refusing: status back to
--    what the expiry says (current / expiring / expired), verified_* cleared,
--    provenance back to self_reported. The owner's re-upload works; the stamp
--    does not travel with it.
--
--    The owner paths in lib/data/live.ts (addPetDocument inserts with a
--    status derived from the expiry and no verdict columns; deletePetDocument
--    deletes) touch none of this.
--
-- 2. THE HIDDEN EXPIRY. manager_review_pet_document approved an `expired`
--    document, overwriting the one status that said so — and approved
--    documents left the review list, so it was never seen again. Approve is
--    now refused (`expired`) when expires_on is before today. Copied verbatim
--    from 20261008000003; the only change is the block marked EXPIRED. The
--    review queues (client) also bring back approved documents whose expiry
--    is past or within 30 days.

create or replace function public.pet_documents_verdict_guard()
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
    if new.status = 'approved'
       or coalesce(new.provenance, 'self_reported') <> 'self_reported'
       or new.verified_by is not null or new.verified_at is not null
       or new.verified_by_business is not null then
      raise exception 'a document cannot be created already verified'
        using errcode = '42501',
              detail  = pg_catalog.format('Insert by %s offered status=%s provenance=%s.',
                                          auth.uid(), new.status, new.provenance),
              hint    = 'Upload the document; your building''s manager approves it.';
    end if;
    return new;
  end if;

  -- UPDATE. Upgrades of the verdict are refused outright.
  if (new.status = 'approved' and old.status is distinct from 'approved')
     or (new.provenance is distinct from old.provenance and new.provenance <> 'self_reported')
     or (new.verified_by is distinct from old.verified_by and new.verified_by is not null)
     or (new.verified_at is distinct from old.verified_at and new.verified_at is not null)
     or (new.verified_by_business is distinct from old.verified_by_business
         and new.verified_by_business is not null) then
    raise exception 'only your building''s manager can approve or verify a document'
      using errcode = '42501',
            detail  = pg_catalog.format('Document %s by %s: status %s -> %s, provenance %s -> %s.',
                                        old.id, auth.uid(), old.status, new.status,
                                        old.provenance, new.provenance);
  end if;

  -- A different file or expiry is a different document: the stamp is void.
  -- Also when the owner moves it away from approved themselves, so no row is
  -- left saying "manager verified" over a status that no longer agrees.
  if (old.status = 'approved' or old.provenance in ('manager_verified', 'clinic_confirmed'))
     and (new.storage_path is distinct from old.storage_path
          or new.expires_on is distinct from old.expires_on
          or (old.status = 'approved' and new.status is distinct from 'approved')) then
    -- Re-derived from the expiry only when the document itself changed; an
    -- owner who merely stepped it down keeps the status they chose.
    if new.storage_path is distinct from old.storage_path
       or new.expires_on is distinct from old.expires_on then
      new.status := case
                      when new.expires_on is null then 'current'
                      when new.expires_on < current_date then 'expired'
                      when new.expires_on < current_date + 30 then 'expiring'
                      else 'current'
                    end::public.doc_status;
    end if;
    new.provenance           := 'self_reported';
    new.verified_by          := null;
    new.verified_at          := null;
    new.verified_by_business := null;
  end if;

  return new;
end;
$guard$;

revoke all on function public.pet_documents_verdict_guard() from public, anon, authenticated;

comment on function public.pet_documents_verdict_guard() is
  'BEFORE INSERT OR UPDATE on pet_documents (20261008000006). A client role (authenticated/anon) that is not is_admin() may not set status approved, a provenance other than self_reported, or verified_by/verified_at/verified_by_business. Changing storage_path or expires_on on an approved or verified row resets it: status from the expiry, provenance self_reported, verified_* null. manager_review_pet_document runs as definer and is unaffected. Raises 42501.';

drop trigger if exists trg_pet_documents_verdict_guard on public.pet_documents;
create trigger trg_pet_documents_verdict_guard
  before insert or update on public.pet_documents
  for each row execute function public.pet_documents_verdict_guard();

-- ---------------------------------------------------------------------------
-- manager_review_pet_document, verbatim from 20261008000003 plus EXPIRED.
-- ---------------------------------------------------------------------------
create or replace function public.manager_review_pet_document(
  p_doc     uuid,
  p_verdict text,
  p_note    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc   public.pet_documents%rowtype;
  v_pet   public.pets%rowtype;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_label text;
begin
  select * into v_doc from public.pet_documents where id = p_doc for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- A removed pet's documents are nobody's to review.
  select * into v_pet from public.pets where id = v_doc.pet_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not (public.manages_building(v_pet.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if not coalesce(p_verdict in ('approve', 'reject'), false) then
    return jsonb_build_object('ok', false, 'error', 'verdict_required');
  end if;

  if length(v_note) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'note_too_long',
                              'length', length(v_note), 'max', 2000);
  end if;

  if (p_verdict = 'approve' and v_doc.status = 'approved')
     or (p_verdict = 'reject' and v_doc.status = 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'already_reviewed', 'status', v_doc.status);
  end if;

  v_label := coalesce(nullif(btrim(v_doc.name), ''), replace(v_doc.kind::text, '_', ' '));

  if p_verdict = 'approve' then
    if v_doc.storage_path is null then
      return jsonb_build_object('ok', false, 'error', 'no_file');
    end if;
    -- EXPIRED (20261008000006): approving would overwrite the one status that
    -- says it has lapsed, and take it off the review list. The owner renews it.
    if v_doc.expires_on is not null and v_doc.expires_on < current_date then
      return jsonb_build_object('ok', false, 'error', 'expired', 'expires_on', v_doc.expires_on);
    end if;

    update public.pet_documents
       set status      = 'approved',
           verified_by = auth.uid(),
           verified_at = now(),
           provenance  = 'manager_verified'
     where id = p_doc;
  else
    if v_note is null then
      return jsonb_build_object('ok', false, 'error', 'note_required');
    end if;

    -- verified_by/verified_at record who ruled and when, whichever way. A
    -- rejected document is not verified, so provenance is left as it was.
    update public.pet_documents
       set status      = 'rejected',
           verified_by = auth.uid(),
           verified_at = now()
     where id = p_doc;

    insert into public.notifications (profile_id, kind, severity, title, body,
                                      action_label, action_target, building_id)
    values (
      v_pet.owner_id,
      'compliance',
      'warning',
      'Document not accepted: ' || v_label,
      'Your building did not accept ' || v_pet.name || '''s ' || v_label || '. ' || v_note,
      'Open ' || v_pet.name,
      'pet-detail:' || v_pet.id::text,
      v_pet.building_id
    );
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(),
          case when p_verdict = 'approve' then 'pet_document.approved' else 'pet_document.rejected' end,
          'pet_document', p_doc, v_pet.building_id,
          jsonb_build_object('pet_id', v_pet.id, 'kind', v_doc.kind,
                             'from', v_doc.status, 'note', v_note));

  return jsonb_build_object('ok', true,
                            'status', case when p_verdict = 'approve' then 'approved' else 'rejected' end,
                            'notified', p_verdict = 'reject');
end;
$$;

comment on function public.manager_review_pet_document(uuid, text, text) is
  'Manager (of the pet''s building) or admin rules on a pet_documents row (20261008000003). approve: status approved, verified_by/at, provenance manager_verified; refused no_file without a stored file. reject: status rejected, note REQUIRED, compliance notification to the owner opening pet-detail:<pet>. Audits pet_document.approved|rejected. Returns {ok:true, status, notified} or {ok:false, error: not_found | forbidden | verdict_required | note_too_long | already_reviewed | no_file | expired | note_required}. Approve is refused (expired) when expires_on is before today (20261008000006).';

revoke all on function public.manager_review_pet_document(uuid, text, text) from public, anon;
grant execute on function public.manager_review_pet_document(uuid, text, text) to authenticated;


-- ===== migration 20261008000007_building_archive_followups.sql =====
-- Pet10x — Part B review fixes to building archiving.
--
-- 1. admin_building_history counted only the NO ACTION tables (fines,
--    notifications, payouts, business_listings) plus violations. Everything
--    else CASCADES: a building with residents, pets, units, incident reports,
--    accommodation requests, posts, events, rules and emergency tokens counted
--    zero, the console offered Delete, and Delete would have erased all of it
--    silently. It now counts every table that references buildings, and the
--    console offers Delete only when the total is zero — in practice a
--    building created by mistake and never used. Units are counted outright,
--    not only occupied ones: a unit list is configuration someone typed, and
--    Archive keeps it. Return type changes, so drop and re-create.
--
-- 2. building_pets_for_report (anon) still resolved an archived building's
--    code and listed its pets. Copied verbatim from
--    20260809000007_incident_pet_identification.sql plus the ARCHIVED filter.
--
-- 3. links_insert_self let a signed-in user insert a pending resident_links
--    row directly — around request_building_link — into an archived building.
--    The policy is replaced with the same check plus "the building is live".

drop function if exists public.admin_building_history();

create function public.admin_building_history()
returns table (building_id uuid, total bigint, counts jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id,
         (select coalesce(sum(v::bigint), 0) from jsonb_each_text(c.counts) e(k, v)),
         c.counts
    from (
      select b.id, jsonb_build_object(
           'units', (select count(*) from public.units x where x.building_id = b.id),
           'resident_links', (select count(*) from public.resident_links x where x.building_id = b.id),
           'building_managers', (select count(*) from public.building_managers x where x.building_id = b.id),
           'pets', (select count(*) from public.pets x where x.building_id = b.id),
           'incident_reports', (select count(*) from public.incident_reports x where x.building_id = b.id),
           'accommodation_requests', (select count(*) from public.accommodation_requests x where x.building_id = b.id),
           'community_posts', (select count(*) from public.community_posts x where x.building_id = b.id),
           'lost_found', (select count(*) from public.lost_found x where x.building_id = b.id),
           'events', (select count(*) from public.events x where x.building_id = b.id),
           'building_subscriptions', (select count(*) from public.building_subscriptions x where x.building_id = b.id),
           'emergency_access_tokens', (select count(*) from public.emergency_access_tokens x where x.building_id = b.id),
           'building_rules', (select count(*) from public.building_rules x where x.building_id = b.id),
           'violations', (select count(*) from public.violations x where x.building_id = b.id),
           'fines', (select count(*) from public.fines x where x.building_id = b.id),
           'notifications', (select count(*) from public.notifications x where x.building_id = b.id),
           'payouts', (select count(*) from public.payouts x where x.building_id = b.id),
           'business_listings', (select count(*) from public.business_listings x where x.building_id = b.id)
      ) as counts
        from public.buildings b
       where public.is_admin()
    ) c;
$$;
revoke all on function public.admin_building_history() from public, anon;
grant execute on function public.admin_building_history() to authenticated;

comment on function public.admin_building_history() is
  'Per building, row counts in every table referencing buildings (cascading and blocking alike) and their total (20261008000007). The admin console offers Delete only when total = 0. Admin only — returns nothing to anyone else.';

-- ---------------------------------------------------------------------------
create or replace function public.building_pets_for_report(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_building uuid; v_pets jsonb;
begin
  select b.id into v_building from public.buildings b
  where upper(b.building_code) = upper(btrim(p_code))
    and b.archived_at is null;  -- ARCHIVED (20261008000007)

  if v_building is null then return jsonb_build_object('valid', false); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'species', p.species, 'breed', p.breed,
           'photo', coalesce(p.image_url,
                      (select ph.path from public.pet_photos ph
                        where ph.pet_id = p.id order by ph.sort_order limit 1))
         ) order by p.name), '[]'::jsonb)
    into v_pets
  from public.pets p
  where p.building_id = v_building and p.deleted_at is null;

  return jsonb_build_object('valid', true, 'pets', v_pets);
end; $$;

-- ---------------------------------------------------------------------------
drop policy if exists links_insert_self on public.resident_links;
create policy links_insert_self on public.resident_links for insert with check (
  profile_id = auth.uid() and status = 'pending'
  -- ARCHIVED (20261008000007): an archived building takes no new residents.
  and exists (select 1 from public.buildings b where b.id = resident_links.building_id and b.archived_at is null)
);


-- ===== migration 20261009000001_pending_signup_intent.sql =====
-- Pet10x — Part C: business sign-up verifies the email.
--
-- /api/business/signup created a confirmed auth user straight from the form —
-- no code, no cooldown, no send cap — which is exactly the hole the resident
-- OTP gate (20260802000000) closed for everyone else. Business sign-up now
-- parks in pending_signups too, and the same verify route creates the account.
--
-- `intent` says which account the verified code creates. `business` carries
-- what the business needs at creation ({businessName, category}) and is set
-- exactly when intent = 'business', so a business row can never verify into a
-- resident account with its details silently dropped, nor a resident row into
-- a business with none.
--
-- RLS and grants are untouched: the table stays service-role only.

alter table public.pending_signups
  add column if not exists intent text not null default 'resident',
  add column if not exists business jsonb null;

alter table public.pending_signups drop constraint if exists pending_signups_intent_ck;
alter table public.pending_signups add constraint pending_signups_intent_ck
  check (intent in ('resident', 'business'));

alter table public.pending_signups drop constraint if exists pending_signups_business_ck;
alter table public.pending_signups add constraint pending_signups_business_ck
  check ((intent = 'business') = (business is not null));

comment on column public.pending_signups.intent is
  'Which account the verified code creates: resident (default) or business (20261009000001).';
comment on column public.pending_signups.business is
  'For intent = business only: {"businessName": text, "category": text}. Null otherwise (pending_signups_business_ck).';


-- ===== migration 20261009000002_admin_business_tier.sql =====
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


-- ===== migration 20261009000003_part_c_review_fixes.sql =====
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


-- ===== migration 20261010000001_owner_bills.sql =====
-- Pet10x — Part E: an owner sees the estimates and invoices a practice sends,
-- and approves an estimate.
--
-- 1. THE LEAK. `invoices_owner_read` and `invoice_lines_owner_read`
--    (20260901000006) admitted every invoice on a chart linked to the owner's
--    pet, whatever its status — so a draft the practice was still pricing was
--    readable from the browser before anyone pressed Send. Both now require
--    `status <> 'draft'`. Staff are unaffected (`invoices_staff` /
--    `invoice_lines_staff`).
--
-- 2. clinic_set_invoice_status — copied from 20260901000006 unchanged except
--    for one addition: on draft -> sent it notifies the pet's owner (kind
--    `clinic`), with action target `my-vets:bills`. The notification is
--    written here, as the definer, because it is addressed to someone other
--    than the caller. A chart with no linked pet notifies nobody.
--
-- 3. owner_approve_estimate — copied from 20260901000006 with two changes: it
--    refuses anything whose kind is not `estimate` (`not_an_estimate`; an
--    owner "approving" an invoice moved it to approved, which the practice
--    reads as agreed money), and after approving it notifies the practice's
--    administrators — the business owner and every active owner/manager staff
--    row, unsuspended — with kind `clinic` and no action target: staff work
--    in /clinic, and no /app screen answers for them.
--
-- Payment is out of scope: `paid` stays a status the practice records.

-- ---------------------------------------------------------------------------
-- 1. Owners never read a draft
-- ---------------------------------------------------------------------------
drop policy if exists invoices_owner_read on public.invoices;
create policy invoices_owner_read on public.invoices for select
  using (status <> 'draft'
         and exists (select 1 from public.clinic_patients cp join public.pets p on p.id = cp.pet_id
                      where cp.id = invoices.patient_id and p.owner_id = auth.uid()));
drop policy if exists invoice_lines_owner_read on public.invoice_lines;
create policy invoice_lines_owner_read on public.invoice_lines for select
  using (exists (select 1 from public.invoices i join public.clinic_patients cp on cp.id = i.patient_id
                 join public.pets p on p.id = cp.pet_id
                 where i.id = invoice_lines.invoice_id and i.status <> 'draft'
                   and p.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Sending a bill tells the owner
-- ---------------------------------------------------------------------------
create or replace function public.clinic_set_invoice_status(
  p_invoice uuid, p_status text, p_paid_cents integer default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare inv record; ok boolean;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.staff_of_business(inv.business_id) and not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  ok := case inv.status
    when 'draft'    then p_status in ('sent','void')
    when 'sent'     then p_status in ('approved','paid','void','draft')
    when 'approved' then p_status in ('paid','void')
    when 'paid'     then p_status in ('void')
    else false end;
  if not ok then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition', 'from', inv.status, 'to', p_status);
  end if;
  update public.invoices set
    status = p_status,
    issued_on = case when p_status = 'sent' and issued_on is null then current_date else issued_on end,
    paid_cents = case when p_status = 'paid' then coalesce(p_paid_cents, total_cents) else paid_cents end
  where id = p_invoice;

  -- Part E (20261010000001): the owner learns a bill has reached them. Only
  -- on draft -> sent — the move that makes it readable to them at all.
  if inv.status = 'draft' and p_status = 'sent' then
    insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
    select p.owner_id, 'clinic', 'info',
           case when inv.kind = 'estimate' then 'Estimate from ' else 'Invoice from ' end
             || coalesce(b.name, 'your vet'),
           coalesce(b.name, 'Your vet') || ' sent '
             || case when inv.kind = 'estimate' then 'an estimate' else 'an invoice' end
             || ' for ' || p.name || ': '
             || to_char(inv.total_cents / 100.0, 'FM999,999,990.00') || ' ' || upper(inv.currency) || '. '
             || case when inv.kind = 'estimate'
                     then 'Review and approve it before treatment starts.'
                     else 'Pay the clinic directly.' end,
           case when inv.kind = 'estimate' then 'Review estimate' else 'View invoice' end,
           'my-vets:bills'
      from public.clinic_patients cp
      join public.pets p on p.id = cp.pet_id
      left join public.businesses b on b.id = inv.business_id
     where cp.id = inv.patient_id;
  end if;

  return jsonb_build_object('ok', true, 'status', p_status);
end; $$;
revoke all on function public.clinic_set_invoice_status(uuid, text, integer) from public, anon;
grant execute on function public.clinic_set_invoice_status(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Approving: estimates only, and the practice hears about it
-- ---------------------------------------------------------------------------
create or replace function public.owner_approve_estimate(p_invoice uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare inv record;
begin
  select i.*, p.owner_id, p.name as pet_name into inv from public.invoices i
    join public.clinic_patients cp on cp.id = i.patient_id
    join public.pets p on p.id = cp.pet_id
   where i.id = p_invoice;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if inv.owner_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if inv.kind <> 'estimate' then return jsonb_build_object('ok', false, 'error', 'not_an_estimate'); end if;
  if inv.status <> 'sent' then return jsonb_build_object('ok', false, 'error', 'not_awaiting_approval'); end if;
  update public.invoices set status = 'approved', owner_approved_at = now() where id = p_invoice;

  -- Part E (20261010000001): the practice's administrators — the business
  -- owner (whose own staff row may say `veterinarian`) and active
  -- owner/manager staff. `union` de-duplicates the owner who has both.
  insert into public.notifications (profile_id, kind, severity, title, body)
  select r.profile_id, 'clinic', 'success',
         'Estimate approved for ' || inv.pet_name,
         'The owner approved the ' || coalesce('estimate ' || inv.number, 'estimate') || ' for '
           || inv.pet_name || ' ('
           || to_char(inv.total_cents / 100.0, 'FM999,999,990.00') || ' ' || upper(inv.currency) || ').'
    from (
      select b.owner_id as profile_id from public.businesses b where b.id = inv.business_id
      union
      select s.profile_id from public.business_staff s
       where s.business_id = inv.business_id and s.is_active and s.role in ('owner', 'manager')
    ) r
    join public.profiles pr on pr.id = r.profile_id
   where not pr.is_suspended and r.profile_id <> auth.uid();

  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.owner_approve_estimate(uuid) from public, anon;
grant execute on function public.owner_approve_estimate(uuid) to authenticated;


-- ===== migration 20261010000002_business_staff_guard.sql =====
-- Pet10x — Part E review: a practice manager cannot promote themselves.
--
-- THE GAP. `bstaff_write` (20260901000000) is FOR ALL on
-- can_admin_business(business_id), with no opinion about WHICH row or WHICH
-- role. The Team screen offered every role, Owner included, on every row
-- including the viewer's own, so a practice manager could make themselves
-- `owner` or `veterinarian` in one tap — and both are clinical roles to
-- can_read_shared_records, i.e. other people's pet records. They could also
-- demote or deactivate the business owner's row, or rewrite another row's
-- profile_id to themselves and inherit its role.
--
-- THE RULE, for a client role (authenticated, anon) that is not is_admin():
--
--   * business_id and profile_id never change on an existing row;
--   * nobody sets role `owner` — ownership is businesses.owner_id; a row
--     already holding `owner` may keep it;
--   * unless the caller is the business owner:
--       - their own row's role and is_active do not change,
--       - the business owner's row's role and is_active do not change.
--
-- So a manager may set reception | nurse | veterinarian | manager on OTHER,
-- non-owner rows, and the business owner may set any of those on any row,
-- their own included. Other columns (title, licence, colour, is_bookable)
-- are untouched by this guard.
--
-- Same `current_user` test as pets_archive_guard (20261007000002): SECURITY
-- INVOKER, so current_user is the executing role, which PostgREST fixes from
-- the JWT. business_bootstrap (definer) and service_role are not client roles
-- and pass. Raises 42501.

create or replace function public.business_staff_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
declare
  v_owner uuid;
  v_is_owner boolean;
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;

  select b.owner_id into v_owner from public.businesses b where b.id = new.business_id;
  v_is_owner := v_owner is not null and v_owner = auth.uid();

  if tg_op = 'INSERT' then
    if new.role = 'owner'::public.clinic_staff_role then
      raise exception 'Nobody can be added to a practice as owner'
        using errcode = '42501',
              detail  = pg_catalog.format('Insert into business %s by %s offered role owner.', new.business_id, auth.uid()),
              hint    = 'Ownership is businesses.owner_id. Choose veterinarian, nurse, reception or manager.';
    end if;
    return new;
  end if;

  if new.business_id is distinct from old.business_id or new.profile_id is distinct from old.profile_id then
    raise exception 'A staff row cannot be moved to another person or practice'
      using errcode = '42501',
            detail  = pg_catalog.format('Staff row %s by %s.', old.id, auth.uid()),
            hint    = 'Invite the person instead.';
  end if;

  if new.role = 'owner'::public.clinic_staff_role and old.role is distinct from new.role then
    raise exception 'Nobody can be given the owner role'
      using errcode = '42501',
            detail  = pg_catalog.format('Staff row %s by %s: role %s -> owner.', old.id, auth.uid(), old.role),
            hint    = 'Ownership is businesses.owner_id. Choose veterinarian, nurse, reception or manager.';
  end if;

  if not v_is_owner
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    if old.profile_id = auth.uid() then
      raise exception 'You cannot change your own role or access'
        using errcode = '42501',
              detail  = pg_catalog.format('Staff row %s by its own holder: role %s -> %s, is_active %s -> %s.',
                                          old.id, old.role, new.role, old.is_active, new.is_active),
              hint    = 'Ask the practice owner.';
    end if;
    -- v_owner is null only when the caller cannot read the business row
    -- (businesses_staff_read needs staff_of_business, which a suspended
    -- manager fails). Refuse rather than guess which row is the owner's.
    if v_owner is null or old.profile_id = v_owner then
      raise exception 'Only the practice owner can change their own role or access'
        using errcode = '42501',
              detail  = pg_catalog.format('Owner''s staff row %s by %s: role %s -> %s, is_active %s -> %s.',
                                          old.id, auth.uid(), old.role, new.role, old.is_active, new.is_active),
              hint    = 'The owner''s row is theirs to change.';
    end if;
  end if;

  return new;
end;
$guard$;

-- A trigger function is attached, never called.
revoke all on function public.business_staff_guard() from public, anon, authenticated;

comment on function public.business_staff_guard() is
  'BEFORE INSERT OR UPDATE on business_staff (20261010000002). For a client role (authenticated/anon) that is not is_admin(): business_id/profile_id are immutable; role owner is never set; unless the caller owns the business, neither their own row nor the owner''s row changes role or is_active. SECURITY INVOKER so current_user is the executing role. Raises 42501.';

drop trigger if exists trg_business_staff_guard on public.business_staff;
create trigger trg_business_staff_guard
  before insert or update on public.business_staff
  for each row execute function public.business_staff_guard();


-- ===== migration 20261011000001_notify_incidents_and_bookings.sql =====
-- Part D §1 — the three events that told nobody.
--
-- An incident report sat in the manager's Incidents queue with no signal that
-- it had arrived; a booking request sat in the business's Bookings tab the
-- same way; and a customer whose booking was confirmed, declined or completed
-- learned it only by opening My Bookings. All three are now notifications.
--
-- Triggers rather than edits to the writers. A report arrives through
-- `submit_incident_report` (guests and residents), the capture RPCs, and the
-- `incidents_insert_auth` policy; a booking through a client insert; a status
-- change through two RLS update policies and `business_mark_booking_paid`.
-- One trigger per event covers every door, including ones added later.
--
-- SECURITY DEFINER because every one of these notifications is addressed to
-- somebody other than the person acting, and the only client insert policy on
-- `notifications` is `kind = 'assistant'` for oneself. Trigger functions are
-- granted to nobody: they run as the trigger, never as a call.

-- ---------------------------------------------------------------------------
-- 1. A new incident report → every manager of its building
-- ---------------------------------------------------------------------------
create or replace function public.notify_managers_of_incident()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_label text;
  v_where text;
begin
  -- Mirrors INCIDENT_TYPE_LABEL in lib/data/incidents.ts.
  v_label := case new.type
    when 'noise'        then 'Noise / barking'
    when 'aggressive'   then 'Aggressive behaviour'
    when 'off_leash'    then 'Off-leash'
    when 'waste'        then 'Waste not cleaned'
    when 'damage'       then 'Property damage'
    when 'unregistered' then 'Unregistered pet'
    else 'Other'
  end;

  /* The body names WHERE, never WHO. A report can be anonymous, and a guest
     report can carry the reporter's phone or email in its own columns; none of
     it belongs in a notification that is also emailed and pushed to a lock
     screen. The manager reads the full report on the Incidents screen, under
     that screen's own rules. */
  v_where := nullif(trim(coalesce(new.location_text, '')), '');

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target, building_id)
  select
    bm.profile_id,
    'incident',
    case when new.type = 'aggressive' then 'warning' else 'info' end,
    'New incident: ' || v_label || coalesce(' · ' || new.reference_code, ''),
    case when v_where is not null
         then 'Reported at ' || left(v_where, 120) || '. Open Incidents to review and triage it.'
         else 'Open Incidents to review and triage it.' end,
    'Open incidents',
    'incidents',
    new.building_id
  from public.building_managers bm
  join public.profiles p on p.id = bm.profile_id
  where bm.building_id = new.building_id
    and not p.is_suspended
    -- A manager who files a report in their own building already knows.
    and bm.profile_id is distinct from new.reporter_id;

  return null;
end;
$$;
revoke all on function public.notify_managers_of_incident() from public, anon, authenticated;

drop trigger if exists trg_incident_reports_notify on public.incident_reports;
create trigger trg_incident_reports_notify
  after insert on public.incident_reports
  for each row execute function public.notify_managers_of_incident();

-- ---------------------------------------------------------------------------
-- 2. A new booking → the business owner
-- ---------------------------------------------------------------------------
/* Times are rendered in the RECIPIENT's zone, with the same fallback the care
   reminder cron uses (app/api/care/reminders/run/route.ts, DEFAULT_TZ): a
   notification read in Vancouver must not say a 10:00 booking is at 17:00. */
create or replace function public.booking_when(p_at timestamptz, p_profile uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when p_at is null then null else
    to_char(p_at at time zone coalesce(
      (select nullif(timezone, '') from public.profiles
        where id = p_profile and timezone in (select name from pg_timezone_names)),
      'America/Vancouver'), 'Dy DD Mon, HH12:MI AM')
  end
$$;
revoke all on function public.booking_when(timestamptz, uuid) from public, anon, authenticated;

create or replace function public.notify_business_of_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner   uuid;
  v_service text;
  v_pet     text;
  v_who     text;
  v_when    text;
begin
  select b.owner_id into v_owner from public.businesses b where b.id = new.business_id;
  -- No owner, or the owner booking their own business: nobody to tell.
  if v_owner is null or v_owner = new.customer_id then return null; end if;
  if exists (select 1 from public.profiles where id = v_owner and is_suspended) then return null; end if;

  select s.name into v_service from public.business_services s where s.id = new.service_id;
  select p.name into v_pet from public.pets p where p.id = new.pet_id;
  -- The business already reads its customers' names on the Bookings tab
  -- (profiles_business_customer_read); the first name is enough here.
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_who
    from public.profiles where id = new.customer_id;
  v_when := public.booking_when(new.scheduled_for, v_owner);

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target)
  values (
    v_owner,
    'appointment',
    'info',
    'New booking request' || coalesce(': ' || v_service, ''),
    coalesce(v_who, 'A customer') || ' asked to book'
      || coalesce(' ' || v_service, '')
      || coalesce(' for ' || v_pet, '')
      || coalesce(' on ' || v_when, '')
      || '. Confirm or decline it in Bookings.',
    'Open bookings',
    'business:bookings'
  );
  return null;
end;
$$;
revoke all on function public.notify_business_of_booking() from public, anon, authenticated;

drop trigger if exists trg_service_bookings_notify_insert on public.service_bookings;
create trigger trg_service_bookings_notify_insert
  after insert on public.service_bookings
  for each row execute function public.notify_business_of_booking();

-- ---------------------------------------------------------------------------
-- 3. confirmed / declined / completed → the customer
-- ---------------------------------------------------------------------------
create or replace function public.notify_customer_of_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_biz     text;
  v_service text;
  v_when    text;
  v_reason  text;
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status not in ('confirmed', 'declined', 'completed') then return null; end if;
  /* `bookings_customer_update` lets the customer write their own row. A
     customer who changes it has nothing to be told about. */
  if auth.uid() is not null and auth.uid() = new.customer_id then return null; end if;
  if exists (select 1 from public.profiles where id = new.customer_id and is_suspended) then return null; end if;

  select b.name into v_biz from public.businesses b where b.id = new.business_id;
  select s.name into v_service from public.business_services s where s.id = new.service_id;
  v_when := public.booking_when(new.scheduled_for, new.customer_id);
  v_reason := nullif(trim(coalesce(new.declined_reason, '')), '');

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target)
  values (
    new.customer_id,
    'appointment',
    case new.status when 'declined' then 'warning' else 'success' end,
    case new.status
      when 'confirmed' then 'Booking confirmed'
      when 'declined'  then 'Booking declined'
      else 'Booking completed'
    end || coalesce(' — ' || v_biz, ''),
    case new.status
      when 'confirmed' then coalesce(v_biz, 'The business') || ' confirmed your booking'
                            || coalesce(' for ' || v_service, '') || coalesce(' on ' || v_when, '') || '.'
      when 'declined'  then coalesce(v_biz, 'The business') || ' could not take your booking'
                            || coalesce(' for ' || v_service, '') || '.'
                            || coalesce(' Reason: ' || left(v_reason, 200), '')
      else coalesce(v_biz, 'The business') || ' marked your booking'
           || coalesce(' for ' || v_service, '') || ' as completed. You can leave a review.'
    end,
    'My bookings',
    'my-bookings'
  );
  return null;
end;
$$;
revoke all on function public.notify_customer_of_booking_status() from public, anon, authenticated;

drop trigger if exists trg_service_bookings_notify_status on public.service_bookings;
create trigger trg_service_bookings_notify_status
  after update of status on public.service_bookings
  for each row execute function public.notify_customer_of_booking_status();


-- ===== migration 20261011000002_notification_delivery.sql =====
-- Part D §2–§4 — notifications leave the app: preferences, a dispatcher's
-- bookkeeping, and web push subscriptions.
--
-- Until now a notification was a row a person saw only by opening Pet10x.
-- `/api/notifications/dispatch` (every 5 minutes) now emails and pushes them.
-- This migration holds everything that route needs from the database.

-- ---------------------------------------------------------------------------
-- 1. Preferences — one switch per channel, on by default
-- ---------------------------------------------------------------------------
/* `profiles_update_self` already lets the account write its own row, and
   `guard_profile_privilege` (latest: 20260714000000) refuses only role,
   is_super_admin and is_suspended — so these two need no new policy and no
   change to the guard. */
alter table public.profiles
  add column if not exists notify_email boolean not null default true,
  add column if not exists notify_push  boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Delivery bookkeeping on each notification
-- ---------------------------------------------------------------------------
/* `emailed_at` / `pushed_at` are written on SUCCESS only. The `*_claimed_at`
   pair is the lease a dispatcher run takes before it sends: two overlapping
   runs (a slow one and the next tick) must not both mail the same row, and a
   run that dies after claiming must not lose the row forever. A claim older
   than the lease is fair game again, which is also the retry for a send that
   failed. */
alter table public.notifications
  add column if not exists emailed_at       timestamptz,
  add column if not exists pushed_at        timestamptz,
  add column if not exists email_claimed_at timestamptz,
  add column if not exists push_claimed_at  timestamptz;

create index if not exists notifications_email_pending_idx
  on public.notifications (created_at) where emailed_at is null;
create index if not exists notifications_push_pending_idx
  on public.notifications (created_at) where pushed_at is null;

-- ---------------------------------------------------------------------------
-- 3. Web push subscriptions — one row per browser, owned by its account
-- ---------------------------------------------------------------------------
/* `push_tokens` is Expo-shaped (one opaque token, for a native client that
   does not exist yet) and is left alone. A browser subscription is three
   values — the endpoint and the two keys the payload is encrypted to. */
create table if not exists public.web_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists web_push_subscriptions_profile_idx
  on public.web_push_subscriptions (profile_id);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists wps_select_own on public.web_push_subscriptions;
create policy wps_select_own on public.web_push_subscriptions
  for select using (profile_id = auth.uid());
drop policy if exists wps_insert_own on public.web_push_subscriptions;
create policy wps_insert_own on public.web_push_subscriptions
  for insert with check (profile_id = auth.uid());
drop policy if exists wps_update_own on public.web_push_subscriptions;
create policy wps_update_own on public.web_push_subscriptions
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists wps_delete_own on public.web_push_subscriptions;
create policy wps_delete_own on public.web_push_subscriptions
  for delete using (profile_id = auth.uid());

/* The four verbs RLS polices, to the role that needs them, and nothing to
   anon (20260824000004's grammar). */
revoke all on public.web_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.web_push_subscriptions to authenticated;

/* Registering is a definer RPC, not a client upsert, because of one case RLS
   cannot express: a browser that last belonged to SOMEONE ELSE. Signing out
   deletes the row, but a session can also simply expire, leaving the
   endpoint bound to the previous account — whose notifications would then
   keep arriving on this device. The endpoint identifies the browser, the
   browser now belongs to the caller, so the caller takes it over. That is a
   write to another account's row, hence SECURITY DEFINER. */
create or replace function public.register_web_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 2048
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = ''
     or length(p_p256dh) > 256 or length(p_auth) > 256 then
    return jsonb_build_object('ok', false, 'error', 'invalid_subscription');
  end if;

  delete from public.web_push_subscriptions
   where endpoint = p_endpoint and profile_id <> v_me;

  insert into public.web_push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent, last_used_at)
  values (v_me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300), now())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, last_used_at = now();

  -- A browser that re-subscribes gets a new endpoint and the old one dies
  -- unannounced; keep the newest twenty per account so dead rows cannot pile up.
  delete from public.web_push_subscriptions
   where profile_id = v_me
     and id not in (select id from public.web_push_subscriptions
                     where profile_id = v_me
                     order by coalesce(last_used_at, created_at) desc limit 20);

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.register_web_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_web_push_subscription(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The dispatcher's claims
-- ---------------------------------------------------------------------------
/* Each claim is ONE statement: select the eligible rows `for update skip
   locked`, stamp the lease, return what was stamped. A second run that
   overlaps skips every row the first holds and finds the rest already
   leased, so nothing is sent twice — the read and the write cannot be split
   by another run, which a select-then-update from the route could not
   promise.

   Called only by the cron route with the service role; nobody else has any
   business leasing another account's notifications, so neither function is
   granted to `authenticated`. */

-- Email: unread, 2 minutes to 24 hours old (an in-app read in the first two
-- minutes suppresses it), recipient opted in, kind on the route's list (and a
-- clinic reminder only from an Email rule), and
-- every pending row of at most p_max_recipients people, so one person's
-- digest is never split across runs.
create or replace function public.claim_notification_emails(
  p_kinds public.notification_kind[], p_max_recipients integer default 200)
returns table (
  id uuid, profile_id uuid, email text, full_name text,
  kind public.notification_kind, severity text, title text, body text,
  action_label text, action_target text, created_at timestamptz,
  read_at timestamptz, notify_email boolean)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select n.id, n.profile_id, n.created_at
      from public.notifications n
     where n.emailed_at is null
       and n.read_at is null
       and n.created_at > now() - interval '24 hours'
       and n.created_at <= now() - interval '2 minutes'
       and (n.email_claimed_at is null or n.email_claimed_at < now() - interval '15 minutes')
       and n.kind = any (p_kinds)
       /* A practice's reminder goes by email only when its rule says Email
          (20261011000003). `clinic_reminder_action('notify')` links the item
          to the notification it wrote; an in-app or call-list rule's
          reminder stays in the app (and push). */
       and not exists (select 1 from public.reminder_items ri
                        where ri.notification_id = n.id and ri.channel <> 'email')
       and exists (select 1 from public.profiles p
                    where p.id = n.profile_id and p.notify_email and not p.is_suspended
                      -- An account with no address is never claimed, rather
                      -- than re-leased all day for an email it cannot get.
                      and coalesce((select u.email::text from auth.users u where u.id = p.id),
                                   p.email, '') <> '')
     for update of n skip locked
  ),
  recipients as (
    select c.profile_id
      from candidates c
     group by c.profile_id
     order by min(c.created_at)
     limit greatest(coalesce(p_max_recipients, 200), 1)
  ),
  claimed as (
    update public.notifications n
       set email_claimed_at = now()
      from candidates c
      join recipients r on r.profile_id = c.profile_id
     where n.id = c.id
    returning n.id, n.profile_id, n.kind, n.severity, n.title, n.body,
              n.action_label, n.action_target, n.created_at, n.read_at
  )
  select cl.id, cl.profile_id, coalesce(u.email::text, p.email), p.full_name,
         cl.kind, cl.severity, cl.title, cl.body, cl.action_label, cl.action_target,
         cl.created_at, cl.read_at, p.notify_email
    from claimed cl
    join public.profiles p on p.id = cl.profile_id
    left join auth.users u on u.id = cl.profile_id
   order by cl.profile_id, cl.created_at
$$;
revoke all on function public.claim_notification_emails(public.notification_kind[], integer) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(public.notification_kind[], integer) to service_role;

-- Push: every kind, unread, under 24 hours old, recipient opted in and with
-- at least one subscription. No two-minute wait — a push is the fast channel.
create or replace function public.claim_notification_pushes(p_limit integer default 500)
returns table (
  id uuid, profile_id uuid, kind public.notification_kind, severity text,
  title text, body text, action_target text, created_at timestamptz)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select n.id
      from public.notifications n
     where n.pushed_at is null
       and n.read_at is null
       and n.created_at > now() - interval '24 hours'
       and (n.push_claimed_at is null or n.push_claimed_at < now() - interval '15 minutes')
       and exists (select 1 from public.profiles p
                    where p.id = n.profile_id and p.notify_push and not p.is_suspended)
       and exists (select 1 from public.web_push_subscriptions s where s.profile_id = n.profile_id)
     order by n.created_at
     limit greatest(coalesce(p_limit, 500), 1)
     for update of n skip locked
  )
  update public.notifications n
     set push_claimed_at = now()
    from candidates c
   where n.id = c.id
  returning n.id, n.profile_id, n.kind, n.severity, n.title, n.body, n.action_target, n.created_at
$$;
revoke all on function public.claim_notification_pushes(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_pushes(integer) to service_role;


-- ===== migration 20261011000003_reminder_rules_no_sms.sql =====
-- Part D §5 — a reminder rule can no longer promise SMS.
--
-- `reminder_rules.channel` offered Email and SMS and nothing sent either. SMS
-- is out of scope (decided 2026-10-07), so the console stops offering it, and
-- this stops a new or edited rule from choosing it. Email is now real: the
-- queue's Notify action writes a `reminder` notification to the owner, and
-- `/api/notifications/dispatch` emails it.
--
-- SUPERSEDED by 20261011000004, which replaces this check with a trigger so a
-- historic sms rule can still be edited.
--
-- NOT VALID on purpose: a rule saved as `sms` before today stays a valid row
-- (the original check still admits it, and it is shown as "SMS (retired)"),
-- but no insert and no update can produce one again. A historic `sms` rule
-- that is edited must therefore move to another channel in the same write —
-- the console's channel picker has no SMS option, so that is what it sends.
alter table public.reminder_rules
  drop constraint if exists reminder_rules_channel_not_sms;
alter table public.reminder_rules
  add constraint reminder_rules_channel_not_sms check (channel <> 'sms') not valid;


-- ===== migration 20261011000004_reminder_rules_sms_trigger.sql =====
-- Part D review — retired SMS rules must stay editable.
--
-- 20261011000003 refused SMS with a NOT VALID check. A NOT VALID check is
-- still evaluated on every UPDATE of every row, so a rule saved as `sms`
-- before then could not be touched at all — not renamed, not even switched
-- off. The rule this enforces is narrower: nobody may CHOOSE sms. Inserting
-- an sms rule, or changing a rule's channel to sms, is refused; any other
-- write to a historic sms rule goes through, and so does moving it off sms.
--
-- A trigger, because a check cannot see OLD. The message starts with the old
-- constraint's name so `saveReminderRule`'s readable error still matches it.

alter table public.reminder_rules
  drop constraint if exists reminder_rules_channel_not_sms;

create or replace function public.reminder_rules_refuse_sms()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.channel = 'sms'
     and (tg_op = 'INSERT' or old.channel is distinct from 'sms') then
    raise exception 'reminder_rules_channel_not_sms: SMS reminders are not sent'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.reminder_rules_refuse_sms() from public, anon, authenticated;

drop trigger if exists trg_reminder_rules_refuse_sms on public.reminder_rules;
create trigger trg_reminder_rules_refuse_sms
  before insert or update of channel on public.reminder_rules
  for each row execute function public.reminder_rules_refuse_sms();


-- ===== migration 20261011000005_notification_email_failed.sql =====
-- Part D review — an email Resend refuses for good stops being retried.
--
-- A send that failed kept its lease, and the lease expiring was the retry:
-- right for a 5xx or a network blip, wrong for a recipient Resend rejects as
-- invalid, which was re-sent every fifteen minutes for a day (~96 tries) and
-- failed every time. The dispatcher now stamps `email_failed_at` when Resend
-- says the message itself is the problem (`isPermanentEmailFailure` in
-- lib/email.ts: 422, or 400 validation); everything else still retries.
--
-- `emailed_at` stays "it was sent", so it is not reused for "it never will be".
--
-- claim_notification_emails is copied verbatim from 20261011000002 (the only
-- definition) with one line added: `email_failed_at is null`.

alter table public.notifications
  add column if not exists email_failed_at timestamptz;

create or replace function public.claim_notification_emails(
  p_kinds public.notification_kind[], p_max_recipients integer default 200)
returns table (
  id uuid, profile_id uuid, email text, full_name text,
  kind public.notification_kind, severity text, title text, body text,
  action_label text, action_target text, created_at timestamptz,
  read_at timestamptz, notify_email boolean)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select n.id, n.profile_id, n.created_at
      from public.notifications n
     where n.emailed_at is null
       and n.email_failed_at is null  -- 20261011000005: refused for good
       and n.read_at is null
       and n.created_at > now() - interval '24 hours'
       and n.created_at <= now() - interval '2 minutes'
       and (n.email_claimed_at is null or n.email_claimed_at < now() - interval '15 minutes')
       and n.kind = any (p_kinds)
       /* A practice's reminder goes by email only when its rule says Email
          (20261011000003). `clinic_reminder_action('notify')` links the item
          to the notification it wrote; an in-app or call-list rule's
          reminder stays in the app (and push). */
       and not exists (select 1 from public.reminder_items ri
                        where ri.notification_id = n.id and ri.channel <> 'email')
       and exists (select 1 from public.profiles p
                    where p.id = n.profile_id and p.notify_email and not p.is_suspended
                      -- An account with no address is never claimed, rather
                      -- than re-leased all day for an email it cannot get.
                      and coalesce((select u.email::text from auth.users u where u.id = p.id),
                                   p.email, '') <> '')
     for update of n skip locked
  ),
  recipients as (
    select c.profile_id
      from candidates c
     group by c.profile_id
     order by min(c.created_at)
     limit greatest(coalesce(p_max_recipients, 200), 1)
  ),
  claimed as (
    update public.notifications n
       set email_claimed_at = now()
      from candidates c
      join recipients r on r.profile_id = c.profile_id
     where n.id = c.id
    returning n.id, n.profile_id, n.kind, n.severity, n.title, n.body,
              n.action_label, n.action_target, n.created_at, n.read_at
  )
  select cl.id, cl.profile_id, coalesce(u.email::text, p.email), p.full_name,
         cl.kind, cl.severity, cl.title, cl.body, cl.action_label, cl.action_target,
         cl.created_at, cl.read_at, p.notify_email
    from claimed cl
    join public.profiles p on p.id = cl.profile_id
    left join auth.users u on u.id = cl.profile_id
   order by cl.profile_id, cl.created_at
$$;
revoke all on function public.claim_notification_emails(public.notification_kind[], integer) from public, anon, authenticated;
grant execute on function public.claim_notification_emails(public.notification_kind[], integer) to service_role;


-- ===== migration 20261012000001_account_deletion_set_null.sql =====
-- Pet10x — Part F: an account can be deleted by everyone, not 27 of 48.
--
-- 20 foreign keys into `profiles` were NO ACTION, and `violations.pet_id` and
-- `service_bookings.business_id` refused the two owned-row deletes the route
-- runs first. Measured before this file: 21 of 48 live profiles could not be
-- deleted (app/api/account/delete/route.ts carried the histogram).
--
-- THE RULE. A column that records who DID something (granted, decided,
-- verified, triaged, issued, logged, suspended) goes NULL with the person: the
-- act stays on the record, the name does not. A column that records who a
-- record is ABOUT (the resident on a case or a fine, the customer on a
-- booking, the payer, the appellant) also goes NULL — enforcement and booking
-- history is retained, de-identified, as PIPEDA permits for legal obligations
-- — but the route refuses BEFORE deleting while a case is open or a fine is
-- owed, so nothing live loses its subject.
--
-- A REFERENTIAL SET NULL IS AN UPDATE, and four guards refused it
-- (20260827000006 learned this for accommodation_requests): fines_settle_only_
-- guard compares whole rows; community_freeze_attribution and
-- community_row_opening freeze created_by / reporter_id / author_id; and
-- community_posts_guard froze author_id while its own hint said the FK was the
-- one permitted writer. Each now admits exactly the referential case through
-- person_ref_released() below, and nothing else.
--
-- Guards checked and left alone, with the reason:
--   violations_stage_guard     — WHEN (old.stage is distinct from new.stage)
--   pet_documents_verdict_guard — exempts non-client roles; a NULL verified_by
--                                 is not an upgrade either way
--   guard_profile_privilege    — from 20261012000006 it does guard suspended_by,
--                                but only for callers with a JWT; the deletion
--                                cascade carries none, so it passes
--   accommodation_requests_freeze — already admits decided_by / pet_id going
--                                 NULL (20260827000006/7)
--   business_staff_guard       — exempts non-client roles
--   sync_pets_on_link_change   — acts on a status change only
--   building_rules_publish_guard — acts on is_published only
--   service_bookings status notify triggers — `after update of status`
--
-- WHO RUNS A REFERENTIAL ACTION. PostgreSQL executes ON DELETE SET NULL as the
-- OWNER of the referencing table (ri_triggers.c switches to its relowner), not
-- as the role that issued the DELETE — GoTrue's supabase_auth_admin holds no
-- UPDATE on public.fines, and deleting a user cascades today regardless. So
-- inside the cascade current_user is the owner, which is never `authenticated`
-- or `anon`; a client's own UPDATE always is.

-- ---------------------------------------------------------------------------
-- 1. The predicate every guard below shares
-- ---------------------------------------------------------------------------
create or replace function public.person_ref_released(p_old uuid, p_new uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $fn$
  select p_new is null
     and p_old is not null
     and current_user not in ('authenticated', 'anon')
     and not exists (select 1 from public.profiles pr where pr.id = p_old)
$fn$;

comment on function public.person_ref_released(uuid, uuid) is
  'True only for the write an ON DELETE SET NULL referential action makes: a person column going from a uuid to NULL, the profile it named gone, and the write not made by a client role. Referential actions run as the referencing table''s owner, so under one the existence probe bypasses RLS and is authoritative; under authenticated/anon the function is false whatever the probe would say, so it is not an existence oracle. SECURITY INVOKER on purpose (20260827000007, 20260829000000).';

revoke all on function public.person_ref_released(uuid, uuid) from public, anon;
grant execute on function public.person_ref_released(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Actor columns — who did something. The record stays; the name goes.
-- ---------------------------------------------------------------------------
alter table public.building_managers
  drop constraint if exists building_managers_granted_by_fkey,
  add constraint building_managers_granted_by_fkey
  foreign key (granted_by) references public.profiles(id) on delete set null;
alter table public.resident_links
  drop constraint if exists resident_links_decided_by_fkey,
  add constraint resident_links_decided_by_fkey
  foreign key (decided_by) references public.profiles(id) on delete set null;
alter table public.pet_documents
  drop constraint if exists pet_documents_verified_by_fkey,
  add constraint pet_documents_verified_by_fkey
  foreign key (verified_by) references public.profiles(id) on delete set null;
alter table public.incident_reports
  drop constraint if exists incident_reports_reporter_id_fkey,
  add constraint incident_reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete set null;
alter table public.incident_reports
  drop constraint if exists incident_reports_triaged_by_fkey,
  add constraint incident_reports_triaged_by_fkey
  foreign key (triaged_by) references public.profiles(id) on delete set null;
alter table public.violations
  drop constraint if exists violations_opened_by_fkey,
  add constraint violations_opened_by_fkey
  foreign key (opened_by) references public.profiles(id) on delete set null;
alter table public.violation_events
  drop constraint if exists violation_events_actor_id_fkey,
  add constraint violation_events_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;
alter table public.lost_found
  drop constraint if exists lost_found_reporter_id_fkey,
  add constraint lost_found_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete set null;
alter table public.events
  drop constraint if exists events_created_by_fkey,
  add constraint events_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.fines
  drop constraint if exists fines_issued_by_fkey,
  add constraint fines_issued_by_fkey
  foreign key (issued_by) references public.profiles(id) on delete set null;
alter table public.emergency_access_tokens
  drop constraint if exists emergency_access_tokens_issued_by_fkey,
  add constraint emergency_access_tokens_issued_by_fkey
  foreign key (issued_by) references public.profiles(id) on delete set null;
alter table public.audit_log
  drop constraint if exists audit_log_actor_id_fkey,
  add constraint audit_log_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;
alter table public.care_entries
  drop constraint if exists care_entries_logged_by_fkey,
  add constraint care_entries_logged_by_fkey
  foreign key (logged_by) references public.profiles(id) on delete set null;
alter table public.profiles
  drop constraint if exists profiles_suspended_by_fkey,
  add constraint profiles_suspended_by_fkey
  foreign key (suspended_by) references public.profiles(id) on delete set null;
alter table public.violation_disputes
  drop constraint if exists violation_disputes_decided_by_fkey,
  add constraint violation_disputes_decided_by_fkey
  foreign key (decided_by) references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. Subject columns — who a record is about. Kept, de-identified.
--    The delete route refuses first while a case is open or a fine is owed.
-- ---------------------------------------------------------------------------
alter table public.service_bookings alter column customer_id drop not null;
alter table public.violation_disputes alter column filed_by drop not null;
alter table public.violations
  drop constraint if exists violations_resident_id_fkey,
  add constraint violations_resident_id_fkey
  foreign key (resident_id) references public.profiles(id) on delete set null;
alter table public.fines
  drop constraint if exists fines_resident_id_fkey,
  add constraint fines_resident_id_fkey
  foreign key (resident_id) references public.profiles(id) on delete set null;
alter table public.payments
  drop constraint if exists payments_profile_id_fkey,
  add constraint payments_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete set null;
alter table public.service_bookings
  drop constraint if exists service_bookings_customer_id_fkey,
  add constraint service_bookings_customer_id_fkey
  foreign key (customer_id) references public.profiles(id) on delete set null;
alter table public.violation_disputes
  drop constraint if exists violation_disputes_filed_by_fkey,
  add constraint violation_disputes_filed_by_fkey
  foreign key (filed_by) references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. The two owned-row deletes the route runs before the account itself.
--    A removed pet leaves its cases standing with no pet named; a removed
--    business leaves its customers' booking history with no business named.
--    The route refuses a business deletion while a booking is still open.
-- ---------------------------------------------------------------------------
alter table public.violations
  drop constraint if exists violations_pet_id_fkey,
  add constraint violations_pet_id_fkey
  foreign key (pet_id) references public.pets(id) on delete set null;
alter table public.service_bookings alter column business_id drop not null;
alter table public.service_bookings
  drop constraint if exists service_bookings_business_id_fkey,
  add constraint service_bookings_business_id_fkey
  foreign key (business_id) references public.businesses(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 5. A decided appeal whose decider has left still says it was decided.
-- ---------------------------------------------------------------------------
alter table public.violation_disputes drop constraint if exists violation_disputes_decision_whole;
alter table public.violation_disputes add constraint violation_disputes_decision_whole check (
  (outcome is null and decided_at is null and decided_by is null)
  or (outcome is not null and decided_at is not null)
);

-- ---------------------------------------------------------------------------
-- 6. Guards that read a SET NULL as an edit
-- ---------------------------------------------------------------------------

-- fines: settled, never rewritten — except the two person columns going NULL
-- with the person.
create or replace function public.fines_settle_only_guard()
returns trigger
language plpgsql
set search_path = ''
as $guard$
declare
  v_old jsonb := pg_catalog.to_jsonb(old) - 'status' - 'updated_at';
  v_new jsonb := pg_catalog.to_jsonb(new) - 'status' - 'updated_at';
begin
  if public.person_ref_released(old.resident_id, new.resident_id) then
    v_old := v_old - 'resident_id';
    v_new := v_new - 'resident_id';
  end if;
  if public.person_ref_released(old.issued_by, new.issued_by) then
    v_old := v_old - 'issued_by';
    v_new := v_new - 'issued_by';
  end if;
  if v_old is distinct from v_new then
    raise exception
      'a fine may be settled, not rewritten'
      using errcode = '42501',
            detail  = pg_catalog.format(
                        'Fine %s: an UPDATE changed a column other than status.', old.id),
            hint    = 'Only `status` may be changed on an existing fine (this is what "Mark paid" and "Waive" do). The amount, currency, due date and the case a fine belongs to are set when manager_advance_violation issues it, and are not editable afterwards — a fine the resident has already been told about cannot be quietly restated.';
  end if;
  return new;
end;
$guard$;

comment on function public.fines_settle_only_guard() is
  'BEFORE UPDATE guard on fines: permits a row to differ only in `status` (and `updated_at`, which trg_fines_updated rewrites), plus resident_id / issued_by going NULL when that person''s account is deleted (person_ref_released, 20261012000001). Compares whole rows as jsonb, so columns added later are protected without amending this function. Raises 42501.';

create or replace function public.community_posts_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $guard$
declare
  -- THE REGISTRY. Every column of community_posts, and nothing else. This is
  -- the positive grammar: membership here is what makes a column governed at
  -- all, and the branches below say by whom. Add a column to the table without
  -- adding it here and every write to community_posts refuses until you do.
  k_known constant text[] := array[
    -- the author's, supplied on the way in; posts_insert already binds
    -- author_id to auth.uid() and building_id to a building they stand in
    'id', 'building_id', 'author_id', 'category', 'content', 'image_url',
    -- the building management's voice
    'is_official', 'is_pinned',
    -- the counter triggers'
    'like_count', 'comment_count',
    -- the system's
    'created_at',
    -- the moderation path's
    'deleted_at'
  ];
  v_stray text;
begin
  select t.col into v_stray
    from pg_catalog.jsonb_object_keys(to_jsonb(new)) as t(col)
   where t.col <> all (k_known)
   limit 1;
  if v_stray is not null then
    raise exception 'community_posts.% is not classified by community_posts_guard', v_stray
      using errcode = '42501',
            detail  = pg_catalog.format('%s on community_posts reached the guard in no column class.', v_stray),
            hint    = 'A new column on this table is closed until it is named in k_known and given a rule. Decide there whether an author may supply it, whether a manager may change it, and whether it is frozen after insert.';
  end if;

  -- -------------------------------------------------------------------------
  -- THE WAY IN. NEW here, and the whole reason for this migration.
  -- -------------------------------------------------------------------------
  if tg_op = 'INSERT' then
    -- is_official says "the building management said this" and is_pinned says
    -- "the management put this in front of you". Neither is the author's to
    -- claim, and an INSERT is a claim exactly as an UPDATE is. A MANAGER OF
    -- THE BUILDING MAY STILL OPEN A POST BADGED — that is a genuine official
    -- announcement, written and badged in one statement, and it must keep
    -- working.
    if new.is_official or new.is_pinned then
      if not (public.manages_building(new.building_id) or public.is_admin()) then
        raise exception 'only a manager of this building or an admin may publish a post as official or pinned'
          using errcode = '42501',
                detail  = pg_catalog.format('Building %s: is_official=%s, is_pinned=%s offered at INSERT by %s.',
                            new.building_id, new.is_official, new.is_pinned, auth.uid()),
                hint    = 'A resident''s post opens unbadged and unpinned. The badge is a manager''s act, before or after.';
      end if;
    end if;

    -- Engagement is earned, never declared — by ANYBODY, manager included.
    -- The counters belong to trg_post_reactions_count and trg_post_comments_count
    -- and there is nothing for them to have counted yet.
    if new.like_count <> 0 or new.comment_count <> 0 then
      raise exception 'community_posts opens with like_count = 0 and comment_count = 0'
        using errcode = '42501',
              detail  = pg_catalog.format('Offered like_count=%s, comment_count=%s at INSERT by %s.',
                          new.like_count, new.comment_count, auth.uid()),
              hint    = 'Insert the post_reactions / post_comments rows. The counters follow.';
    end if;

    -- A post opens visible. Opening one already removed would put a row into
    -- the building's record that no feed renders and no audit_log names.
    if new.deleted_at is not null then
      raise exception 'community_posts.deleted_at cannot be set at INSERT'
        using errcode = '42501',
              detail  = pg_catalog.format('Offered deleted_at=%s at INSERT by %s.', new.deleted_at, auth.uid()),
              hint    = 'Removal is an UPDATE, which this guard authorises and which moderate_community_post audits.';
    end if;

    -- STAMPED, NOT CHECKED, and for everyone including managers and admins.
    -- created_at is a system fact about when the building was told, not an
    -- input; a backdated post sorts into the feed above things that were
    -- actually said first. Checking it would need a tolerance and a clock
    -- argument; stamping it means there is no value a caller can offer that
    -- survives this line. No caller in this codebase sends it: neither
    -- createCommunityPost nor any RPC names the column.
    new.created_at := now();
    return new;
  end if;

  -- -------------------------------------------------------------------------
  -- THE WAY ON. 20260826000006's text, plus the created_at freeze.
  -- -------------------------------------------------------------------------
  if new.building_id is distinct from old.building_id then
    raise exception 'community_posts.building_id cannot be changed'
      using errcode = '42501',
            detail  = pg_catalog.format('Post %s: %s -> %s.', old.id, old.building_id, new.building_id),
            hint    = 'A post was addressed to a building. Remove it (deleted_at) and write a new one.';
  end if;
  -- 20261012000001: the hint below was always the intent and was never the
  -- behaviour — the FK's ON DELETE SET NULL is an UPDATE, and this branch
  -- refused it, so nobody who had ever posted could delete their account.
  if new.author_id is distinct from old.author_id
     and not public.person_ref_released(old.author_id, new.author_id) then
    raise exception 'community_posts.author_id cannot be changed'
      using errcode = '42501',
            detail  = pg_catalog.format('Post %s: %s -> %s.', old.id, old.author_id, new.author_id),
            hint    = 'Attribution is not transferable. The only writer of this column is the FK''s ON DELETE SET NULL, which anonymises rather than reassigns.';
  end if;

  -- NEW. The mirror of the stamp above: if the timestamp cannot be chosen on
  -- the way in, it cannot be edited afterwards either, or the freeze is one
  -- extra statement away. Measured before this line: an author moved their own
  -- post's created_at back 900 days, 1 row, no error.
  if new.created_at is distinct from old.created_at then
    raise exception 'community_posts.created_at cannot be changed'
      using errcode = '42501',
            detail  = pg_catalog.format('Post %s: %s -> %s attempted by %s.',
                        old.id, old.created_at, new.created_at, auth.uid()),
            hint    = 'When the building was told is a fact about the past. It is stamped at INSERT and frozen here.';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    if old.deleted_at is null then
      if not (
        (new.author_id is not distinct from auth.uid())
        or public.manages_building(new.building_id)
        or public.is_admin()
      ) then
        raise exception 'only the author, a manager of this building or an admin may remove a post'
          using errcode = '42501',
                detail  = pg_catalog.format('Post %s in building %s: deleted_at NULL -> %s by %s.',
                            old.id, new.building_id, new.deleted_at, auth.uid()),
                hint    = 'A manager should remove somebody else''s post through moderate_community_post, which audits it.';
      end if;
    else
      if not (public.manages_building(new.building_id) or public.is_admin()) then
        raise exception 'only a manager of this building or an admin may restore a removed post'
          using errcode = '42501',
                detail  = pg_catalog.format('Post %s in building %s: deleted_at %s -> %s by %s.',
                            old.id, new.building_id, old.deleted_at, new.deleted_at, auth.uid()),
                hint    = 'An author may remove their own post and may not un-remove it: the row does not record who removed it, so this trigger cannot tell your takedown from a moderator''s.';
      end if;
    end if;
  end if;

  if (new.is_pinned   is distinct from old.is_pinned)
  or (new.is_official is distinct from old.is_official) then
    if not (public.manages_building(new.building_id) or public.is_admin()) then
      raise exception 'only a manager of this building or an admin may pin or mark a post official'
        using errcode = '42501',
              detail  = pg_catalog.format('Post %s in building %s: is_pinned %s -> %s, is_official %s -> %s.',
                          old.id, new.building_id, old.is_pinned, new.is_pinned,
                          old.is_official, new.is_official),
              hint    = 'posts_update_own admits the author for content edits; these two columns are not the author''s to set.';
    end if;
  end if;

  if (new.content   is distinct from old.content)
  or (new.category  is distinct from old.category)
  or (new.image_url is distinct from old.image_url) then
    if new.author_id is distinct from auth.uid() then
      raise exception 'only the author may change a post''s content'
        using errcode = '42501',
              detail  = pg_catalog.format('Post %s: attempted content/category/image edit by %s, authored by %s.',
                          old.id, auth.uid(), old.author_id),
              hint    = 'A manager removes a post (deleted_at) or pins it. Rewriting it under the author''s name is not a moderation act.';
    end if;
    -- NEW: the clear is conditioned on the editor's standing.
    --
    -- The rule it enforces is unchanged and still right — the management's
    -- badge and placement were granted to particular WORDS, so a resident who
    -- rewrites the words loses both, or a pinned "Lost cat, found, thanks all"
    -- becomes prose under the management's badge at the top of every
    -- neighbour's feed. But the clear fired on ANY author edit, and A MANAGER
    -- CAN BE THE AUTHOR: a manager fixing a typo in their own Official
    -- announcement silently de-badged and un-pinned it. Measured: badge own
    -- post -> official=true pinned=true; edit one word -> official=false
    -- pinned=false.
    --
    -- This also removes the silent-failure the clear caused for the obvious
    -- client fix. `set content='v2', is_official=true` used to land false,
    -- because the clear ran after the pin block and overwrote the caller's
    -- explicit assignment. For a manager the assignment now survives; for a
    -- resident the pin block above already raises 42501, which is an honest
    -- refusal rather than a value that quietly disagrees with the statement.
    --
    -- A manager who wants their own edited announcement de-badged clears it in
    -- the same statement, and now that means what it says.
    if not (public.manages_building(new.building_id) or public.is_admin()) then
      new.is_official := false;
      new.is_pinned   := false;
    end if;
  end if;

  if (new.like_count    is distinct from old.like_count)
  or (new.comment_count is distinct from old.comment_count) then
    if pg_catalog.current_setting('pet10x.post_counts', true) is distinct from 'ok' then
      raise exception 'community_posts.like_count and comment_count cannot be changed by a direct UPDATE'
        using errcode = '42501',
              detail  = pg_catalog.format('Post %s: like_count %s -> %s, comment_count %s -> %s outside the counter triggers.',
                          old.id, old.like_count, new.like_count, old.comment_count, new.comment_count),
              hint    = 'Insert or delete the post_reactions / post_comments row. The counters follow.';
    end if;
    perform pg_catalog.set_config('pet10x.post_counts', '', true);
  end if;

  return new;
end;
$guard$;

create or replace function public.community_row_opening()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_rule    jsonb  := tg_argv[0]::jsonb;
  v_known   text[];
  v_frozen  text[];
  v_new     jsonb  := to_jsonb(new);
  v_old     jsonb;
  v_stray   text;
  v_opens   record;
  k         text;
begin
  v_known  := array(select pg_catalog.jsonb_array_elements_text(v_rule -> 'columns'));
  v_frozen := array(select pg_catalog.jsonb_array_elements_text(coalesce(v_rule -> 'frozen', '[]'::jsonb)));

  -- The tripwire. Same shape as community_posts_guard's, same purpose: a
  -- column this grammar has never heard of closes the table until it is named.
  select t.col into v_stray
    from pg_catalog.jsonb_object_keys(v_new) as t(col)
   where t.col <> all (v_known)
   limit 1;
  if v_stray is not null then
    raise exception '%.% is not classified by this table''s row grammar', tg_table_name, v_stray
      using errcode = '42501',
            detail  = pg_catalog.format('%s reached trg_%s_row_opening in no column class.', v_stray, tg_table_name),
            hint    = 'Add the column to the "columns" list on the trigger, and decide there whether it is also frozen after insert.';
  end if;

  if tg_op = 'INSERT' then
    -- A row opens in its opening state. lost_found is the reason this exists:
    -- lost_found_insert's WITH CHECK binds reporter_id and building_id and
    -- says nothing about status, so a report could be filed already resolved —
    -- a notice that pages the whole building and then reads as closed.
    for v_opens in
      select key, value from pg_catalog.jsonb_each_text(coalesce(v_rule -> 'opens_as', '{}'::jsonb))
    loop
      if (v_new ->> v_opens.key) is distinct from v_opens.value then
        raise exception '%.% must be ''%'' at INSERT', tg_table_name, v_opens.key, v_opens.value
          using errcode = '42501',
                detail  = pg_catalog.format('Offered %L by %s.', v_new ->> v_opens.key, auth.uid()),
                hint    = 'A row opens in its opening state and is moved afterwards, through the policy that governs the move.';
      end if;
    end loop;

    -- Stamped, not checked, for the same reason as community_posts: there is
    -- then no value a caller can offer that survives. Every one of these five
    -- tables carries created_at, and no client or RPC in this codebase sends
    -- it.
    new.created_at := now();
    return new;
  end if;

  v_old := to_jsonb(old);
  foreach k in array v_frozen loop
    -- 20261012000001: an attribution column going NULL because the person it
    -- named was deleted is the FK's ON DELETE SET NULL, not an edit. Nested,
    -- so the uuid cast only ever meets a uuid column.
    if k = any (array['created_by', 'reporter_id', 'author_id']) then
      if public.person_ref_released((v_old ->> k)::uuid, (v_new ->> k)::uuid) then
        continue;
      end if;
    end if;
    if (v_new -> k) is distinct from (v_old -> k) then
      raise exception '%.% cannot be changed', tg_table_name, k
        using errcode = '42501',
              detail  = pg_catalog.format('Row %s: %s %s -> %s attempted by %s.',
                          coalesce(v_old ->> 'id', '(composite key)'), k, v_old ->> k, v_new ->> k, auth.uid()),
              hint    = 'This column is settled at INSERT. Frozen for the author too, not only for a moderator.';
    end if;
  end loop;

  return new;
end;
$fn$;

create or replace function public.community_freeze_attribution()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_col       text   := tg_argv[0];
  -- TG_ARGV is 0-based; everything from 1 up is a column a non-author may
  -- change. A trigger created with one argument slices to the empty array,
  -- which is `events` and is correct rather than accidental.
  v_moderator text[] := coalesce(tg_argv[1:tg_nargs - 1], '{}'::text[]);
  v_old       jsonb  := to_jsonb(old);
  v_new       jsonb  := to_jsonb(new);
  v_actor     text   := v_old ->> v_col;
  k           text;
begin
  if new.building_id is distinct from old.building_id then
    raise exception '%.building_id cannot be changed', tg_table_name
      using errcode = '42501',
            detail  = pg_catalog.format('%s -> %s.', old.building_id, new.building_id),
            hint    = 'The row was addressed to a building. Create a new one there instead.';
  end if;
  if (v_new ->> v_col) is distinct from v_actor then
    -- 20261012000001: the one way attribution changes — the author's account
    -- was deleted and the FK nulled it. Admitted only when nothing else on the
    -- row moved in the same write.
    if public.person_ref_released(v_actor::uuid, (v_new ->> v_col)::uuid)
       and (v_new - v_col) = (v_old - v_col) then
      return new;
    end if;
    raise exception '%.% cannot be changed', tg_table_name, v_col
      using errcode = '42501',
            detail  = pg_catalog.format('%s -> %s.', v_actor, v_new ->> v_col),
            hint    = 'Attribution is not transferable, by a manager or by anybody else.';
  end if;

  -- The author may change anything the policies let them reach.
  if v_actor is not distinct from (auth.uid())::text then
    return new;
  end if;

  -- Everybody else may change the moderator columns and nothing else.
  for k in select jsonb_object_keys(v_new)
  loop
    if (v_new -> k) is distinct from (v_old -> k) and not (k = any (v_moderator)) then
      raise exception 'only the author may change %.%', tg_table_name, k
        using errcode = '42501',
              detail  = pg_catalog.format('Row %s: %s %s -> %s attempted by %s, attributed to %s.',
                          v_old ->> 'id', k, v_old ->> k, v_new ->> k, auth.uid(), v_actor),
              hint    = pg_catalog.format(
                          'A manager or an admin may change only: %s. Rewriting text a resident wrote, under that resident''s name, is not a moderation act.',
                          case when cardinality(v_moderator) = 0 then '(nothing on this table — remove the row instead)'
                               else array_to_string(v_moderator, ', ') end);
    end if;
  end loop;

  return new;
end;
$fn$;


-- ===== migration 20261012000002_admin_users_and_stats.sql =====
-- Pet10x — Part F: the admin console's Users and Overview tabs.
--
-- Three definer RPCs, each `is_admin()` only:
--
--   admin_list_users(p_query, p_limit, p_offset)
--     Profiles matched by name or email (server-side ilike), newest first,
--     paginated, with what each person IS on the platform — resident, manager
--     of N buildings, business owner, clinic staff, admin — so the console
--     can label them without a query per row.
--
--   admin_set_user_flags(p_profile, p_suspended, p_super_admin)
--     Suspend / unsuspend, grant / revoke super-admin. The client used to
--     write `profiles` directly (setManagerSuspended), which trg_profiles_guard
--     permits an admin — and which let an admin suspend or demote THEMSELVES,
--     locking the last door to the console from the inside. That refusal lives
--     here, in the database, and every change is audit-logged.
--
--   admin_platform_stats()
--     The counts on the Overview tab.

-- ---------------------------------------------------------------------------
-- 1. Users
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_query  text default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id                uuid,
  full_name         text,
  email             text,
  created_at        timestamptz,
  is_suspended      boolean,
  is_super_admin    boolean,
  is_resident       boolean,
  managed_buildings integer,
  owns_business     boolean,
  clinic_staff      boolean,
  total_count       bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q     text := nullif(btrim(coalesce(p_query, '')), '');
  v_like  text;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can list users' using errcode = '42501';
  end if;

  -- The typed text is matched literally: % and _ are escaped, so "a_b" does
  -- not match "axb".
  if v_q is not null then
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select p.id,
         p.full_name,
         p.email,
         p.created_at,
         p.is_suspended,
         p.is_super_admin,
         (p.role = 'pet_owner'
          or exists (select 1 from public.pets pe where pe.owner_id = p.id and pe.deleted_at is null)
          or exists (select 1 from public.resident_links rl
                      where rl.profile_id = p.id and rl.status = 'approved')),
         (select count(*)::integer from public.building_managers bm where bm.profile_id = p.id),
         exists (select 1 from public.businesses b where b.owner_id = p.id),
         exists (select 1 from public.business_staff s where s.profile_id = p.id and s.is_active),
         count(*) over ()
    from public.profiles p
   where v_like is null
      or p.full_name ilike v_like
      or p.email ilike v_like
   order by p.created_at desc, p.id
   limit v_limit
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function public.admin_list_users(text, integer, integer) is
  'Admin console Users tab (20261012000002). is_admin() only. Profiles whose name or email contains p_query (case-insensitive, % and _ matched literally), newest first, at most 100 per page, each with the persona facts the console labels: resident (pet_owner role, an active pet or an approved building link), number of buildings managed, owns a business, active clinic staff. total_count is the match count before paging.';

revoke all on function public.admin_list_users(text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;

create or replace function public.admin_set_user_flags(
  p_profile     uuid,
  p_suspended   boolean default null,
  p_super_admin boolean default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me  uuid := auth.uid();
  v_row record;
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can change an account''s access' using errcode = '42501';
  end if;
  if p_suspended is null and p_super_admin is null then
    raise exception 'Nothing to change' using errcode = '22023';
  end if;
  if p_profile = v_me and (p_suspended is true or p_super_admin is false) then
    raise exception 'You can''t suspend or demote your own account'
      using errcode = '42501',
            hint    = 'Ask another admin. An admin locking themselves out could leave nobody able to undo it.';
  end if;

  select id, is_suspended, is_super_admin into v_row
    from public.profiles where id = p_profile for update;
  if not found then
    raise exception 'That account no longer exists' using errcode = 'P0002';
  end if;

  if p_suspended is not null and p_suspended is distinct from v_row.is_suspended then
    update public.profiles
       set is_suspended = p_suspended,
           suspended_at = case when p_suspended then now() else null end,
           suspended_by = case when p_suspended then v_me else null end
     where id = p_profile;
    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (v_me, case when p_suspended then 'user.suspended' else 'user.unsuspended' end,
            'profile', p_profile, jsonb_build_object('from', v_row.is_suspended, 'to', p_suspended));
  end if;

  if p_super_admin is not null and p_super_admin is distinct from v_row.is_super_admin then
    update public.profiles set is_super_admin = p_super_admin where id = p_profile;
    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (v_me, case when p_super_admin then 'user.admin_granted' else 'user.admin_revoked' end,
            'profile', p_profile, jsonb_build_object('from', v_row.is_super_admin, 'to', p_super_admin));
  end if;
end;
$$;

comment on function public.admin_set_user_flags(uuid, boolean, boolean) is
  'Admin console (20261012000002). is_admin() only. Sets is_suspended (stamping suspended_at / suspended_by) and/or is_super_admin on one profile; a null argument leaves that flag alone. Refuses an admin suspending or demoting themselves. Each actual change writes one audit_log row (user.suspended / user.unsuspended / user.admin_granted / user.admin_revoked).';

revoke all on function public.admin_set_user_flags(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_set_user_flags(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Overview
-- ---------------------------------------------------------------------------
create or replace function public.admin_platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can read platform statistics' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'users',              (select count(*) from public.profiles),
    'pets',               (select count(*) from public.pets where deleted_at is null),
    'buildings_active',   (select count(*) from public.buildings where archived_at is null),
    'buildings_archived', (select count(*) from public.buildings where archived_at is not null),
    'businesses_by_tier', coalesce((select jsonb_object_agg(tier, n)
                                      from (select tier::text as tier, count(*) as n
                                              from public.businesses group by tier) t), '{}'::jsonb),
    'incidents_30d',      (select count(*) from public.incident_reports
                            where created_at >= now() - interval '30 days'),
    'open_violations',    (select count(*) from public.violations
                            where stage not in ('resolved', 'dismissed')),
    'bookings_30d',       (select count(*) from public.service_bookings
                            where created_at >= now() - interval '30 days'),
    'ai_conversations_30d', (select count(*) from public.ai_conversations
                              where created_at >= now() - interval '30 days')
  );
end;
$$;

comment on function public.admin_platform_stats() is
  'Admin console Overview tab (20261012000002). is_admin() only. Platform counts: users, active pets, buildings active/archived, businesses by tier, incidents / bookings / AI conversations started in the last 30 days, open violations (stage not resolved or dismissed). AI conversations a person deleted still count — deletion removes their messages and title, not the fact one was started (20261012000003).';

revoke all on function public.admin_platform_stats() from public, anon;
grant execute on function public.admin_platform_stats() to authenticated;


-- ===== migration 20261012000003_ai_conversation_delete_purges.sql =====
-- Pet10x — Part F: deleting an AI conversation deletes what was said in it.
--
-- DELETE /api/ai/conversations/[id] used to stamp `deleted_at` and leave every
-- message, and the title derived from the first one, in the database until
-- the whole account was deleted. The Privacy Policy said exactly that. A
-- person who deletes a conversation about their pet's rash means the words,
-- not the list entry.
--
-- From now on the route deletes the conversation's ai_messages rows and
-- clears its title, keeping only a content-free row (id, profile, pet,
-- timestamps, deleted_at) so admin_platform_stats can still count that a
-- conversation was started. Nothing rate-limits on messages, so no counter is
-- lost with them.
--
-- This migration does the same once for every conversation deleted before the
-- route changed. Their photos were already removed at delete time.

delete from public.ai_messages m
 using public.ai_conversations c
 where c.id = m.conversation_id
   and c.deleted_at is not null;

update public.ai_conversations
   set title = null
 where deleted_at is not null
   and title is not null;


-- ===== migration 20261012000004_customer_cancel_booking.sql =====
-- Pet10x — Part F: a customer cancels a booking; they do not rewrite it.
--
-- `bookings_customer_update` (20260722000000) was `using (customer_id =
-- auth.uid()) with check (customer_id = auth.uid())` — every column, every
-- status. A customer could mark their own booking `paid` or `completed`, move
-- its time, or zero its amount, and the business's Earnings tab would believe
-- it. The only customer write the app makes is Cancel (my-bookings-screen →
-- cancelBooking); business-detail-screen only inserts.
--
-- So the policy goes and one door replaces it: customer_cancel_booking moves
-- the caller's own booking to `cancelled` from `requested` or `confirmed`, and
-- tells the business. notify_customer_of_booking_status (20261011000001) never
-- covered a cancellation — it speaks to the customer, about confirmed /
-- declined / completed — so the business heard nothing when a customer
-- cancelled. It hears now, from here.

drop policy if exists bookings_customer_update on public.service_bookings;

create or replace function public.customer_cancel_booking(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me      uuid := auth.uid();
  v_row     public.service_bookings%rowtype;
  v_owner   uuid;
  v_service text;
  v_who     text;
  v_when    text;
begin
  if v_me is null then
    raise exception 'Sign in to cancel a booking' using errcode = '42501';
  end if;

  select * into v_row from public.service_bookings where id = p_booking for update;
  if not found or v_row.customer_id is distinct from v_me then
    raise exception 'That booking isn''t yours' using errcode = '42501';
  end if;
  if v_row.status = 'cancelled' then
    return;
  end if;
  if v_row.status not in ('requested', 'confirmed') then
    raise exception 'This booking can''t be cancelled any more'
      using errcode = '22023',
            hint    = 'Only a requested or confirmed booking can be cancelled. Contact the business about the rest.';
  end if;

  update public.service_bookings set status = 'cancelled' where id = p_booking;

  select b.owner_id into v_owner from public.businesses b where b.id = v_row.business_id;
  if v_owner is null or v_owner = v_me then return; end if;
  if exists (select 1 from public.profiles where id = v_owner and is_suspended) then return; end if;

  select s.name into v_service from public.business_services s where s.id = v_row.service_id;
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_who
    from public.profiles where id = v_me;
  v_when := public.booking_when(v_row.scheduled_for, v_owner);

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target)
  values (
    v_owner,
    'appointment',
    'warning',
    'Booking cancelled' || coalesce(': ' || v_service, ''),
    coalesce(v_who, 'A customer') || ' cancelled'
      || case when v_row.status = 'confirmed' then ' their confirmed booking' else ' their booking request' end
      || coalesce(' for ' || v_service, '')
      || coalesce(' on ' || v_when, '') || '.',
    'Open bookings',
    'business:bookings'
  );
end;
$$;

comment on function public.customer_cancel_booking(uuid) is
  'The one customer write on service_bookings (20261012000004). Moves the caller''s own booking from requested or confirmed to cancelled — a repeat on a cancelled booking is a no-op — and notifies the business owner (kind appointment, target business:bookings). bookings_customer_update was dropped in the same migration.';

revoke all on function public.customer_cancel_booking(uuid) from public, anon;
grant execute on function public.customer_cancel_booking(uuid) to authenticated;


-- ===== migration 20261012000005_estimate_approved_target.sql =====
-- Pet10x — Part F: an approved estimate opens the practice's Billing tab.
--
-- The clinic console now has an inbox (components/notifications/console-inbox)
-- and a console target grammar of its own (`clinic:<tab>`, CLINIC_TABS in
-- lib/navigation.ts). owner_approve_estimate's notification to the practice
-- carried no target, so it could be read but led nowhere. The body below is
-- 20261010000001's, verbatim, with action_label and action_target added to the
-- one insert; nothing else changes. Grants are untouched by create or replace.

create or replace function public.owner_approve_estimate(p_invoice uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare inv record;
begin
  select i.*, p.owner_id, p.name as pet_name into inv from public.invoices i
    join public.clinic_patients cp on cp.id = i.patient_id
    join public.pets p on p.id = cp.pet_id
   where i.id = p_invoice;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if inv.owner_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if inv.kind <> 'estimate' then return jsonb_build_object('ok', false, 'error', 'not_an_estimate'); end if;
  if inv.status <> 'sent' then return jsonb_build_object('ok', false, 'error', 'not_awaiting_approval'); end if;
  update public.invoices set status = 'approved', owner_approved_at = now() where id = p_invoice;

  -- Part E (20261010000001): the practice's administrators — the business
  -- owner (whose own staff row may say `veterinarian`) and active
  -- owner/manager staff. `union` de-duplicates the owner who has both.
  insert into public.notifications (profile_id, kind, severity, title, body, action_label, action_target)
  select r.profile_id, 'clinic', 'success',
         'Estimate approved for ' || inv.pet_name,
         'The owner approved the ' || coalesce('estimate ' || inv.number, 'estimate') || ' for '
           || inv.pet_name || ' ('
           || to_char(inv.total_cents / 100.0, 'FM999,999,990.00') || ' ' || upper(inv.currency) || ').',
         'Open billing',
         'clinic:billing'
    from (
      select b.owner_id as profile_id from public.businesses b where b.id = inv.business_id
      union
      select s.profile_id from public.business_staff s
       where s.business_id = inv.business_id and s.is_active and s.role in ('owner', 'manager')
    ) r
    join public.profiles pr on pr.id = r.profile_id
   where not pr.is_suspended and r.profile_id <> auth.uid();

  return jsonb_build_object('ok', true);
end; $$;


-- ===== migration 20261012000006_user_flags_one_door.sql =====
-- Pet10x — Part F review: the account flags have one door, for admins too.
--
-- 20261012000002 put the self-lockout refusal and the audit row in
-- admin_set_user_flags, but `profiles_admin_all` still lets an admin PATCH
-- `profiles` over REST, and guard_profile_privilege (20260714000000) only asks
-- "is the caller an admin". So an admin could set is_super_admin /
-- is_suspended directly — on themselves included — and nothing was audited.
--
-- Now a change to is_super_admin, is_suspended, suspended_at or suspended_by
-- from a request that carries a JWT must carry the single-use transaction-
-- local token `pet10x.user_flags`, which only admin_set_user_flags mints,
-- immediately before each of its UPDATEs. The guard spends it on every pass
-- (the pet10x.post_counts / pet10x.stage_change pattern: a GUC set inside a
-- definer function outlives the function, so a token left standing would be a
-- mode, not a capability).
--
-- The guard is SECURITY DEFINER, so `current_user` inside it is its owner and
-- cannot tell a client from the system; it keeps its original test,
-- `auth.uid() is not null` — a request with a JWT. Service-role scripts and
-- the referential SET NULL of suspended_by (an account deletion, run by
-- GoTrue without a JWT) carry none and pass, as before. The role check is
-- copied verbatim from 20260714000000.

create or replace function public.guard_profile_privilege()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_token boolean;
begin
  v_token := pg_catalog.current_setting('pet10x.user_flags', true) is not distinct from 'ok';
  perform pg_catalog.set_config('pet10x.user_flags', '', true);

  if (new.role is distinct from old.role
      or new.is_super_admin is distinct from old.is_super_admin
      or new.is_suspended is distinct from old.is_suspended)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Not allowed to change role, admin flag, or suspension state';
  end if;

  if (new.is_super_admin is distinct from old.is_super_admin
      or new.is_suspended is distinct from old.is_suspended
      or new.suspended_at is distinct from old.suspended_at
      or new.suspended_by is distinct from old.suspended_by)
     and auth.uid() is not null and not v_token then
    raise exception 'Admin access and suspension change only through admin_set_user_flags'
      using errcode = '42501',
            hint    = 'Call admin_set_user_flags(p_profile, p_suspended, p_super_admin). It refuses self-lockout and writes the audit row.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_profile_privilege() from public, anon, authenticated;

create or replace function public.admin_set_user_flags(
  p_profile     uuid,
  p_suspended   boolean default null,
  p_super_admin boolean default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me  uuid := auth.uid();
  v_row record;
begin
  if not public.is_admin() then
    raise exception 'Only a Pet10x admin can change an account''s access' using errcode = '42501';
  end if;
  if p_suspended is null and p_super_admin is null then
    raise exception 'Nothing to change' using errcode = '22023';
  end if;
  if p_profile = v_me and (p_suspended is true or p_super_admin is false) then
    raise exception 'You can''t suspend or demote your own account'
      using errcode = '42501',
            hint    = 'Ask another admin. An admin locking themselves out could leave nobody able to undo it.';
  end if;

  select id, is_suspended, is_super_admin into v_row
    from public.profiles where id = p_profile for update;
  if not found then
    raise exception 'That account no longer exists' using errcode = 'P0002';
  end if;

  if p_suspended is not null and p_suspended is distinct from v_row.is_suspended then
    -- The single-use capability guard_profile_privilege requires (20261012000006).
    perform set_config('pet10x.user_flags', 'ok', true);
    update public.profiles
       set is_suspended = p_suspended,
           suspended_at = case when p_suspended then now() else null end,
           suspended_by = case when p_suspended then v_me else null end
     where id = p_profile;
    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (v_me, case when p_suspended then 'user.suspended' else 'user.unsuspended' end,
            'profile', p_profile, jsonb_build_object('from', v_row.is_suspended, 'to', p_suspended));
  end if;

  if p_super_admin is not null and p_super_admin is distinct from v_row.is_super_admin then
    perform set_config('pet10x.user_flags', 'ok', true);
    update public.profiles set is_super_admin = p_super_admin where id = p_profile;
    insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (v_me, case when p_super_admin then 'user.admin_granted' else 'user.admin_revoked' end,
            'profile', p_profile, jsonb_build_object('from', v_row.is_super_admin, 'to', p_super_admin));
  end if;
end;
$$;

revoke all on function public.admin_set_user_flags(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_set_user_flags(uuid, boolean, boolean) to authenticated;


-- ===== migration 20261012000007_anonymous_incident_audit.sql =====
-- Pet10x — Part F review: an anonymous report is anonymous in the audit log.
--
-- submit_incident_report already writes reporter_id = NULL when p_anonymous,
-- but its audit row wrote actor_id = auth.uid() regardless — and audit_select
-- lets the building's managers read actor_id. A signed-in resident who chose
-- "anonymous" was named to exactly the people they chose not to tell.
--
-- The function below is 20261008000004's, verbatim, except the audit insert's
-- actor_id. Then the rows already written are cleared: every incident.submitted
-- row whose report is_anonymous, or whose metadata says anonymous.

create or replace function public.submit_incident_report(
  p_building_code text,
  p_type          text,
  p_description   text,
  p_location      text default null,
  p_unit          text default null,
  p_anonymous     boolean default true,
  p_pet_id        uuid default null,
  p_evidence_paths text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_building uuid;
  v_ref      text;
  v_id       uuid;
  v_pet      uuid;
  v_path     text;
begin
  select id into v_building
  from public.buildings
  where upper(building_code) = upper(trim(p_building_code))
    and archived_at is null;  -- ARCHIVED (20261008000004)

  if v_building is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if coalesce(trim(p_description), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'description_required');
  end if;

  -- Evidence lands in guest-evidence under {buildingId}/{draftId}/{name},
  -- uploaded through a signed URL this building's code authorised. Anything
  -- with a different prefix was not ours to attach, and anything that can be
  -- normalised out of that folder is the same problem wearing a disguise.
  -- One anchored regex does both: exactly three segments, segment 1 the
  -- building, segment 2 a uuid, segment 3 starting alphanumeric. See the note
  -- at the top of this migration for why the character class alone is not it.
  if coalesce(cardinality(p_evidence_paths), 0) > 0 then
    if array_ndims(p_evidence_paths) > 1 then
      return jsonb_build_object('ok', false, 'error', 'bad_evidence_path');
    end if;
    if cardinality(p_evidence_paths) > 5 then
      return jsonb_build_object('ok', false, 'error', 'too_many_files');
    end if;
    foreach v_path in array p_evidence_paths loop
      if v_path is null or v_path !~ (
           '^' || v_building::text ||
           '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' ||
           '/[A-Za-z0-9][A-Za-z0-9._-]*$'
         ) then
        return jsonb_build_object('ok', false, 'error', 'bad_evidence_path');
      end if;
    end loop;
  end if;

  -- Only a pet that actually lives in this building. Silently dropped rather
  -- than rejected: a stale id should not lose someone's written report.
  if p_pet_id is not null then
    select p.id into v_pet
    from public.pets p
    where p.id = p_pet_id and p.building_id = v_building and p.deleted_at is null;
  end if;

  v_ref := 'IR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.incident_reports (
    building_id, reporter_id, is_anonymous, type, description,
    location_text, unit_involved, pet_id, status, reference_code,
    evidence_paths
  )
  values (
    v_building,
    case when p_anonymous then null else auth.uid() end,
    p_anonymous,
    p_type::incident_type,
    trim(p_description),
    nullif(trim(coalesce(p_location, '')), ''),
    nullif(trim(coalesce(p_unit, '')), ''),
    v_pet,
    'submitted',
    v_ref,
    -- The column is NOT NULL DEFAULT '{}', and an explicit null argument would
    -- reach it as null rather than falling back to the default.
    coalesce(p_evidence_paths, '{}')
  )
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  -- 20261012000007: an anonymous report names nobody here either.
  values (case when p_anonymous then null else auth.uid() end,
          'incident.submitted', 'incident_report', v_id, v_building,
          jsonb_build_object('anonymous', p_anonymous, 'reference', v_ref,
                             'pet_identified', v_pet is not null,
                             'evidence_count', coalesce(cardinality(p_evidence_paths), 0)));

  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$function$;

update public.audit_log a
   set actor_id = null
 where a.action = 'incident.submitted'
   and a.actor_id is not null
   and (coalesce((a.metadata ->> 'anonymous')::boolean, false)
        or exists (select 1 from public.incident_reports ir
                    where ir.id = a.entity_id and ir.is_anonymous));


-- ===== migration 20261012000008_booking_insert_guard.sql =====
-- Pet10x — Part F review: a customer books; they do not write the booking.
--
-- `bookings_insert` checks only customer_id = auth.uid(). Every other column
-- was the customer's to choose: a booking could be inserted already
-- `completed` or `paid`, at any amount, with a response time — poisoning the
-- business's Earnings tab and unlocking the "after a completed booking"
-- review. 20261012000004 closed the UPDATE path; this closes the INSERT one.
--
-- For a client caller (`authenticated` / `anon` — this function is SECURITY
-- INVOKER, so current_user is the caller; service role and definer RPCs are
-- trusted, as in 20261007000002) the row is REWRITTEN, not checked, so there
-- is no value a caller can offer that survives:
--   status            'requested'
--   responded_at, payment_id, declined_reason   NULL
--   amount_cents, currency   from the booked business_services row, which
--                     must belong to the booked business and be active
--   commission_cents  15% of that (lib/data/bookings.ts COMMISSION_RATE)
--   amount_cents      0 when no service is named
-- createBooking already sends exactly these values, so nothing changes for
-- the app.

create or replace function public.service_bookings_insert_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
declare
  v_price    integer;
  v_currency text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.service_id is not null then
    select s.price_cents, s.currency into v_price, v_currency
      from public.business_services s
     where s.id = new.service_id and s.business_id = new.business_id and s.active;
    if not found then
      raise exception 'That service isn''t available to book'
        using errcode = '22023',
              hint    = 'The service must belong to the business you are booking and be active.';
    end if;
  end if;

  new.status           := 'requested';
  new.responded_at     := null;
  new.payment_id       := null;
  new.declined_reason  := null;
  new.amount_cents     := coalesce(v_price, 0);
  new.currency         := coalesce(v_currency, new.currency, 'cad');
  new.commission_cents := round(coalesce(v_price, 0) * 0.15)::integer;
  return new;
end;
$guard$;

comment on function public.service_bookings_insert_guard() is
  'BEFORE INSERT on service_bookings (20261012000008). For authenticated/anon callers, rewrites status to requested, clears responded_at / payment_id / declined_reason, and sets amount_cents, currency and commission_cents (15%) from the booked, active business_services row of the same business (0 with no service). Refuses a service that is not that business''s or not active (22023). Service role and definer RPCs pass untouched.';

revoke all on function public.service_bookings_insert_guard() from public, anon, authenticated;

drop trigger if exists trg_service_bookings_insert_guard on public.service_bookings;
create trigger trg_service_bookings_insert_guard
  before insert on public.service_bookings
  for each row execute function public.service_bookings_insert_guard();


-- ===== migration 20261012000009_booking_status_notify_former_customer.sql =====
-- A booking whose customer deleted their account can still be answered.
--
-- 20261012000001 made service_bookings.customer_id ON DELETE SET NULL, so a
-- booking survives its customer's account deletion with no customer. The
-- status trigger from 20261011000001 then inserted a notification with a NULL
-- profile_id, which notifications.profile_id (NOT NULL) refuses — so the
-- business's confirm / decline / complete failed outright on that booking.
--
-- Copied verbatim from 20261011000001 with one change: a booking with no
-- customer has nobody to tell, so the trigger returns before notifying. The
-- comment about bookings_customer_update is also updated — that policy was
-- dropped in 20261012000004 and customers now cancel through
-- customer_cancel_booking, so a customer never moves a booking to one of the
-- three statuses below; the auth.uid() check stays as a belt.

create or replace function public.notify_customer_of_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_biz     text;
  v_service text;
  v_when    text;
  v_reason  text;
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status not in ('confirmed', 'declined', 'completed') then return null; end if;
  /* A booking whose customer deleted their account has nobody to tell. */
  if new.customer_id is null then return null; end if;
  /* Customers no longer write their own row (customer_cancel_booking is the
     only door, and it only cancels), but a customer who somehow changes it
     has nothing to be told about. */
  if auth.uid() is not null and auth.uid() = new.customer_id then return null; end if;
  if exists (select 1 from public.profiles where id = new.customer_id and is_suspended) then return null; end if;

  select b.name into v_biz from public.businesses b where b.id = new.business_id;
  select s.name into v_service from public.business_services s where s.id = new.service_id;
  v_when := public.booking_when(new.scheduled_for, new.customer_id);
  v_reason := nullif(trim(coalesce(new.declined_reason, '')), '');

  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target)
  values (
    new.customer_id,
    'appointment',
    case new.status when 'declined' then 'warning' else 'success' end,
    case new.status
      when 'confirmed' then 'Booking confirmed'
      when 'declined'  then 'Booking declined'
      else 'Booking completed'
    end || coalesce(' — ' || v_biz, ''),
    case new.status
      when 'confirmed' then coalesce(v_biz, 'The business') || ' confirmed your booking'
                            || coalesce(' for ' || v_service, '') || coalesce(' on ' || v_when, '') || '.'
      when 'declined'  then coalesce(v_biz, 'The business') || ' could not take your booking'
                            || coalesce(' for ' || v_service, '') || '.'
                            || coalesce(' Reason: ' || left(v_reason, 200), '')
      else coalesce(v_biz, 'The business') || ' marked your booking'
           || coalesce(' for ' || v_service, '') || ' as completed. You can leave a review.'
    end,
    'My bookings',
    'my-bookings'
  );
  return null;
end;
$$;

revoke all on function public.notify_customer_of_booking_status() from public, anon, authenticated;


-- ===== migration 20261014000001_pet_child_tables_manager_read_only.sql =====
-- Pet10x — a building's manager reads a pet's records and writes none of them.
--
-- 20260601000001 said it in a comment: "child tables: read = owner|manager|
-- admin ; write = owner|admin (managers read-only)". It wrote each table's rule
-- as ONE `for all` policy whose USING admits the manager and whose WITH CHECK
-- does not. WITH CHECK guards only the row a write PRODUCES, so:
--
--   INSERT   refused for a manager (WITH CHECK)            as intended
--   UPDATE   refused for a manager (WITH CHECK on new row)  as intended
--   DELETE   ALLOWED — a delete produces no row, so only USING is consulted
--
-- A manager could delete any resident's vaccination, document, medication,
-- vet visit, photo or care log in their building from the browser. Found while
-- running the Part B checks on 2026-10-14; the same shape is on every table
-- below, which are all the `for all` policies in `public` whose USING differs
-- from their WITH CHECK, and each is the table's only policy.
--
-- THE GRAMMAR, per table, replacing `<table>_rw`:
--   select   owner | manager of the pet's building | admin
--   insert   owner | admin
--   update   owner | admin   (USING and WITH CHECK both)
--   delete   owner | admin
--
-- Every client write to these tables is the owner's own (lib/data/live.ts,
-- lib/data/care-schedule.ts). Manager verdicts go through SECURITY DEFINER
-- functions (manager_review_pet_document, …), which RLS does not see. Deleting a
-- pet cascades through foreign keys, which RLS does not see either.
--
-- The replaced policy is checked before it is dropped: if a table's `_rw`
-- policy is not the exact owner|manager|admin / owner|admin pair this was
-- written against, the migration stops rather than replace something unseen.

do $$
declare
  t text;
  v_qual text;
  v_check text;
  v_read  constant text := '(EXISTS ( SELECT 1
   FROM pets p
  WHERE ((p.id = %1$I.pet_id) AND ((p.owner_id = auth.uid()) OR manages_building(p.building_id) OR is_admin()))))';
  v_write constant text := '(EXISTS ( SELECT 1
   FROM pets p
  WHERE ((p.id = %1$I.pet_id) AND ((p.owner_id = auth.uid()) OR is_admin()))))';
begin
  foreach t in array array[
    'care_entries', 'care_targets', 'pet_activity', 'pet_care_tasks',
    'pet_documents', 'pet_emergency_contacts', 'pet_feeding', 'pet_medications',
    'pet_photos', 'pet_vaccinations', 'pet_vet_visits'
  ] loop
    select qual, with_check into v_qual, v_check
      from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = t and policyname = t || '_rw' and cmd = 'ALL';

    if not found then
      raise exception 'policy public.%._rw not found; nothing was replaced', t;
    end if;
    if v_qual <> pg_catalog.format(v_read, t) or v_check <> pg_catalog.format(v_write, t) then
      raise exception 'policy public.%._rw is not the owner|manager|admin / owner|admin pair; nothing was replaced', t
        using detail = pg_catalog.format('USING %s WITH CHECK %s', v_qual, v_check);
    end if;

    execute pg_catalog.format('drop policy %I on public.%I', t || '_rw', t);

    execute pg_catalog.format($p$
      create policy %1$I on public.%2$I for select using (
        exists (select 1 from public.pets p where p.id = %2$I.pet_id
                and (p.owner_id = auth.uid() or public.manages_building(p.building_id) or public.is_admin())))
    $p$, t || '_select', t);

    execute pg_catalog.format($p$
      create policy %1$I on public.%2$I for insert with check (
        exists (select 1 from public.pets p where p.id = %2$I.pet_id
                and (p.owner_id = auth.uid() or public.is_admin())))
    $p$, t || '_insert', t);

    execute pg_catalog.format($p$
      create policy %1$I on public.%2$I for update using (
        exists (select 1 from public.pets p where p.id = %2$I.pet_id
                and (p.owner_id = auth.uid() or public.is_admin())))
      with check (
        exists (select 1 from public.pets p where p.id = %2$I.pet_id
                and (p.owner_id = auth.uid() or public.is_admin())))
    $p$, t || '_update', t);

    execute pg_catalog.format($p$
      create policy %1$I on public.%2$I for delete using (
        exists (select 1 from public.pets p where p.id = %2$I.pet_id
                and (p.owner_id = auth.uid() or public.is_admin())))
    $p$, t || '_delete', t);
  end loop;
end $$;


-- Record them, so the Supabase CLI / MCP know they are applied.
do $$ begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    insert into supabase_migrations.schema_migrations (version, name) values ('20261007000001', 'owner_archive_pet') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261007000002', 'pet_archive_guard_and_publish') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261008000001', 'manager_set_fine_status') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261008000002', 'manager_municipal_reports') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261008000003', 'manager_review_pet_document') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261008000004', 'building_archive') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261008000005', 'municipal_area_summary') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261008000006', 'pet_documents_verdict_guard') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261008000007', 'building_archive_followups') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261009000001', 'pending_signup_intent') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261009000002', 'admin_business_tier') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261009000003', 'part_c_review_fixes') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261010000001', 'owner_bills') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261010000002', 'business_staff_guard') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261011000001', 'notify_incidents_and_bookings') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261011000002', 'notification_delivery') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261011000003', 'reminder_rules_no_sms') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261011000004', 'reminder_rules_sms_trigger') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261011000005', 'notification_email_failed') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261012000001', 'account_deletion_set_null') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261012000002', 'admin_users_and_stats') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261012000003', 'ai_conversation_delete_purges') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261012000004', 'customer_cancel_booking') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261012000005', 'estimate_approved_target') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261012000006', 'user_flags_one_door') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261012000007', 'anonymous_incident_audit') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261012000008', 'booking_insert_guard') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261012000009', 'booking_status_notify_former_customer') on conflict (version) do nothing;
    insert into supabase_migrations.schema_migrations (version, name) values ('20261014000001', 'pet_child_tables_manager_read_only') on conflict (version) do nothing;
  end if;
end $$;
commit;
