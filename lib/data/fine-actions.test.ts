import { describe, it, expect } from "vitest"
import {
  SETTLEABLE_IN_CASE,
  settleableFines,
  fineDegreeToIssue,
  fineStatusError,
  type CaseFine,
} from "./fine-actions"
import { FINE_STATUSES } from "./violations"

const fine = (status: CaseFine["status"], id = status): CaseFine => ({
  id,
  amountCents: 25000,
  currency: "cad",
  status,
})

describe("settleableFines", () => {
  it("offers Mark paid / Waive on issued and partially paid fines only", () => {
    expect([...SETTLEABLE_IN_CASE].sort()).toEqual(["issued", "partially_paid"])
    const all = FINE_STATUSES.map((s) => fine(s))
    expect(settleableFines(all).map((f) => f.status).sort()).toEqual(["issued", "partially_paid"])
  })

  it("leaves a disputed fine to the appeal, and a settled one alone", () => {
    for (const s of ["disputed", "paid", "waived", "remitted", "written_off"] as const) {
      expect(settleableFines([fine(s)]), s).toEqual([])
    }
  })
})

describe("fineDegreeToIssue", () => {
  it("follows the ladder: a warning may be fined, a first fine escalated", () => {
    expect(fineDegreeToIssue("warning", false)).toBe("fine_1")
    expect(fineDegreeToIssue("fine_1", false)).toBe("fine_2")
  })

  it("offers nothing where the ladder has no fine rung", () => {
    for (const s of ["open", "fine_2", "resolved", "dismissed"] as const) {
      expect(fineDegreeToIssue(s, false), s).toBeNull()
    }
  })

  it("offers nothing while an appeal is open — deciding it is the only move", () => {
    expect(fineDegreeToIssue("warning", true)).toBeNull()
    expect(fineDegreeToIssue("fine_1", true)).toBeNull()
  })
})

describe("fineStatusError", () => {
  it("turns every code the RPC returns into a sentence", () => {
    expect(fineStatusError({ error: "forbidden" })).toMatch(/don't manage/)
    expect(fineStatusError({ error: "not_found" })).toMatch(/no longer exists/)
    expect(fineStatusError({ error: "note_too_long", length: 2400, max: 2000 })).toBe(
      "Your note is 2400 characters; the limit is 2000.",
    )
  })

  it("names the fine's status on an illegal transition", () => {
    expect(fineStatusError({ error: "illegal_transition", from: "waived", to: "paid" })).toBe(
      "This fine is already waived, so it can't be marked paid.",
    )
    expect(fineStatusError({ error: "illegal_transition", from: "written_off", to: "waived" })).toBe(
      "This fine is already written off, so it can't be waived.",
    )
  })

  it("never swallows a code it was not taught", () => {
    expect(fineStatusError({ error: "something_new" })).toBe("Couldn't update this fine (something_new).")
    expect(fineStatusError({})).toBe("Couldn't update this fine.")
  })
})
