import { describe, it, expect } from "vitest"
import {
  checklistFor,
  legalMoves,
  retentionDeadline,
  missingRequired,
  allRequiredVerified,
  present,
  fileSize,
  REQUIRED_KINDS,
  RETENTION_DAYS,
  MS_PER_DAY,
  type AccommodationDocumentRow,
  type AccommodationStatus,
} from "./accommodations"

function doc(over: Partial<AccommodationDocumentRow> = {}): AccommodationDocumentRow {
  return {
    id: "d1",
    kind: "esa_letter",
    storagePath: "b/r/esa_letter-1.pdf",
    verified: false,
    status: "current",
    label: "letter.pdf",
    mimeType: "application/pdf",
    sizeBytes: 20481,
    uploadedAt: "2026-08-01T00:00:00Z",
    verifiedAt: null,
    reviewNote: null,
    purgedAt: null,
    ...over,
  }
}

const ESA = { type: "esa" as const, animalDesc: "Luna helps me manage panic attacks." }
const SERVICE = { type: "service_animal" as const, animalDesc: "A trained guide dog." }

describe("checklistFor — where the four hardcoded booleans died", () => {
  it("an ESA request with no documents shows the letter as missing, not as a green tick", () => {
    const items = checklistFor(ESA, [])
    const letter = items.find((i) => i.kind === "esa_letter")
    expect(letter).toBeDefined()
    expect(letter!.required).toBe(true)
    expect(letter!.state).toBe("missing")
    expect(letter!.documentId).toBeUndefined()
    // manager-queues.ts:208 had `letterFromProvider: true` as a LITERAL, so
    // this exact case rendered a tick for a file that did not exist.
  })

  it("an unverified letter reads provided, not verified — a real state", () => {
    const items = checklistFor(ESA, [doc()])
    expect(items.find((i) => i.kind === "esa_letter")!.state).toBe("provided")
    expect(items.find((i) => i.kind === "esa_letter")!.documentId).toBe("d1")
  })

  it("a verified letter reads verified", () => {
    const items = checklistFor(ESA, [doc({ verified: true, status: "approved" })])
    expect(items.find((i) => i.kind === "esa_letter")!.state).toBe("verified")
  })

  it("a rejected letter reads rejected, not missing and not provided", () => {
    const items = checklistFor(ESA, [doc({ verified: false, status: "rejected" })])
    expect(items.find((i) => i.kind === "esa_letter")!.state).toBe("rejected")
  })

  it("a row whose file retention has purged reads missing — the record survives, the bytes do not", () => {
    const items = checklistFor(ESA, [doc({ storagePath: null, purgedAt: "2027-10-01T00:00:00Z", verified: true })])
    expect(items.find((i) => i.kind === "esa_letter")!.state).toBe("missing")
  })

  it("a service animal request requires provider_license and NOT esa_letter", () => {
    const items = checklistFor(SERVICE, [])
    expect(items.find((i) => i.kind === "provider_license")!.required).toBe(true)
    // esa_letter is optional for a service animal, and an optional kind with no
    // row is not listed at all — four red crosses for things nobody asked for
    // is not a checklist.
    expect(items.find((i) => i.kind === "esa_letter")).toBeUndefined()
  })

  it("an optional kind appears once, and only once, the resident attaches it", () => {
    const items = checklistFor(ESA, [doc(), doc({ id: "d2", kind: "vaccination" })])
    const vac = items.find((i) => i.kind === "vaccination")
    expect(vac).toBeDefined()
    expect(vac!.required).toBe(false)
    expect(vac!.state).toBe("provided")
  })

  it("animal_desc is a checklist item sourced from the request, never a document", () => {
    const withDesc = checklistFor(ESA, [])
    expect(withDesc.find((i) => i.kind === "animal_desc")!.state).toBe("provided")
    const blank = checklistFor({ type: "esa", animalDesc: "" }, [])
    expect(blank.find((i) => i.kind === "animal_desc")!.state).toBe("missing")
  })

  it("a whitespace-only description is missing — btrim strips only spaces, \\S does not", () => {
    for (const blank of ["   ", "\n\n\t\n", " ", null]) {
      const items = checklistFor({ type: "esa", animalDesc: blank }, [])
      expect(items.find((i) => i.kind === "animal_desc")!.state).toBe("missing")
    }
    expect(present("\n\n\t\n")).toBe(false)
    expect(present(" x ")).toBe(true)
  })

  it("REQUIRED_KINDS matches accommodation_required_kinds() in the database", () => {
    // If this ever drifts, the Submit button is enabled and the RPC refuses.
    expect(REQUIRED_KINDS.esa).toEqual(["esa_letter"])
    expect(REQUIRED_KINDS.service_animal).toEqual(["provider_license"])
  })
})

