-- Pet10x — Veterinary platform, part 2 of 6: customers and patients.
--
-- The hinge of the whole module is `clinic_patients.pet_id`, which is
-- NULLABLE. A practice serves customers who are on Pet10x and customers who
-- are not, through exactly the same screens; the link is an enrichment, never
-- a requirement. A clinic with zero linked patients is fully functional.
--
-- Linking is not sharing. A link says "this chart is about that pet"; it
-- grants no access to anything. Sharing is part 5.
--
-- Only the OWNER may complete a link. A clinic proposes; the owner confirms in
-- their own app on their own pet, which makes mistaken identity structurally
-- impossible rather than merely unlikely.

create table if not exists public.clinic_customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  first_name text not null,
  last_name text,
  email text,
  phone text,
  alt_phone text,
  address text,
  city text,
  region text,
  postal_code text,
  notes text,
  alert_note text,
  marketing_consent boolean not null default false,
  service_reminders boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clinic_customers_business_idx on public.clinic_customers(business_id);
create index if not exists clinic_customers_profile_idx on public.clinic_customers(profile_id);
create index if not exists clinic_customers_name_idx
  on public.clinic_customers(business_id, lower(coalesce(last_name,'')), lower(first_name));
create index if not exists clinic_customers_phone_idx on public.clinic_customers(business_id, phone);
create index if not exists clinic_customers_email_idx on public.clinic_customers(business_id, lower(email));

create table if not exists public.clinic_patients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.clinic_customers(id) on delete cascade,
  pet_id uuid references public.pets(id) on delete set null,
  name text not null,
  species public.pet_species not null default 'dog',
  breed text,
  sex public.pet_sex default 'unknown',
  dob date,
  colour text,
  microchip text,
  weight_grams integer,
  neutered boolean,
  allergies text,
  conditions text,
  medications_notes text,
  behavioural_alert text,
  notes text,
  is_deceased boolean not null default false,
  deceased_on date,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clinic_patients_business_idx on public.clinic_patients(business_id);
create index if not exists clinic_patients_customer_idx on public.clinic_patients(customer_id);
create index if not exists clinic_patients_pet_idx on public.clinic_patients(pet_id);
create index if not exists clinic_patients_name_idx on public.clinic_patients(business_id, lower(name));
create index if not exists clinic_patients_chip_idx on public.clinic_patients(business_id, microchip);
-- One clinic chart per pet per practice.
create unique index if not exists clinic_patients_pet_uniq
  on public.clinic_patients(business_id, pet_id) where pet_id is not null;

