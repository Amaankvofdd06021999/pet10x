-- Pet10x — a new business starts with appointment types and weekday hours,
-- so a new clinic can be booked on day one.
--
-- THE GAP (UX audit, vet clinics):
--   * business_bootstrap (20260901000000) gives a new business its owner's
--     staff row and a primary location, and nothing else. A clinic with no
--     appointment_types has nothing to book, and one with no
--     staff_availability has no slots: clinic_available_slots returns [] until
--     someone finds both settings screens. Seven live businesses have zero
--     appointment types today.
--
-- WHAT THIS DOES
--
--   1. seed_business_defaults(p_business) -> void. Internal only: SECURITY
--      DEFINER, search_path public, pg_temp, execute revoked from public,
--      anon and authenticated (only business_bootstrap and this migration's
--      backfill call it). Two independent seeds, each only when the business
--      has none of that thing yet, so calling it again changes nothing:
--
--      * appointment_types, when the business has zero (active or not), by
--        business_kind (text, FK to business_types):
--          veterinary — Wellness exam 30 min, Vaccination 15, Sick visit 30;
--                       online-bookable, each request confirmed by the
--                       practice (requires_confirmation true).
--          grooming   — Bath & brush 60 min, Full groom 90; not online-bookable.
--          any other  — Appointment 30 min; not online-bookable.
--        Only a clinic takes online visit requests through these types, so
--        only veterinary ones are bookable out of the box; everyone else can
--        switch it on. price_cents is 0, the column's NOT NULL default: 0
--        means "no price set", not "free". sort_order 0, 1, 2.
--
--      * staff_availability, when the business has zero rows: Monday to
--        Friday (weekday 1..5, extract(dow) — 0 is Sunday, as
--        clinic_available_slots reads it) 09:00–17:00 for the owner's own
--        business_staff row, location_id null (every location). The times
--        are local to the business: clinic_available_slots reads them in
--        businesses.timezone. A business whose owner has no staff row gets
--        no hours (nothing to attach them to).
--
--   2. business_bootstrap — LIVE definition (as 20260901000000) verbatim,
--      plus a call to seed_business_defaults(new.id) after the staff row
--      exists. The trigger is unchanged and is not recreated.
--
--   3. Backfill: every existing business through the same helper. Its own
--      zero-row checks make this touch only the businesses that are missing
--      types or hours; the rest are left exactly as they are.

-- ---------------------------------------------------------------------------
-- 1. The defaults
-- ---------------------------------------------------------------------------
create or replace function public.seed_business_defaults(p_business uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind  text;
  v_owner uuid;
begin
  select b.business_kind, b.owner_id into v_kind, v_owner
    from public.businesses b where b.id = p_business;
  if not found then
    return;
  end if;

  if not exists (select 1 from public.appointment_types t where t.business_id = p_business) then
    insert into public.appointment_types
      (business_id, name, duration_min, price_cents, is_online_bookable, requires_confirmation, sort_order)
    select p_business, d.name, d.duration_min, 0, d.bookable, true, d.sort_order
      from (values
              ('veterinary', 'Wellness exam', 30, true,  0),
              ('veterinary', 'Vaccination',   15, true,  1),
              ('veterinary', 'Sick visit',    30, true,  2),
              ('grooming',   'Bath & brush',  60, false, 0),
              ('grooming',   'Full groom',    90, false, 1),
              ('other',      'Appointment',   30, false, 0)
           ) as d(kind, name, duration_min, bookable, sort_order)
     where d.kind = case when v_kind in ('veterinary', 'grooming') then v_kind else 'other' end;
  end if;

  if not exists (select 1 from public.staff_availability a where a.business_id = p_business) then
    insert into public.staff_availability (business_id, staff_id, location_id, weekday, start_time, end_time)
    select p_business, s.id, null, wd.weekday::smallint, '09:00'::time, '17:00'::time
      from public.business_staff s
      cross join generate_series(1, 5) as wd(weekday)
     where s.business_id = p_business and s.profile_id = v_owner;
  end if;
end;
$$;

revoke all on function public.seed_business_defaults(uuid) from public, anon, authenticated;

comment on function public.seed_business_defaults(uuid) is
  'Internal (20261015000006); called by business_bootstrap and the backfill, not by clients. When the business has no appointment_types: veterinary gets Wellness exam 30, Vaccination 15, Sick visit 30 (online-bookable); grooming Bath & brush 60, Full groom 90; any other kind Appointment 30 (not online-bookable); price_cents 0 means no price set. When it has no staff_availability: Mon-Fri (dow 1..5) 09:00-17:00 for the owner''s business_staff row, every location. Idempotent.';

-- ---------------------------------------------------------------------------
-- 2. business_bootstrap seeds them for every new business
-- ---------------------------------------------------------------------------
-- LIVE definition verbatim, plus the call at the end: the owner's staff row
-- must exist before hours can hang off it.
create or replace function public.business_bootstrap()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.business_staff (business_id, profile_id, role, is_active, is_bookable, joined_at)
  values (new.id, new.owner_id,
          case when new.business_kind = 'veterinary' then 'veterinarian'::public.clinic_staff_role
               else 'owner'::public.clinic_staff_role end,
          true, true, now())
  on conflict (business_id, profile_id) do nothing;
  insert into public.business_locations
    (business_id, name, address, city, region, postal_code, country, latitude, longitude, is_primary)
  values (new.id, coalesce(new.name,'Main location'), new.address, new.city, new.region,
          new.postal_code, coalesce(new.country,'CA'), new.latitude, new.longitude, true);
  perform public.seed_business_defaults(new.id);
  return new;
end; $$;

comment on function public.business_bootstrap() is
  'AFTER INSERT on businesses (20260901000000, 20261015000006): the owner''s staff row, a primary location, then seed_business_defaults — appointment types and Mon-Fri 09:00-17:00 hours — so a new business can be booked on day one.';

-- ---------------------------------------------------------------------------
-- 3. Backfill the businesses that already exist
-- ---------------------------------------------------------------------------
select public.seed_business_defaults(b.id) from public.businesses b;
