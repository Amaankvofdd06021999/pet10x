-- Affiliate shop. Manually curated rather than fed from a marketplace API:
-- an Associates account needs approval and carries sales thresholds, and
-- curating means the building is never shown a product nobody vetted.
--
-- Deliberately NOT a variant of business_listings. A listing is a local
-- service someone books; this is a product that sends the user off-site for
-- commission.

create table if not exists public.shop_items (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  image_url     text,
  price_label   text,
  currency      text not null default 'CAD',
  affiliate_url text not null,
  merchant      text,
  category      text,
  species       text[] not null default '{}',
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Only http(s). An affiliate URL is rendered as a tappable link; a
-- javascript: or data: value here would be stored XSS.
alter table public.shop_items drop constraint if exists shop_items_url_check;
alter table public.shop_items add constraint shop_items_url_check
  check (affiliate_url ~* '^https?://');

alter table public.shop_items drop constraint if exists shop_items_species_check;
alter table public.shop_items add constraint shop_items_species_check
  check (species <@ array['dog','cat','bird','small_mammal','fish','reptile','other']::text[]);

create index if not exists shop_items_active_idx on public.shop_items (is_active, sort_order);

alter table public.shop_items enable row level security;

drop policy if exists shop_select on public.shop_items;
create policy shop_select on public.shop_items for select using (is_active or is_admin());

drop policy if exists shop_admin_write on public.shop_items;
create policy shop_admin_write on public.shop_items for all using (is_admin()) with check (is_admin());

comment on table public.shop_items is
  'Curated affiliate products. price_label is a display guide, not a synced price.';
