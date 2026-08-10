-- Which scheduled task produced this entry, if any.
--
-- Ticking a scheduled meal logs a care entry. Without knowing where an entry
-- came from, un-ticking could only guess which of today's kibble entries to
-- remove — and an entry the owner typed by hand could be deleted by un-ticking
-- a task that had nothing to do with it.
alter table public.care_entries
  add column if not exists source_task_id uuid references public.pet_care_tasks(id) on delete set null;

create index if not exists care_entries_source_task_idx
  on public.care_entries (source_task_id) where source_task_id is not null;

comment on column public.care_entries.source_task_id is
  'The scheduled task whose tick created this entry. Null for entries logged by hand, which un-ticking must never touch.';
