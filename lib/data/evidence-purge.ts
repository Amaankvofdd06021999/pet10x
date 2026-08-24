/**
 * Pet10x — which evidence objects a sweep may remove.
 *
 * Pulled out of `app/api/incidents/evidence/purge/route.ts` so the decision to
 * delete can be tested without a bucket. Everything here is pure: it takes a
 * listing, a cutoff and the set of claimed paths, and returns a verdict. The
 * route does the I/O either side of it.
 *
 * The deletion is irreversible and the objects are evidence in live cases, so
 * every ambiguity in this file resolves the same way — toward keeping the file.
 */

export interface EvidenceObject {
  path: string
  /** As storage reports it. Null or unparseable means the age is unknown. */
  createdAt: string | null
}

/**
 * The only path shape `submit_incident_report` will accept as evidence:
 * `{buildingId}/{draftId}/{name}`, uuids, and a name that starts alphanumeric.
 * Mirrors the anchored regex in 20260822000001_evidence_path_hardening.sql.
 *
 * This is a *precondition*, not decoration. `postgrest-js` serialises the
 * `&&` operand as `ov.{a,b,c}` with no quoting or escaping, so a path holding
 * a comma, brace, quote, backslash or whitespace would be split or mangled on
 * the way to Postgres, match nothing, and be deleted as unclaimed — the one
 * bug class this route must not have. A path that cannot be claimed also
 * cannot be proven claimed, so anything off this shape is left alone rather
 * than sent to the claim query. The RPC's regex and the bucket's missing
 * INSERT policy make such a path unreachable today; enforcing it here means a
 * future relaxation of either one cannot quietly arm the delete.
 */
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
export const CLAIMABLE_PATH = new RegExp(`^${UUID}/${UUID}/[A-Za-z0-9][A-Za-z0-9._-]*$`)

export interface AgePartition {
  /** Old enough AND shaped so a claim can be proven. Only these may be deleted. */
  candidates: string[]
  /** Genuinely too recent — a report that may still be being written. */
  tooYoung: number
  /**
   * Age unreadable, so left alone. Counted apart from `tooYoung` on purpose:
   * an object with a permanently unreadable timestamp is spared forever, and
   * folding it into "young" would hide a leak inside the route that exists to
   * stop leaks.
   */
  undated: number
  /** Old enough, but off the claimable shape. Never deleted, never queried. */
  malformed: string[]
}

/** When the object was uploaded, in epoch ms, or NaN if that cannot be read. */
export function uploadedAt(object: EvidenceObject): number {
  return object.createdAt ? Date.parse(object.createdAt) : Number.NaN
}

/**
 * Split a listing into what may be considered for deletion and what may not.
 *
 * `cutoff` is an epoch-ms instant: an object is old enough when it was
 * uploaded at or before it.
 */
export function ageEligible(objects: readonly EvidenceObject[], cutoff: number): AgePartition {
  const partition: AgePartition = { candidates: [], tooYoung: 0, undated: 0, malformed: [] }
  for (const object of objects) {
    const uploaded = uploadedAt(object)
    // A missing or unreadable timestamp is not evidence of age. If we cannot
    // show the object is old, it stays.
    if (!Number.isFinite(uploaded)) {
      partition.undated++
      continue
    }
    if (uploaded > cutoff) {
      partition.tooYoung++
      continue
    }
    if (!CLAIMABLE_PATH.test(object.path)) {
      partition.malformed.push(object.path)
      continue
    }
    partition.candidates.push(object.path)
  }
  return partition
}

/**
 * Drop every path attached to a filed report.
 *
 * `claimed` is deliberately allowed to be over-inclusive — the caller builds it
 * from whole matching rows rather than just the intersecting elements, so an
 * error in that direction spares a file instead of destroying one.
 */
export function unclaimed(
  paths: readonly string[],
  claimed: ReadonlySet<string>,
): { remove: string[]; spared: string[] } {
  const remove: string[] = []
  const spared: string[] = []
  for (const path of paths) (claimed.has(path) ? spared : remove).push(path)
  return { remove, spared }
}
