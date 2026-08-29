-- Pet10x — Veterinary platform, part 4 of 6: reminders and recalls.
--
-- "reminders for them when they need vaccinations or medical so i can call or
-- send them notifications to come and see the shop" — two verbs, call and
-- send, and both are served equally. The call list is a first-class surface,
-- not a fallback behind a bulk-email screen: working a call list is a real job
-- in a practice.
--
-- Suppression is aggressive by default. A vaccination reminder for an animal
-- that died last month is the fastest way to lose a family.

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  kind text not null default 'reminder'
    check (kind in ('reminder','appointment_confirm','appointment_remind','follow_up','marketing')),
  channel text not null default 'app' check (channel in ('app','email','sms','call')),
  subject text,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists msg_templates_business_idx on public.message_templates(business_id);

create table if not exists public.reminder_rules (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  trigger_kind text not null
    check (trigger_kind in ('vaccination_due','visit_follow_up','annual_check','lapsed_customer')),
  -- How many days BEFORE the due date the item should appear in the queue.
  lead_days integer not null default 14 check (lead_days between 0 and 365),
  -- For lapsed_customer: how long since the last visit counts as lapsed.
  lapse_days integer not null default 400 check (lapse_days between 30 and 2000),
  channel text not null default 'app' check (channel in ('app','email','sms','call')),
  template_id uuid references public.message_templates(id) on delete set null,
  -- Do not contact the same household about the same thing more often than this.
  cooldown_days integer not null default 14 check (cooldown_days between 1 and 365),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reminder_rules_business_idx on public.reminder_rules(business_id);

create table if not exists public.reminder_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  rule_id uuid references public.reminder_rules(id) on delete set null,
  customer_id uuid references public.clinic_customers(id) on delete cascade,
  patient_id uuid references public.clinic_patients(id) on delete cascade,
  kind text not null,
  label text not null,
  due_on date not null,
  status text not null default 'pending'
    check (status in ('pending','sent','snoozed','booked','done','suppressed')),
  channel text not null default 'app',
  snoozed_until date,
  sent_at timestamptz,
  notification_id uuid references public.notifications(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  source_kind text,
  source_id uuid,
  note text,
  handled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reminder_items_queue_idx
  on public.reminder_items(business_id, status, due_on);
create index if not exists reminder_items_patient_idx on public.reminder_items(patient_id);
-- One open item per patient per source, so re-running the generator is safe.
create unique index if not exists reminder_items_source_uniq
  on public.reminder_items(business_id, patient_id, kind, coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('pending','snoozed');

drop trigger if exists trg_msg_templates_updated on public.message_templates;
create trigger trg_msg_templates_updated before update on public.message_templates
  for each row execute function public.set_updated_at();
drop trigger if exists trg_reminder_rules_updated on public.reminder_rules;
create trigger trg_reminder_rules_updated before update on public.reminder_rules
  for each row execute function public.set_updated_at();
drop trigger if exists trg_reminder_items_updated on public.reminder_items;
create trigger trg_reminder_items_updated before update on public.reminder_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- The generator. Idempotent: re-running it never duplicates an open item.
-- ---------------------------------------------------------------------------
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
                  where cp.id = ri.patient_id and (cp.is_deceased or not cp.is_active));

  -- Suppress where the household opted out of service reminders.
  update public.reminder_items ri set status = 'suppressed', note = 'opted out'
   where ri.business_id = p_business and ri.status in ('pending','snoozed')
     and exists (select 1 from public.clinic_customers c
                  where c.id = ri.customer_id and not c.service_reminders);

  return jsonb_build_object('ok', true, 'scanned', n_seen, 'created', n_created);
end; $$;
revoke all on function public.clinic_generate_reminders(uuid) from public, anon;
grant execute on function public.clinic_generate_reminders(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Working the queue. One action, every outcome, and every attempt logged.
-- ---------------------------------------------------------------------------
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
     where cp.id = it.patient_id;
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

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['message_templates','reminder_rules','reminder_items']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format(
      'create policy %I on public.%I for all using (public.staff_of_business(business_id) or public.is_admin()) with check (public.staff_of_business(business_id) or public.is_admin())',
      t || '_staff', t);
  end loop;
end $$;
