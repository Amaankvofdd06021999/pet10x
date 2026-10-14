/**
 * `manager_decide_link` (20261015000001) answers in two ways.
 *
 * A refusal the caller can cause by acting — a non-manager (42501), a move
 * outside approve/deny/remove (22023), an over-long reason (22023) — RAISES,
 * and the raise carries a sentence and a hint written for the manager, so the
 * transport error is shown as it is. The one answer that is not the caller's
 * doing — the link is gone, usually because a colleague's tap got there first
 * — comes back as `{ ok: false, error: 'not_found' }`. This turns that, and
 * anything newer than this file, into a sentence.
 */
export type LinkDecisionResult = { ok: boolean; error?: string; status?: string } | null

export function linkDecisionError(r: LinkDecisionResult): string | null {
  if (r?.ok) return null
  switch (r?.error) {
    case "not_found":
      return "That request no longer exists."
  }
  return "That didn't go through. Try again."
}
