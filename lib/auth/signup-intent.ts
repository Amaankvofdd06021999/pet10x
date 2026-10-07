/**
 * Which account a verified signup code creates.
 *
 * Residents and businesses share one OTP gate (`/api/auth/signup/start` and
 * `/verify`). Start records the intent on the pending row; verify reads it back
 * from there, never from the verify request, so the account type is fixed at
 * the moment the code is sent to the address that will confirm it.
 *
 * Pure, and deliberately free of `server-only`, so the rules are unit-tested
 * and the business form can list the same categories the server accepts.
 */

export const BUSINESS_CATEGORIES = [
  "Veterinary",
  "Grooming",
  "Boarding",
  "Dog walking",
  "Training",
  "Pet store",
  "Other",
] as const

export const BUSINESS_NAME_MAX = 120

export interface PendingBusiness {
  businessName: string
  category: string
}

export type SignupIntent =
  | { ok: true; intent: "resident"; business: null }
  | { ok: true; intent: "business"; business: PendingBusiness }
  | { ok: false; error: string }

/** Validate the intent part of a `/signup/start` body. Email is checked by the route. */
export function parseSignupIntent(body: {
  intent?: unknown
  businessName?: unknown
  category?: unknown
  [field: string]: unknown
}): SignupIntent {
  const intent = body.intent ?? "resident"
  if (intent === "resident") return { ok: true, intent: "resident", business: null }
  if (intent !== "business") return { ok: false, error: "Invalid request." }

  const businessName = typeof body.businessName === "string" ? body.businessName.trim() : ""
  if (!businessName) return { ok: false, error: "Enter your business name." }
  if (businessName.length > BUSINESS_NAME_MAX) {
    return { ok: false, error: `Business name is too long (${BUSINESS_NAME_MAX} characters at most).` }
  }

  const raw = typeof body.category === "string" ? body.category.trim() : ""
  const category = raw || "Other"
  if (!(BUSINESS_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, error: "Choose a category from the list." }
  }

  return { ok: true, intent: "business", business: { businessName, category } }
}

/** Read `pending_signups.business` back. Null when it is not a usable business. */
export function pendingBusiness(value: unknown): PendingBusiness | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (typeof v.businessName !== "string" || !v.businessName.trim()) return null
  if (typeof v.category !== "string" || !v.category.trim()) return null
  return { businessName: v.businessName, category: v.category }
}

/** Same business details — the only kind of business row a cooldown may leave alone. */
function sameBusiness(a: PendingBusiness | null, b: PendingBusiness | null): boolean {
  if (!a || !b) return a === b
  return a.businessName === b.businessName && a.category === b.category
}

export type StartDecision =
  /** Issue and email a fresh code, replacing the row. */
  | { kind: "send" }
  /** The current code is still valid and the request matches it: change nothing. */
  | { kind: "cooldown"; retryAfterSeconds: number }
  /**
   * Inside the cooldown, but the request wants a different account (intent or
   * business details). Refused: changing what a live code creates without a
   * new code going to the inbox would let anyone who knows the address flip a
   * stranger's pending signup.
   */
  | { kind: "conflict"; retryAfterSeconds: number }
  /** Send cap reached for this pending signup. */
  | { kind: "cap" }

/**
 * What `/signup/start` does with a request, given the pending row for that
 * address (or none). An existing row's intent, business and name only ever
 * change together with a new code.
 */
export function decideStart(input: {
  existing: {
    send_count: number
    last_sent_at: string
    intent: string
    business: unknown
  } | null
  intent: "resident" | "business"
  business: PendingBusiness | null
  nowMs: number
  cooldownSeconds: number
  maxSends: number
}): StartDecision {
  const { existing } = input
  if (!existing) return { kind: "send" }
  const since = (input.nowMs - new Date(existing.last_sent_at).getTime()) / 1000
  if (since < input.cooldownSeconds) {
    const retryAfterSeconds = Math.ceil(input.cooldownSeconds - since)
    const matches =
      existing.intent === input.intent && sameBusiness(pendingBusiness(existing.business), input.business)
    return matches ? { kind: "cooldown", retryAfterSeconds } : { kind: "conflict", retryAfterSeconds }
  }
  if (existing.send_count >= input.maxSends) return { kind: "cap" }
  return { kind: "send" }
}

/**
 * The string the code hash is taken over. The intent is bound in, so a code
 * issued for one account type never verifies a row that now says another.
 * A resident's input is unchanged from before intents existed, so codes in
 * flight at deploy time keep working.
 */
export function codeHashInput(email: string, code: string, intent: string, pepper: string): string {
  return intent === "resident" ? `${email}:${code}:${pepper}` : `${email}:${intent}:${code}:${pepper}`
}
