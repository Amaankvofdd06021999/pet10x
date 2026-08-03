-- 49 vaccination rows carry expires_on and nothing has ever looked at it.
-- The booster that lapses is the one nobody was told about.
--
-- `kind` lets the same table hold injections and vet treatments alongside
-- vaccines. Compliance matches on NAME (rabies, core vaccines), so rows of
-- another kind are ignored by it automatically.

alter table public.pet_vaccinations
  add column if not exists kind               text    not null default 'vaccine',
  add column if not exists remind_days_before integer not null default 30,
  add column if not exists reminded_for       date;

alter table public.pet_vaccinations drop constraint if exists pet_vaccinations_kind_check;
alter table public.pet_vaccinations
  add constraint pet_vaccinations_kind_check
  check (kind in ('vaccine', 'booster', 'injection', 'treatment'));

alter table public.pet_vaccinations drop constraint if exists pet_vaccinations_remind_window_check;
alter table public.pet_vaccinations
  add constraint pet_vaccinations_remind_window_check
  check (remind_days_before between 0 and 365);

create index if not exists pet_vaccinations_expiry_idx
  on public.pet_vaccinations (expires_on)
  where expires_on is not null;

comment on column public.pet_vaccinations.kind is
  'vaccine | booster | injection | treatment. Compliance matches by name, so non-vaccine rows never affect it.';
comment on column public.pet_vaccinations.reminded_for is
  'The expires_on value we last reminded about. Cleared when the date moves, so a renewal re-arms the reminder.';
