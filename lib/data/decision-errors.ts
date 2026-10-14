/**
 * What a manager reads when a registration or resident-link decision fails.
 *
 * `manager_decide_registration` and `manager_decide_link` (20261015000001)
 * answer a refusal in two ways, and both used to reach the screen as written:
 * a raise came through as its Postgres message ("forbidden: not a manager of
 * this link's building"), and an `{ok:false}` answer came through as a code
 * the manager had no way to read (`already_member` fell to "That didn't go
 * through", which invites the retry that can never work).
 *
 * The codes are an allow-list. A code this file has not been taught gets the
 * one generic sentence, never the raw text — the database's vocabulary can
 * grow, and the screen must still read as English when it does.
 *
 * 22023 maps to "already decided" whatever its detail. The function also uses
 * 22023 for a missing or over-long reason, but every caller now asks for the
 * reason in a ConfirmDialog that refuses blank and over-long text before the
 * call is made, so the one 22023 a manager can actually reach is the race: a
 * colleague decided it first, or the same tap landed twice.
 */

const ALREADY_DECIDED = "This was already decided. Refresh to see the latest."
const ALREADY_MEMBER = "They're already a member of this building."
const NOT_YOURS = "You don't manage this building any more."
const GONE = "That request no longer exists."
const RETRY = "Couldn't save that. Try again."

/** The fields of a Postgrest error this reads. `message` is never shown. */
export type DecisionRaise = { code?: string | null; details?: string | null; message?: string } | null

/** The jsonb a decision RPC returns. */
export type DecisionResult = { ok: boolean; error?: string; status?: string } | null

/** A raise, as a sentence. Null when there was none. */
export function decisionError(e: DecisionRaise): string | null {
  if (!e) return null
  if (e.details === "not_pending") return ALREADY_DECIDED
  switch (e.code) {
    case "22023":
      return ALREADY_DECIDED
    case "42501":
      return NOT_YOURS
  }
  return RETRY
}

/** An `{ok:false}` answer, as a sentence. Null when it went through. */
export function decisionResultError(r: DecisionResult): string | null {
  if (r?.ok) return null
  switch (r?.error) {
    case "already_member":
      return ALREADY_MEMBER
    case "not_found":
      return GONE
    case "not_pending":
      return ALREADY_DECIDED
  }
  return RETRY
}
