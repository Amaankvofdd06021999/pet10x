import { describe, it, expect } from "vitest"
import {
  BUSINESS_TIERS,
  awaitingReview,
  businessTierError,
  tierDescription,
  tierLabel,
  verificationBanner,
} from "./business-tier"

describe("tier labels and descriptions", () => {
  it("names every tier, in the order an admin moves through them", () => {
    expect(BUSINESS_TIERS).toEqual(["registered", "listed", "verified"])
    expect(BUSINESS_TIERS.map(tierLabel)).toEqual(["Registered", "Listed", "Verified"])
  })

  it("says what each tier unlocks", () => {
    expect(tierDescription("registered")).toMatch(/own data/)
    expect(tierDescription("registered")).toMatch(/not in owner search/)
    expect(tierDescription("listed")).toMatch(/owner search/)
    expect(tierDescription("listed")).toMatch(/online bookings/)
    expect(tierDescription("verified")).toMatch(/shared records/)
    expect(tierDescription("verified")).toMatch(/emergency access/)
  })
})

describe("awaitingReview", () => {
  it("is true for an open verification request, whatever the tier", () => {
    expect(awaitingReview({ tier: "listed", openRequest: true })).toBe(true)
    expect(awaitingReview({ tier: "verified", openRequest: true })).toBe(true)
  })

  it("is true for a business never reviewed — still registered", () => {
    expect(awaitingReview({ tier: "registered", openRequest: false })).toBe(true)
  })

  it("is false once an admin has listed or verified it with nothing open", () => {
    expect(awaitingReview({ tier: "listed", openRequest: false })).toBe(false)
    expect(awaitingReview({ tier: "verified", openRequest: false })).toBe(false)
  })
})

describe("verificationBanner", () => {
  it("is nothing for a verified practice", () => {
    expect(verificationBanner("verified", null)).toBeNull()
    expect(verificationBanner("verified", { status: "submitted", note: null })).toBeNull()
  })

  it("offers a request when none is open", () => {
    expect(verificationBanner("registered", null)).toEqual({ state: "none", canRequest: true, note: null })
    // Approved earlier, then lowered by an admin: a new request is the way back.
    expect(verificationBanner("listed", { status: "approved", note: null })).toMatchObject({ state: "none", canRequest: true })
  })

  it("says requested while one is open, with no second button", () => {
    for (const status of ["submitted", "in_review", "needs_info"]) {
      expect(verificationBanner("registered", { status, note: null })).toEqual({
        state: "requested",
        canRequest: false,
        note: null,
      })
    }
  })

  it("shows the admin's note on a rejection, and allows asking again", () => {
    expect(verificationBanner("registered", { status: "rejected", note: "Licence number missing" })).toEqual({
      state: "rejected",
      canRequest: true,
      note: "Licence number missing",
    })
  })
})

describe("businessTierError", () => {
  it("turns the RPCs' refusals into sentences", () => {
    expect(businessTierError({ code: "42501", message: "Only a Pet10x admin can change a business's tier" })).toBe(
      "Only a Pet10x admin can change a business's tier.",
    )
    expect(businessTierError({ code: "P0002", message: "That business no longer exists" })).toBe(
      "That business no longer exists.",
    )
    expect(businessTierError({ code: "22023", message: "That request has already been decided" })).toBe(
      "That request has already been decided.",
    )
  })

  it("keeps the one-open-request rule readable", () => {
    expect(businessTierError({ code: "23505", message: 'duplicate key value violates unique constraint "business_verifications_one_open"' })).toBe(
      "A verification request is already open for this practice.",
    )
  })

  it("explains an RLS refusal of the request insert", () => {
    expect(
      businessTierError({ code: "42501", message: 'new row violates row-level security policy for table "business_verifications"' }),
    ).toBe("Only the practice's owner or a manager can request verification.")
  })

  it("never shows a raw Postgres message for anything else", () => {
    expect(businessTierError({ code: "XX000", message: "relation does not exist" })).toBe(
      "Something went wrong. Try again.",
    )
    expect(businessTierError({ message: "Failed to fetch" })).toBe("Something went wrong. Try again.")
  })
})
