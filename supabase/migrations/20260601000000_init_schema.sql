-- Pet10x — Phase 1 schema
-- Conventions: uuid PKs (gen_random_uuid), created_at/updated_at timestamptz,
-- money as integer minor units (cents) + currency, RLS enabled in the next
-- migration. Location stored as lat/lng now; PostGIS geography can be layered
-- in later for radius queries (Phase 3).

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role            as enum ('pet_owner','building_manager','super_admin','business');
create type pet_species          as enum ('dog','cat','bird','small_mammal','fish','reptile','other');
create type pet_status           as enum ('home','away','at_vet','vacation','deceased');
create type pet_sex              as enum ('male','female','unknown');
create type care_kind            as enum ('meal','medication','water','walk','grooming','other');

create type registration_status  as enum ('draft','pending','approved','denied','info_requested','revoked');
create type resident_link_status as enum ('pending','approved','denied','revoked','left');

create type violation_stage      as enum ('investigation','pending_review','verbal_warning','written_warning','fine_issued','resolved','dismissed');
create type incident_type        as enum ('noise','aggressive','off_leash','waste','damage','unregistered','other');
create type incident_status      as enum ('submitted','triaged','investigating','linked_to_violation','dismissed','resolved');

create type accommodation_type   as enum ('esa','service_animal');
create type accommodation_status as enum ('pending','approved','denied','info_requested');

create type doc_kind             as enum ('vaccination','municipal_license','liability_insurance','building_registration','microchip_registration','esa_letter','provider_license','other');
create type doc_status           as enum ('current','expiring','expired','missing','rejected','approved','active');

create type subscription_status  as enum ('trialing','active','past_due','canceled','incomplete','paused');
create type entitlement_source   as enum ('individual_stripe','individual_iap','building_sponsored','complimentary');

create type fine_status          as enum ('issued','paid','partially_paid','waived','disputed','remitted','written_off');
create type payment_status       as enum ('pending','succeeded','failed','refunded');
create type payout_status        as enum ('pending','in_transit','paid','failed','reversed');

create type business_listing_tier as enum ('basic','featured','premium');
create type notification_kind     as enum ('compliance','incident','building','billing','community','system');

