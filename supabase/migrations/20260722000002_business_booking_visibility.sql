-- A business must be able to see the customer and pet on ITS OWN bookings —
-- and nothing else. Scoped exactly to "introduced by a booking".
create or replace function public.has_booking_with(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.service_bookings sb
    join public.businesses b on b.id = sb.business_id
    where b.owner_id = auth.uid() and sb.customer_id = p
  );
$$;

create policy profiles_business_customer_read on public.profiles for select
  using (public.has_booking_with(id));

create or replace function public.has_booking_for_pet(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.service_bookings sb
    join public.businesses b on b.id = sb.business_id
    where b.owner_id = auth.uid() and sb.pet_id = p
  );
$$;

create policy pets_business_booking_read on public.pets for select
  using (public.has_booking_for_pet(id));

-- Reviews are public, but resident profiles are not — denormalise the author's
-- display name so anyone can render a review without reading profiles.
alter table public.business_reviews add column if not exists author_name text;

create or replace function public.set_review_author_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.author_name is null then
    new.author_name := coalesce((select full_name from public.profiles where id = new.author_id), 'Pet owner');
  end if;
  return new;
end; $$;

create trigger trg_review_author_name before insert on public.business_reviews
  for each row execute function public.set_review_author_name();

update public.business_reviews r
   set author_name = coalesce((select full_name from public.profiles p where p.id = r.author_id), 'Pet owner')
 where r.author_name is null;
