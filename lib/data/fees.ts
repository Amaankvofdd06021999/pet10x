/**
 * Pet10x — the money model a business sees, in one place.
 *
 * The customer pays the business directly; Pet10x bills the business its fee
 * separately. So the business always works with two numbers: the price it
 * sets, and what it keeps once the fee is billed. Both come from here so the
 * storefront, the bookings inbox and the dashboard can never disagree.
 *
 * The fee is rounded the way the booking insert guard rounds commission_cents
 * (Postgres round() on numeric: half away from zero, which for a price is
 * half up), so "You receive" matches what the stored booking will say.
 */

import { COMMISSION_RATE, type BookingStatus } from "./bookings"

/** The fee as the copy states it — "15%" — derived so it can't drift from the rate. */
export function feePercentLabel(): string {
  return `${Math.round(COMMISSION_RATE * 100)}%`
}

/**
 * Pet10x's fee on a price, rounded half up. Worked in basis points so a float
 * product like 10 × 0.15 = 1.5000000000000002 cannot tip a half-cent the
 * wrong way.
 */
export function feeCents(priceCents: number): number {
  const bp = Math.round(COMMISSION_RATE * 10_000)
  return Math.floor((priceCents * bp + 5_000) / 10_000)
}

/** What the business keeps from a completed booking at this price. */
export function youReceiveCents(priceCents: number): number {
  return priceCents - feeCents(priceCents)
}

/**
 * What Pet10x will invoice the business for: the fee stored on each completed
 * or paid booking. The stored commission_cents is summed, never recomputed —
 * it is what the booking was priced at, even if the rate later changes.
 */
export function feeOwedCents(bookings: { status: BookingStatus; commissionCents: number }[]): number {
  return bookings
    .filter((b) => b.status === "completed" || b.status === "paid")
    .reduce((sum, b) => sum + b.commissionCents, 0)
}

export interface EarningsSummary {
  /** Price of every completed and paid booking. */
  grossCents: number
  /** Pet10x's stored fee on those same bookings. */
  feeCents: number
  /** grossCents − feeCents, by construction. */
  netCents: number
  /** Gross of completed bookings the customer has not yet paid for — a subset of grossCents. */
  waitingCents: number
  waitingCount: number
  paidCount: number
  /** Completed + paid bookings: the set the three money figures are over. */
  countedBookings: number
}

/**
 * Every money tile on Earnings and the Dashboard, from one pass over one set.
 *
 * Gross, fee and net are all taken over completed + paid bookings (the set
 * `feeOwedCents` already bills against), so Gross − Fee = Net holds exactly and
 * the tiles can never be read against different sets. "Waiting for payment" is
 * the completed, not-yet-paid part of that same set, shown as its own line.
 * Stored amount_cents and commission_cents are summed, never recomputed.
 */
export function earningsSummary(
  bookings: { status: BookingStatus; amountCents: number; commissionCents: number }[],
): EarningsSummary {
  let grossCents = 0
  let feeCents = 0
  let waitingCents = 0
  let waitingCount = 0
  let paidCount = 0
  for (const b of bookings) {
    if (b.status !== "completed" && b.status !== "paid") continue
    grossCents += b.amountCents
    feeCents += b.commissionCents
    if (b.status === "paid") paidCount += 1
    else {
      waitingCents += b.amountCents
      waitingCount += 1
    }
  }
  return {
    grossCents,
    feeCents,
    netCents: grossCents - feeCents,
    waitingCents,
    waitingCount,
    paidCount,
    countedBookings: paidCount + waitingCount,
  }
}

/*
 * The only shapes a price may take: an optional dollar sign, 1–5 digits, and
 * optionally a dot or comma with one or two decimals. Anything else — a minus
 * sign, a thousands separator, a currency code, three decimals — is refused
 * rather than guessed at.
 */
const PRICE = /^\s*\$?\s*(\d{1,5})(?:[.,](\d{1,2}))?\s*$/

export function parsePriceCents(raw: string): { ok: true; cents: number } | { ok: false } {
  const m = PRICE.exec(raw)
  if (!m) return { ok: false }
  const whole = Number(m[1])
  const frac = m[2] ? Number(m[2].padEnd(2, "0")) : 0
  return { ok: true, cents: whole * 100 + frac }
}

/* ------------------------------------------------------------------ */
/* A service's name, price and duration                                */
/* ------------------------------------------------------------------ */

export const SERVICE_NAME_MIN = 2
export const SERVICE_NAME_MAX = 80
export const SERVICE_MINUTES_MIN = 5
export const SERVICE_MINUTES_MAX = 600

/** Whole minutes only — no units, signs or decimals in the field. */
const MINUTES = /^\s*(\d{1,3})\s*$/

export type ServiceInput = { name: string; price: string; duration: string }
export type ServiceErrors = Partial<Record<keyof ServiceInput, string>>
export type ServiceValue = { name: string; priceCents: number; durationMin: number | null }

/**
 * Check the add/edit service form. A blank duration is allowed and stored as
 * null — the column is nullable and older services have none — but a typed
 * one must be a whole number of minutes in range.
 */
export function validateServiceInput(
  input: ServiceInput,
): { ok: true; value: ServiceValue } | { ok: false; errors: ServiceErrors } {
  const errors: ServiceErrors = {}

  const name = input.name.trim()
  if (name.length < SERVICE_NAME_MIN || name.length > SERVICE_NAME_MAX) {
    errors.name = `Use ${SERVICE_NAME_MIN} to ${SERVICE_NAME_MAX} characters.`
  }

  const price = parsePriceCents(input.price)
  if (!price.ok) errors.price = "Enter a price like 85 or 85.50."

  let durationMin: number | null = null
  if (input.duration.trim() !== "") {
    const m = MINUTES.exec(input.duration)
    const n = m ? Number(m[1]) : NaN
    if (!m || n < SERVICE_MINUTES_MIN || n > SERVICE_MINUTES_MAX) {
      errors.duration = `Enter whole minutes from ${SERVICE_MINUTES_MIN} to ${SERVICE_MINUTES_MAX}.`
    } else {
      durationMin = n
    }
  }

  if (Object.keys(errors).length > 0 || !price.ok) return { ok: false, errors }
  return { ok: true, value: { name, priceCents: price.cents, durationMin } }
}
