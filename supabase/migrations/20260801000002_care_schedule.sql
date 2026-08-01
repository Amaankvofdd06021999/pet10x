-- Turn pet_care_tasks into a real schedule.
--
-- The table already existed with `time_label text` — "7:30 AM", "All day".
-- That can be printed and hand-sorted, but nothing can compute from it: no
-- job can ask "is this due now?", so it could never drive a reminder. This
-- adds an actual clock time, a recurrence, and the timezone to resolve them
-- in, plus a ledger so a reminder is sent once per task per day.
--
-- Every change is additive. `time_label` is kept and left populated so any
-- existing row still renders while the app moves over to `scheduled_at`.

-- ---------------------------------------------------------------- timezone
-- A schedule is meaningless without one: 07:30 is a different instant in
-- Vancouver and Toronto, and the app serves buildings in both. Nullable, with
-- the app falling back to America/Vancouver — the region the project was
-- created in — rather than to the server's clock, which is UTC on Vercel.
alter table public.profiles
  add column if not exists timezone text;

comment on column public.profiles.timezone is
  'IANA zone (e.g. America/Vancouver) used to resolve care schedules. Null falls back to the app default.';

-- ------------------------------------------------------------- the schedule
alter table public.pet_care_tasks
  -- Local clock time the task is due. Null means all-day: it still appears in
  -- Today's Care and can still be ticked off, it simply never becomes overdue.
  add column if not exists scheduled_at time,
  -- ISO-free day set, 0 = Sunday to match JS getDay(). Null or empty means
  -- every day, which is the common case and avoids making the UI ask.
  add column if not exists days_of_week smallint[],
  -- Soft-off, so pausing a routine doesn't destroy its completion history.
  add column if not exists is_active boolean not null default true,
  -- Lead time, so "walk at 17:00" can nudge at 16:45.
  add column if not exists remind_minutes_before integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.pet_care_tasks.time_label is
  'Legacy free-text label ("7:30 AM"). Display only — scheduling reads scheduled_at.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pet_care_tasks_days_of_week_valid'
  ) then
    alter table public.pet_care_tasks
      add constraint pet_care_tasks_days_of_week_valid
      check (days_of_week is null or days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'pet_care_tasks_remind_lead_sane'
  ) then
    alter table public.pet_care_tasks
      add constraint pet_care_tasks_remind_lead_sane
      check (remind_minutes_before between 0 and 1440);
  end if;
end $$;

-- The sweep scans active, timed tasks; this is the index it needs.
create index if not exists pet_care_tasks_due_idx
  on public.pet_care_tasks (is_active, scheduled_at)
  where scheduled_at is not null;

create index if not exists pet_care_tasks_pet_idx
  on public.pet_care_tasks (pet_id, sort_order);

-- --------------------------------------------------------- reminder ledger
-- One row per task per day, written when a reminder is raised.
--
-- The dedupe has to live somewhere, and `notifications` has no natural key to
-- hang it on — no dedupe_key column, and matching on title would break the
-- moment the copy changes. A unique (task_id, on_date) makes a second send
-- impossible even if the cron overlaps itself or is replayed.
create table if not exists public.pet_care_reminders (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references public.pet_care_tasks(id) on delete cascade,
  on_date         date not null,
  notification_id uuid references public.notifications(id) on delete set null,
  sent_at         timestamptz not null default now(),
  unique (task_id, on_date)
);

create index if not exists pet_care_reminders_date_idx
  on public.pet_care_reminders (on_date desc);

alter table public.pet_care_reminders enable row level security;

-- Readable by whoever can see the task. Writes come from the cron on the
-- service-role key, which bypasses RLS, so no insert path is granted here.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and policyname='pet_care_reminders_read'
  ) then
    create policy pet_care_reminders_read on public.pet_care_reminders for select using (
      exists (
        select 1
        from public.pet_care_tasks ct
        join public.pets p on p.id = ct.pet_id
        where ct.id = pet_care_reminders.task_id
          and (p.owner_id = auth.uid() or public.is_admin())
      )
    );
  end if;
end $$;

-- ------------------------------------------------------------ updated_at
create or replace function public.touch_pet_care_tasks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists pet_care_tasks_touch_updated_at on public.pet_care_tasks;
create trigger pet_care_tasks_touch_updated_at
  before update on public.pet_care_tasks
  for each row execute function public.touch_pet_care_tasks_updated_at();
