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
 * (`supabase/migrations/20260823000002_violations_stage_guard.sql:169-176`).
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

/* ------------------------------------------------------------------ */
/* What a case may be offered, decided once for every surface           */
/* ------------------------------------------------------------------ */

/**
 * The controls a manager may be shown for a case.
 *
 *   decide-appeal   an appeal is open. The ONLY legal next action is deciding
 *                   it, so the ladder controls are REPLACED — not shown
 *                   alongside — by Uphold and Overturn.
 *   ladder          no appeal is open. `moves` is every legal transition out of
 *                   the stage and `next` is the single escalation step, or null
 *                   at the top of the ladder.
 */
export type CaseControls =
  | { kind: "decide-appeal" }
  | { kind: "ladder"; moves: readonly ViolationStage[]; next: ViolationStage | null }

/**
 * WHY THIS IS A FUNCTION IN A SHARED MODULE AND NOT AN `if` IN A SCREEN.
 *
 * Phase 5 added `dispute_open` to `manager_advance_violation` and taught the
 * manager's Violations screen about it. `components/screens/strata/building-
 * detail.tsx` calls the SAME two mutations and was not told, so on a case under
 * appeal it went on rendering Advance and Resolve — two buttons the database
 * refuses, over an error sentence pointing at a Disputed tab that does not
 * exist on the strata portal, with no way to decide the appeal at all.
 *
 * That was the third time this project shipped a fix at the call site the
 * defect was REPORTED at while a second call site went on being wrong (Phase
 * 2's escalation gap and Phase 3's wrong-pet were the others). The rule is not
 * "the Violations screen hides the ladder during an appeal", it is "a case
 * under appeal has exactly one legal next action" — a fact about the case, and
 * a fact the database enforces. So it is stated here, once, and every surface
 * asks. A fourth screen that forgets to ask is a screen that never renders a
 * control at all, which is a visible bug rather than a silent one.
 *
 * `hasOpenDispute` is a boolean rather than the dispute row for the same reason
 * `tabFor` takes one: this module is about the ladder, and it should not need
 * to know the shape of `violation_disputes` to answer.
 */
