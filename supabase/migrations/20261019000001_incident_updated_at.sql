-- Incident reports record when they last changed.
--
-- The Approvals Closed list dates a report by the last time it changed, which
-- for a resolved or dismissed report is when it closed. incident_reports had
-- only created_at, so a report filed months ago and resolved today could not be
-- found under "last 90 days". Same column and trigger as every other table
-- that has one (public.set_updated_at, init schema).
--
-- Backfill BEFORE the trigger exists: existing rows take created_at, the only
-- date they have, rather than the moment of this migration (which would make
-- every old report look closed today).

alter table public.incident_reports
  add column if not exists updated_at timestamptz not null default now();

update public.incident_reports set updated_at = created_at;

drop trigger if exists trg_incident_reports_updated on public.incident_reports;
create trigger trg_incident_reports_updated
  before update on public.incident_reports
  for each row execute function public.set_updated_at();

-- The Closed list reads one building's closed reports newest change first.
create index if not exists incident_reports_closed_idx
  on public.incident_reports (building_id, updated_at desc, id desc);
