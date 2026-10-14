import { describe, expect, it } from "vitest"
import { decisionError, decisionResultError } from "./decision-errors"

const ALREADY = "This was already decided. Refresh to see the latest."
const MEMBER = "They're already a member of this building."
const NOT_YOURS = "You don't manage this building any more."
const GONE = "That request no longer exists."
const RETRY = "Couldn't save that. Try again."

describe("decisionError (a raise from a decision RPC)", () => {
  it("is null when nothing went wrong", () => {
    expect(decisionError(null)).toBeNull()
  })

  it("reads 22023 as a decision someone already made", () => {
    expect(decisionError({ code: "22023", message: "You can't approve a link that is approved." })).toBe(ALREADY)
  })

  it("reads not_pending in the detail as already decided", () => {
    expect(
      decisionError({ code: "22023", details: "not_pending", message: "This registration has already been decided (it is denied)." }),
    ).toBe(ALREADY)
  })

  it("reads 42501 as no longer managing the building", () => {
    expect(decisionError({ code: "42501", message: "forbidden: not a manager of this link's building" })).toBe(NOT_YOURS)
  })

  it("never shows a raw message it has not met", () => {
    expect(decisionError({ code: "PGRST202", message: "Could not find the function" })).toBe(RETRY)
    expect(decisionError({ message: "Failed to fetch" })).toBe(RETRY)
  })
})

describe("decisionResultError (an {ok:false} answer)", () => {
  it("is null for a decision that went through", () => {
    expect(decisionResultError({ ok: true, status: "approved" })).toBeNull()
  })

  it("turns already_member into a sentence", () => {
    expect(decisionResultError({ ok: false, error: "already_member" })).toBe(MEMBER)
  })

  it("turns not_found into a sentence", () => {
    expect(decisionResultError({ ok: false, error: "not_found" })).toBe(GONE)
  })

  it("never shows a raw code it has not met", () => {
    expect(decisionResultError({ ok: false, error: "weird_code" })).toBe(RETRY)
    expect(decisionResultError(null)).toBe(RETRY)
  })
})
