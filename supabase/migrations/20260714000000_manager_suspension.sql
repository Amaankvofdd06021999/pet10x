-- Pet10x — Super-admin control: suspend/unsuspend a manager's account.
-- Suspension blocks the account everywhere (login, RLS scope) regardless of
-- role; it is not scoped to a single building.

alter table public.profiles
  add column is_suspended boolean not null default false,
  add column suspended_at timestamptz,
  add column suspended_by uuid references public.profiles(id);

-- A suspended profile has no manager/resident/admin scope: manages_building()
-- and is_resident_of() both fall through to false, and is_admin() likewise
-- can't be granted to a suspended account. RLS on `profiles` still lets the
-- suspended user read their own row (so the app can show "account suspended"),
-- but every other scope collapses.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_super_admin and not is_suspended from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.manages_building(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.building_managers bm
    join public.profiles p on p.id = bm.profile_id
    where bm.building_id = b and bm.profile_id = auth.uid() and not p.is_suspended
  );
$$;

create or replace function public.is_resident_of(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.resident_links rl
    join public.profiles p on p.id = rl.profile_id
    where rl.building_id = b and rl.profile_id = auth.uid()
      and rl.status = 'approved' and not p.is_suspended
  );
$$;

-- Extend the existing privilege guard so only an active admin (not the
-- account itself) can flip is_suspended — same pattern as role/is_super_admin.
create or replace function public.guard_profile_privilege()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role
      or new.is_super_admin is distinct from old.is_super_admin
      or new.is_suspended is distinct from old.is_suspended)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Not allowed to change role, admin flag, or suspension state';
  end if;
  return new;
end;
$$;
