/**
 * Pet10x — a manager's verdict on a pet's document, the pure half.
 *
 * `manager_review_pet_document` (20261008000003) is the only way a manager
 * writes to `pet_documents`. This module answers the two questions a screen
 * asks before and after calling it, so the approvals screen and the strata
 * queue cannot answer them differently.
 */

/**
 * Approve is offered only where the RPC would act: a stored file, not yet
 * approved, and not lapsed — `manager_review_pet_document` refuses `expired`
 * when expires_on is before today (20261008000006). `today` is a YYYY-MM-DD
 * local day, passed in so this stays pure.
 */
export function canApprovePetDocument(
  doc: { storagePath: string | null; docStatus: string; expiresOn?: string | null },
  today: string,
): boolean {
  if (doc.storagePath === null || doc.docStatus === "approved") return false
  return !doc.expiresOn || doc.expiresOn >= today
}

/** The RPC's rejection codes, as sentences. */
export function petDocumentReviewError(r: {
  error?: string
  status?: string
  length?: number
  max?: number
}): string {
  switch (r.error) {
    case "forbidden":
      return "You don't manage this pet's building."
    case "not_found":
      return "That document no longer exists, or its pet was removed."
    case "verdict_required":
      return "Approve or reject the document."
    case "no_file":
      return "There is no file on this document to approve. Ask the owner to upload one."
    case "note_required":
      return "Say why you are rejecting it — the owner is told exactly what you write."
    case "note_too_long":
      return `Your note is ${r.length ?? 0} characters; the limit is ${r.max ?? 2000}.`
    case "expired":
      return "This document has expired, so it can't be approved. Ask the owner to upload the renewal."
    case "already_reviewed":
      return `This document has already been ${r.status ?? "reviewed"}.`
    default:
      return r.error ? `Couldn't record the decision (${r.error}).` : "Couldn't record the decision."
  }
}
