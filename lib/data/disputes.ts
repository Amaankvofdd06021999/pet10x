/**
 * Pet10x — what a resident may contest, as the client understands it.
 *
 * THE DATABASE IS THE ENFORCEMENT POINT. `dispute_violation`
 * (`supabase/migrations/20260824000001_dispute_violation.sql`) checks the
 * caller, the stage, the once-per-degree rule, the one-open-dispute rule and
 * the 14-day window itself, and `violation_disputes` has no client write policy
 * at all — so nothing in this file can let a dispute through that the RPC would
 * refuse.
 *
 * What this file is for is the other half, and it is the same argument
 * `violations.ts` makes for the ladder: a UI that OFFERS a control the database
 * will refuse is a bug even though the database refuses it, because the
 * resident finds out by typing a paragraph and pressing Submit. So the rules
 * are mirrored here, once, and the screen asks this module rather than
 * re-deriving them.
 *
 * Two properties are asserted rather than assumed:
 *
 *   - `disputes.test.ts` checks coverage over `VIOLATION_STAGES` itself, so a
 *     seventh stage added to `violation_stage_v2` fails by name here instead of
 *     silently defaulting to "not disputable".
 *   - the phase's task report asserts `DISPUTABLE_STAGES` and
 *     `DISPUTE_WINDOW_DAYS` against the DEPLOYED `prosrc`, in both directions —
 *     nothing offered that the database refuses, nothing hidden that it allows.
 *     That is the check that caught `LEGAL_TRANSITIONS` drifting in Phase 2.
 *
 * It lives apart from `live.ts` for the reason `violations.ts` lives apart from
 * `manager-queues.ts`: that file is `"use client"` with React hooks and a
 * Supabase client, and this logic has to be testable under vitest's
 * `environment: "node"`, where there is no DOM and no session. Pure functions
 * only.
 */

import { longDate } from "@/lib/dates"
import type { ViolationStage } from "./types"

/**
 * The outcome vocabulary, RE-EXPORTED rather than redeclared.
 *
 * `types.ts` aliases it over `Database["public"]["Enums"]["dispute_outcome"]`,
 * the same rule `ViolationStage` follows. Writing `Database[...]` a second time
 * here would be two declarations of one fact — the shape of duplicated truth
 * this project has already paid for twice — so this is a re-export and callers
 * may import it from whichever module they already depend on.
 */
export type { DisputeOutcome } from "./types"

/**
 * The three findings a resident may contest, as a POSITIVE GRAMMAR.
 *
 * Written as the stages that ARE disputable rather than as "everything except
 * open, resolved and dismissed", so a seventh `violation_stage_v2` label is
 * excluded until somebody decides it belongs. This mirrors
 * `dispute_violation`'s own `c_disputable` array exactly.
 *
 * Why each of the other three is out:
 *
 *   open        not a finding against anyone — it is "we are looking into it".
 *               One of the 13 live cases at `open` has no `resident_id` at all.
 *               There is nothing yet to contest.
 *   resolved    terminal.
 *   dismissed   terminal, and it is already the outcome a dispute seeks.
 */
export const DISPUTABLE_STAGES = ["warning", "fine_1", "fine_2"] as const
export type DisputableStage = (typeof DISPUTABLE_STAGES)[number]

/**
 * How long a resident has, from the event that entered the case's current
 * stage.
 *
 * A CONSTANT, not a `buildings.pet_rules` key, and that reverses the obvious
 * reading of AD-5's pattern deliberately. `fine_1_cents` / `fine_2_cents` are a
 * `pet_rules` convention with no writer anywhere in this codebase and 0 of 6
 * buildings carrying them; a third unwritable key would repeat a defect this
 * project has already shipped. A per-building window ships the day its editor
 * does, and on that day this constant becomes the default rather than the rule.
 *
 * `dispute_violation` holds the same 14 as `c_window`. Neither reads the other,
 * which is why the mirror is asserted against the deployed function rather than
 * trusted.
 */
export const DISPUTE_WINDOW_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export function isDisputableStage(stage: ViolationStage): stage is DisputableStage {
  return (DISPUTABLE_STAGES as readonly ViolationStage[]).includes(stage)
}

