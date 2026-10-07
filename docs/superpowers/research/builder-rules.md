# Rules every builder on `pet10x-gaps` follows (2026-10-07)

- Do ALL the work yourself — do not spawn sub-agents. Stay on branch
  `pet10x-gaps`; never create branches, never push.
- Read your part's spec in `docs/superpowers/specs/` fully first, then the
  research notes in `docs/superpowers/research/`. Research notes were taken
  before earlier parts landed — re-verify anything you rely on against the
  current code.
- Match surrounding code: comment density and voice, naming, idioms.
- pnpm is not on PATH: prefix `PATH="$HOME/.corepack-bin:$PATH"`. Never upgrade
  pnpm.
- No Supabase CLI, Docker, psql, or DB access. Write migrations to
  `supabase/migrations/` using your part's number block (check `ls` first).
  Verify every table, column, function, enum and policy name you reference by
  grepping `supabase/migrations/` and `lib/supabase/database.types.ts`. When
  replacing a SQL function, copy its LATEST definition (newest migration file
  wins) verbatim and change only what you need. `SECURITY DEFINER` functions
  set `search_path = public, pg_temp`, revoke from `public` and `anon`, grant
  to `authenticated` (or nobody, for trigger functions).
- Put the spec's SQL checks in `supabase/tests/part-<x>.sql`: one rolled-back
  transaction, `set local role authenticated` + `request.jwt.claims`, each
  check raising on failure (see `supabase/tests/part-a-archive.sql`).
- Hand-edit `lib/supabase/database.types.ts` for new columns/functions so
  `tsc` passes.
- RLS is the floor, the query is the filter: every read names its scope.
- A control that cannot act must not exist. No `toast()` in place of a
  mutation. Errors from RPCs become readable sentences, never raw Postgres.
- Cross-user writes (including every notification not addressed to self) go
  through `SECURITY DEFINER`.
- TDD for pure logic: vitest tests beside the module (`*.test.ts`).
- Commit in small logical commits (style: `git log`), ending each message with
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
  `git add <paths>` only — never `git add -A` or `git add .`. Leave
  `public/SingleDog.mp4` untracked.
- Done means: every spec section implemented; `pnpm test` passes;
  `npx tsc --noEmit -p .` exits 0; `pnpm build` exits 0; all committed.
- Report back under 500 words: commits (hash + subject), migration filenames,
  test counts, decisions beyond the spec, anything unsure or not done.
