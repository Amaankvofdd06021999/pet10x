/**
 * Pet10x — the pure half of account deletion (app/api/account/delete).
 *
 * Two decisions live here so vitest can pin them without a database: whether
 * the account may be deleted at all right now, and which storage objects go
 * with it. The route does the I/O.
 */

/** The violation stages that close a case (violation_stage_v2). */
const CLOSED_STAGES = new Set(["resolved", "dismissed"])
/** Fine statuses that still mean money is owed or contested. */
const OUTSTANDING_FINE = new Set(["issued", "partially_paid", "disputed"])
/** Booking statuses a business still has to act on. */
const OPEN_BOOKING = new Set(["requested", "confirmed", "in_progress"])

export interface DeletionFacts {
  /** The caller's cases (violations.resident_id), with their building's name. */
  cases: { stage: string; buildingName: string | null }[]
  /** The caller's fines (fines.resident_id). */
  fines: { status: string; buildingName: string | null }[]
  /** Bookings at businesses the caller owns. */
  businessBookings: { status: string }[]
}

/**
 * Why the account cannot be deleted yet, as a sentence for the person — or
 * null when nothing stands in the way.
 *
 * An open case or an owed fine keeps its subject: once the account is gone
 * the record says nobody, and a case that is still being decided must not
 * lose the person it is about. A business with bookings still to answer
 * would leave customers waiting on someone who no longer exists.
 */
export function deletionBlocker(facts: DeletionFacts): string | null {
  const openCase = facts.cases.find((c) => !CLOSED_STAGES.has(c.stage))
  const owedFine = facts.fines.find((f) => OUTSTANDING_FINE.has(f.status))
  const blocking = openCase ?? owedFine
  if (blocking) {
    const where = blocking.buildingName ? `with ${blocking.buildingName}` : "with your building"
    return `You have an open bylaw case ${where}. It needs to be closed before the account can be deleted — contact your building manager.`
  }
  if (facts.businessBookings.some((b) => OPEN_BOOKING.has(b.status))) {
    return "Your business has bookings that are still open. Decline, cancel or complete them in your business console before deleting the account."
  }
  return null
}

/**
 * A value that names an object in one of our private buckets — not a public
 * asset path (`/placeholder.svg`) and not an absolute URL. The same rule as
 * `isStoragePath` in lib/supabase/storage.ts, which is a client module and
 * cannot be imported into a route.
 */
export function isObjectPath(value: string | null | undefined): value is string {
  return !!value && !value.startsWith("/") && !value.startsWith("http")
}

/** Distinct object paths, dropping anything that is not one. */
export function objectPaths(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter(isObjectPath))]
}

/**
 * A path in `community-media` uploaded by this person. The upload route
 * (app/api/community/media/sign) names every object `{buildingId}/{uid}/…`,
 * so the second segment is the uploader — and only those are taken, even if a
 * row the person authored somehow names somebody else's file.
 */
export function isOwnCommunityObject(path: string, uid: string): boolean {
  const parts = path.split("/")
  return parts.length >= 3 && parts[1] === uid
}
