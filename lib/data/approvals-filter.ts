/**
 * Which incidents and accommodation requests are on a manager's desk, and which
 * are history — and how the history is paged.
 *
 * The Approvals queue used to load every row ever filed and filter (or not) in
 * memory, so it only ever grew. These lists are what the queries send to the
 * database instead. Each names the statuses that ARE open and the statuses that
 * ARE closed, rather than excluding one from the other: a status added to an
 * enum later then lands in neither list, and approvals-filter.test.ts fails
 * until somebody decides which side it belongs on.
 *
 * Pure on purpose — vitest runs in Node with no session, so the decisions live
 * here and the hooks only send them.
 */

import type { AccommodationStatus } from "./accommodations"
import type { IncidentStatus } from "./incidents"

export const INCIDENT_OPEN = ["submitted", "triaged", "investigating"] as const satisfies readonly IncidentStatus[]
export const INCIDENT_CLOSED = ["resolved", "dismissed", "linked_to_violation"] as const satisfies readonly IncidentStatus[]

export const ACCOMMODATION_OPEN = ["pending", "info_requested"] as const satisfies readonly AccommodationStatus[]
export const ACCOMMODATION_CLOSED = ["approved", "denied", "withdrawn"] as const satisfies readonly AccommodationStatus[]
/** A draft is the resident's own until they submit it; a manager never sees it. */
export const ACCOMMODATION_NOT_QUEUED = ["draft"] as const satisfies readonly AccommodationStatus[]

export const CLOSED_WINDOW_DAYS = 90
export const CLOSED_PAGE_SIZE = 50

/** The oldest instant the Closed view shows before "Show older" is pressed. */
export function closedCutoff(now: Date): string {
  return new Date(now.getTime() - CLOSED_WINDOW_DAYS * 86_400_000).toISOString()
}

/**
 * Where the next "Show older" page starts. Rows are ordered `ts desc, id desc`,
 * so a position is a (ts, id) pair. `id: null` means "strictly older than ts"
 * (the 90-day cutoff, where the first page already took everything at or after
 * it).
 */
export type ClosedCursor = { ts: string; id: string | null }

/**
 * The cursor for the page after `rows` (the page just loaded, newest first), or
 * null when there is nothing older to ask for.
 *
 * A full page may have more behind it, so it continues from its last row. A
 * short first page has run out of the 90-day window but not of history, so older
 * starts at the cutoff. A short page after that is the end.
 *
 * The id is part of the cursor because timestamps tie: `updated_at` comes from
 * now(), which is the transaction's start, so one delete that nulls a foreign
 * key on 70 rows stamps all 70 identically. A timestamp-only cursor would skip
 * every tied row past the page boundary.
 */
export function nextClosedCursor(
  rows: readonly { ts: string; id: string }[],
  { cutoff, firstPage }: { cutoff: string; firstPage: boolean },
): ClosedCursor | null {
  if (rows.length >= CLOSED_PAGE_SIZE) {
    const last = rows[rows.length - 1]
    return { ts: last.ts, id: last.id }
  }
  return firstPage ? { ts: cutoff, id: null } : null
}

/**
 * The PostgREST `.or()` expression that selects rows after `cursor` in
 * `ts desc, id desc` order: older than ts, or at ts with a smaller id.
 */
export function olderThanFilter(tsColumn: string, cursor: ClosedCursor): string {
  if (cursor.id === null) return `${tsColumn}.lt.${cursor.ts}`
  return `${tsColumn}.lt.${cursor.ts},and(${tsColumn}.eq.${cursor.ts},id.lt.${cursor.id})`
}
