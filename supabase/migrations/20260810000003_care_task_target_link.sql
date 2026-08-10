-- Tie a scheduled task to the thing it is for.
--
-- Targets went multi — two foods, three treat types, several medications — but
-- the schedule did not follow. A task was a free-text label with a kind, so
-- "Breakfast" and "Evening dental chew" existed as words with no connection to
-- the Dry-kibble or Dental-chew targets they were meant to satisfy. Ticking one
-- moved no progress bar, and there was no way to say "two meals a day, and they
-- are different foods".

alter table public.pet_care_tasks
  add column if not exists target_id  uuid references public.care_targets(id) on delete set null,
  add column if not exists log_amount numeric;

create index if not exists pet_care_tasks_target_idx on public.pet_care_tasks (target_id);

alter table public.pet_care_tasks drop constraint if exists pet_care_tasks_log_amount_check;
alter table public.pet_care_tasks add constraint pet_care_tasks_log_amount_check
  check (log_amount is null or log_amount > 0);

comment on column public.pet_care_tasks.target_id is
  'Which care_target this task feeds. ON DELETE SET NULL: removing a target must not delete the routine built around it — the task survives as a plain reminder.';
comment on column public.pet_care_tasks.log_amount is
  'Amount logged against the target when ticked. Null means tick-only, which is right for "brush teeth" and wrong for "1 bowl of kibble".';