-- ---------------------------------------------------------------------------
-- Link proposals. A clinic asks; the owner answers.
-- ---------------------------------------------------------------------------
create table if not exists public.patient_link_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  patient_id uuid not null references public.clinic_patients(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  invite_email text,
  pet_id uuid references public.pets(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled','expired')),
  message text,
  requested_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists plr_business_idx on public.patient_link_requests(business_id);
create index if not exists plr_profile_idx on public.patient_link_requests(profile_id) where status = 'pending';
create unique index if not exists plr_open_uniq
  on public.patient_link_requests(patient_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Staged imports. A practice that must retype four hundred customers closes
-- the tab, so the importer previews and can be undone for a day.
-- ---------------------------------------------------------------------------
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null default 'customers' check (kind in ('customers','patients','combined')),
  filename text,
  row_count integer not null default 0,
  created_count integer not null default 0,
  status text not null default 'previewed'
    check (status in ('previewed','committed','undone','failed')),
  mapping jsonb not null default '{}'::jsonb,
  error_note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  undone_at timestamptz
);
create index if not exists import_batches_business_idx on public.import_batches(business_id);

alter table public.clinic_customers add column if not exists import_batch_id uuid
  references public.import_batches(id) on delete set null;
alter table public.clinic_patients add column if not exists import_batch_id uuid
  references public.import_batches(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_clinic_customers_updated on public.clinic_customers;
create trigger trg_clinic_customers_updated before update on public.clinic_customers
  for each row execute function public.set_updated_at();
drop trigger if exists trg_clinic_patients_updated on public.clinic_patients;
create trigger trg_clinic_patients_updated before update on public.clinic_patients
  for each row execute function public.set_updated_at();

-- A patient's business must match its customer's business.
create or replace function public.clinic_patient_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_biz uuid;
begin
  select business_id into v_biz from public.clinic_customers where id = new.customer_id;
  if v_biz is null or v_biz <> new.business_id then
    raise exception 'customer_business_mismatch' using errcode = '23514';
  end if;
  if new.is_deceased and new.deceased_on is null then new.deceased_on := current_date; end if;
  if not new.is_deceased then new.deceased_on := null; end if;
  return new;
end; $$;
drop trigger if exists trg_clinic_patient_guard on public.clinic_patients;
create trigger trg_clinic_patient_guard before insert or update on public.clinic_patients
  for each row execute function public.clinic_patient_guard();

-- ---------------------------------------------------------------------------
-- The owner decides a link.
-- ---------------------------------------------------------------------------
create or replace function public.owner_decide_patient_link(
  p_request uuid, p_accept boolean, p_pet uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_pet uuid;
begin
  select * into r from public.patient_link_requests where id = p_request for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'already_decided'); end if;
  if r.expires_at < now() then
    update public.patient_link_requests set status = 'expired' where id = p_request;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if r.profile_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if not p_accept then
    update public.patient_link_requests set status = 'declined', decided_at = now() where id = p_request;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  v_pet := coalesce(p_pet, r.pet_id);
  if v_pet is null then return jsonb_build_object('ok', false, 'error', 'pet_required'); end if;
  if not exists (select 1 from public.pets p
                 where p.id = v_pet and p.owner_id = auth.uid() and p.deleted_at is null) then
    return jsonb_build_object('ok', false, 'error', 'not_your_pet');
  end if;
  if exists (select 1 from public.clinic_patients cp
             where cp.business_id = r.business_id and cp.pet_id = v_pet and cp.id <> r.patient_id) then
    return jsonb_build_object('ok', false, 'error', 'already_linked');
  end if;

  update public.clinic_patients set pet_id = v_pet where id = r.patient_id;
  update public.clinic_customers c set profile_id = auth.uid()
    where c.id = (select customer_id from public.clinic_patients where id = r.patient_id)
      and c.profile_id is null;
  update public.patient_link_requests
     set status = 'accepted', decided_at = now(), pet_id = v_pet where id = p_request;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'clinic.patient_linked', 'clinic_patient', r.patient_id,
          jsonb_build_object('business_id', r.business_id, 'pet_id', v_pet));

  return jsonb_build_object('ok', true, 'status', 'accepted', 'pet_id', v_pet);
end; $$;
revoke all on function public.owner_decide_patient_link(uuid, boolean, uuid) from public, anon;
grant execute on function public.owner_decide_patient_link(uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.clinic_customers enable row level security;
alter table public.clinic_patients enable row level security;
alter table public.patient_link_requests enable row level security;
alter table public.import_batches enable row level security;

drop policy if exists cust_staff on public.clinic_customers;
create policy cust_staff on public.clinic_customers for all
  using (public.staff_of_business(business_id) or public.is_admin())
  with check (public.staff_of_business(business_id) or public.is_admin());
-- An owner may see the customer record a practice holds about them.
drop policy if exists cust_owner_read on public.clinic_customers;
create policy cust_owner_read on public.clinic_customers for select
  using (profile_id = auth.uid());

drop policy if exists pat_staff on public.clinic_patients;
create policy pat_staff on public.clinic_patients for all
  using (public.staff_of_business(business_id) or public.is_admin())
  with check (public.staff_of_business(business_id) or public.is_admin());
drop policy if exists pat_owner_read on public.clinic_patients;
create policy pat_owner_read on public.clinic_patients for select
  using (exists (select 1 from public.pets p where p.id = pet_id and p.owner_id = auth.uid()));

drop policy if exists plr_staff on public.patient_link_requests;
create policy plr_staff on public.patient_link_requests for all
  using (public.staff_of_business(business_id) or public.is_admin())
  with check (public.staff_of_business(business_id) or public.is_admin());
drop policy if exists plr_owner_read on public.patient_link_requests;
create policy plr_owner_read on public.patient_link_requests for select
  using (profile_id = auth.uid());

drop policy if exists imp_staff on public.import_batches;
create policy imp_staff on public.import_batches for all
  using (public.staff_of_business(business_id) or public.is_admin())
  with check (public.staff_of_business(business_id) or public.is_admin());
