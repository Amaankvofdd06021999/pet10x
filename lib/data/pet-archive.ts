/**
 * Pet10x — why a pet was removed, and how that is said.
 *
 * The three reasons mirror `pets_archived_reason_check` in
 * 20261007000001_owner_archive_pet.sql, character for character. The reason
 * is not decoration: it decides whether the pet is remembered anywhere. Only
 * `passed_away` appears again — in the owner's "In memory" list on Profile.
 * A rehomed pet or one added by mistake is simply gone.
 *
 * Pure, so vitest (`environment: "node"`) can hold it.
 */

import { parseDbDate } from "@/lib/dates"

export const ARCHIVE_REASONS = ["passed_away", "rehomed", "mistake"] as const
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number]

/** What the owner taps in the Remove sheet. */
export const ARCHIVE_REASON_LABEL: Record<ArchiveReason, string> = {
  passed_away: "Passed away",
  rehomed: "Rehomed",
  mistake: "Added by mistake",
}

/** A line under each choice, so the consequence is known before confirming. */
export const ARCHIVE_REASON_HINT: Record<ArchiveReason, string> = {
  passed_away: "Kept on your profile under In memory.",
  rehomed: "Removed from your account.",
  mistake: "Removed from your account.",
}

/**
 * What the owner reads when owner_archive_pet refuses. Keyed on the SQLSTATE /
 * PostgREST code, never the message: the message is Postgres talking to a
 * developer.
 *
 *   42501     not their pet, or already removed (a second tap, another tab)
 *   22023     a reason outside the three — the sheet cannot send one, so this
 *             means a stale client
 *   PGRST202  / 42883  the function does not exist: the migration is not
 *             applied yet
 */
export function archiveErrorSentence(code: string | null | undefined): string {
  switch (code) {
    case "42501":
      return "This pet isn't on your account, or it was already removed."
    case "22023":
      return "Choose a reason for removing this pet."
    case "PGRST202":
    case "42883":
      return "Removing a pet isn't available yet. Please try again later."
    default:
      return "Couldn't remove this pet. Check your connection and try again."
  }
}

/** Anything not exactly one of the three is not a reason — including case variants. */
export function parseArchiveReason(value: unknown): ArchiveReason | null {
  return typeof value === "string" && (ARCHIVE_REASONS as readonly string[]).includes(value)
    ? (value as ArchiveReason)
    : null
}

/**
 * "2014–2026" for the In memory list — birth year to the year it was removed.
 * Null without a birth date: a lone year would read as the year the pet was
 * born. Read through parseDbDate so a `date` is a local calendar day, not a
 * UTC midnight that lands on the previous year west of Greenwich on 1 January.
 */
export function memorialYears(dob: string | null | undefined, archivedAt: string | null | undefined): string | null {
  const end = parseDbDate(archivedAt)
  if (!end) return null
  const birth = parseDbDate(dob)
  return birth ? `${birth.getFullYear()}–${end.getFullYear()}` : null
}
