import type { BusinessTier } from "./business-tier"

/**
 * Pet10x — deleting a business from the admin console, the pure half.
 *
 * Only admin_delete_business deletes a business for a signed-in client
 * (20261015000002: no client role has a delete policy on `businesses`). It
 * wants the business's name typed, and refuses while clinic records exist —
 * patients, visits, invoices — or bookings are still open. The console shows
 * admin_business_footprint's counts first, and offers "Set tier to Registered
 * instead", which keeps the records and takes the business out of search.
 *
 * `canDeleteBusiness` and `nameMatches` restate the database's rules so the
 * dialog can say so before asking; the database still decides.
 */

export interface BusinessFootprint {
  patients: number
  visits: number
  invoices: number
  /** Active staff other than the owner. */
  staff: number
  /** service_bookings requested | confirmed | in_progress. */
  openBookings: number
  /** Future, not cancelled. */
  appointments: number
}

export const NAME_MISMATCH_MESSAGE = "That name doesn't match."
export const HAS_RECORDS_MESSAGE = "This business has clinic records. Set its tier to Registered instead."
const HAS_RECORDS_REGISTERED_MESSAGE = "This business has clinic records, so it can't be deleted. It's already Registered."
const NOT_FOUND_MESSAGE = "That business no longer exists."
const NOT_ADMIN_MESSAGE = "Only a Pet10x admin can delete a business."
const GENERIC_MESSAGE = "Something went wrong. Try again."

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0

/**
 * The RPC's jsonb, or null unless all six counts are whole and non-negative.
 * Null means "no counts" — and the dialog does not offer Delete without them.
 */
export function parseFootprint(raw: unknown): BusinessFootprint | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const { patients, visits, invoices, staff, open_bookings, appointments } = r
  if (![patients, visits, invoices, staff, open_bookings, appointments].every(isCount)) return null
  return {
    patients: patients as number,
    visits: visits as number,
    invoices: invoices as number,
    staff: staff as number,
    openBookings: open_bookings as number,
    appointments: appointments as number,
  }
}

/**
 * The database's has_records rule, inverted. Staff and upcoming appointments
 * are shown but do not block: staff keep their accounts, and the admin has
 * seen the count.
 */
export function canDeleteBusiness(fp: BusinessFootprint | null): boolean {
  if (!fp) return false
  return fp.patients + fp.visits + fp.invoices === 0 && fp.openBookings === 0
}

/** Exact after trimming both sides, case-sensitive; a blank name never matches. */
export function nameMatches(typed: string, name: string): boolean {
  const t = typed.trim()
  return t !== "" && t === name.trim()
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The counts in words, in the order the dialog lists them. */
export function footprintLines(fp: BusinessFootprint): string[] {
  return [
    plural(fp.patients, "patient", "patients"),
    plural(fp.visits, "visit", "visits"),
    plural(fp.invoices, "invoice", "invoices"),
    `${plural(fp.staff, "staff member", "staff members")} besides the owner`,
    plural(fp.openBookings, "open booking", "open bookings"),
    plural(fp.appointments, "upcoming appointment", "upcoming appointments"),
  ]
}

/**
 * Why a business with records can't go. "Set its tier to Registered" is advice
 * only while it isn't — a Registered business has nowhere further to step down.
 */
export function hasRecordsMessage(tier: BusinessTier | undefined): string {
  return tier === "registered" ? HAS_RECORDS_REGISTERED_MESSAGE : HAS_RECORDS_MESSAGE
}

/**
 * A sentence for a refused delete: either the RPC's `{error}` answer, or a
 * raised error (`{code, message}`). Nothing unknown is shown raw.
 */
export function deleteBusinessError(
  err: { error?: string; code?: string; message?: string },
  tier?: BusinessTier,
): string {
  switch (err.error) {
    case "name_mismatch":
      return NAME_MISMATCH_MESSAGE
    case "has_records":
      return hasRecordsMessage(tier)
    case "not_found":
      return NOT_FOUND_MESSAGE
  }
  if (err.code === "42501") return NOT_ADMIN_MESSAGE
  if (err.code === "P0002") return NOT_FOUND_MESSAGE
  return GENERIC_MESSAGE
}

/** Why admin_business_footprint failed, as a sentence. */
export function footprintError(err: { code?: string; message: string }): string {
  if (err.code === "42501") return NOT_ADMIN_MESSAGE
  if (err.code === "P0002") return NOT_FOUND_MESSAGE
  return "Couldn't load what this business holds. Try again."
}
