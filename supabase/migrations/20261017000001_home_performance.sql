-- Home performance: suggestions are built nightly (and once on a resident's
-- first visit) instead of on every Home visit.
--
--   * cron_cursors — where a nightly sweep stopped, so a run that hits its
--     time budget resumes after the last profile it finished. Server-only:
--     RLS on, no policies, no grants to the app roles; the cron route reaches
--     it with the service role.
--   * profiles.suggestions_last_run_at — null until the owner's suggestions
--     have been built once. Home reads it to decide whether this visit is the
--     first-visit build.

create table if not exists public.cron_cursors (
  name       text primary key,
  cursor     text,
  updated_at timestamptz not null default now()
);

alter table public.cron_cursors enable row level security;
revoke all on public.cron_cursors from anon, authenticated;

alter table public.profiles add column if not exists suggestions_last_run_at timestamptz;
