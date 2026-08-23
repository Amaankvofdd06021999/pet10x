/**
 * The client's mirror of what a resident may contest, kept honest.
 *
 * `dispute_violation` is the enforcement point and `violation_disputes` has no
 * client write policy, so nothing here can let a bad dispute through. What
 * these tests catch is the other bug: a screen that OFFERS a control the
 * database will refuse, or — the direction that is easier to miss — one that
 * HIDES a control the database would have accepted, so a resident silently
 * loses an appeal they were entitled to file.
 *
 * Coverage is asserted over `VIOLATION_STAGES` itself, which is
 * `Constants.public.Enums.violation_stage_v2` regenerated from the live
 * database. Add a seventh stage and these fail by name until somebody decides
 * whether it is disputable — the method `violations.test.ts` already uses.
 */

import { describe, expect, it } from "vitest"
import {
  DISPUTABLE_STAGES,
  DISPUTE_WINDOW_DAYS,
  canDispute,
  describeWhyNot,
  disputeDeadline,
  isDisputableStage,
  type DisputeBlockedReason,
} from "./disputes"
import { VIOLATION_STAGES } from "./violations"
import type { ViolationStage } from "./types"

/**
 * The disputable set, written out independently of the implementation rather
 * than imported and compared to itself. Transcribed from `dispute_violation`'s
 * `c_disputable` array (`20260824000001_dispute_violation.sql`) and from the
 * plan, which are the specification.
 */
const EXPECTED_DISPUTABLE: readonly ViolationStage[] = ["warning", "fine_1", "fine_2"]

const DAY_MS = 24 * 60 * 60 * 1000
const ANCHOR = "2026-08-01T09:00:00.000Z"
const anchorMs = new Date(ANCHOR).getTime()
/** `t` days (and optional ms) after the anchor. */
const at = (days: number, ms = 0) => new Date(anchorMs + days * DAY_MS + ms)

const base = {
  stage: "warning" as ViolationStage,
  anchorIso: ANCHOR,
  hasOpenDispute: false,
  alreadyDisputedThisStage: false,
}

describe("DISPUTABLE_STAGES", () => {
  it("is exactly the three findings against a person", () => {
    expect([...DISPUTABLE_STAGES]).toEqual([...EXPECTED_DISPUTABLE])
  })

  it("is a subset of VIOLATION_STAGES — no stage that does not exist", () => {
    for (const s of DISPUTABLE_STAGES) {
      expect(VIOLATION_STAGES as readonly string[]).toContain(s)
    }
  })

  /**
   * The coverage test. Driven from the generated enum, so a seventh stage is a
   * named failure here rather than a silent `false` from `isDisputableStage`.
   */
  it.each(VIOLATION_STAGES)("classifies %s in exactly one direction", (stage) => {
    expect(isDisputableStage(stage)).toBe(EXPECTED_DISPUTABLE.includes(stage))
  })

  it("excludes open, resolved and dismissed, and says so per stage", () => {
    for (const stage of VIOLATION_STAGES) {
      if (EXPECTED_DISPUTABLE.includes(stage)) continue
      expect(canDispute({ ...base, stage, now: at(0) })).toEqual({ ok: false, reason: "stage" })
    }
  })
})

describe("the 14-day window", () => {
  it("DISPUTE_WINDOW_DAYS is 14", () => {
    // Pinned as a literal on purpose. `disputeDeadline` is derived from the
    // constant, so a test that only checked the derivation would pass for any
    // value of it — this is the assertion that goes red when somebody changes
    // the number without changing the RPC.
    expect(DISPUTE_WINDOW_DAYS).toBe(14)
  })

  it("puts the deadline exactly 14 days after the anchor", () => {
    expect(disputeDeadline(ANCHOR).toISOString()).toBe(at(14).toISOString())
  })

  it("allows 13 days and 23:59", () => {
    expect(canDispute({ ...base, now: at(14, -60_000) })).toEqual({ ok: true })
  })

  it("allows exactly 14 days — the boundary is inclusive, as the RPC's `>` is", () => {
    expect(canDispute({ ...base, now: at(14) })).toEqual({ ok: true })
  })

  it("refuses 14 days plus one second", () => {
    expect(canDispute({ ...base, now: at(14, 1000) })).toEqual({ ok: false, reason: "window" })
  })

  it("refuses rather than passes when the anchor cannot be parsed", () => {
    // An Invalid Date makes every comparison false. The guard is written so
    // that lands on "closed", not on "open" — a client that cannot work out the
    // deadline must not offer the control.
    expect(canDispute({ ...base, anchorIso: "not a date", now: at(0) })).toEqual({
      ok: false,
      reason: "window",
    })
  })
})

