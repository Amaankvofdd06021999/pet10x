/**
 * Business tiers — what each one unlocks, who is waiting for review, and what
 * the clinic's verification banner says. Pure, so the admin console and the
 * clinic console read the same words and the mapping is unit-tested.
 *
 * The tiers themselves are enforced in the database (business_is_public,
 * business_tier_of, businesses_select); only admin_set_business_tier changes
 * one (20261009000002).
 */

import { dbErrorMessage } from "./db-error"

export type BusinessTier = "registered" | "listed" | "verified"

export const BUSINESS_TIERS: readonly BusinessTier[] = ["registered", "listed", "verified"]

const LABEL: Record<BusinessTier, string> = {
  registered: "Registered",
  listed: "Listed",
  verified: "Verified",
}

const DESCRIPTION: Record<BusinessTier, string> = {
  registered: "Runs on its own data only; not in owner search.",
  listed: "Appears in owner search and takes online bookings.",
  verified: "Listed, plus receives shared records, sends records back and can use emergency access.",
}

export const tierLabel = (tier: BusinessTier) => LABEL[tier]
export const tierDescription = (tier: BusinessTier) => DESCRIPTION[tier]

/**
 * Moving down a rung takes something away from the business (search listing,
 * shared records), so the admin owes it a note. Upgrades and no-ops do not.
 */
export function isTierDowngrade(from: BusinessTier, to: BusinessTier): boolean {
  return BUSINESS_TIERS.indexOf(to) < BUSINESS_TIERS.indexOf(from)
}

const OPEN = new Set(["submitted", "in_review", "needs_info"])

export const isOpenRequest = (status: string) => OPEN.has(status)

/**
 * The admin's "Awaiting review" filter: an open verification request, or a
 * business nobody has listed yet — sign-up says new businesses are reviewed
 * before they appear in the directory, so a registered one is waiting.
 */
export function awaitingReview(b: { tier: BusinessTier; openRequest: boolean }): boolean {
  return b.openRequest || b.tier === "registered"
}

export interface BannerState {
  state: "none" | "requested" | "needs_info" | "rejected"
  /** Whether a new request may be sent (the database allows one open per kind). */
  canRequest: boolean
  /** The admin's reason, on a rejection or a request for more information. */
  note: string | null
}

/** What the clinic's "not yet verified" banner shows. Null when verified. */
export function verificationBanner(
  tier: BusinessTier,
  latest: { status: string; note: string | null } | null,
): BannerState | null {
  if (tier === "verified") return null
  // needs_info is still open (business_verifications_one_open): no new request,
  // but the clinic answers the question by resubmitting this one.
  if (latest?.status === "needs_info") return { state: "needs_info", canRequest: true, note: latest.note }
  if (latest && isOpenRequest(latest.status)) return { state: "requested", canRequest: false, note: null }
  if (latest?.status === "rejected") return { state: "rejected", canRequest: true, note: latest.note }
  return { state: "none", canRequest: true, note: null }
}

/**
 * A readable sentence for a failed tier or verification write. The RPCs raise
 * sentences of their own (42501 / P0002 / 22023), which dbErrorMessage keeps;
 * anything else is not shown raw.
 */
export function businessTierError(err: { code?: string; message: string }): string {
  if (err.code === "23505" && /business_verifications_one_open/.test(err.message)) {
    return "A verification request is already open for this practice."
  }
  // RLS refusing the request insert (bver_insert) — also 42501, but its
  // message is Postgres's, not ours.
  if (/row-level security/.test(err.message)) {
    return "Only the practice's owner or a manager can request verification."
  }
  // The RPCs' own raises (db-sentences.ts lists them) pass with a full stop.
  return dbErrorMessage(err, "Something went wrong. Try again.")
}
