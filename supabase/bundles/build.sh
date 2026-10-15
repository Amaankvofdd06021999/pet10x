#!/usr/bin/env bash
# Rebuilds dry-run.sql and apply.sql from migrations/ (>= 20261017) and tests/.
set -euo pipefail
cd "$(dirname "$0")/.."
M=()
while IFS= read -r f; do M+=("$f"); done < <(ls migrations | awk '$0>="20261017"')
D=$(date +%F)
{
  echo "-- DRY RUN — generated $D from branch perf-and-leftovers by bundles/build.sh."
  echo "-- Applies every migration from 20261017000001 on, runs supabase/tests/part-*.sql,"
  echo "-- then RAISES ON PURPOSE so the whole transaction rolls back. Nothing is saved."
  echo "-- SUCCESS looks like the error:  DRY RUN OK — ..."
  echo "-- Any other error is the first thing that broke; fix it before running apply.sql."
  echo "begin;"
  # Fail fast instead of queueing behind a long-held lock on a live table.
  echo "set local lock_timeout = '5s';"
  for f in "${M[@]}"; do printf '\n-- ===== migration %s =====\n' "$f"; cat "migrations/$f"; echo; done
  for t in part-a-archive part-b part-c part-e part-d part-f part-g part-h part-i; do
    printf '\n-- ===== checks %s =====\n' "$t"
    sed -E 's/^begin;[[:space:]]*$/savepoint checks;/; s/^rollback;[[:space:]]*$/rollback to savepoint checks; reset role;/' "tests/$t.sql"
    echo
  done
  echo
  echo "do \$\$ begin raise exception 'DRY RUN OK — all migrations applied and every check passed; rolled back, nothing saved'; end \$\$;"
} > bundles/dry-run.sql
{
  echo "-- APPLY — generated $D from branch perf-and-leftovers by bundles/build.sh. Run dry-run.sql first."
  echo "-- One transaction: either every migration lands or none does."
  echo "begin;"
  # Fail fast instead of queueing behind a long-held lock on a live table.
  echo "set local lock_timeout = '5s';"
  for f in "${M[@]}"; do printf '\n-- ===== migration %s =====\n' "$f"; cat "migrations/$f"; echo; done
  echo
  echo "-- Record them, so the Supabase CLI / MCP know they are applied."
  echo "do \$\$ begin"
  echo "  if to_regclass('supabase_migrations.schema_migrations') is not null then"
  for f in "${M[@]}"; do v=${f%%_*}; n=${f#*_}; n=${n%.sql}
    echo "    insert into supabase_migrations.schema_migrations (version, name) values ('$v', '$n') on conflict (version) do nothing;"
  done
  echo "  end if;"
  echo "end \$\$;"
  echo "commit;"
} > bundles/apply.sql
echo "migrations: ${#M[@]}"
