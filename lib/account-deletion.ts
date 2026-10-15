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
  /**
   * At businesses the caller owns: active staff OTHER than the caller, and
   * clinic patient records. Optional so a caller with no business can omit it.
   */
  businessDependants?: { otherActiveStaff: number; patients: number }
}

/**
 * Why the account cannot be deleted yet, as a sentence for the person — or
 * null when nothing stands in the way.
 *
 * An open case or an owed fine keeps its subject: once the account is gone
 * the record says nobody, and a case that is still being decided must not
 * lose the person it is about. A business with staff or patient records
 * would take colleagues' and pet owners' records with it, and one with
 * bookings still to answer would leave customers waiting on nobody.
 */
const HAS_DEPENDANTS =
  "Your business has staff or patient records that others rely on. Transfer ownership first, or contact support and we'll help close it properly."
const HAS_OPEN_BOOKINGS =
  "Your business has bookings that are still open. Decline, cancel or complete them in your business console before deleting the account."
const openCaseSentence = (where: string) =>
  `You have an open bylaw case ${where}. It needs to be closed before the account can be deleted — contact your building manager.`

/** The blockers that read the same for everyone (lib/user-error.ts lists them). */
export const DELETION_SENTENCES: readonly string[] = [HAS_DEPENDANTS, HAS_OPEN_BOOKINGS, openCaseSentence("with your building")]

/** The open-case blocker names the building, so it is matched by its shape. */
export const DELETION_SENTENCE_PATTERNS: readonly RegExp[] = [
  /^You have an open bylaw case with [^\n]{1,200}\. It needs to be closed before the account can be deleted — contact your building manager\.$/,
]

export function deletionBlocker(facts: DeletionFacts): string | null {
  const openCase = facts.cases.find((c) => !CLOSED_STAGES.has(c.stage))
  const owedFine = facts.fines.find((f) => OUTSTANDING_FINE.has(f.status))
  const blocking = openCase ?? owedFine
  if (blocking) {
    const where = blocking.buildingName ? `with ${blocking.buildingName}` : "with your building"
    return openCaseSentence(where)
  }
  // Deleting an owner deletes the business, and with it every clinic
  // customer, patient and record (business_id cascades). Colleagues and pet
  // owners rely on those; ownership has to move first.
  const dep = facts.businessDependants
  if (dep && (dep.otherActiveStaff > 0 || dep.patients > 0)) {
    return HAS_DEPENDANTS
  }
  if (facts.businessBookings.some((b) => OPEN_BOOKING.has(b.status))) {
    return HAS_OPEN_BOOKINGS
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
