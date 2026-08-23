/**
 * The client's mirror of the enforcement ladder, kept honest.
 *
 * The database is the enforcement point — `manager_advance_violation` refuses
 * an illegal transition and a BEFORE UPDATE trigger on `violations` refuses any
 * stage change that did not come through it. So nothing in this file can let a
 * bad move through.
 *
 * What it can do is catch the other bug: a UI that OFFERS a move the database
 * will refuse. That failure is invisible in TypeScript and invisible in the
 * database; it surfaces as a manager pressing "Escalate" and receiving
 * `42501`. These tests make it a red test on a laptop instead.
 *
 * The mirror is only worth having if it cannot silently fall behind, so every
 * table here is driven from `VIOLATION_STAGES`, which is
 * `Constants.public.Enums.violation_stage_v2` — regenerated from the live
 * database. Add a seventh stage to the enum, regenerate, and the coverage
 * tests below fail by name until the ladder and the tab mapping account for it.
 */

import { describe, expect, it } from "vitest"
import {
  FINE_STAGES,
  LEGAL_TRANSITIONS,
  STAGE_LABEL,
  TERMINAL_STAGES,
  VIOLATION_STAGES,
  canAdvance,
  describeLegalMoves,
  isFineStage,
  isTerminal,
  isViolationStage,
  nextStage,
  tabFor,
  toViolationStage,
} from "./violations"
import type { ViolationStage, ViolationTab } from "./types"

const TABS: readonly ViolationTab[] = ["active", "warnings", "fines", "disputed", "resolved"]

/**
 * The 11 legal transitions, written out independently of the implementation.
 *
 * Deliberately a flat list of pairs rather than a copy of `LEGAL_TRANSITIONS`'s
 * shape: a test that restates the implementation's data structure passes when
 * both are wrong together. This is transcribed from the table in
 * `supabase/migrations/20260823000002_violations_stage_guard.sql:203-215`,
 * which is the specification, and from the plan's own transition table.
 */
const LEGAL_PAIRS: ReadonlyArray<readonly [ViolationStage, ViolationStage]> = [
  ["open", "warning"],
  ["open", "resolved"],
  ["open", "dismissed"],
  ["warning", "fine_1"],
  ["warning", "resolved"],
  ["warning", "dismissed"],
  ["fine_1", "fine_2"],
  ["fine_1", "resolved"],
  ["fine_1", "dismissed"],
  ["fine_2", "resolved"],
  ["fine_2", "dismissed"],
]

describe("the stage vocabulary", () => {
  it("is exactly the six stages of the database enum", () => {
    expect([...VIOLATION_STAGES].sort()).toEqual(
      ["dismissed", "fine_1", "fine_2", "open", "resolved", "warning"].sort(),
    )
  })

  it("names every stage", () => {
    for (const stage of VIOLATION_STAGES) {
      expect(STAGE_LABEL[stage], `no label for ${stage}`).toBeTruthy()
    }
  })

  it("recognises every real stage and nothing else", () => {
    for (const stage of VIOLATION_STAGES) expect(isViolationStage(stage)).toBe(true)
    // The pre-Phase-2 vocabulary, which is what a stale client would send.
    for (const dead of ["investigation", "pending_review", "verbal_warning", "written_warning", "fine_issued"]) {
      expect(isViolationStage(dead), `${dead} is not a stage any more`).toBe(false)
    }
    expect(isViolationStage(null)).toBe(false)
    expect(isViolationStage(undefined)).toBe(false)
    expect(isViolationStage("")).toBe(false)
  })

  it("falls back to open for anything unreadable", () => {
    expect(toViolationStage("fine_2")).toBe("fine_2")
    expect(toViolationStage("investigation")).toBe("open")
    expect(toViolationStage(null)).toBe("open")
  })
})

