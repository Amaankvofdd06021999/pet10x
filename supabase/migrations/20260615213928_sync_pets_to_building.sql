-- Captured verbatim from the remote migration ledger (supabase_migrations.schema_migrations) on 2026-08-21.
-- When a resident link is approved, attach the resident's pets to that building
-- (so managers can see them via RLS); detach on leave/deny/revoke.
create or replace function public.sync_pets_on_link_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.pets
      set building_id = new.building_id, unit_id = new.unit_id
      where owner_id = new.profile_id and deleted_at is null;
  elsif new.status in ('left','denied','revoked') and old.status = 'approved' then
    update public.pets
      set building_id = null, unit_id = null
      where owner_id = new.profile_id and building_id = new.building_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_pets_on_link on public.resident_links;
create trigger trg_sync_pets_on_link
  after update on public.resident_links
  for each row execute function public.sync_pets_on_link_change();

-- New pets created by an already-approved resident inherit the building.
create or replace function public.set_pet_building()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.building_id is null then
    select building_id, unit_id into new.building_id, new.unit_id
      from public.resident_links
      where profile_id = new.owner_id and status = 'approved' and left_at is null
      order by decided_at desc nulls last
      limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_pet_building on public.pets;
create trigger trg_set_pet_building
  before insert on public.pets
  for each row execute function public.set_pet_building();
