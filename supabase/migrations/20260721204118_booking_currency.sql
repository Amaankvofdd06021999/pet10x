-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- A booking must remember the currency it was priced in; the platform now has
-- businesses in more than one country.
alter table public.service_bookings
  add column if not exists currency text not null default 'cad';