describe("precedence — the order must mirror dispute_violation's", () => {
  it("a non-disputable stage beats everything else", () => {
    expect(
      canDispute({
        ...base,
        stage: "open",
        hasOpenDispute: true,
        alreadyDisputedThisStage: true,
        now: at(99),
      }),
    ).toEqual({ ok: false, reason: "stage" })
  })

  it("an already-decided dispute at this stage beats the window", () => {
    expect(
      canDispute({ ...base, alreadyDisputedThisStage: true, now: at(99) }),
    ).toEqual({ ok: false, reason: "already" })
  })

  it("an already-disputed degree beats an open dispute — the RPC's own order", () => {
    expect(
      canDispute({ ...base, alreadyDisputedThisStage: true, hasOpenDispute: true, now: at(0) }),
    ).toEqual({ ok: false, reason: "already" })
  })

  it("an open dispute at another stage beats the window", () => {
    expect(canDispute({ ...base, hasOpenDispute: true, now: at(99) })).toEqual({
      ok: false,
      reason: "open",
    })
  })

  it("permits a fresh dispute on a disputable stage inside the window", () => {
    expect(canDispute({ ...base, stage: "fine_1", now: at(1) })).toEqual({ ok: true })
    expect(canDispute({ ...base, stage: "fine_2", now: at(1) })).toEqual({ ok: true })
  })
})

describe("describeWhyNot", () => {
  const REASONS: readonly DisputeBlockedReason[] = ["stage", "already", "open", "window"]

  it.each(REASONS)("returns a non-empty sentence for %s", (reason) => {
    const s = describeWhyNot(reason, at(14))
    expect(s.length).toBeGreaterThan(20)
    expect(s.trim()).toBe(s)
    expect(s.endsWith(".")).toBe(true)
  })

  it("gives each reason a DISTINCT sentence", () => {
    // Four reasons collapsing to one generic sentence would pass every test
    // above and tell the resident nothing.
    const seen = REASONS.map((r) => describeWhyNot(r, at(14)))
    expect(new Set(seen).size).toBe(REASONS.length)
  })

  it("names the closing date and the window length when the window closed", () => {
    /*
     * THE EXPECTED DATE IS COMPUTED, NOT WRITTEN OUT, and that is the fix.
     *
     * This assertion used to read `toContain("August 15, 2026")`. The deadline
     * is an INSTANT — 14 days after `violation_events.created_at`, a
     * `timestamptz` — and rendering an instant in the reader's zone is correct.
     * So the literal was only true in zones where 2026-08-15T09:00Z is still
     * the 15th: green at UTC-7, `1 failed | 26 passed` at UTC-10, where it is
     * the evening of the 14th. A test written to catch a timezone bug that
     * itself only passes in the author's zone proves nothing anywhere else.
     *
     * The property that is true in every zone is "the sentence names the
     * deadline it was handed, in this module's long-date format" — so that is
     * what is asserted, against the same `Date` the caller passed in.
     */
    const deadline = at(14)
    const s = describeWhyNot("window", deadline)
    expect(s).toContain("14-day")
    expect(s).toContain(
      deadline.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    )
  })

  it("names a date exactly DISPUTE_WINDOW_DAYS after the anchor", () => {
    // The zone-free half of the same claim: whatever it renders, the deadline
    // it renders is 14 calendar days on from the anchor.
    expect(disputeDeadline(ANCHOR).getTime() - anchorMs).toBe(DISPUTE_WINDOW_DAYS * DAY_MS)
  })

  it("does not claim a date it does not have", () => {
    expect(describeWhyNot("window")).toContain("an unknown date")
  })
})
