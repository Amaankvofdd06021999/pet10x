/**
 * Pet10x — which accommodation documents a sweep may remove.
 *
 * Pure, so the decision to delete a doctor's letter can be tested without a
 * bucket. The route does the I/O either side of it.
 *
 * WHY 400 DAYS, AND WHY NOT ZERO. A denied or withdrawn request still has a
 * doctor's letter in the bucket. Deleting it the moment you deny someone is
 * exactly wrong: a BC Human Rights Code complaint may be filed up to ONE YEAR
 * after the alleged contravention, and the letter is the complainant's own
 * evidence. Keeping it forever is also wrong. `RETENTION_DAYS = 400` is
 * thirteen months from the terminal timestamp, one month past the filing limit,
 * and it applies to EVERY terminal state including `approved` — the entitlement
 * lives on the request row and on the pet, not in the PDF.
 *
 * THE ROW SURVIVES THE FILE. `retention_expired` sets `storage_path = null` and
 * stamps `purged_at`; it does not delete the row and does not touch `status`.
 * So "an ESA letter was provided on 14 July and verified by Rachel Torres"
 * stays provable after the letter itself is gone.
 *
 * Deletion is irreversible and the objects are evidence in live human-rights
 * matters, so every ambiguity here resolves the same way — toward keeping the
 * file. An undated object is kept forever. A malformed path is kept forever. A
 * request this sweep cannot see is treated as a request that exists.
 *
 * REUSED FROM `./evidence-purge`, not re-derived: `ageEligible`, `unclaimed`,
 * `uploadedAt`, `CLAIMABLE_PATH` and `EvidenceObject`. That regex is
 * `^UUID/UUID/[A-Za-z0-9][A-Za-z0-9._-]*$`, which `{buildingId}/{requestId}/
 * {name}` matches exactly, and its property — "a path that cannot be claimed
 * cannot be proven claimed, so leave it alone" — transfers with it.
 *
 * The RULE is written here and the ROUTE is written separately, and this file
 * deliberately does NOT extend `app/api/incidents/evidence/purge/route.ts`.
 * That route is hard-wired to one bucket and one claim table, and folding a
 * second rule into it would make the deletion of a doctor's letter conditional
 * inside the sweep that deletes incident photos, where a bug in either destroys
 * the other's files.
 */

import { CLAIMABLE_PATH, uploadedAt, type EvidenceObject } from "./evidence-purge"
import { RETENTION_DAYS, MS_PER_DAY, TERMINAL_STATUSES, type AccommodationStatus } from "./accommodations"

export { CLAIMABLE_PATH, uploadedAt, type EvidenceObject }
export { RETENTION_DAYS }

/** An abandoned draft, and an object nothing points at, are both 24 hours old before they count. */
export const MIN_AGE_HOURS = 24

/** The parent request, as the sweep needs to see it. */
export interface PurgeRequest {
  id: string
  status: AccommodationStatus
  decidedAt: string | null
  withdrawnAt: string | null
}

/** One `accommodation_documents` row that still names a file. */
export interface PurgeDocument {
  id: string
  requestId: string
  storagePath: string
}

export type PurgeReason = "abandoned_draft" | "retention_expired" | "orphan"

export interface PurgeVerdict {
  path: string
  reason: PurgeReason
  /** The document row to amend or delete afterwards. Absent for an orphan — there is none. */
  documentId?: string
  requestId?: string
}

export interface Classification {
  remove: PurgeVerdict[]
  /** Old enough and well-formed, but the rules say keep. */
  kept: string[]
  /** Younger than the window. */
  tooYoung: number
  /** Age unreadable, so spared forever. Counted apart from tooYoung on purpose. */
  undated: number
  /** Off the claimable shape. Never deleted, never matched against a row. */
  malformed: string[]
}

/**
 * When a terminal request's documents become removable, in epoch ms, or NaN.
 *
 * `decided_at` for a decision, `withdrawn_at` for a withdrawal. A request with
 * neither has no clock, and NaN compares false against everything, so it is
 * kept — which is what we want for a row whose history we cannot read.
 */
export function retentionExpiryMs(request: PurgeRequest): number {
  if (!TERMINAL_STATUSES.includes(request.status)) return Number.NaN
  const stamp = request.decidedAt ?? request.withdrawnAt
  if (!stamp) return Number.NaN
  const at = Date.parse(stamp)
  if (!Number.isFinite(at)) return Number.NaN
  return at + RETENTION_DAYS * MS_PER_DAY
}

