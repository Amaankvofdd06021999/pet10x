import { CANCEL_SENTENCES } from "@/lib/data/cancel-errors"
import { DECISION_SENTENCES } from "@/lib/data/decision-errors"
import { CLINIC_SENTENCES } from "@/lib/data/clinic/sentences"
import { DELETION_SENTENCES, DELETION_SENTENCE_PATTERNS } from "@/lib/account-deletion"
import { DB_SENTENCES, isIssuedFallback } from "@/lib/data/db-sentences"

/**
 * What an owner-facing screen may show from an error string.
 *
 * Several data functions still hand back `error.message` as it came from
 * Postgres, Storage or fetch ("new row violates row-level security policy…",
 * "Failed to fetch"). Those are diagnostics, not sentences. This is the
 * allow-list in front of the screen: a sentence we wrote passes through
 * unchanged; anything else becomes the screen's own fallback. Positive
 * grammar — the list says what may be shown, so text the database learns to
 * say later can never leak by default.
 */

/** Short sentences the data layer returns in several places. */
const GENERIC_SENTENCES: readonly string[] = [
  "Not configured.",
  "Please sign in first.",
  "You must be signed in.",
  "You must be signed in to add a pet.",
  "Pets can't be saved right now — backend not configured.",
  "Upload failed.",
  // municipal.ts's 42501, thrown inside a useLive loader that re-reads it.
  "You don't manage this building.",
  // The account-deletion route's own refusals (app/api/account/delete).
  "We couldn't delete your account. Please contact support so we can finish it for you.",
  "Couldn't prepare your data for deletion. Try again in a moment.",
  "Couldn't delete your account.",
]

/** Every sentence `userError` passes through as written. */
export const KNOWN_USER_SENTENCES: ReadonlySet<string> = new Set([
  ...GENERIC_SENTENCES,
  ...CANCEL_SENTENCES,
  ...DECISION_SENTENCES,
  ...CLINIC_SENTENCES,
  ...DELETION_SENTENCES,
  ...DB_SENTENCES,
])

/** `raw` when it is a sentence we wrote, else `fallback`. Null when there was no error. */
export function userError(raw: string | null, fallback: string): string | null {
  if (raw === null) return null
  const text = raw.trim()
  if (KNOWN_USER_SENTENCES.has(text)) return text
  // A fallback dbErrorMessage handed out earlier — a sentence a caller wrote.
  if (isIssuedFallback(text)) return text
  if (DELETION_SENTENCE_PATTERNS.some((p) => p.test(text))) return text
  return fallback
}
