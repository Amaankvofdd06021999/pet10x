-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- Standalone owners' location (for "nearby businesses" when not in a building)
alter table public.profiles
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_label text,
  add column if not exists location_source text;

-- Verify-before-appearing: the public directory now shows only verified
-- businesses. Owners still see their own (businesses_owner_write, cmd ALL) and
-- admins see all (businesses_admin_all).
drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses
  for select using (is_verified = true);
