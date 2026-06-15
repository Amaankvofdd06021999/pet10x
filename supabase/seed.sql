-- Pet10x — seed (reference + demo building). Runs on `supabase db reset`.
-- User-dependent demo data (pets, residents, violations) is created after you
-- sign up real accounts — see docs/PHASE1_SUPABASE.md "Create demo data".

-- ---------------------------------------------------------------------------
-- Billing plans (the per-seat building price is below the individual price)
-- ---------------------------------------------------------------------------
insert into public.billing_plans (id, audience, billing_interval, unit_amount_cents, currency, is_seat_based) values
  ('individual_premium_monthly', 'individual', 'month',  499,  'cad', false),
  ('individual_premium_yearly',  'individual', 'year',  4999,  'cad', false),
  ('building_seat_monthly',      'building',   'month',  299,  'cad', true),
  ('business_featured_monthly',  'business',   'month', 4900,  'cad', false),
  ('business_premium_monthly',   'business',   'month', 9900,  'cad', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Demo building + units (matches the in-app "Harbour View Tower" demo)
-- ---------------------------------------------------------------------------
insert into public.buildings (id, name, address, city, region, postal_code, building_code, total_units, bylaw_enacted_on, risk_score, pet_rules)
values (
  '00000000-0000-0000-0000-0000000b1d61',
  'Harbour View Tower',
  '1200 West Georgia St',
  'Vancouver', 'BC', 'V6E 4R2',
  'HVT2024',
  220,
  '2023-01-01',
  23,
  '{"max_dogs":1,"max_cats":1,"leash_required":true,"weight_limit_lbs":null,"designated_areas":["Courtyard"]}'::jsonb
)
on conflict (id) do nothing;

insert into public.units (building_id, unit_number, floor) values
  ('00000000-0000-0000-0000-0000000b1d61','310', 3),
  ('00000000-0000-0000-0000-0000000b1d61','905', 9),
  ('00000000-0000-0000-0000-0000000b1d61','1201',12),
  ('00000000-0000-0000-0000-0000000b1d61','1402',14),
  ('00000000-0000-0000-0000-0000000b1d61','1503',15),
  ('00000000-0000-0000-0000-0000000b1d61','1806',18),
  ('00000000-0000-0000-0000-0000000b1d61','2104',21),
  ('00000000-0000-0000-0000-0000000b1d61','2208',22)
on conflict (building_id, unit_number) do nothing;
