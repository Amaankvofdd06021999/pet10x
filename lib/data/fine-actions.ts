/**
 * Pet10x — which money controls a bylaw case offers, and what a refusal says.
 *
 * Pure, so vitest can reach it (`manager-queues.ts` is "use client" with a
 * Supabase client in it). The mutations stay there; this only answers "may
 * this case show the button?" and "what does that error code mean?".
 */

import { controlsForCase, type FineStage, type FineStatus } from "./violations"
import type { CaseFine, ViolationStage } from "./types"

export type { CaseFine }

/**
 * The statuses the case view offers Mark paid and Waive on.
 *
 * `manager_set_fine_status` also accepts `disputed`, but on a case a disputed
 * fine sits under an open appeal, and deciding the appeal is the only move
 * the case view offers then — upholding returns the fine to `issued`,
 * overturning waives it. Settled statuses have no way out at all.
 */
export const SETTLEABLE_IN_CASE: readonly FineStatus[] = ["issued", "partially_paid"]

export function settleableFines(fines: readonly CaseFine[]): CaseFine[] {
  return fines.filter((f) => SETTLEABLE_IN_CASE.includes(f.status))
}

/**
 * Which fine degree the ladder lets this case be issued next, or null.
 *
 * Copied from the retired `violations-screen.tsx` `actionsFor`, not
 * re-derived: ask `controlsForCase`; under an open appeal nothing but the
 * decision is legal; otherwise offer the first of `fine_1`/`fine_2` the
 * ladder lists as a legal move. A case at `open` gets no fine here — the
 * notice form still offers one, with its own warning about the building's
 * direct-fine policy.
 */
export function fineDegreeToIssue(stage: ViolationStage, hasOpenDispute: boolean): FineStage | null {
  const controls = controlsForCase(stage, hasOpenDispute)
  if (controls.kind === "decide-appeal") return null
  for (const degree of ["fine_1", "fine_2"] as const) {
    if (controls.moves.includes(degree)) return degree
  }
  return null
}

const STATUS_WORD: Record<string, string> = {
  issued: "issued",
  paid: "paid",
  partially_paid: "partially paid",
  waived: "waived",
  disputed: "under appeal",
  remitted: "remitted",
  written_off: "written off",
}

/** `manager_set_fine_status`'s rejection codes, as sentences. */
export function fineStatusError(r: {
  error?: string
  from?: string
  to?: string
  length?: number
  max?: number
}): string {
  switch (r.error) {
    case "forbidden":
      return "You don't manage this building."
    case "not_found":
      return "That fine no longer exists."
    case "note_too_long":
      return `Your note is ${r.length ?? 0} characters; the limit is ${r.max ?? 2000}.`
    case "illegal_transition": {
      const from = STATUS_WORD[r.from ?? ""] ?? (r.from ?? "settled").replace(/_/g, " ")
      const to = r.to === "paid" ? "marked paid" : r.to === "waived" ? "waived" : "changed"
      return `This fine is already ${from}, so it can't be ${to}.`
    }
    default:
      return r.error ? `Couldn't update this fine (${r.error}).` : "Couldn't update this fine."
  }
}