/**
 * Split a bucket listing into what may be removed and what may not.
 *
 * `documents` MUST be every row that currently names a storage path, and
 * `requests` every request those rows belong to. A caller that passes a partial
 * set turns "I could not read the table" into "nothing references these
 * objects", which is a delete bug — so the route aborts on any query error
 * rather than calling this with what it managed to fetch.
 *
 * An object is an ORPHAN when no document row names its exact path. That is
 * broader than "segment 2 matches no request", and deliberately so: it also
 * catches a document REPLACED by a re-upload (the row now points at the new
 * path) and one the resident removed while the storage delete failed. Both are
 * unreferenced letters sitting in a private bucket, and neither is caught by a
 * segment-2 test, because the request they belonged to is alive and well.
 */
export function classify(
  objects: readonly EvidenceObject[],
  requests: readonly PurgeRequest[],
  documents: readonly PurgeDocument[],
  now: number,
): Classification {
  const cutoff = now - MIN_AGE_HOURS * 60 * 60 * 1000
  const requestById = new Map(requests.map((r) => [r.id, r]))
  const docByPath = new Map(documents.map((d) => [d.storagePath, d]))

  const out: Classification = { remove: [], kept: [], tooYoung: 0, undated: 0, malformed: [] }

  for (const object of objects) {
    const uploaded = uploadedAt(object)
    // A missing or unreadable timestamp is not evidence of age. If we cannot
    // SHOW the object is old, it stays — forever, if need be.
    if (!Number.isFinite(uploaded)) {
      out.undated++
      continue
    }
    if (!CLAIMABLE_PATH.test(object.path)) {
      out.malformed.push(object.path)
      continue
    }
    if (uploaded > cutoff) {
      out.tooYoung++
      continue
    }

    const doc = docByPath.get(object.path)
    if (!doc) {
      out.remove.push({ path: object.path, reason: "orphan" })
      continue
    }

    const parent = requestById.get(doc.requestId)
    if (!parent) {
      // The row exists and names this file, but its request was not in the set
      // we were given. That is a hole in what we can see, not a fact about the
      // file, so it is kept.
      out.kept.push(object.path)
      continue
    }

    if (parent.status === "draft") {
      out.remove.push({
        path: object.path,
        reason: "abandoned_draft",
        documentId: doc.id,
        requestId: parent.id,
      })
      continue
    }

    const expires = retentionExpiryMs(parent)
    if (Number.isFinite(expires) && now >= expires) {
      out.remove.push({
        path: object.path,
        reason: "retention_expired",
        documentId: doc.id,
        requestId: parent.id,
      })
      continue
    }

    out.kept.push(object.path)
  }
  return out
}

/**
 * THE SERVER LOG IS A SURFACE, and the phase's confidentiality contract named
 * only three (`audit_log`, `notifications`, email).
 *
 * A path in this bucket reads `{buildingId}/{requestId}/esa_letter-1787518255922.pdf`.
 * `20260827000003` refuses to put `kind` into `audit_log` because *"the doc_kind
 * label `esa_letter` contains the word 'letter' and would put the nature of the
 * request into the one table the note was kept out of"* — and the purge route
 * then wrote building, request and `esa_letter` into the log drain together, on
 * every sweep. The reasoning was already written down; the list of surfaces it
 * applied to was short by one.
 *
 * The FINAL SEGMENT carries the doc_kind and the resident's own filename, and it
 * is the part that goes. The two id segments stay: `audit_log` already carries
 * the request id, so redacting them buys nothing and leaves an operator unable
 * to trace a leaked object to anything. The extension survives because `.pdf`
 * says nothing clinical.
 *
 * It lives here rather than in the route so that it is covered by a test — a
 * privacy guarantee nobody can assert against is a comment, not a guarantee.
 */
export function redactPath(path: string): string {
  const cut = path.lastIndexOf("/")
  const file = cut < 0 ? path : path.slice(cut + 1)
  const dot = file.lastIndexOf(".")
  // `dot > 0`, not `>= 0`: a dotfile is all name and no extension.
  const ext = dot > 0 ? file.slice(dot).toLowerCase() : ""
  return cut < 0 ? `<file>${ext}` : `${path.slice(0, cut)}/<file>${ext}`
}

/** How many of each reason, which is what an operator reads the log for. */
export function reasonHistogram(verdicts: readonly PurgeVerdict[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const v of verdicts) out[v.reason] = (out[v.reason] ?? 0) + 1
  return out
}
