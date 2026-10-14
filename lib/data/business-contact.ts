/**
 * A business's public phone and email (businesses.contact_phone /
 * contact_email, 20261015000005): checked here before the storefront saves,
 * and turned into a tel: link where it is shown.
 *
 * One grammar each, the same as the database's CHECKs, so the form refuses
 * exactly what Postgres would and the person reads a sentence instead of a
 * constraint name. The email shape is the app's one EMAIL_SHAPE.
 */
import { EMAIL_SHAPE } from "@/lib/auth/email-shape"

/** businesses_contact_phone_grammar. */
export const PHONE_SHAPE = /^[+0-9 ()-]{7,20}$/

export const CONTACT_ERRORS = {
  phone: "Use digits, spaces, brackets, + or -, 7 to 20 characters.",
  email: "Enter an email like name@example.com.",
} as const

export type ContactErrors = Partial<Record<"phone" | "email", string>>

export type ContactResult =
  | { ok: true; value: { phone: string | null; email: string | null } }
  | { ok: false; errors: ContactErrors }

/** Both fields are optional; a filled one must match its grammar after trimming. */
export function validateContact(input: { phone: string; email: string }): ContactResult {
  const phone = input.phone.trim()
  const email = input.email.trim()
  const errors: ContactErrors = {}
  if (phone && !PHONE_SHAPE.test(phone)) errors.phone = CONTACT_ERRORS.phone
  if (email && !EMAIL_SHAPE.test(email)) errors.email = CONTACT_ERRORS.email
  if (errors.phone || errors.email) return { ok: false, errors }
  return { ok: true, value: { phone: phone || null, email: email || null } }
}

/** A dialable tel: link. The number is still shown as typed beside it. */
export function telHref(phone: string): string {
  const trimmed = phone.trim()
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${trimmed.replace(/[^0-9]/g, "")}`
}

/**
 * What a business's booking card says about the customer's contact details.
 * `shared`: business_booking_contact (20261015000005) answers for these
 * statuses, so the card fetches. `after_confirm`: a request — the card says
 * when it will see them. `none`: a booking that ended without happening, where
 * the RPC returns nulls and there is nothing to promise.
 */
export function bookingContactState(status: string): "shared" | "after_confirm" | "none" {
  if (status === "confirmed" || status === "in_progress" || status === "completed" || status === "paid") return "shared"
  if (status === "requested") return "after_confirm"
  return "none"
}
