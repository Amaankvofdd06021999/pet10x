-- pet_care_tasks could only say "at 17:00, on these weekdays". That covers
-- meals and walks and nothing else an owner actually needs reminding about:
-- a monthly flea treatment, a six-month heartworm course, an annual booster.
--
--   daily     scheduled_at + days_of_week   (existing behaviour, unchanged)
--   interval  every N days from next_due_on (flea = 30, heartworm = 180)

alter table public.pet_care_tasks
  add column if not exists recurrence    text not null default 'daily',
  add column if not exists interval_days integer,
  add column if not exists next_due_on   date,
  add column if not exists starts_on     date,
  add column if not exists ends_on       date,
  add column if not exists dose          text;

alter table public.pet_care_tasks drop constraint if exists pet_care_tasks_recurrence_check;
alter table public.pet_care_tasks
  add constraint pet_care_tasks_recurrence_check check (recurrence in ('daily', 'interval'));

alter table public.pet_care_tasks drop constraint if exists pet_care_tasks_interval_shape_check;
alter table public.pet_care_tasks
  add constraint pet_care_tasks_interval_shape_check check (
    (recurrence = 'daily'    and interval_days is null)
    or
    (recurrence = 'interval' and interval_days is not null and interval_days > 0 and next_due_on is not null)
  );

alter table public.pet_care_tasks drop constraint if exists pet_care_tasks_course_bounds_check;
alter table public.pet_care_tasks
  add constraint pet_care_tasks_course_bounds_check check (
    starts_on is null or ends_on is null or ends_on >= starts_on
  );

create index if not exists pet_care_tasks_next_due_idx
  on public.pet_care_tasks (next_due_on)
  where recurrence = 'interval' and is_active;

comment on column public.pet_care_tasks.ends_on is
  'Last day the course runs. The sweep stops raising past it, so a finite course retires itself.';
comment on column public.pet_care_tasks.dose is
  'Free text as written on the packet ("1 tablet", "0.5 ml") — dosing is not a number we should reinterpret.';
