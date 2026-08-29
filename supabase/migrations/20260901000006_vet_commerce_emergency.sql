-- Pet10x — Veterinary platform, part 6 of 6: shop, money, emergency, and the
-- online booking surface that makes a Pet10x customer worth more than a
-- walk-in.
--
-- Invoicing goes through a function with a transition table from the first
-- commit. Booking money is client-controlled elsewhere in this codebase — the
-- update policies carry no column list, so a customer can set their own
-- booking to paid — and a practice invoicing real treatment must not inherit
-- that.

-- ---------------------------------------------------------------------------
-- Shop
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sku text,
  name text not null,
  category text,
  unit text default 'each',
  price_cents integer not null default 0 check (price_cents >= 0),
  cost_cents integer,
  reorder_point numeric(10,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_business_idx on public.products(business_id) where is_active;

create table if not exists public.stock_levels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete cascade,
  quantity numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (product_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Money. An estimate and an invoice are the same shape at different stages.
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references public.clinic_customers(id) on delete set null,
  patient_id uuid references public.clinic_patients(id) on delete set null,
  visit_id uuid references public.visits(id) on delete set null,
  kind text not null default 'invoice' check (kind in ('estimate','invoice')),
  number text,
  status text not null default 'draft'
    check (status in ('draft','sent','approved','paid','void')),
  currency text not null default 'cad',
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  paid_cents integer not null default 0,
  issued_on date,
  due_on date,
  note text,
  owner_approved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoices_business_idx on public.invoices(business_id, created_at desc);
create index if not exists invoices_customer_idx on public.invoices(customer_id);
create index if not exists invoices_unpaid_idx on public.invoices(business_id, status)
  where status in ('sent','approved');

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  created_at timestamptz not null default now()
);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines(invoice_id);

-- Totals are derived, never trusted from a client.
create or replace function public.invoice_recalc()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_invoice uuid; v_sub integer;
begin
  v_invoice := coalesce(new.invoice_id, old.invoice_id);
  select coalesce(sum(round(quantity * unit_price_cents)), 0)::integer into v_sub
    from public.invoice_lines where invoice_id = v_invoice;
  update public.invoices
     set subtotal_cents = v_sub, total_cents = v_sub + tax_cents, updated_at = now()
   where id = v_invoice;
  return coalesce(new, old);
end; $$;
drop trigger if exists trg_invoice_lines_recalc on public.invoice_lines;
create trigger trg_invoice_lines_recalc after insert or update or delete on public.invoice_lines
  for each row execute function public.invoice_recalc();

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
  return jsonb_build_object('ok', true, 'status', p_status);
end; $$;
revoke all on function public.clinic_set_invoice_status(uuid, text, integer) from public, anon;
grant execute on function public.clinic_set_invoice_status(uuid, text, integer) to authenticated;

-- An owner approves an estimate before treatment starts.
create or replace function public.owner_approve_estimate(p_invoice uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare inv record;
begin
  select i.*, p.owner_id into inv from public.invoices i
    join public.clinic_patients cp on cp.id = i.patient_id
    join public.pets p on p.id = cp.pet_id
   where i.id = p_invoice;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if inv.owner_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if inv.status <> 'sent' then return jsonb_build_object('ok', false, 'error', 'not_awaiting_approval'); end if;
  update public.invoices set status = 'approved', owner_approved_at = now() where id = p_invoice;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.owner_approve_estimate(uuid) from public, anon;
grant execute on function public.owner_approve_estimate(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Emergency
-- ---------------------------------------------------------------------------
create table if not exists public.on_call_shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete cascade,
  staff_id uuid references public.business_staff(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  phone text,
  note text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists on_call_window_idx on public.on_call_shifts(business_id, starts_at, ends_at);

create table if not exists public.emergency_arrivals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete set null,
  pet_id uuid references public.pets(id) on delete set null,
  patient_id uuid references public.clinic_patients(id) on delete set null,
  reported_by uuid references public.profiles(id) on delete set null,
  pet_name text,
  species public.pet_species,
  weight_grams integer,
  allergies text,
  problem text not null,
  triage_level text not null default 'urgent' check (triage_level in ('emergency','urgent','routine')),
  eta_minutes integer,
  contact_phone text,
  status text not null default 'incoming'
    check (status in ('incoming','arrived','handled','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists emerg_arrivals_open_idx on public.emergency_arrivals(business_id, status, created_at desc);

create table if not exists public.emergency_pulls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_profile_id uuid references public.profiles(id) on delete set null,
  pet_id uuid not null references public.pets(id) on delete cascade,
  reason text not null,
  pulled_at timestamptz not null default now(),
  owner_notified_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_outcome text check (review_outcome in ('legitimate','questionable','abuse'))
);
create index if not exists emerg_pulls_business_idx on public.emergency_pulls(business_id, pulled_at desc);
create index if not exists emerg_pulls_review_idx on public.emergency_pulls(pulled_at desc) where reviewed_at is null;

-- Break-glass. Narrow projection, mandatory reason, owner told at once.
create or replace function public.clinic_emergency_pull(
  p_business uuid, p_pet uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pet record; v_owner record; v_biz text; v_recent integer;
begin
  if not public.staff_of_business(p_business) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if public.business_tier_of(p_business) <> 'verified' then
    return jsonb_build_object('ok', false, 'error', 'not_verified');
  end if;
  if not public.can_read_shared_records(p_business) then
    return jsonb_build_object('ok', false, 'error', 'role_not_permitted');
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  select count(*) into v_recent from public.emergency_pulls
   where business_id = p_business and pulled_at > now() - interval '24 hours';
  if v_recent >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select p.id, p.name, p.species, p.breed, p.sex, p.dob, p.color, p.weight_grams,
         p.allergies, p.conditions, p.medications_notes, p.owner_id
    into v_pet from public.pets p where p.id = p_pet and p.deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  select pr.full_name, pr.phone into v_owner from public.profiles pr where pr.id = v_pet.owner_id;
  select name into v_biz from public.businesses where id = p_business;

  insert into public.emergency_pulls (business_id, staff_profile_id, pet_id, reason, owner_notified_at)
  values (p_business, auth.uid(), p_pet, btrim(p_reason), now());

  insert into public.record_access_log (business_id, staff_profile_id, pet_id, scopes, basis)
  values (p_business, auth.uid(), p_pet, array['identity','health_notes'], 'emergency');

  insert into public.notifications (profile_id, kind, severity, title, body, action_target)
  values (v_pet.owner_id, 'clinic', 'warning',
          'Emergency access to ' || v_pet.name || '''s records',
          coalesce(v_biz,'A veterinary practice') ||
          ' opened emergency access to essential details for ' || v_pet.name ||
          '. Reason given: ' || btrim(p_reason) || '. If this was not expected, contact us.',
          'my-vets');

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'records.emergency_pull', 'pet', p_pet,
          jsonb_build_object('business_id', p_business, 'reason', btrim(p_reason)));

  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'name', v_pet.name, 'species', v_pet.species, 'breed', v_pet.breed, 'sex', v_pet.sex,
    'dob', v_pet.dob, 'colour', v_pet.color, 'weight_grams', v_pet.weight_grams,
    'allergies', v_pet.allergies, 'conditions', v_pet.conditions,
    'medications_notes', v_pet.medications_notes,
    'owner_name', v_owner.full_name, 'owner_phone', v_owner.phone));
end; $$;
revoke all on function public.clinic_emergency_pull(uuid, uuid, text) from public, anon;
grant execute on function public.clinic_emergency_pull(uuid, uuid, text) to authenticated;

-- "Tell them I am coming" — one tap from the owner's emergency card.
create or replace function public.owner_notify_arrival(
  p_business uuid, p_pet uuid, p_problem text, p_eta_minutes integer default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pet record; v_patient uuid; v_loc uuid; v_id uuid; v_phone text;
begin
  select p.* into v_pet from public.pets p
   where p.id = p_pet and p.owner_id = auth.uid() and p.deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_your_pet'); end if;
  if not public.business_is_public(p_business) then
    return jsonb_build_object('ok', false, 'error', 'clinic_unavailable');
  end if;
  select id into v_patient from public.clinic_patients
   where business_id = p_business and pet_id = p_pet limit 1;
  select id into v_loc from public.business_locations
   where business_id = p_business and is_primary limit 1;
  select phone into v_phone from public.profiles where id = auth.uid();

  insert into public.emergency_arrivals
    (business_id, location_id, pet_id, patient_id, reported_by, pet_name, species,
     weight_grams, allergies, problem, triage_level, eta_minutes, contact_phone)
  values (p_business, v_loc, p_pet, v_patient, auth.uid(), v_pet.name, v_pet.species,
          v_pet.weight_grams, v_pet.allergies, coalesce(nullif(btrim(p_problem),''), 'Emergency'),
          'emergency', p_eta_minutes, v_phone)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
revoke all on function public.owner_notify_arrival(uuid, uuid, text, integer) from public, anon;
grant execute on function public.owner_notify_arrival(uuid, uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Online booking
-- ---------------------------------------------------------------------------
create or replace function public.clinic_available_slots(
  p_business uuid, p_type uuid, p_date date, p_location uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_dur integer; v_tz text; slots jsonb := '[]'::jsonb; r record; t timestamptz; t_end timestamptz;
begin
  if not public.business_is_public(p_business) and not public.staff_of_business(p_business) then
    return '[]'::jsonb;
  end if;
  select duration_min into v_dur from public.appointment_types
   where id = p_type and business_id = p_business and is_active;
  if v_dur is null then return '[]'::jsonb; end if;
  select coalesce(timezone, 'America/Vancouver') into v_tz from public.businesses where id = p_business;

  for r in
    select sa.start_time, sa.end_time, s.id as staff_id,
           coalesce(pr.full_name, 'Available') as staff_name
      from public.staff_availability sa
      join public.business_staff s on s.id = sa.staff_id and s.is_active and s.is_bookable
      left join public.profiles pr on pr.id = s.profile_id
     where sa.business_id = p_business
       and sa.weekday = extract(dow from p_date)::smallint
       and (p_location is null or sa.location_id is null or sa.location_id = p_location)
       and (sa.valid_from is null or sa.valid_from <= p_date)
       and (sa.valid_to is null or sa.valid_to >= p_date)
     order by sa.start_time
  loop
    t := (p_date + r.start_time) at time zone v_tz;
    loop
      t_end := t + make_interval(mins => v_dur);
      exit when t_end > ((p_date + r.end_time) at time zone v_tz);
      if t > now()
         and not exists (
           select 1 from public.appointments a
            where a.staff_id = r.staff_id
              and a.status in ('requested','booked','arrived','in_progress','ready')
              and a.starts_at < t_end and a.ends_at > t)
         and not exists (
           select 1 from public.staff_time_off o
            where o.staff_id = r.staff_id and o.starts_at < t_end and o.ends_at > t)
      then
        slots := slots || jsonb_build_object(
          'starts_at', t, 'ends_at', t_end,
          'staff_id', r.staff_id, 'staff_name', r.staff_name);
      end if;
      t := t + make_interval(mins => v_dur);
    end loop;
  end loop;
  return slots;
end; $$;
grant execute on function public.clinic_available_slots(uuid, uuid, date, uuid) to authenticated, anon;

create or replace function public.owner_book_appointment(
  p_business uuid, p_type uuid, p_pet uuid, p_starts_at timestamptz,
  p_staff uuid default null, p_note text default null, p_share boolean default true)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pet record; v_type record; v_cust uuid; v_patient uuid; v_loc uuid;
        v_appt uuid; v_status public.appointment_status; v_prof record;
begin
  select * into v_pet from public.pets
   where id = p_pet and owner_id = auth.uid() and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_your_pet'); end if;
  select * into v_type from public.appointment_types
   where id = p_type and business_id = p_business and is_active and is_online_bookable;
  if not found then return jsonb_build_object('ok', false, 'error', 'type_unavailable'); end if;
  if not public.business_is_public(p_business) then
    return jsonb_build_object('ok', false, 'error', 'clinic_unavailable');
  end if;
  if p_starts_at <= now() then return jsonb_build_object('ok', false, 'error', 'in_the_past'); end if;

  if exists (select 1 from public.appointments a
              where a.staff_id = p_staff and p_staff is not null
                and a.status in ('requested','booked','arrived','in_progress','ready')
                and a.starts_at < p_starts_at + make_interval(mins => v_type.duration_min)
                and a.ends_at > p_starts_at) then
    return jsonb_build_object('ok', false, 'error', 'slot_taken');
  end if;

  select * into v_prof from public.profiles where id = auth.uid();

  select id into v_patient from public.clinic_patients
   where business_id = p_business and pet_id = p_pet limit 1;
  if v_patient is null then
    select id into v_cust from public.clinic_customers
     where business_id = p_business and profile_id = auth.uid() limit 1;
    if v_cust is null then
      insert into public.clinic_customers (business_id, profile_id, first_name, last_name, email, phone)
      values (p_business, auth.uid(),
              coalesce(split_part(v_prof.full_name, ' ', 1), 'Pet'),
              nullif(substr(v_prof.full_name, coalesce(nullif(position(' ' in v_prof.full_name),0), length(v_prof.full_name))+1), ''),
              v_prof.email, v_prof.phone)
      returning id into v_cust;
    end if;
    insert into public.clinic_patients
      (business_id, customer_id, pet_id, name, species, breed, sex, dob, colour, microchip, weight_grams)
    values (p_business, v_cust, p_pet, v_pet.name, v_pet.species, v_pet.breed, v_pet.sex,
            v_pet.dob, v_pet.color, v_pet.microchip, v_pet.weight_grams)
    returning id into v_patient;
  else
    select customer_id into v_cust from public.clinic_patients where id = v_patient;
  end if;

  select id into v_loc from public.business_locations
   where business_id = p_business and is_primary limit 1;
  v_status := case when v_type.requires_confirmation then 'requested' else 'booked' end;

  insert into public.appointments
    (business_id, location_id, customer_id, patient_id, staff_id, type_id,
     starts_at, ends_at, status, reason, note, source, booked_by)
  values (p_business, v_loc, v_cust, v_patient, p_staff, p_type,
          p_starts_at, p_starts_at + make_interval(mins => v_type.duration_min),
          v_status, v_type.name, p_note, 'online', auth.uid())
  returning id into v_appt;

  if p_share and public.business_tier_of(p_business) = 'verified' then
    perform public.owner_grant_record_share(
      p_pet, p_business, array['identity','vaccinations','health_notes'],
      p_starts_at + interval '30 days', 'booking');
  end if;

  return jsonb_build_object('ok', true, 'appointment_id', v_appt, 'status', v_status);
end; $$;
revoke all on function public.owner_book_appointment(uuid, uuid, uuid, timestamptz, uuid, text, boolean) from public, anon;
grant execute on function public.owner_book_appointment(uuid, uuid, uuid, timestamptz, uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at + RLS
-- ---------------------------------------------------------------------------
drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();
drop trigger if exists trg_invoices_updated on public.invoices;
create trigger trg_invoices_updated before update on public.invoices
  for each row execute function public.set_updated_at();
drop trigger if exists trg_emerg_arrivals_updated on public.emergency_arrivals;
create trigger trg_emerg_arrivals_updated before update on public.emergency_arrivals
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['products','stock_levels','invoices','invoice_lines',
                           'on_call_shifts','emergency_arrivals','emergency_pulls']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format(
      'create policy %I on public.%I for all using (public.staff_of_business(business_id) or public.is_admin()) with check (public.staff_of_business(business_id) or public.is_admin())',
      t || '_staff', t);
  end loop;
end $$;

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select
  using (is_active and public.business_is_public(business_id));

drop policy if exists invoices_owner_read on public.invoices;
create policy invoices_owner_read on public.invoices for select
  using (exists (select 1 from public.clinic_patients cp join public.pets p on p.id = cp.pet_id
                 where cp.id = invoices.patient_id and p.owner_id = auth.uid()));
drop policy if exists invoice_lines_owner_read on public.invoice_lines;
create policy invoice_lines_owner_read on public.invoice_lines for select
  using (exists (select 1 from public.invoices i join public.clinic_patients cp on cp.id = i.patient_id
                 join public.pets p on p.id = cp.pet_id
                 where i.id = invoice_lines.invoice_id and p.owner_id = auth.uid()));

drop policy if exists emerg_pulls_owner_read on public.emergency_pulls;
create policy emerg_pulls_owner_read on public.emergency_pulls for select
  using (exists (select 1 from public.pets p where p.id = pet_id and p.owner_id = auth.uid()));

drop policy if exists on_call_public_read on public.on_call_shifts;
create policy on_call_public_read on public.on_call_shifts for select
  using (public.business_is_public(business_id));
