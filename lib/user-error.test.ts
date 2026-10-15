import { describe, it, expect } from "vitest"
import { KNOWN_USER_SENTENCES, userError } from "./user-error"

describe("userError", () => {
  it("is null when there was no error", () => {
    expect(userError(null, "Couldn't save. Try again.")).toBeNull()
  })

  it("passes a sentence we wrote through unchanged", () => {
    expect(userError("That service isn't available to book", "x")).toBe("That service isn't available to book")
    expect(userError("This was already decided. Refresh to see the latest.", "x")).toBe(
      "This was already decided. Refresh to see the latest.",
    )
    expect(userError("The visit is less than 2 hours away. Call the practice to cancel.", "x")).toBe(
      "The visit is less than 2 hours away. Call the practice to cancel.",
    )
    expect(userError("Someone just took that slot. Pick another.", "x")).toBe("Someone just took that slot. Pick another.")
  })

  it("replaces anything else — raw database text — with the fallback", () => {
    const fallback = "Couldn't post your review. Try again."
    for (const raw of [
      'duplicate key value violates unique constraint "business_reviews_booking_id_key"',
      'new row violates row-level security policy for table "service_bookings"',
      "Failed to fetch",
      "",
      "   ",
    ]) {
      expect(userError(raw, fallback)).toBe(fallback)
    }
  })

  it("passes the account-deletion blockers, the building-named one included", () => {
    expect(
      userError(
        "You have an open bylaw case with Maple Court Residences. It needs to be closed before the account can be deleted — contact your building manager.",
        "x",
      ),
    ).toMatch(/^You have an open bylaw case with Maple Court Residences\./)
    expect(
      userError(
        "Your business has bookings that are still open. Decline, cancel or complete them in your business console before deleting the account.",
        "x",
      ),
    ).not.toBe("x")
  })

  it("does not let raw text ride along with a known sentence", () => {
    expect(userError("That service isn't available to book: relation does not exist", "x")).toBe("x")
  })

  it("knows a non-trivial set of sentences, every one in sentence case", () => {
    expect(KNOWN_USER_SENTENCES.size).toBeGreaterThan(30)
    for (const s of KNOWN_USER_SENTENCES) expect(s[0]).toBe(s[0].toUpperCase())
  })
})
