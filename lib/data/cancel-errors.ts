/**
 * What a person reads when a cancel or a decline fails, and how the booking
 * contact RPC's answer is read (20261015000005).
 *
 * business_cancel_booking, owner_cancel_appointment and owner_decline_estimate
 * each refuse in two ways: a raise (42501 not yours, 22023 the reason or note)
 * and an `{ok:false, error}` answer for a state it cannot move from. Neither
 * reaches the screen as written. The codes are an allow-list: anything this
 * file has not been taught reads as the one "try again" sentence, never the
 * database's text — the same rule as decision-errors.ts.
 *
 * 22023 always means the reason or note: the screens ask for it in a
 * ConfirmDialog that refuses blank and over-long text first, so this is the
 * belt behind it, and it says the rule rather than "invalid".
 */

/** The fields of a Postgrest error this reads. `message` is never shown. */
export type CancelRaise = { code?: string | null; message?: string } | null

/** The jsonb the RPCs return. */
export type CancelAnswer = { ok?: boolean; error?: string; status?: string } | null

type Sentences = { raise: Record<string, string>; answer: Record<string, string>; retry: string }

function sentence(s: Sentences, e: CancelRaise, r: CancelAnswer): string | null {
  if (e) return (e.code && s.raise[e.code]) || s.retry
  if (r?.ok) return null
  return (r?.error && s.answer[r.error]) || s.retry
}

const BOOKING: Sentences = {
  raise: {
    "42501": "Only the business can cancel this booking.",
    "22023": "Add a reason of 2000 characters or fewer. The customer sees it.",
  },
  answer: { not_cancellable: "This booking can't be cancelled any more. Refresh to see where it stands." },
  retry: "Couldn't cancel the booking. Try again.",
}

const APPOINTMENT: Sentences = {
  raise: {
    "42501": "That visit isn't yours to cancel.",
    "22023": "Keep the reason to 2000 characters or fewer.",
  },
  answer: {
    too_late: "The visit is less than 2 hours away. Call the practice to cancel.",
    not_cancellable: "This visit can't be cancelled any more. Refresh to see where it stands.",
  },
  retry: "Couldn't cancel the visit. Try again.",
}

const ESTIMATE: Sentences = {
  raise: {
    "42501": "That estimate isn't yours.",
    "22023": "Add a note of 2000 characters or fewer. The practice sees it.",
  },
  answer: {
    not_awaiting_approval: "This estimate has already been answered. Refresh to see where it stands.",
    not_an_estimate: "Only an estimate can be declined.",
  },
  retry: "Couldn't decline the estimate. Try again.",
}

/** customer_cancel_booking's refusals (cancelBooking in bookings.ts). */
export const CUSTOMER_CANCEL = {
  tooLate: "This booking can't be cancelled any more — contact the business.",
  notYours: "That booking isn't yours to cancel.",
  retry: "Couldn't cancel the booking. Try again.",
} as const

/** The insert guard's refusal (20261012000008), raised in plain English. */
export const SERVICE_UNAVAILABLE = "That service isn't available to book"

const all = (s: Sentences) => [...Object.values(s.raise), ...Object.values(s.answer), s.retry]

/** Every sentence this file can return, for lib/user-error.ts. */
export const CANCEL_SENTENCES: readonly string[] = [
  ...all(BOOKING),
  ...all(APPOINTMENT),
  ...all(ESTIMATE),
  ...Object.values(CUSTOMER_CANCEL),
  SERVICE_UNAVAILABLE,
]

/** business_cancel_booking, as a sentence. Null when it went through. */
export const bookingCancelError = (e: CancelRaise, r: CancelAnswer) => sentence(BOOKING, e, r)

/** owner_cancel_appointment, as a sentence. Null when it went through. */
export const appointmentCancelError = (e: CancelRaise, r: CancelAnswer) => sentence(APPOINTMENT, e, r)

/** owner_decline_estimate, as a sentence. Null when it went through. */
export const estimateDeclineError = (e: CancelRaise, r: CancelAnswer) => sentence(ESTIMATE, e, r)

export interface BookingContact {
  email: string | null
  phone: string | null
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)

/**
 * business_booking_contact's `{email, phone}`. Null fields mean "not yours to
 * see yet" (a request, a cancellation, someone else's booking) or "the
 * customer never gave one" — the RPC does not say which, on purpose.
 */
export function parseBookingContact(data: unknown): BookingContact {
  if (!data || typeof data !== "object") return { email: null, phone: null }
  const d = data as Record<string, unknown>
  return { email: text(d.email), phone: text(d.phone) }
}
