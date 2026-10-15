# Home performance and leftover items — design

Date: 2026-10-15 · Branch: `perf-and-leftovers` · Status: approved in chat, awaiting spec review

## Intent

Residents say the app feels sluggish and Home "loads too much". Make Home load
noticeably faster without a rewrite, and close the three items deferred from
the 2026-10-15 follow-up release. Billing is out of scope (later project);
brand tokens are a separate spec.

**Success:** Home's network requests on a warm visit drop by at least half
(measured before/after for a resident with one dog, linked to a building), the
initial `/app` JavaScript shrinks measurably, and no screen behaves
differently except where this spec says so.

## Approach

Targeted fixes plus one small shared cache (chosen over adopting TanStack
Query everywhere, or moving Home to server components). The app already has
module-level stores for pets and notifications; this extends that pattern.

## 1. What Home loads

| Today | After |
|---|---|
| `useEffect` on Home POSTs `/api/ai/suggestions/run` every visit (≈8 queries, maybe a Groq call), then re-GETs | Home GETs saved suggestions once. No POST, except the first-visit case (§2) |
| Each `CareTile` calls `useCareEntries(petId, kind)` and `useCareTargets(petId)` | One `useCareTargets(petId)` and one entries read for the pet's tile kinds, made by `TodayCareTiles` and passed down |
| `useMyBuildingLink()` called by Home and `CaseCard` (no cache) | Shared module-level cache (same shape as the pets store); one RPC per session, refreshed on link changes |
| `useMyCompleteness()` re-selects pets with embeds | Uses the pets cache for pet identity; queries only vaccinations / documents / emergency contacts for those ids |
| `useMyCases`, `useHouseholdCareTasks` (tasks then log), completeness (then `buildings.pet_rules`) run as waterfalls | Independent reads start together (`Promise.all`); dependent reads only where data truly depends |
| `app/app/page.tsx` statically imports every resident, manager and clinic screen | Screens other than Home load with `next/dynamic` on first open, with the existing skeleton as the loading state |
| `refreshNotifications()` on Home mount forces a second fetch when the store is already loaded | Home relies on the store's `ensure()`; no forced refetch on mount |

`useMyCases` gets a sensible limit (open cases plus the most recent closed ones)
rather than an unbounded select.

## 2. Nightly suggestions job

- New cron route `/api/ai/suggestions/nightly`, scheduled `0 15 * * *` (08:00 Pacific,
  11:00 Eastern in daylight time), a morning run so the pushes its
  notifications trigger arrive at a civil hour, guarded by `CRON_SECRET` like the existing crons.
- Uses the service-role client. `runSuggestions` is refactored to take an
  owner id and a client so the same rules run per resident; behaviour per
  resident is unchanged.
- Works through residents who own at least one non-deleted pet, ordered by
  profile id, in batches, and stops with a safety margin before
  `maxDuration`. It records the last processed profile id (a row in a new
  `cron_cursors(name text primary key, cursor text, updated_at timestamptz)` table, no client access) and resumes from it next run; a completed sweep resets
  the cursor.
- One resident's failure is logged (`console.error` with the profile id) and
  skipped.
- Copy: reuses the stored wording for an unchanged suggestion (same
  `dedupe_key`); asks Groq only for new ones; if Groq is unavailable, uses the
  rule's template wording.
- **First visit:** if a resident has never had a run (`profiles.suggestions_last_run_at`
  is null), Home fires one background POST after
  it has painted. Every run, nightly or first-visit, sets that column. After that Home never POSTs.

## 3. Leftover items

1. **Named load errors.** `lib/data/clinic/use-live.ts` takes a `what` label;
   each clinic hook passes its noun ("patients", "billing", "appointments", …),
   giving "Couldn't load {what}. Try again." The generic sentence is removed.
2. **Cron summaries name the failure.** Each cron route's 500 body becomes
   `{ error: "<fixed sentence>", step: "<stage id>", code: "<SQLSTATE or storage code>" }`.
   `step` and `code` are positive-grammar values (`^[a-z_]+$`, `^[0-9A-Z]{5}$`
   or a known storage code), never the raw message, which stays in the log.
3. **Taken today per currency.** `takenTodayCents` becomes `takenTodayByCurrency`
   returning `{ currency, cents }[]`. One currency renders as today; several
   render "$120.00 CAD · $40.00 USD". Never summed across currencies.

## Testing

- Unit tests (vitest, Node): batch cursor advance / resume / reset;
  first-visit decision; per-currency totals; cron step/code sanitiser;
  `use-live` label sentence.
- Existing suite, `tsc`, and `next build` stay green.
- Before/after measurement recorded in the plan's ledger: Home request count
  (browser network panel against production data, read-only navigation) and
  `/app` first-load JS from the build output.

## Database

One migration: `cron_cursors` (RLS on, no client policies) and
`profiles.suggestions_last_run_at timestamptz`. Shipped through the usual
dry-run → apply bundle flow, with checks in a new part file.

## Out of scope

Resident billing; brand tokens and UI primitives; TanStack Query; server
components for Home; image optimisation (`images.unoptimized`) — noted for
later.