/**
 * The last moment a dispute may be filed against the current stage.
 *
 * `anchorIso` is `max(violation_events.created_at where to_stage = <the case's
 * stage>)`, falling back to the case's own `created_at` — the same `coalesce`
 * the RPC applies, and the fallback covers a case whose stage predates any
 * event.
 *
 * An unparseable anchor yields an Invalid Date, and every comparison against it
 * is false — so `canDispute` refuses. That is the right direction: a client
 * that cannot work out the deadline must not offer the control, and the RPC
 * would answer honestly if it were called anyway.
 */
export function disputeDeadline(anchorIso: string): Date {
  return new Date(new Date(anchorIso).getTime() + DISPUTE_WINDOW_DAYS * DAY_MS)
}

/** Why a dispute cannot be filed. One reason per sentence the screen renders. */
export type DisputeBlockedReason = "stage" | "already" | "open" | "window"

export type CanDisputeResult = { ok: true } | { ok: false; reason: DisputeBlockedReason }

export interface CanDisputeInput {
  stage: ViolationStage
  /** `max(created_at)` of the events that entered `stage`, else the case's `created_at`. */
  anchorIso: string
  /** Any dispute on this case with `outcome === null`, whatever stage it names. */
  hasOpenDispute: boolean
  /** A dispute row already exists for `(case, stage)` — decided or not. */
  alreadyDisputedThisStage: boolean
  /** Injected so the tests can pin it. Defaults to now. */
  now?: Date
}

/**
 * Can this resident dispute this case, and if not, which sentence do they see?
 *
 * THE ORDER OF THESE TESTS MIRRORS `dispute_violation`'s, statement for
 * statement, and that is deliberate rather than incidental: when the RPC and
 * this function disagree about WHICH rule blocked a call, the resident reads
 * one explanation on screen and gets a different one from the server on submit.
 *
 *   stage -> already (same degree) -> open (any degree) -> window
 *
 * `already` before `open` is what makes re-filing against the same rung say
 * "you have already disputed this" rather than the vaguer "you have an appeal
 * outstanding", and `open` before `window` is what stops a resident with a
 * pending appeal being told the window has closed on a different rung.
 *
 * Note what is NOT an input: `fines.status`. Phase 2 derived the dispute signal
 * from `fines.status = 'disputed'`, and that derivation is retired — a
 * warning-stage dispute has no fine row to carry a flag, which is how it became
 * inexpressible in the first place. `violation_disputes` is the only source.
 */
export function canDispute(input: CanDisputeInput): CanDisputeResult {
  const { stage, anchorIso, hasOpenDispute, alreadyDisputedThisStage } = input
  const now = input.now ?? new Date()

  if (!isDisputableStage(stage)) return { ok: false, reason: "stage" }
  if (alreadyDisputedThisStage) return { ok: false, reason: "already" }
  if (hasOpenDispute) return { ok: false, reason: "open" }

  const deadline = disputeDeadline(anchorIso)
  // `!(a <= b)` rather than `a > b`, so an Invalid Date — which makes every
  // comparison false — lands on "closed" instead of quietly passing.
  if (!(now.getTime() <= deadline.getTime())) return { ok: false, reason: "window" }

  return { ok: true }
}

/**
 * The sentence shown IN PLACE OF the dispute button, never instead of nothing.
 *
 * A control that vanishes lies about ever having existed: a resident who missed
 * the window and finds no button anywhere concludes the app has no appeal
 * process, not that theirs expired. Each of these names the reason and points
 * somewhere real.
 *
 * `deadline` is only read for `"window"`; the other three ignore it, which is
 * why it is optional rather than four functions.
 */
export function describeWhyNot(reason: DisputeBlockedReason, deadline?: Date): string {
  switch (reason) {
    case "stage":
      return "There is nothing to dispute yet. A case stays open while the strata looks into it, and once it is resolved or dismissed it is closed for good — an appeal applies to a warning or a fine."
    case "already":
      return "You have already disputed this stage of the case. If it escalates to the next stage, you can dispute that separately."
    case "open":
      return "You already have an appeal on this case waiting for a decision. The strata will respond to that one first."
    case "window":
      return `The ${DISPUTE_WINDOW_DAYS}-day window to dispute this closed on ${longDate(deadline ?? null, "an unknown date")}. Contact your strata directly if you still want to contest it.`
  }
}
