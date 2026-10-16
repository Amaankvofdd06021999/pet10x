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
 * Where the next "Show older" page starts: rows strictly older than this, or
 * null when there is nothing older to ask for.
 *
 * `timestamps` are the page just loaded, newest first. A full page may have more
 * behind it, so it continues from its oldest row. A short first page has run out
 * of the 90-day window but not of history, so older starts at the cutoff. A
 * short page after that is the end.
 *
 * The cursor is a timestamp, so rows sharing one with the page boundary could be
 * skipped. These columns are microsecond timestamps set by the database, and a
 * collision on the 50th row is not worth a composite cursor.
 */
export function nextClosedCursor(
  timestamps: readonly string[],
  { cutoff, firstPage }: { cutoff: string; firstPage: boolean },
): string | null {
  if (timestamps.length >= CLOSED_PAGE_SIZE) return timestamps[timestamps.length - 1]
  return firstPage ? cutoff : null
}
