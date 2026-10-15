# Home Performance and Leftovers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the resident Home screen load noticeably faster and close the three deferred items, without a data-layer rewrite.

**Architecture:** Suggestions move from a per-visit server rebuild to a nightly cron (plus one first-visit build). Home's hooks stop duplicating and waterfalling; shared module-level caches follow the existing pets-store pattern in `lib/data/live.ts`. Non-Home screens load through `next/dynamic`. One migration ships through the bundle flow.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, vitest (Node), pnpm 9.15.9.

**Spec:** `docs/superpowers/specs/2026-10-15-home-performance-design.md`

## Global Constraints

- pnpm is not on PATH: prefix commands with `PATH="$HOME/.corepack-bin:$PATH"`. Do not upgrade pnpm.
- Green gate for every task: `pnpm test`, `npx tsc --noEmit -p .`, `pnpm lint` (0 errors); `pnpm build` in Tasks 3 and 5 and at the end.
- Validate with a positive grammar: state what is allowed, never a denylist.
- Never `supabase db push`. The one new migration is `supabase/migrations/20261017000001_home_performance.sql`. Change `supabase/bundles/build.sh` cutoff to `20261017`, add `part-i` to its checks list, and change the "from branch ux-followups" text to `perf-and-leftovers`. SQL checks go in `supabase/tests/part-i.sql` (house style of part-h: one transaction ending in ROLLBACK, actors from live data, RAISE on failure). Regenerate bundles with `bash supabase/bundles/build.sh`.
- Permission checks in SQL are NULL-safe. New tables: RLS on.
- No raw database or Supabase error text reaches a user or an HTTP response body: use `dbErrorMessage` (`lib/data/db-error.ts`), log detail with `console.error`.
- Do not change user-visible behaviour except where this plan says so. Copy: sentence case, second person.
- One implementer at a time on this tree. Do not touch the live database outside the bundle flow.

## Review Focus

