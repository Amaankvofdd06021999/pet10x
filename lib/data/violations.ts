/**
 * Pet10x — the enforcement ladder, as the client understands it.
 *
 * The database is the enforcement point. `manager_advance_violation` validates
 * every transition against its own table and a BEFORE UPDATE trigger on
 * `violations` refuses any stage change that did not come through it, so
 * nothing here can let an illegal move through.
 *
 * What this file is for is the other half: a UI that OFFERS an illegal move is
 * a bug even though the database will refuse it, because the manager finds out
 * by pressing a button and getting a 42501. So the ladder is mirrored here,
 * once, and every screen asks this module what a case may do next instead of
 * each one re-deriving it. `lib/data/violations.test.ts` is what keeps the
 * mirror honest.
 *
 * It lives apart from `manager-queues.ts` deliberately: that file is a
 * "use client" module full of React hooks and a Supabase client, and this
 * logic has to be testable under vitest's `environment: "node"`, where there
 * is no DOM and no session. Pure functions only — the mutations that call the
 * RPC stay in `manager-queues.ts`.
 */

import { Constants } from "@/lib/supabase/database.types"
import type { ViolationStage, ViolationTab } from "./types"

/**
 * Every stage, taken from the generated enum rather than retyped.
 *
 * This is the load-bearing import. `Constants.public.Enums.violation_stage_v2`
 * is regenerated from the live database, so adding a seventh stage there and
 * forgetting it here is a compile error on `LEGAL_TRANSITIONS` and a test
 * failure in `violations.test.ts` — not a silent `undefined` at runtime, which
 * is exactly what the old hand-written `DB_STAGE_TO_APP` produced for
 * `resolved` and `dismissed`.
 */
export const VIOLATION_STAGES = Constants.public.Enums.violation_stage_v2

/** The two stages that carry a fine. */
export const FINE_STAGES = ["fine_1", "fine_2"] as const
export type FineStage = (typeof FINE_STAGES)[number]

/** The two stages a case cannot leave. Reopening means a new violation. */
export const TERMINAL_STAGES = ["resolved", "dismissed"] as const

/**
 * The 11 legal transitions, mirroring `manager_advance_violation`'s table
 * (`supabase/migrations/20260823000002_violations_stage_guard.sql:203`).
 *
 * Written out rather than derived from the enum's sort order. Ordering alone
 * would permit `resolved -> dismissed` and forbid nothing that matters — the
 * table is the specification, so the table is what is written. A stage cannot
 * move to itself either: pressing "issue fine" twice is an illegal transition,
 * not a no-op, so the manager learns the case had already moved.
 */
export const LEGAL_TRANSITIONS: Record<ViolationStage, readonly ViolationStage[]> = {
  open: ["warning", "resolved", "dismissed"],
  warning: ["fine_1", "resolved", "dismissed"],
  fine_1: ["fine_2", "resolved", "dismissed"],
  fine_2: ["resolved", "dismissed"],
  resolved: [],
  dismissed: [],
}

export const STAGE_LABEL: Record<ViolationStage, string> = {
  open: "Open",
  warning: "Warning",
  fine_1: "First fine",
  fine_2: "Second fine",
  resolved: "Resolved",
  dismissed: "Dismissed",
}

export function isViolationStage(value: string | null | undefined): value is ViolationStage {
  return value != null && (VIOLATION_STAGES as readonly string[]).includes(value)
}

/**
 * Narrow a stage read from the database.
 *
 * Falls back to `open` — the least consequential stage — rather than throwing,
 * because a row the client cannot classify should still render. The fallback
 * is now unreachable in practice: the column is an enum with exactly these six
 * values.
 */
export function toViolationStage(value: string | null | undefined): ViolationStage {
  return isViolationStage(value) ? value : "open"
}

export function canAdvance(from: ViolationStage, to: ViolationStage): boolean {
  return LEGAL_TRANSITIONS[from].includes(to)
}

export function isTerminal(stage: ViolationStage): boolean {
  return (TERMINAL_STAGES as readonly string[]).includes(stage)
}

export function isFineStage(stage: ViolationStage): stage is FineStage {
  return (FINE_STAGES as readonly string[]).includes(stage)
}

/**
 * The single escalation step from a stage, or null at the top of the ladder.
 *
 * Escalation is the only linear part of the ladder — `resolved` and
 * `dismissed` are reachable from every rung and are not "next". This is what
 * the strata portal's Advance button offers.
 */
export function nextStage(stage: ViolationStage): ViolationStage | null {
  return LEGAL_TRANSITIONS[stage].find((s) => !isTerminal(s)) ?? null
}

/**
 * The sentence a manager should see when a transition is refused.
 *
 * `manager_advance_violation` returns `{ok:false, error:'illegal_transition',
 * from, to}` — accurate, and useless to read. The guidance ("what CAN this case
 * do?") is derivable from the same table the UI already holds, so it is
 * composed here rather than asked of the database.
 */
export function describeLegalMoves(from: ViolationStage): string {
  const moves = LEGAL_TRANSITIONS[from]
  const here = `A case at ${STAGE_LABEL[from].toLowerCase()}`
  if (moves.length === 0) return `${here} is closed. Reopening it means logging a new violation.`
  const names = moves.map((m) => STAGE_LABEL[m].toLowerCase())
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`
  return `${here} can only go to ${list}.`
}

/**
 * Which tab of the manager's Violations screen a case belongs on.
 *
 * Order matters, and it is the order of what a manager must act on:
 *
 *  - A dispute outranks everything. It is an appeal waiting on a decision, and
 *    burying it under the fine it disputes is how it gets missed.
 *  - A closed case is closed, fine or no fine. `hasFine` used to win over the
 *    stage, which would have filed a dismissed case under Fines — money to
 *    chase on a case that was dropped.
 *  - Then the fine degrees, and any case carrying a fine row.
 *
 * `disputed` is derived from the fines attached to the case (`fines.status =
 * 'disputed'`), which is the only dispute signal that exists today.
 * `violations.disputed_at` is specified in AD-7 but not yet migrated; when it
 * lands, it becomes the input to this argument and nothing else changes.
 */
export function tabFor(stage: ViolationStage, hasFine: boolean, disputed = false): ViolationTab {
  if (disputed) return "disputed"
  if (isTerminal(stage)) return "resolved"
  if (isFineStage(stage) || hasFine) return "fines"
  if (stage === "warning") return "warnings"
  return "active"
}
