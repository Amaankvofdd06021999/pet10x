/**
 * How an owner reads a vet visit's status, and when they may cancel it. Pure,
 * so the words and the 2-hour rule are unit-tested; the screen is My vets →
 * Appointments.
 *
 * The labels are an allow-list (the positive-grammar rule): a status this file
 * has not been taught reads "Status unknown", never the enum's raw spelling.
 * `own` guards against inherited keys, so "constructor" is unknown too.
 *
 * The live `appointment_status` enum (20260901000000) spells the check-in step
 * `arrived`, and has a `ready` step after the vet; the brief's `checked_in` is
 * kept as written so either spelling reads the same.
 */

const LABEL: Record<string, string> = {
  requested: "Waiting for the clinic to confirm",
  booked: "Confirmed",
  checked_in: "Checked in",
  arrived: "Checked in",
  in_progress: "With the vet",
  ready: "Ready to go home",
  completed: "Done",
  cancelled: "Cancelled",
  no_show: "Missed",
}

export type AppointmentTone = "neutral" | "good" | "warn" | "bad"

const TONE: Record<string, AppointmentTone> = {
  requested: "warn",
  booked: "good",
  completed: "good",
  no_show: "bad",
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

export function appointmentLabel(status: string): string {
  return own(LABEL, status) ? LABEL[status] : "Status unknown"
}

export function appointmentTone(status: string): AppointmentTone {
  return own(TONE, status) ? TONE[status] : "neutral"
}

/** owner_cancel_appointment (20261015000005) refuses inside this window as `too_late`. */
const CANCEL_CUTOFF_MS = 2 * 60 * 60 * 1000

/**
 * May the owner cancel this visit themselves? The same rule the RPC enforces —
 * requested or booked, and starting MORE than 2 hours from now — so the button
 * only shows when pressing it can work. The RPC stays the authority: a clock
 * that drifts past the cutoff still gets the "call the practice" sentence.
 */
export function canOwnerCancel(status: string, startsAt: string, now: Date): boolean {
  if (status !== "requested" && status !== "booked") return false
  const start = new Date(startsAt).getTime()
  if (Number.isNaN(start)) return false
  return start - now.getTime() > CANCEL_CUTOFF_MS
}

/**
 * A business that books through the vet scheduler rather than the service
 * catalog. The same test `useVetDirectory` applies (business_kind =
 * 'veterinary'), so every practice that offers "Book an appointment" is one
 * the My vets picker lists.
 */
export function isClinicBusiness(b: { businessKind: string | null }): boolean {
  return b.businessKind === "veterinary"
}
