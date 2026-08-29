-- Pet10x — Veterinary platform, part 3 of 6: scheduling and daily operations.
--
-- The calendar is the product. It is what a practice opens at 8am and closes
-- at 6pm, and if it is not better than the paper book they are using, nothing
-- else matters.
--
-- The appointment lifecycle is enforced by a function with an explicit
-- transition table, not by which buttons happen to render. The diligence
-- review found five state machines in this codebase enforced only in the
-- interface and one product bug that fell straight out of that; appointments
-- start on the right side of that line.

do $$ begin
  create type public.appointment_status as enum
    ('requested','booked','arrived','in_progress','ready','completed','no_show','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  duration_min integer not null default 30 check (duration_min between 5 and 600),
  price_cents integer not null default 0 check (price_cents >= 0),
  colour text not null default '#0E6E68',
  description text,
  species public.pet_species[] not null default '{}',
  is_online_bookable boolean not null default false,
  requires_confirmation boolean not null default true,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists appt_types_business_idx on public.appointment_types(business_id);

create table if not exists public.clinic_resources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete cascade,
  name text not null,
  kind text not null default 'room' check (kind in ('room','theatre','bay','kennel','equipment')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists clinic_resources_business_idx on public.clinic_resources(business_id);

create table if not exists public.staff_availability (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid not null references public.business_staff(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists staff_avail_staff_idx on public.staff_availability(staff_id);

create table if not exists public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid not null references public.business_staff(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists staff_time_off_staff_idx on public.staff_time_off(staff_id);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  customer_id uuid references public.clinic_customers(id) on delete set null,
  patient_id uuid references public.clinic_patients(id) on delete set null,
  staff_id uuid references public.business_staff(id) on delete set null,
  resource_id uuid references public.clinic_resources(id) on delete set null,
  type_id uuid references public.appointment_types(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'booked',
  reason text,
  note text,
  source text not null default 'staff' check (source in ('staff','online','walk_in','recall','waitlist')),
  booked_by uuid references public.profiles(id) on delete set null,
  arrived_at timestamptz,
  started_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists appts_business_start_idx on public.appointments(business_id, starts_at);
create index if not exists appts_location_start_idx on public.appointments(location_id, starts_at);
create index if not exists appts_staff_start_idx on public.appointments(staff_id, starts_at);
create index if not exists appts_patient_idx on public.appointments(patient_id);
create index if not exists appts_customer_idx on public.appointments(customer_id);
create index if not exists appts_open_idx on public.appointments(business_id, status)
  where status in ('requested','booked','arrived','in_progress','ready');

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.clinic_customers(id) on delete cascade,
  patient_id uuid references public.clinic_patients(id) on delete cascade,
  type_id uuid references public.appointment_types(id) on delete set null,
  earliest_on date,
  latest_on date,
  note text,
  status text not null default 'waiting' check (status in ('waiting','offered','booked','expired','cancelled')),
  offered_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists waitlist_business_idx on public.waitlist_entries(business_id, status);

-- ---------------------------------------------------------------------------
-- Visits — what the practice did. A SERVICE record, not a clinical chart.
-- ---------------------------------------------------------------------------
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  customer_id uuid references public.clinic_customers(id) on delete set null,
  patient_id uuid not null references public.clinic_patients(id) on delete cascade,
  staff_id uuid references public.business_staff(id) on delete set null,
  visited_on date not null default current_date,
  reason text,
  summary text,
  internal_note text,
  weight_grams integer,
  temperature_c numeric(4,1),
  next_due_on date,
  next_due_reason text,
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists visits_business_idx on public.visits(business_id, visited_on desc);
create index if not exists visits_patient_idx on public.visits(patient_id, visited_on desc);
create index if not exists visits_appointment_idx on public.visits(appointment_id);

create table if not exists public.visit_services (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists visit_services_visit_idx on public.visit_services(visit_id);

-- Vaccinations given at the practice. These drive reminders and are the
-- records handed back to owners in part 5.
create table if not exists public.patient_vaccinations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  patient_id uuid not null references public.clinic_patients(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,
  name text not null,
  product text,
  batch text,
  given_on date not null default current_date,
  expires_on date,
  administered_by uuid references public.business_staff(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists patient_vax_patient_idx on public.patient_vaccinations(patient_id, given_on desc);
create index if not exists patient_vax_due_idx on public.patient_vaccinations(business_id, expires_on)
  where expires_on is not null;

create table if not exists public.visit_attachments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete cascade,
  patient_id uuid not null references public.clinic_patients(id) on delete cascade,
  label text,
  storage_path text not null,
  mime_type text,
  size_bytes integer,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists visit_attach_patient_idx on public.visit_attachments(patient_id);

-- ---------------------------------------------------------------------------
-- Tasks and the communication log
-- ---------------------------------------------------------------------------
create table if not exists public.clinic_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  detail text,
  due_on date,
  assigned_to uuid references public.business_staff(id) on delete set null,
  customer_id uuid references public.clinic_customers(id) on delete set null,
  patient_id uuid references public.clinic_patients(id) on delete set null,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  done_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists clinic_tasks_open_idx on public.clinic_tasks(business_id, status, due_on);

create table if not exists public.communication_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.clinic_customers(id) on delete cascade,
  patient_id uuid references public.clinic_patients(id) on delete set null,
  channel text not null check (channel in ('call','email','sms','app','in_person','note')),
  direction text not null default 'out' check (direction in ('in','out')),
  subject text,
  body text,
  outcome text check (outcome in ('reached','no_answer','left_message','booked','declined','sent','failed')),
  staff_id uuid references public.business_staff(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists comm_log_customer_idx on public.communication_log(customer_id, occurred_at desc);
create index if not exists comm_log_business_idx on public.communication_log(business_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Appointment transitions — the rule lives here, not in the screen.
-- ---------------------------------------------------------------------------
create or replace function public.clinic_set_appointment_status(
  p_appointment uuid, p_status public.appointment_status, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a record; ok boolean := false;
begin
  select * into a from public.appointments where id = p_appointment for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not public.staff_of_business(a.business_id) and not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if a.status = p_status then return jsonb_build_object('ok', true, 'status', p_status); end if;

  ok := case a.status
    when 'requested'  then p_status in ('booked','cancelled')
    when 'booked'     then p_status in ('arrived','no_show','cancelled')
    when 'arrived'    then p_status in ('in_progress','cancelled','no_show')
    when 'in_progress' then p_status in ('ready','completed')
    when 'ready'      then p_status in ('completed','in_progress')
    when 'no_show'    then p_status in ('booked','cancelled')
    else false end;
  if not ok then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition',
      'from', a.status, 'to', p_status);
  end if;

  update public.appointments set
    status = p_status,
    arrived_at   = case when p_status = 'arrived'     then now() else arrived_at end,
    started_at   = case when p_status = 'in_progress' then coalesce(started_at, now()) else started_at end,
    ready_at     = case when p_status = 'ready'       then now() else ready_at end,
    completed_at = case when p_status = 'completed'   then now() else completed_at end,
    cancelled_at = case when p_status = 'cancelled'   then now() else cancelled_at end,
    cancel_reason = case when p_status in ('cancelled','no_show') then coalesce(p_note, cancel_reason) else cancel_reason end
  where id = p_appointment;

  return jsonb_build_object('ok', true, 'status', p_status);
end; $$;
revoke all on function public.clinic_set_appointment_status(uuid, public.appointment_status, text) from public, anon;
grant execute on function public.clinic_set_appointment_status(uuid, public.appointment_status, text) to authenticated;

-- Completing an appointment opens the visit record it produced.
create or replace function public.clinic_open_visit(p_appointment uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a record; v_id uuid;
begin
  select * into a from public.appointments where id = p_appointment;
  if not found then raise exception 'not_found'; end if;
  if not public.staff_of_business(a.business_id) then raise exception 'forbidden'; end if;
  select id into v_id from public.visits where appointment_id = p_appointment limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.visits (business_id, appointment_id, customer_id, patient_id, staff_id,
                             visited_on, reason, created_by)
  values (a.business_id, a.id, a.customer_id, a.patient_id, a.staff_id,
          (a.starts_at at time zone 'UTC')::date, a.reason, auth.uid())
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.clinic_open_visit(uuid) from public, anon;
grant execute on function public.clinic_open_visit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists trg_appt_types_updated on public.appointment_types;
create trigger trg_appt_types_updated before update on public.appointment_types
  for each row execute function public.set_updated_at();
drop trigger if exists trg_appts_updated on public.appointments;
create trigger trg_appts_updated before update on public.appointments
  for each row execute function public.set_updated_at();
drop trigger if exists trg_visits_updated on public.visits;
create trigger trg_visits_updated before update on public.visits
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — one shape, repeated: staff of the business, or an admin.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['appointment_types','clinic_resources','staff_availability','staff_time_off',
                           'appointments','waitlist_entries','visits','visit_services',
                           'patient_vaccinations','visit_attachments','clinic_tasks','communication_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format(
      'create policy %I on public.%I for all using (public.staff_of_business(business_id) or public.is_admin()) with check (public.staff_of_business(business_id) or public.is_admin())',
      t || '_staff', t);
  end loop;
end $$;

-- Owners see their own appointments and the visits recorded about their pet.
drop policy if exists appts_owner_read on public.appointments;
create policy appts_owner_read on public.appointments for select
  using (exists (select 1 from public.clinic_patients cp join public.pets p on p.id = cp.pet_id
                 where cp.id = appointments.patient_id and p.owner_id = auth.uid()));

drop policy if exists visits_owner_read on public.visits;
create policy visits_owner_read on public.visits for select
  using (exists (select 1 from public.clinic_patients cp join public.pets p on p.id = cp.pet_id
                 where cp.id = visits.patient_id and p.owner_id = auth.uid()));

drop policy if exists appt_types_public_read on public.appointment_types;
create policy appt_types_public_read on public.appointment_types for select
  using (is_active and is_online_bookable and public.business_is_public(business_id));
