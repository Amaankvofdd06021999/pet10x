import { describe, it, expect } from "vitest"
import { petDocumentReviewError, canApprovePetDocument } from "./pet-document-review"

describe("petDocumentReviewError", () => {
  it("turns every code the RPC returns into a sentence", () => {
    expect(petDocumentReviewError({ error: "forbidden" })).toMatch(/don't manage/)
    expect(petDocumentReviewError({ error: "not_found" })).toMatch(/no longer exists/)
    expect(petDocumentReviewError({ error: "no_file" })).toMatch(/no file/)
    expect(petDocumentReviewError({ error: "note_required" })).toMatch(/why/)
    expect(petDocumentReviewError({ error: "verdict_required" })).toMatch(/Approve or reject/)
    expect(petDocumentReviewError({ error: "already_reviewed", status: "approved" })).toBe(
      "This document has already been approved.",
    )
    expect(petDocumentReviewError({ error: "note_too_long", length: 2100, max: 2000 })).toBe(
      "Your note is 2100 characters; the limit is 2000.",
    )
  })

  it("never swallows a code it was not taught", () => {
    expect(petDocumentReviewError({ error: "brand_new" })).toBe("Couldn't record the decision (brand_new).")
    expect(petDocumentReviewError({})).toBe("Couldn't record the decision.")
  })
})

describe("canApprovePetDocument", () => {
  it("needs a stored file — there is nothing to approve without one", () => {
    expect(canApprovePetDocument({ storagePath: null, docStatus: "current" })).toBe(false)
    expect(canApprovePetDocument({ storagePath: "u/p/f.pdf", docStatus: "current" })).toBe(true)
  })

  it("does not offer to approve what is already approved", () => {
    expect(canApprovePetDocument({ storagePath: "u/p/f.pdf", docStatus: "approved" })).toBe(false)
  })
})
