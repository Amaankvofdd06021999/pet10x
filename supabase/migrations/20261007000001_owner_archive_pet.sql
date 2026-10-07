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
