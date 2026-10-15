-- APPLY — generated 2026-10-15 from branch perf-and-leftovers by bundles/build.sh. Run dry-run.sql first.
-- One transaction: either every migration lands or none does.
begin;
set local lock_timeout = '5s';

-- ===== migration 20261017000001_home_performance.sql =====
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


-- Record them, so the Supabase CLI / MCP know they are applied.
do $$ begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    insert into supabase_migrations.schema_migrations (version, name) values ('20261017000001', 'home_performance') on conflict (version) do nothing;
  end if;
end $$;
commit;