export function controlsForCase(stage: ViolationStage, hasOpenDispute: boolean): CaseControls {
  if (hasOpenDispute) return { kind: "decide-appeal" }
  return { kind: "ladder", moves: LEGAL_TRANSITIONS[stage], next: nextStage(stage) }
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
 *  - A closed case is closed, dispute or no dispute, fine or no fine. This
 *    test used to sit BELOW the dispute test, which meant a case resolved or
 *    dismissed while its fine still read `status='disputed'` never reached the
 *    Resolved tab and sat on Disputed forever, asking for a decision that had
 *    already been made. Terminal wins: the ladder's own terminals are the
 *    strongest statement about a case there is, and the fine's status is a
 *    fact about the money, not about whether the case is still live.
 *  - Then a dispute, which outranks the fine it disputes. It is an appeal
 *    waiting on a decision, and burying it under the fine is how it gets
 *    missed.
 *  - Then the fine degrees, and any case carrying a fine row. `hasFine` used
 *    to win over the stage, which would have filed a dismissed case under
 *    Fines — money to chase on a case that was dropped.
 *
 * `disputed` now means "this case has a `violation_disputes` row with
 * `outcome is null`" — an appeal the strata has not decided. It used to be
 * derived from `fines.status = 'disputed'`, and that derivation is RETIRED
 * rather than composed with the new one: a dispute against a WARNING has no
 * fine row to carry a flag, so the old signal could not express it at all.
 *
 * AD-7 specified `violations.disputed_at`, `dispute_reason` and `dispute_stage`
 * instead. Those columns were never applied and Phase 5 deliberately did not
 * add them — "a resident disputes a degree once" is a uniqueness constraint,
 * and three nullable columns cannot express one. See
 * `supabase/migrations/20260824000000_violation_disputes.sql` for the argument.
 *
 * The signature still takes a boolean, so this file's blast radius from that
 * decision is this paragraph.
 */
export function tabFor(stage: ViolationStage, hasFine: boolean, disputed = false): ViolationTab {
  if (isTerminal(stage)) return "resolved"
  if (disputed) return "disputed"
  if (isFineStage(stage) || hasFine) return "fines"
  if (stage === "warning") return "warnings"
  return "active"
}

/* ------------------------------------------------------------------ */
/* The money: which fine statuses mean "still owed"                    */
/* ------------------------------------------------------------------ */

/**
 * Every fine status, taken from the generated enum rather than retyped — the
 * same load-bearing import as `VIOLATION_STAGES` above, for the same reason.
 */
export const FINE_STATUSES = Constants.public.Enums.fine_status
export type FineStatus = (typeof FINE_STATUSES)[number]

/**
 * What each of the seven statuses means for the money, stated once.
 *
 * This exists because two surfaces were answering "is this fine still owed?"
 * in two different ways and both were wrong. `manager-queues.ts` derived a
 * boolean `paid` as `fines.every(f => f.status === 'paid')` and the Violations
 * screen then read `!paid` as "outstanding" — so a **waived** fine still
 * counted as money owed, and the screen showed $600 against the strata
 * overview's $350 on the same data. The overview's own query
 * (`portfolio.ts:useOutstandingFines`) carried the right list as a literal
 * `.in(...)`, so the two agreed only for as long as nobody waived anything.
 * Both now read this table.
 *
 * It is a `Record` over the generated enum on purpose. A denylist (`!== 'paid'`)
 * silently swallows every status added later — which is exactly how `waived`
 * got counted as owed. An exhaustive `Record` cannot: an eighth `fine_status`
 * is a **compile error here**, and whoever adds it has to say what it means for
 * the money before anything builds.
 *
 * The two verdicts:
 *
 *  - `owed`      the strata is still owed this money. `disputed` is owed —
 *                an appeal is not a payment, and hiding it understates the
 *                ledger — but see `CHASEABLE_FINE_STATUSES` for whether the
 *                resident may be *asked* for it.
 *  - `settled`   the strata is not owed it any more, whether it was paid,
 *                given up (`waived`, `remitted`) or abandoned (`written_off`).
 *
 * `partially_paid` counts its FULL `amount_cents`, because `fines` has no
 * paid-to-date column. That overstates the remainder and is the safe direction
 * — the alternative is dropping a partly-settled fine out of the total
 * entirely — but it is an approximation. The column that would fix it is a
 * paid-to-date figure, and NO PHASE OWNS IT: Phase 5 was scoped explicitly as
 * "fine payments later, for now just see dispute or appeal" (AD-8), so it
 * shipped no payment surface and no such column. It stays an approximation
 * until somebody builds payments.
 */
const FINE_STATUS_MEANING: Record<FineStatus, "owed" | "settled"> = {
  issued: "owed",
  partially_paid: "owed",
  disputed: "owed",
  paid: "settled",
  waived: "settled",
  remitted: "settled",
  written_off: "settled",
}

/**
 * The statuses that mean money is still owed, as a positive grammar.
 *
 * Derived from the table above rather than written out again, so the list and
 * the meanings cannot drift. `useOutstandingFines` filters its query with this
 * and the manager's screen sums with it, which is what makes the two surfaces
 * agree by construction instead of by coincidence.
 */
export const OUTSTANDING_FINE_STATUSES: readonly FineStatus[] = FINE_STATUSES.filter(
  (s) => FINE_STATUS_MEANING[s] === "owed",
)

/**
 * The statuses a resident may be chased about — the exact predicate
 * `manager_remind_fine` applies (`status = 'issued'`).
 *
 * Narrower than "owed" by one status: a `disputed` fine is still owed, but
 * demanding payment for it while the appeal is undecided is the wrong message,
 * so the RPC refuses and the button is not offered. `partially_paid` is
 * excluded because the RPC would state the full amount as outstanding, which is
 * a resident-facing money claim this codebase cannot currently make truthfully.
 *
 * The point of naming it here is that the "Send Reminder" button now renders on
 * exactly the cases the RPC will act on. Before this, the button was gated on
 * `amount > 0 && !paid`, so it rendered on a case whose only fine had been
 * waived and could do nothing but return `no_outstanding_fine`.
 */
export const CHASEABLE_FINE_STATUSES: readonly FineStatus[] = ["issued"]

export function isOutstandingFine(status: string): boolean {
  return (OUTSTANDING_FINE_STATUSES as readonly string[]).includes(status)
}

export function isChaseableFine(status: string): boolean {
  return (CHASEABLE_FINE_STATUSES as readonly string[]).includes(status)
}

/** Just enough of a `fines` row to answer the money questions. */
export interface FineLike {
  amount_cents: number | null
  status: string
}

export interface FineSummary {
  /** Every fine on the case, whatever its status. "Issued", not "owed". */
  totalCents: number
  /** The subset still owed — `OUTSTANDING_FINE_STATUSES`. */
  outstandingCents: number
  /** The subset owed AND under appeal, called out separately on screen. */
  disputedCents: number
  /** True when at least one fine can be chased — gates "Send Reminder". */
  chaseable: boolean
  /** True when every fine on the case reads `paid`. Not the same as "nothing owed". */
  fullyPaid: boolean
}

/**
 * The one function that answers "what does this case owe?".
 *
 * Cents in, cents out: rounding to dollars is the caller's last step, so
 * summing never happens on already-divided numbers.
 */
export function summariseFines(fines: readonly FineLike[]): FineSummary {
  let totalCents = 0
  let outstandingCents = 0
  let disputedCents = 0
  let chaseable = false
  for (const f of fines) {
    const cents = f.amount_cents ?? 0
    totalCents += cents
    if (isOutstandingFine(f.status)) outstandingCents += cents
    if (f.status === "disputed") disputedCents += cents
    if (isChaseableFine(f.status)) chaseable = true
  }
  return {
    totalCents,
    outstandingCents,
    disputedCents,
    chaseable,
    fullyPaid: fines.length > 0 && fines.every((f) => f.status === "paid"),
  }
}
