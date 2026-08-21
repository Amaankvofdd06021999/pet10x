-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- Businesses had coordinates but no human-readable location, so a resident
-- could see a distance without ever seeing where the business actually is.
alter table public.businesses
  add column if not exists address     text,
  add column if not exists city        text,
  add column if not exists region      text,
  add column if not exists postal_code text,
  add column if not exists country     text default 'CA';

-- Distance filtering reads latitude/longitude constantly; keep it cheap.
create index if not exists businesses_verified_idx on public.businesses(is_verified) where is_verified;
