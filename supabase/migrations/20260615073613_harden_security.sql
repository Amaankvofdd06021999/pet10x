-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- pin search_path on the updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- avatars is a public bucket; object URLs work without a broad listing policy
drop policy if exists "avatars public read" on storage.objects;

-- trigger functions must never be callable over the REST RPC surface
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.guard_profile_privilege() from anon, authenticated;

-- don't let anonymous callers probe arbitrary users' entitlements
revoke execute on function public.is_premium(uuid) from anon;
revoke execute on function public.resolve_entitlement(uuid) from anon;

-- payout_items had RLS on but no policy; allow managers/admin to read
create policy payout_items_select on public.payout_items for select using (
  exists (select 1 from public.payouts po where po.id = payout_id
          and (public.manages_building(po.building_id) or public.is_admin()))
);
