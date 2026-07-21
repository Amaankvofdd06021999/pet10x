-- ===========================================================================
-- Reviews — businesses.rating_avg / rating_count were aggregates with nothing
-- behind them. A review is only allowed from a customer whose booking with that
-- business actually completed.
-- ===========================================================================
create table if not exists public.business_reviews (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  booking_id  uuid references public.service_bookings(id) on delete set null,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  rating      int not null check (rating between 1 and 5),
  comment     text,
  owner_reply text,
  replied_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (booking_id)
);
create index if not exists business_reviews_business_idx on public.business_reviews(business_id);

alter table public.business_reviews enable row level security;

create policy rev_select on public.business_reviews for select using (true);

create policy rev_insert on public.business_reviews for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.service_bookings sb
    where sb.id = booking_id
      and sb.customer_id = auth.uid()
      and sb.business_id = business_reviews.business_id
      and sb.status in ('completed','paid')
  )
);

create policy rev_author_update on public.business_reviews for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());

-- The owner may reply; the trigger below stops them editing the rating/comment.
create policy rev_owner_reply on public.business_reviews for update
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

create or replace function public.guard_review_reply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Anyone who isn't the author may only touch owner_reply / replied_at.
  if auth.uid() is not null and auth.uid() <> old.author_id and not public.is_admin() then
    if new.rating is distinct from old.rating
       or new.comment is distinct from old.comment
       or new.author_id is distinct from old.author_id
       or new.business_id is distinct from old.business_id then
      raise exception 'Only the review author can change the rating or comment';
    end if;
  end if;
  return new;
end; $$;
create trigger trg_review_reply_guard before update on public.business_reviews
  for each row execute function public.guard_review_reply();

-- Keep the denormalised rating on businesses in step with the reviews.
create or replace function public.recompute_business_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  bid := coalesce(new.business_id, old.business_id);
  update public.businesses
     set rating_avg   = coalesce((select round(avg(rating)::numeric, 1) from public.business_reviews where business_id = bid), 0),
         rating_count = (select count(*) from public.business_reviews where business_id = bid)
   where id = bid;
  return null;
end; $$;
create trigger trg_reviews_rating
  after insert or update or delete on public.business_reviews
  for each row execute function public.recompute_business_rating();

-- ===========================================================================
-- businesses_owner_write is `for all` on owner_id = auth.uid(), which let an
-- owner flip their own is_verified and mint the trust badge. Verification is
-- admin-only; block it at the row level.
-- ===========================================================================
create or replace function public.guard_business_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_verified is distinct from old.is_verified
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only Pet10x admins can change verification status';
  end if;
  return new;
end; $$;
create trigger trg_business_verification_guard before update on public.businesses
  for each row execute function public.guard_business_verification();