1. The nightly job uses the service-role client, so RLS no longer scopes it: a suggestion or notification must never be written for a pet the profile does not own. (Task 1 test: `runSuggestions` called for owner A never reads or writes pets of owner B — every rules query filters by the owner's pet ids.)
2. The cursor: a sweep that finishes resets to the start; a profile deleted between runs does not stall or skip the rest; a run that times out mid-batch resumes after the last *completed* profile. (Task 1 tests on the pure cursor helper.)
3. Stale shared caches: after a resident requests, is approved for, or leaves a building, Home's building link updates without a reload. (Task 2: every writer that changes the link calls `refreshMyBuildingLink()`; test the store.)
4. Care tiles after logging: logging food/water/walk from a tile updates that tile and its siblings immediately. (Task 2: the shared care read exposes `refetch`, and the log action calls it.)
5. Lazy screens: opening a deep link straight to a non-Home screen, or a first open while offline, shows the existing skeleton then the existing error state — never a blank page. (Task 3: a `loading` component on every `dynamic()` call; manual check listed in the report.)

---

### Task 0: Baseline (controller, no implementer)

- [ ] On `perf-and-leftovers` before Task 1: `pnpm build` and record the `/app` route's First Load JS from the build output in the ledger.
- [ ] Record Home's request count for one warm visit: in the user's own logged-in browser on www.pet10x.com, Network panel filtered to Fetch/XHR, reload Home, count requests (read-only navigation; never sign in on the user's behalf). If no logged-in browser is available, record the static count of queries Home's mount path issues (from the spec's table) instead and say so.

### Task 1: Migration and nightly suggestions

**Files:** Create `supabase/migrations/20261017000001_home_performance.sql`, `supabase/tests/part-i.sql`, `lib/ai/suggestions/nightly.ts` (+ `nightly.test.ts`), `app/api/ai/suggestions/nightly/route.ts`. Modify `lib/ai/suggestions/run.ts`, `app/api/ai/suggestions/run/route.ts`, `lib/ai/client.ts` (`useAiSuggestions`), `components/screens/home-screen.tsx` (the `useEffect` at ~line 134), `vercel.json`, `supabase/bundles/build.sh`, `lib/supabase/database.types.ts` (hand-add the table and column), bundles.

**Interfaces:**
- Produces: `GET /api/ai/suggestions/run` returns `{ suggestions, firstRun: boolean }` where `firstRun` is true only when `profiles.suggestions_last_run_at` is null.
- Produces: `nextBatch(profileIds: string[], cursor: string | null, size: number): { batch: string[]; done: boolean }` and `advanceCursor(processed: string[], done: boolean): string | null` in `nightly.ts` (pure).

- [ ] Migration: `create table public.cron_cursors (name text primary key, cursor text, updated_at timestamptz not null default now())`; RLS on; no policies; `revoke all ... from anon, authenticated`. `alter table public.profiles add column if not exists suggestions_last_run_at timestamptz`.
- [ ] part-i.sql: authenticated cannot select/insert `cron_cursors` (expect 42501 or zero rows per the house pattern); the column exists and is nullable.
- [ ] Write failing tests for `nextBatch`/`advanceCursor`: ids `["a","b","c","d","e"]`, size 2 — cursor null → `["a","b"]`, done false; cursor `"b"` → `["c","d"]`; cursor `"d"` → `["e"]`, done true, `advanceCursor` returns null; cursor `"bb"` (a deleted profile, between b and c) → `["c","d"]`; empty list → `[]`, done true. Ids compare as plain strings (uuid order).
- [ ] Implement them; tests pass.
- [ ] `run.ts`: no change to rule logic. After a run completes (any result, including zero hits), set `profiles.suggestions_last_run_at = now()` for `ownerId` using `getSupabaseAdmin()` (log, don't throw, on failure). Add a test, or extend an existing one, asserting every query in `rules.ts` is scoped with `.in("pet_id", <owner's pet ids>)` — Review Focus 1.
- [ ] Nightly route `GET /api/ai/suggestions/nightly`: same `CRON_SECRET` check as `app/api/care/reminders/run/route.ts`; `export const maxDuration = 300`; admin client; read cursor row `name = 'suggestions_nightly'`; list `profiles.id` that own ≥1 pet with `deleted_at is null`, ordered by id, greater than cursor, limit 200; loop `runSuggestions(admin, id)` one at a time, catching and `console.error`-ing per profile; stop when 240 s have elapsed; upsert the cursor with the last completed id (or null when the list was exhausted). Respond `{ ok: true, processed, failed, done }`.
- [ ] `vercel.json`: add `{ "path": "/api/ai/suggestions/nightly", "schedule": "0 7 * * *" }`.
- [ ] GET route adds `firstRun`. `useAiSuggestions` exposes it. Home: remove the every-visit `run()`; when `firstRun` is true and pets exist, fire `run()` once after paint (`requestIdleCallback` with a `setTimeout` fallback), then refetch once.
- [ ] Regenerate bundles; gate; commit.

### Task 2: Home data — shared caches and one care read

**Files:** `lib/data/live.ts`, `components/screens/home/today-care-tiles.tsx`, `components/screens/home/case-card.tsx`, `components/screens/home-screen.tsx`, `lib/data/completeness.ts`, `lib/data/care-schedule.ts`, plus every caller of `request_building_link` / leave-building writers (grep `request_building_link`, `leave_building`, `resident_links`).

**Interfaces:**
- Produces: `useMyBuildingLink()` keeps its signature and return type but reads a module-level store; `refreshMyBuildingLink(): Promise<void>` exported from `lib/data` and `lib/data/live.ts`.
- Produces: `usePetCareToday(petId: string | undefined, kinds: CareEntryKind[]): { entriesByKind: Record<CareEntryKind, CareEntry[]>; targets: CareTarget[]; isLoading: boolean; error: string | null; refetch: () => void }`.

- [ ] Building link store: model it on the pets store (`refreshPets`/`usePets`, live.ts ~250-330): one in-flight promise, subscribers, reset on auth account change. Unit-test the store's dedupe (two subscribers → one RPC) with a mocked client if the pets store has a test pattern; otherwise test the pure reducer.
- [ ] Every writer that creates, approves (resident side), withdraws or leaves a building link calls `refreshMyBuildingLink()` after success — Review Focus 3.
- [ ] `usePetCareToday`: one `care_targets` select for the pet and one `care_entries` select `.in("kind", kinds)` with the same date window and limit logic `useCareEntries` uses today (read it; keep its semantics), run in parallel. `TodayCareTiles` calls it once and passes slices to each `CareTile`; `CareTile` no longer calls `useCareEntries`/`useCareTargets`. The tile's log action calls `refetch` — Review Focus 4. Explicit column lists, not `select("*")`.
- [ ] `useMyCompleteness`: take pet ids from `usePets()`; query only `pet_vaccinations`, `pet_documents`, `pet_emergency_contacts` by `.in("pet_id", ids)` plus profiles and resident_links, all in one `Promise.all`; the `buildings.pet_rules` read joins that `Promise.all` once the building id is known from the building-link store. Output identical to today (existing tests must pass unchanged).
- [ ] `useHouseholdCareTasks`: tasks and log in parallel when the log query does not need task ids; if it does, keep the order and note why in the report.
- [ ] `useMyCases`: add `.limit(50)` ordered newest first; no other change.
- [ ] Home: remove the mount-time `refreshNotifications()` call; rely on the store's `ensure()`.
- [ ] Gate; commit.

### Task 3: Load screens on demand

**Files:** `app/app/page.tsx`; a new `components/screen-loading.tsx` only if no suitable skeleton exists (look in `components/screens/shared/ui.tsx` for `SkeletonRows` first).

- [ ] Keep `HomeScreen`, the shell, tab bar and sidebar as static imports. Convert every other screen import (resident, manager, clinic, admin) to `const X = dynamic(() => import("…").then(m => m.X), { loading: () => <ScreenLoading /> })`. Client page, so `ssr` stays default; no `ssr:false` needed unless a screen touches `window` at import time (fix by keeping that one static and noting it).
- [ ] Manual checks in the report: a deep link to a non-Home screen URL (format in `lib/app-route.ts`) paints the skeleton then the screen; switching screens repeatedly does not re-download.
- [ ] `pnpm build`; record `/app` First Load JS before (Task 0 value) and after in the report. Gate; commit.

### Task 4: The three leftover items

**Files:** `lib/data/clinic/use-live.ts` and every `useLive(` caller (grep; ~13 files); `lib/data/clinic/billing.ts` (+test), `components/screens/clinic/billing-screen.tsx`; all seven cron routes (`app/api/{ai/media/purge,care/reminders/run,incidents/evidence/purge,accommodations/docs/purge,auth/signup/purge,notifications/dispatch,ai/suggestions/nightly}/route.ts`); create `lib/cron-failure.ts` (+test).

**Interfaces:**
- Produces: `useLive<T>(what: string, initial: T, load, deps, enabled = true)` — `what` first; error sentence `Couldn't load ${what}. Try again.`
- Produces: `takenTodayByCurrency(payments: Array<{ amountCents: number; currency: string; createdAt: string; invoiceStatus: string }>, now: Date, tz: string): Array<{ currency: string; cents: number }>` sorted by currency; replaces `takenTodayCents`.
- Produces: `cronFailure(step: string, err: unknown): { error: string; step: string; code: string | null }`.

- [ ] `useLive`: add `what` as the first parameter and remove `LOAD_FAILED`. Update every caller with a plain noun phrase for what it loads ("patients", "the schedule", "your vets", "this case's timeline", …). Test: a loader that throws an unknown error yields `Couldn't load patients. Try again.`
- [ ] `takenTodayByCurrency` with tests: two CAD payments today + one USD today + one CAD yesterday + one CAD on a void bill → `[{CAD, sum of two}, {USD, …}]`; empty → `[]`. Taken today tile: one entry renders exactly as today; several render joined with ` · `, each formatted with its currency code ("$120.00 CAD · $40.00 USD"). Loading/error states unchanged. The payments read must include the invoice's currency (extend `usePaymentsSince` select).
- [ ] `cronFailure`: `step` must match `^[a-z_]{1,40}$` else `"unknown"`; `code` is the error's `code` property only if it matches `^[0-9A-Z]{5}$` (SQLSTATE) or `^[a-z_]{1,40}$` (storage/our codes), else null; `error` is the fixed sentence "The job couldn't finish. The server log has the detail."; always `console.error(step, err)`. Tests for each branch, including an error whose message contains a constraint name — never echoed.
- [ ] Each cron route: wrap each stage so a failure throws or returns `cronFailure("<stage>", err)` with a 500. Stage names are short snake_case literals per route (e.g. `list_expired`, `remove_files`, `forget_paths`).
- [ ] Gate; commit.

### Task 5: Measure and finish (controller)

- [ ] `pnpm build`; record `/app` First Load JS. Repeat the Task 0 request count the same way after deploy (or static count). Record both in the ledger and in the final summary.
- [ ] Whole-branch review, then the release order: dry-run.sql → apply.sql → push (user's OK).
