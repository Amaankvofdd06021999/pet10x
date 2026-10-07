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
