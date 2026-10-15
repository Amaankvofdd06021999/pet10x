/**
 * The sentences an RPC's `{ok:false, error}` code turns into (sentenceFor).
 * Pure, and apart from use-live, so lib/user-error.ts can list them without
 * pulling in the browser client.
 */

const BY_CODE: Record<string, string> = {
  forbidden: "You do not have permission to do that.",
  not_found: "That record no longer exists.",
  not_verified: "This practice needs to be verified before it can do that.",
  role_not_permitted: "Your role does not allow reading shared records.",
  not_linked: "This patient is not linked to a Pet10x account yet.",
  pet_archived: "The owner has removed this pet from Pet10x, so records can no longer be sent to them.",
  illegal_transition: "That is not a move this appointment can make from where it is.",
  slot_taken: "Someone just took that slot. Pick another.",
  in_the_past: "That time has already passed.",
  clinic_not_verified: "That practice is not verified, so it cannot receive records.",
  not_your_pet: "That pet is not on your account.",
  already_linked: "That pet is already linked to another chart here.",
  bad_code: "That code was not recognised.",
  already_used: "That code has already been used.",
  expired: "That code has expired. Ask for a fresh one.",
  reason_required: "A reason is required before emergency access.",
  rate_limited: "Too many emergency lookups today. Contact support.",
  not_an_estimate: "Only an estimate can be approved.",
  not_awaiting_approval: "This estimate is no longer waiting for approval — the practice may have changed it.",
  type_unavailable: "That appointment type is not bookable online.",
}

const NO_CODE = "Something went wrong."
const UNKNOWN_CODE = "Couldn't do that. Try again."

/** Turn an RPC error code into something a receptionist can act on. */
export function sentenceFor(code: string | undefined): string {
  if (code === undefined) return NO_CODE
  return Object.prototype.hasOwnProperty.call(BY_CODE, code) ? BY_CODE[code] : UNKNOWN_CODE
}

/** Every sentence sentenceFor can return. */
export const CLINIC_SENTENCES: readonly string[] = [...Object.values(BY_CODE), NO_CODE, UNKNOWN_CODE]
