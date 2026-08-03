-- One target per kind per pet was the hard limit: UNIQUE (pet_id, kind).
--
-- That is wrong for exactly the things owners have most of. A dog on two
-- medicines could set a target for one. An owner capping dental chews at 2 and
-- training treats at 10 could express neither. The kind is the category, not
-- the thing being targeted.

alter table public.care_targets
  add column if not exists label      text,
  add column if not exists period     text not null default 'day',
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active  boolean not null default true,
  add column if not exists created_at timestamptz not null default now();

alter table public.care_targets drop constraint if exists care_targets_period_check;
alter table public.care_targets
  add constraint care_targets_period_check check (period in ('day', 'week'));

update public.care_targets
set label = initcap(kind::text)
where label is null or btrim(label) = '';

alter table public.care_targets alter column label set not null;

alter table public.care_targets drop constraint if exists care_targets_pet_id_kind_key;

create unique index if not exists care_targets_pet_kind_label_key
  on public.care_targets (pet_id, kind, lower(btrim(label)));

comment on table public.care_targets is
  'Per-pet care goals. Several per kind are expected (two medicines, three treat types); uniqueness is on the label within a kind.';