describe("the ladder", () => {
  it("covers every stage — a stage added to the enum must be given a rule", () => {
    for (const stage of VIOLATION_STAGES) {
      expect(LEGAL_TRANSITIONS[stage], `no transition rule for ${stage}`).toBeDefined()
    }
    expect(Object.keys(LEGAL_TRANSITIONS).sort()).toEqual([...VIOLATION_STAGES].sort())
  })

  it("permits exactly the 11 transitions the database permits", () => {
    const mirrored = VIOLATION_STAGES.flatMap((from) =>
      LEGAL_TRANSITIONS[from].map((to) => `${from}->${to}`),
    ).sort()
    expect(mirrored).toEqual(LEGAL_PAIRS.map(([f, t]) => `${f}->${t}`).sort())
    expect(mirrored).toHaveLength(11)
  })

  // Every cell of the 6x6 grid, so a rule cannot be added without a test
  // noticing. This is the client-side twin of the 36-pair probe Task 2 ran
  // against the live function.
  it.each(
    VIOLATION_STAGES.flatMap((from) =>
      VIOLATION_STAGES.map((to) => {
        const legal = LEGAL_PAIRS.some(([f, t]) => f === from && t === to)
        return { from, to, legal }
      }),
    ),
  )("$from -> $to is legal: $legal", ({ from, to, legal }) => {
    expect(canAdvance(from, to)).toBe(legal)
  })

  it("lets no stage move to itself", () => {
    for (const stage of VIOLATION_STAGES) expect(canAdvance(stage, stage)).toBe(false)
  })

  it("lets nothing out of a terminal stage", () => {
    for (const terminal of TERMINAL_STAGES) {
      expect(LEGAL_TRANSITIONS[terminal]).toEqual([])
      for (const to of VIOLATION_STAGES) expect(canAdvance(terminal, to)).toBe(false)
    }
    for (const stage of VIOLATION_STAGES) expect(isTerminal(stage)).toBe(TERMINAL_STAGES.includes(stage as never))
  })

  it("lets every non-terminal stage be resolved or dismissed", () => {
    for (const stage of VIOLATION_STAGES) {
      if (isTerminal(stage)) continue
      expect(canAdvance(stage, "resolved"), `${stage} must be resolvable`).toBe(true)
      expect(canAdvance(stage, "dismissed"), `${stage} must be dismissable`).toBe(true)
    }
  })

  it("climbs one rung at a time and stops at the top", () => {
    expect(nextStage("open")).toBe("warning")
    expect(nextStage("warning")).toBe("fine_1")
    expect(nextStage("fine_1")).toBe("fine_2")
    expect(nextStage("fine_2")).toBeNull()
    expect(nextStage("resolved")).toBeNull()
    expect(nextStage("dismissed")).toBeNull()
  })

  it("only ever offers a next stage the ladder allows", () => {
    for (const stage of VIOLATION_STAGES) {
      const next = nextStage(stage)
      if (next === null) continue
      expect(canAdvance(stage, next), `${stage} -> ${next} is not legal`).toBe(true)
      expect(isTerminal(next), "next is escalation, never closure").toBe(false)
    }
  })

  it("knows which stages carry a fine", () => {
    for (const stage of VIOLATION_STAGES) {
      expect(isFineStage(stage)).toBe(FINE_STAGES.includes(stage as never))
    }
  })
})

describe("the sentence a refused transition produces", () => {
  it("tells the manager what the case can do instead", () => {
    expect(describeLegalMoves("fine_1")).toBe(
      "A case at first fine can only go to second fine, resolved or dismissed.",
    )
    expect(describeLegalMoves("fine_2")).toBe("A case at second fine can only go to resolved or dismissed.")
  })

  it("says a closed case is closed rather than listing nothing", () => {
    for (const terminal of TERMINAL_STAGES) {
      expect(describeLegalMoves(terminal)).toContain("closed")
      expect(describeLegalMoves(terminal)).not.toContain("can only go to .")
    }
  })

  it("produces a usable sentence for every stage", () => {
    for (const stage of VIOLATION_STAGES) {
      const s = describeLegalMoves(stage)
      expect(s.endsWith("."), `${stage}: ${s}`).toBe(true)
      expect(s).not.toContain("undefined")
    }
  })
})

describe("tabFor", () => {
  // All six stages, hasFine both ways. The old map had no entry for `resolved`
  // or `dismissed` at all, so two of these six rows were `undefined` before
  // being coerced to "investigation".
  const EXPECTED: Record<ViolationStage, { withoutFine: ViolationTab; withFine: ViolationTab }> = {
    open: { withoutFine: "active", withFine: "fines" },
    warning: { withoutFine: "warnings", withFine: "fines" },
    fine_1: { withoutFine: "fines", withFine: "fines" },
    fine_2: { withoutFine: "fines", withFine: "fines" },
    // A closed case is closed. `hasFine` used to win over the stage, which
    // would file a dismissed case under Fines — money to chase on a case that
    // was dropped.
    resolved: { withoutFine: "resolved", withFine: "resolved" },
    dismissed: { withoutFine: "resolved", withFine: "resolved" },
  }

  it("covers every stage — a stage added to the enum must be given a tab", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...VIOLATION_STAGES].sort())
  })

  it.each(
    VIOLATION_STAGES.flatMap((stage) => [
      { stage, hasFine: false, tab: EXPECTED[stage].withoutFine },
      { stage, hasFine: true, tab: EXPECTED[stage].withFine },
    ]),
  )("$stage with hasFine=$hasFine sits on $tab", ({ stage, hasFine, tab }) => {
    expect(tabFor(stage, hasFine)).toBe(tab)
  })

  it("returns a real tab for every stage and both fine states", () => {
    for (const stage of VIOLATION_STAGES) {
      for (const hasFine of [false, true]) {
        for (const disputed of [false, true]) {
          expect(TABS, `${stage}/${hasFine}/${disputed}`).toContain(tabFor(stage, hasFine, disputed))
        }
      }
    }
  })

  it("puts a dispute in front of everything else", () => {
    // An appeal is what the manager must decide; filing it under the fine it
    // disputes is how it gets missed.
    for (const stage of VIOLATION_STAGES) {
      for (const hasFine of [false, true]) {
        expect(tabFor(stage, hasFine, true), `${stage}/${hasFine}`).toBe("disputed")
      }
    }
  })
})
