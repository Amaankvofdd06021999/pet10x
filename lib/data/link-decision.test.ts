import { describe, expect, it } from "vitest"
import { linkDecisionError } from "./link-decision"

describe("linkDecisionError", () => {
  it("is null for a decision that went through", () => {
    expect(linkDecisionError({ ok: true, status: "approved" })).toBeNull()
  })

  it("turns not_found into a sentence", () => {
    expect(linkDecisionError({ ok: false, error: "not_found" })).toBe("That request no longer exists.")
  })

  it("never shows a raw code it has not met", () => {
    expect(linkDecisionError({ ok: false, error: "weird_code" })).toBe("That didn't go through. Try again.")
    expect(linkDecisionError(null)).toBe("That didn't go through. Try again.")
  })
})
