-- Pet10x — Part E review: a practice manager cannot promote themselves.
--
-- THE GAP. `bstaff_write` (20260901000000) is FOR ALL on
-- can_admin_business(business_id), with no opinion about WHICH row or WHICH
-- role. The Team screen offered every role, Owner included, on every row
-- including the viewer's own, so a practice manager could make themselves
-- `owner` or `veterinarian` in one tap — and both are clinical roles to
-- can_read_shared_records, i.e. other people's pet records. They could also
-- demote or deactivate the business owner's row, or rewrite another row's
-- profile_id to themselves and inherit its role.
--
-- THE RULE, for a client role (authenticated, anon) that is not is_admin():
--
--   * business_id and profile_id never change on an existing row;
--   * nobody sets role `owner` — ownership is businesses.owner_id; a row
--     already holding `owner` may keep it;
--   * unless the caller is the business owner:
--       - their own row's role and is_active do not change,
--       - the business owner's row's role and is_active do not change.
--
-- So a manager may set reception | nurse | veterinarian | manager on OTHER,
-- non-owner rows, and the business owner may set any of those on any row,
-- their own included. Other columns (title, licence, colour, is_bookable)
-- are untouched by this guard.
--
-- Same `current_user` test as pets_archive_guard (20261007000002): SECURITY
-- INVOKER, so current_user is the executing role, which PostgREST fixes from
-- the JWT. business_bootstrap (definer) and service_role are not client roles
-- and pass. Raises 42501.

create or replace function public.business_staff_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $guard$
declare
  v_owner uuid;
  v_is_owner boolean;
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;

  select b.owner_id into v_owner from public.businesses b where b.id = new.business_id;
  v_is_owner := v_owner is not null and v_owner = auth.uid();

  if tg_op = 'INSERT' then
    if new.role = 'owner'::public.clinic_staff_role then
      raise exception 'Nobody can be added to a practice as owner'
        using errcode = '42501',
              detail  = pg_catalog.format('Insert into business %s by %s offered role owner.', new.business_id, auth.uid()),
              hint    = 'Ownership is businesses.owner_id. Choose veterinarian, nurse, reception or manager.';
    end if;
    return new;
  end if;

  if new.business_id is distinct from old.business_id or new.profile_id is distinct from old.profile_id then
    raise exception 'A staff row cannot be moved to another person or practice'
      using errcode = '42501',
            detail  = pg_catalog.format('Staff row %s by %s.', old.id, auth.uid()),
            hint    = 'Invite the person instead.';
  end if;

  if new.role = 'owner'::public.clinic_staff_role and old.role is distinct from new.role then
    raise exception 'Nobody can be given the owner role'
      using errcode = '42501',
            detail  = pg_catalog.format('Staff row %s by %s: role %s -> owner.', old.id, auth.uid(), old.role),
            hint    = 'Ownership is businesses.owner_id. Choose veterinarian, nurse, reception or manager.';
  end if;

  if not v_is_owner
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    if old.profile_id = auth.uid() then
      raise exception 'You cannot change your own role or access'
        using errcode = '42501',
              detail  = pg_catalog.format('Staff row %s by its own holder: role %s -> %s, is_active %s -> %s.',
                                          old.id, old.role, new.role, old.is_active, new.is_active),
              hint    = 'Ask the practice owner.';
    end if;
    -- v_owner is null only when the caller cannot read the business row
    -- (businesses_staff_read needs staff_of_business, which a suspended
    -- manager fails). Refuse rather than guess which row is the owner's.
    if v_owner is null or old.profile_id = v_owner then
      raise exception 'Only the practice owner can change their own role or access'
        using errcode = '42501',
              detail  = pg_catalog.format('Owner''s staff row %s by %s: role %s -> %s, is_active %s -> %s.',
                                          old.id, auth.uid(), old.role, new.role, old.is_active, new.is_active),
              hint    = 'The owner''s row is theirs to change.';
    end if;
  end if;

  return new;
end;
$guard$;

-- A trigger function is attached, never called.
revoke all on function public.business_staff_guard() from public, anon, authenticated;

comment on function public.business_staff_guard() is
  'BEFORE INSERT OR UPDATE on business_staff (20261010000002). For a client role (authenticated/anon) that is not is_admin(): business_id/profile_id are immutable; role owner is never set; unless the caller owns the business, neither their own row nor the owner''s row changes role or is_active. SECURITY INVOKER so current_user is the executing role. Raises 42501.';

drop trigger if exists trg_business_staff_guard on public.business_staff;
create trigger trg_business_staff_guard
  before insert or update on public.business_staff
  for each row execute function public.business_staff_guard();