-- ---------------------------------------------------------------------------
-- Identity, buildings, residency
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  role           user_role not null default 'pet_owner',
  is_super_admin boolean not null default false,
  full_name      text,
  email          text,
  phone          text,
  avatar_url     text,
  plan_label     text,                      -- display only; real entitlement is computed
  member_since   date default current_date,
  locale         text default 'en',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.buildings (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  address         text,
  city            text, region text, postal_code text, country text default 'CA',
  latitude        double precision,
  longitude       double precision,
  building_code   text unique not null,      -- the guest QR / code (e.g. HVT2024)
  total_units     int,
  bylaw_version   int default 1,
  bylaw_enacted_on date,                      -- §123 grandfathering anchor
  pet_rules       jsonb not null default '{}'::jsonb,
  risk_score      numeric(5,2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.units (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references public.buildings(id) on delete cascade,
  unit_number  text not null,
  floor        int,
  created_at   timestamptz not null default now(),
  unique (building_id, unit_number)
);

-- M:N manager ↔ building
create table public.building_managers (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references public.buildings(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  is_primary   boolean not null default false,
  granted_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  unique (building_id, profile_id)
);

-- Resident ↔ unit link request/approve workflow (drives building-sponsored premium).
create table public.resident_links (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  building_id   uuid not null references public.buildings(id) on delete cascade,
  unit_id       uuid references public.units(id) on delete set null,
  status        resident_link_status not null default 'pending',
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references public.profiles(id),
  left_at       timestamptz,
  move_in_date  date,
  access_notes  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- at most one active (approved) link per profile per building
create unique index resident_links_active_uniq
  on public.resident_links (profile_id, building_id) where status = 'approved';

-- ---------------------------------------------------------------------------
-- Pets + normalized children
-- ---------------------------------------------------------------------------
create table public.pets (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  building_id         uuid references public.buildings(id) on delete set null,  -- denormalized for manager queries/RLS
  unit_id             uuid references public.units(id) on delete set null,
  name                text not null,
  species             pet_species not null,
  breed               text,
  dob                 date,
  sex                 pet_sex default 'unknown',
  weight_grams        int,
  color               text,
  microchip           text,
  neutered            boolean,
  status              pet_status not null default 'home',
  registration_status registration_status not null default 'draft',
  is_grandfathered    boolean default false,
  grandfathered_on    date,
  conditions          text,
  medications_notes   text,
  allergies           text,
  behavioral_notes    text,
  vet_clinic          text,
  vet_name            text,
  vet_phone           text,
  image_url           text,
  compliance_pct      int default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create table public.pet_documents (
  id           uuid primary key default gen_random_uuid(),
  pet_id       uuid references public.pets(id) on delete cascade,
  kind         doc_kind not null,
  name         text,
  status       doc_status not null default 'missing',
  storage_path text,
  expires_on   date,
  verified_by  uuid references public.profiles(id),
  verified_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table public.pet_vaccinations (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.pets(id) on delete cascade,
  name       text not null,
  given_on   date,
  expires_on date,
  status     doc_status not null default 'current',
  doc_id     uuid references public.pet_documents(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.pet_emergency_contacts (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.pets(id) on delete cascade,
  role       text not null,
  name       text not null,
  phone      text not null,
  sort_order int default 0
);

create table public.pet_activity (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.pets(id) on delete cascade,
  type       text not null,        -- compliance | status | document
  text       text not null,
  created_at timestamptz not null default now()
);

-- Care tracking (food / medicine / daily routine)
create table public.pet_care_tasks (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.pets(id) on delete cascade,
  label      text not null,
  detail     text,
  time_label text,                 -- "7:30 AM", "All day"
  kind       care_kind not null default 'other',
  sort_order int default 0,
  created_at timestamptz not null default now()
);

-- Per-day completion log for care tasks (the daily checklist state).
create table public.pet_care_log (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.pet_care_tasks(id) on delete cascade,
  on_date     date not null default current_date,
  completed   boolean not null default true,
  completed_at timestamptz not null default now(),
  unique (task_id, on_date)
);

create table public.pet_feeding (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.pets(id) on delete cascade,
  name       text not null,        -- Breakfast, Dinner
  time_label text,
  portion    text,
  food       text,
  sort_order int default 0
);

create table public.pet_medications (
  id         uuid primary key default gen_random_uuid(),
  pet_id     uuid not null references public.pets(id) on delete cascade,
  name       text not null,
  dosage     text,
  frequency  text,
  next_due   text,                 -- free text for now ("Today", "Mar 1, 2026")
  reminder   boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Governance: incidents, violations, accommodations
-- ---------------------------------------------------------------------------
create table public.incident_reports (
  id             uuid primary key default gen_random_uuid(),
  building_id    uuid not null references public.buildings(id) on delete cascade,
  reporter_id    uuid references public.profiles(id),    -- NULL = anonymous guest
  is_anonymous   boolean not null default true,
  type           incident_type not null,
  description    text not null,
  location_text  text,
  unit_involved  text,
  unit_id        uuid references public.units(id),
  status         incident_status not null default 'submitted',
  evidence_paths text[] not null default '{}',
  reference_code text unique,
  ip_hash        text,
  triaged_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

create table public.violations (
  id                  uuid primary key default gen_random_uuid(),
  building_id         uuid not null references public.buildings(id) on delete cascade,
  unit_id             uuid references public.units(id),
  resident_id         uuid references public.profiles(id),
  pet_id              uuid references public.pets(id),
  origin_incident_id  uuid references public.incident_reports(id),
  type                text not null,
  stage               violation_stage not null default 'investigation',
  opened_by           uuid references public.profiles(id),
  resolved_at         timestamptz,
  resolution_outcome  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.violation_events (
  id           uuid primary key default gen_random_uuid(),
  violation_id uuid not null references public.violations(id) on delete cascade,
  from_stage   violation_stage,
  to_stage     violation_stage not null,
  note         text,
  actor_id     uuid references public.profiles(id),
  occurred_on  date default current_date,
  created_at   timestamptz not null default now()
);

create table public.accommodation_requests (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  resident_id uuid not null references public.profiles(id) on delete cascade,
  unit_id     uuid references public.units(id),
  pet_id      uuid references public.pets(id),
  type        accommodation_type not null,
  status      accommodation_status not null default 'pending',
  animal_desc text,
  legal_note  text,
  decided_by  uuid references public.profiles(id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table public.accommodation_documents (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.accommodation_requests(id) on delete cascade,
  kind         doc_kind not null,
  status       doc_status not null default 'missing',
  storage_path text,
  verified     boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Community
-- ---------------------------------------------------------------------------
create table public.community_posts (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references public.buildings(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete set null,
  category     text not null default 'General',
  content      text not null,
  image_url    text,
  is_official  boolean not null default false,
  is_pinned    boolean not null default false,
  like_count   int not null default 0,
  comment_count int not null default 0,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table public.post_reactions (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create table public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  content    text not null,
  created_at timestamptz not null default now()
);

create table public.lost_found (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade,
  reporter_id uuid references public.profiles(id),
  kind        text not null check (kind in ('lost','found')),
  pet_name    text, species pet_species, breed text, color text,
  last_seen   text, reward_cents int, image_url text,
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid references public.buildings(id) on delete cascade,
  created_by   uuid references public.profiles(id),
  title        text not null,
  category     text,
  starts_at    timestamptz,
  location     text,
  max_attendees int,
  created_at   timestamptz not null default now()
);

create table public.event_rsvps (
  event_id   uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- Business / services
-- ---------------------------------------------------------------------------
create table public.businesses (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  name             text not null,
  category         text not null,
  description      text,
  logo_url         text,
  latitude         double precision,
  longitude        double precision,
  service_radius_m int,
  price_range      text,
  hours            jsonb,
  is_verified      boolean not null default false,
  is_open          boolean not null default true,
  listing_tier     business_listing_tier not null default 'basic',
  rating_avg       numeric(2,1) not null default 0,
  rating_count     int not null default 0,
  tags             text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.business_listings (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind        text not null,   -- directory_featured | community_sponsored | banner
  building_id uuid references public.buildings(id),
  latitude    double precision,
  longitude   double precision,
  radius_m    int,
  starts_at   timestamptz, ends_at timestamptz,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Billing, entitlements, fines, payments, payouts
-- ---------------------------------------------------------------------------
create table public.billing_plans (
  id                text primary key,                 -- 'individual_premium_monthly'
  audience          text not null,                    -- individual | building | business
  billing_interval  text not null,                    -- month | year
  unit_amount_cents int not null,
  currency          text not null default 'cad',
  stripe_price_id   text,
  apple_product_id  text,
  google_product_id text,
  is_seat_based     boolean not null default false,
  active            boolean not null default true
);

create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null references public.profiles(id) on delete cascade,
  plan_id              text references public.billing_plans(id),
  source               entitlement_source not null,
  status               subscription_status not null,
  provider_ref         text,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index subscriptions_active_uniq
  on public.subscriptions (profile_id) where status in ('trialing','active','past_due');

create table public.building_subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  building_id            uuid not null references public.buildings(id) on delete cascade,
  plan_id                text references public.billing_plans(id),
  status                 subscription_status not null,
  stripe_subscription_id text,
  stripe_customer_id     text,
  seat_unit_amount_cents int not null,
  seats_purchased        int default 0,
  seats_in_use           int default 0,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.sponsored_seats (
  id                       uuid primary key default gen_random_uuid(),
  building_subscription_id uuid not null references public.building_subscriptions(id) on delete cascade,
  profile_id               uuid not null references public.profiles(id) on delete cascade,
  resident_link_id         uuid not null references public.resident_links(id) on delete cascade,
  active                   boolean not null default true,
  activated_at             timestamptz not null default now(),
  deactivated_at           timestamptz,
  unique (building_subscription_id, profile_id)
);

create table public.fines (
  id                       uuid primary key default gen_random_uuid(),
  violation_id             uuid references public.violations(id),
  building_id              uuid not null references public.buildings(id),
  unit_id                  uuid references public.units(id),
  resident_id              uuid references public.profiles(id),
  amount_cents             int not null,
  currency                 text not null default 'cad',
  status                   fine_status not null default 'issued',
  issued_by                uuid references public.profiles(id),
  due_on                   date,
  stripe_payment_intent_id text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid references public.profiles(id),
  purpose      text not null,        -- fine | subscription | booking | building_plan
  related_id   uuid,
  amount_cents int not null,
  currency     text not null default 'cad',
  status       payment_status not null default 'pending',
  provider     text not null,        -- stripe | apple_iap | google_play
  provider_ref text,
  created_at   timestamptz not null default now()
);

create table public.service_bookings (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id),
  customer_id      uuid not null references public.profiles(id),
  amount_cents     int not null default 0,
  commission_cents int not null default 0,
  status           text not null default 'requested',
  scheduled_for    timestamptz,
  payment_id       uuid references public.payments(id),
  created_at       timestamptz not null default now()
);

create table public.payouts (
  id                 uuid primary key default gen_random_uuid(),
  building_id        uuid not null references public.buildings(id),
  connect_account_id text,
  amount_cents       int not null,
  platform_fee_cents int not null default 0,
  currency           text not null default 'cad',
  status             payout_status not null default 'pending',
  stripe_transfer_id text,
  period_start       date, period_end date,
  created_at         timestamptz not null default now()
);

create table public.payout_items (
  payout_id    uuid not null references public.payouts(id) on delete cascade,
  payment_id   uuid references public.payments(id),
  fine_id      uuid references public.fines(id),
  amount_cents int not null,
  primary key (payout_id, payment_id)
);

-- ---------------------------------------------------------------------------
-- Notifications, emergency tokens, audit
-- ---------------------------------------------------------------------------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  kind          notification_kind not null,
  severity      text not null default 'info',
  title         text not null,
  body          text,
  action_label  text,
  action_target text,
  building_id   uuid references public.buildings(id),
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create table public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  expo_token  text,
  platform    text,
  last_seen_at timestamptz not null default now(),
  unique (profile_id, expo_token)
);

create table public.emergency_access_tokens (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  token       text unique not null,
  issued_by   uuid references public.profiles(id),
  expires_at  timestamptz not null default now() + interval '4 hours',
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id),
  actor_role  user_role,
  action      text not null,
  entity_type text, entity_id uuid,
  building_id uuid,
  metadata    jsonb,
  ip_hash     text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index pets_owner_idx        on public.pets(owner_id);
create index pets_building_idx     on public.pets(building_id);
create index units_building_idx    on public.units(building_id);
create index resident_links_profile_idx on public.resident_links(profile_id);
create index resident_links_building_idx on public.resident_links(building_id);
create index building_managers_profile_idx on public.building_managers(profile_id);
create index violations_building_idx on public.violations(building_id);
create index violations_resident_idx on public.violations(resident_id);
create index fines_building_idx     on public.fines(building_id);
create index fines_resident_idx     on public.fines(resident_id);
create index incident_building_idx  on public.incident_reports(building_id);
create index community_building_idx on public.community_posts(building_id);
create index notifications_profile_idx on public.notifications(profile_id);
create index pet_children_idx on public.pet_vaccinations(pet_id);
create index pet_care_tasks_idx on public.pet_care_tasks(pet_id);
create index pet_feeding_idx on public.pet_feeding(pet_id);
create index pet_medications_idx on public.pet_medications(pet_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger trg_profiles_updated   before update on public.profiles    for each row execute function public.set_updated_at();
create trigger trg_buildings_updated  before update on public.buildings   for each row execute function public.set_updated_at();
create trigger trg_pets_updated       before update on public.pets        for each row execute function public.set_updated_at();
create trigger trg_links_updated      before update on public.resident_links for each row execute function public.set_updated_at();
create trigger trg_violations_updated before update on public.violations  for each row execute function public.set_updated_at();
create trigger trg_fines_updated      before update on public.fines       for each row execute function public.set_updated_at();
create trigger trg_subs_updated       before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger trg_bsubs_updated      before update on public.building_subscriptions for each row execute function public.set_updated_at();
create trigger trg_businesses_updated before update on public.businesses  for each row execute function public.set_updated_at();
