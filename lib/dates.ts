/**
 * Pet10x — one rule for what a stored date means, and one place that states it.
 *
 * THE RULE. Postgres hands this app two different things through the same
 * JSON string type, and they are not interchangeable:
 *
 *   - a `date` column arrives as a bare `YYYY-MM-DD`. It is a CALENDAR DATE.
 *     It names a square on a wall calendar and carries no instant, no zone and
 *     no time. `pet_documents.expires_on`, `pet_vaccinations.expires_on`,
 *     `pet_medications.next_due_at`, `fines.due_on`, `violation_events
 *     .occurred_on`, `pets.date_of_birth` and `pet_vet_visits.visited_on` are
 *     all of this kind.
 *   - a `timestamptz` column arrives as a full ISO instant with a zone.
 *     `created_at`, `filed_at`, `decided_at`, `resolved_at` are of this kind.
 *
 * `new Date(s)` treats the first as UTC MIDNIGHT — that is what ECMA-262
 * specifies for a date-only form — and every local-zone method then reads it
 * as the PREVIOUS day everywhere west of Greenwich. So a fine due 2026-07-25
 * renders "July 24" at UTC-7, and a document expiring today reads `expired`
 * from local midnight until 17:00.
 *
 * WHY THIS FILE EXISTS RATHER THAN A HELPER PER SCREEN. Phase 5's review found
 * the repo spelling this one rule four ways — a private local-midnight helper
 * on the resident's case screen, a `T00:00:00` string splice in vet records and
 * `auth-context`, UTC-keyed arithmetic in the care schedule and the reminder
 * cron, and a bare `new Date(col)` in `live.ts` and `lib/ai/context.ts` (the
 * two that were actually wrong: one drives a COMPLIANCE BADGE, the other is
 * written into an LLM prompt as fact). Four spellings of one rule is the shape
 * of duplicated truth this project has already paid for twice, and the fix for
 * it is a module, not a fifth spelling.
 *
 * Pure functions only, no React and no Supabase client, so it is testable under
 * vitest's `environment: "node"` and importable from a server route, a client
 * component and `lib/ai` alike. `lib/dates.test.ts` pins the rule, and it pins
 * it under a fixed `TZ` on BOTH sides of UTC — a test about a zone bug that
 * only passes in the author's zone proves nothing.
 */

/** A bare `YYYY-MM-DD`. Anything else is treated as an instant. */
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const DAY_MS = 24 * 60 * 60 * 1000

export type DateInput = string | Date | null | undefined

/** True when `value` is a bare `YYYY-MM-DD` — a Postgres `date`, not an instant. */
export function isCalendarDate(value: string): boolean {
  return CALENDAR_DATE.test(value)
}

/**
 * Parse anything a row hands us into the `Date` it actually means.
 *
 * A calendar date becomes LOCAL midnight of that calendar day, so the square on
 * the wall calendar stays the square it was written as. An instant is parsed
 * normally and converted to the viewer's zone, which for an instant is correct.
 *
 * Returns `null` rather than an Invalid Date, so callers have to say what they
 * render when there is nothing to render instead of leaking "NaN" or "Invalid
 * Date" to a resident.
 */
export function parseDbDate(value: DateInput): Date | null {
  if (value == null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const bare = CALENDAR_DATE.exec(value)
  const d = bare
    ? new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]))
    : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

/*
 * Three presentations, not one — the resident's case screen speaks in full
 * months and the manager's queue does not have the width for it. What is shared
 * is the RULE above; the wording stays a per-surface decision, and so does the
 * fallback, which is why each takes one. A screen that renders "—" and one that
 * renders "an unknown date" are both right for their own sentence, and forcing
 * one on both would be consolidating the wrong half.
 */

/** "June 27, 2026". */
export function longDate(value: DateInput, fallback = "—"): string {
  const d = parseDbDate(value)
  return d === null
    ? fallback
    : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

/** "Aug 23, 2026". */
export function shortDate(value: DateInput, fallback = "—"): string {
  const d = parseDbDate(value)
  return d === null
    ? fallback
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/** "Aug 23" — a queue column, where the year is noise. */
export function shortDay(value: DateInput, fallback = ""): string {
  const d = parseDbDate(value)
  return d === null ? fallback : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/* ------------------------------------------------------------------ */
/* Calendar-day arithmetic                                             */
/* ------------------------------------------------------------------ */

/**
 * The `YYYY-MM-DD` a value falls on IN THE VIEWER'S ZONE.
 *
 * `iso.slice(0, 10)` is the wrong way to do this and was doing it in the CRT
 * export: it takes the UTC calendar day off a `timestamptz`, so an appeal filed
 * at 6pm local exported as the next day — in the document a tribunal reads.
 */
export function localDayKey(value: DateInput): string {
  const d = parseDbDate(value)
  if (d === null) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today's calendar day in the viewer's zone. `now` is injected so tests can pin it. */
export function todayKey(now: Date = new Date()): string {
  return localDayKey(now)
}

/**
 * Whole calendar days from `fromKey` to `toKey`, both bare `YYYY-MM-DD`.
 *
 * Both sides are keyed to the SAME midnight, so the difference is a count of
 * squares on the calendar and nothing else. `Math.round` rather than a truncate
 * because a DST boundary makes one of these "days" 23 or 25 hours long, and
 * truncating turns that into an off-by-one twice a year.
 *
 * Returns `null` when either side is not a calendar date, so a caller cannot
 * silently get `NaN` days and render "NaN days ago".
 */
export function calendarDaysBetween(fromKey: string, toKey: string): number | null {
  const from = parseDbDate(fromKey)
  const to = parseDbDate(toKey)
  if (from === null || to === null || !isCalendarDate(fromKey) || !isCalendarDate(toKey)) return null
  return Math.round((to.getTime() - from.getTime()) / DAY_MS)
}

/**
 * `key` plus `days`, as a calendar date.
 *
 * UTC-keyed internally on purpose: this is pure calendar arithmetic — a date in
 * and a date out, never displayed as an instant — and UTC is the only zone with
 * no DST to make "+30 days" land on the wrong square.
 */
export function addCalendarDays(key: string, days: number): string | null {
  if (!isCalendarDate(key)) return null
  const d = new Date(`${key}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Whole calendar days from today until `value`. Negative when it has passed,
 * **0 on the day itself**.
 *
 * That zero is the whole point. `Math.round((new Date(col) - Date.now()) / DAY)`
 * — which is what `docStatusFromExpiry` and `relativeDays` both did — compares a
 * UTC midnight against a local instant, so a vaccination expiring TODAY came
 * out as `-1` and was described to the model as "1 day ago", and a document
 * expiring today was badged `expired` for the first seventeen hours of the day
 * at UTC-7. A thing that expires today has not expired.
 *
 * An instant is reduced to the calendar day it falls on in the viewer's zone
 * first, so "in 1 day" means "tomorrow" rather than "in more than 24 hours".
 */
export function daysUntil(value: DateInput, now: Date = new Date()): number | null {
  const key = localDayKey(value)
  if (key === "") return null
  return calendarDaysBetween(todayKey(now), key)
}