describe("missingRequired / allRequiredVerified", () => {
  it("names what is still missing, and counts a rejected document as missing", () => {
    expect(missingRequired(checklistFor(ESA, []))).toEqual(["Provider's letter"])
    expect(missingRequired(checklistFor(ESA, [doc({ status: "rejected" })]))).toEqual(["Provider's letter"])
    expect(missingRequired(checklistFor(ESA, [doc()]))).toEqual([])
  })

  it("names a blank description as missing too", () => {
    expect(missingRequired(checklistFor({ type: "esa", animalDesc: "" }, [doc()]))).toEqual([
      "Description of the animal and the need",
    ])
  })

  it("Approve waits for the letter to be VERIFIED, not merely provided", () => {
    expect(allRequiredVerified(checklistFor(ESA, [doc()]))).toBe(false)
    expect(allRequiredVerified(checklistFor(ESA, [doc({ verified: true, status: "approved" })]))).toBe(true)
  })
})

describe("legalMoves — mirrors the ladder the database enforces", () => {
  it("the resident submits or withdraws a draft", () => {
    expect(legalMoves("draft", "resident").sort()).toEqual(["pending", "withdrawn"])
  })
  it("the resident may only withdraw once it is pending", () => {
    expect(legalMoves("pending", "resident")).toEqual(["withdrawn"])
  })
  it("the resident may resubmit from info_requested", () => {
    expect(legalMoves("info_requested", "resident").sort()).toEqual(["pending", "withdrawn"])
  })
  it("a manager decides only a pending or info_requested request", () => {
    expect(legalMoves("pending", "manager").sort()).toEqual(["approved", "denied", "info_requested"])
    expect(legalMoves("info_requested", "manager").sort()).toEqual(["approved", "denied", "info_requested"])
  })
  it("a manager cannot touch a draft — they cannot even see one", () => {
    expect(legalMoves("draft", "manager")).toEqual([])
  })
  it("both terminal states are terminal, for both actors. A new request is a new row", () => {
    for (const s of ["approved", "denied", "withdrawn"] as AccommodationStatus[]) {
      expect(legalMoves(s, "resident")).toEqual([])
      expect(legalMoves(s, "manager")).toEqual([])
    }
  })
})

describe("retentionDeadline", () => {
  it("counts 400 days from decided_at", () => {
    const d = retentionDeadline({ status: "denied", decidedAt: "2026-01-01T00:00:00Z", withdrawnAt: null })
    expect(d).not.toBeNull()
    expect(d!.getTime()).toBe(Date.parse("2026-01-01T00:00:00Z") + RETENTION_DAYS * MS_PER_DAY)
  })

  it("counts 400 days from withdrawn_at when that is the terminal stamp", () => {
    const d = retentionDeadline({ status: "withdrawn", decidedAt: null, withdrawnAt: "2026-01-01T00:00:00Z" })
    expect(d!.getTime()).toBe(Date.parse("2026-01-01T00:00:00Z") + RETENTION_DAYS * MS_PER_DAY)
  })

  it("applies to approved requests too — the entitlement lives on the row, not in the PDF", () => {
    expect(retentionDeadline({ status: "approved", decidedAt: "2026-01-01T00:00:00Z", withdrawnAt: null })).not.toBeNull()
  })

  it("is null for a request still open — not a far-future date a caller could compare against", () => {
    for (const s of ["draft", "pending", "info_requested"] as AccommodationStatus[]) {
      expect(retentionDeadline({ status: s, decidedAt: null, withdrawnAt: null })).toBeNull()
    }
  })

  it("is null for a terminal request with no stamp, and for an unparseable one", () => {
    expect(retentionDeadline({ status: "denied", decidedAt: null, withdrawnAt: null })).toBeNull()
    expect(retentionDeadline({ status: "denied", decidedAt: "not a date", withdrawnAt: null })).toBeNull()
  })
})

describe("fileSize", () => {
  it("reads as a person would", () => {
    expect(fileSize(512)).toBe("512 B")
    expect(fileSize(20481)).toBe("20 KB")
    expect(fileSize(3 * 1024 * 1024)).toBe("3.0 MB")
  })
  it("says nothing rather than 0 B when the size was never recorded", () => {
    expect(fileSize(null)).toBe("—")
    expect(fileSize(0)).toBe("—")
    expect(fileSize(Number.NaN)).toBe("—")
  })
})
