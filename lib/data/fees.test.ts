import { describe, expect, it } from "vitest"
import { COMMISSION_RATE } from "./bookings"
import { feeCents, feeOwedCents, feePercentLabel, parsePriceCents, validateServiceInput, youReceiveCents } from "./fees"

describe("parsePriceCents", () => {
  it("reads a dollar sign and whole dollars", () => {
    expect(parsePriceCents("$85")).toEqual({ ok: true, cents: 8500 })
    expect(parsePriceCents("  $ 85 ")).toEqual({ ok: true, cents: 8500 })
    expect(parsePriceCents("85")).toEqual({ ok: true, cents: 8500 })
  })
  it("reads one or two decimals with a dot or a comma", () => {
    expect(parsePriceCents("85.5")).toEqual({ ok: true, cents: 8550 })
    expect(parsePriceCents("85,50")).toEqual({ ok: true, cents: 8550 })
    expect(parsePriceCents("0.05")).toEqual({ ok: true, cents: 5 })
  })
  it("refuses anything outside the grammar", () => {
    for (const raw of ["-5", "", "  ", "abc", "85.555", "1,000.00", "85 CAD", "123456", "$", ".5", "8 5", "85."]) {
      expect(parsePriceCents(raw)).toEqual({ ok: false })
    }
  })
})

describe("youReceiveCents", () => {
  it("is the price minus the fee at the platform rate", () => {
    expect(COMMISSION_RATE).toBe(0.15)
    expect(youReceiveCents(10000)).toBe(8500)
    expect(feeCents(10000)).toBe(1500)
  })
  it("rounds the fee half up, like the database's round()", () => {
    // 15% of 10 cents is 1.5 → 2, so you receive 8.
    expect(feeCents(10)).toBe(2)
    expect(youReceiveCents(10)).toBe(8)
    // 15% of 8550 is 1282.5 → 1283.
    expect(youReceiveCents(8550)).toBe(8550 - 1283)
    expect(youReceiveCents(0)).toBe(0)
  })
  it("labels the rate from the constant", () => {
    expect(feePercentLabel()).toBe("15%")
  })
})

describe("validateServiceInput", () => {
  const good = { name: "Full groom", price: "$85", duration: "90" }
  it("accepts a valid service and trims the name", () => {
    expect(validateServiceInput({ ...good, name: "  Full groom " })).toEqual({
      ok: true,
      value: { name: "Full groom", priceCents: 8500, durationMin: 90 },
    })
  })
  it("treats a blank duration as not listed", () => {
    expect(validateServiceInput({ ...good, duration: "  " })).toEqual({
      ok: true,
      value: { name: "Full groom", priceCents: 8500, durationMin: null },
    })
  })
  it("needs a name of 2 to 80 characters", () => {
    expect(validateServiceInput({ ...good, name: " a " })).toMatchObject({ ok: false, errors: { name: expect.any(String) } })
    expect(validateServiceInput({ ...good, name: "a".repeat(81) })).toMatchObject({ ok: false })
    expect(validateServiceInput({ ...good, name: "a".repeat(80) }).ok).toBe(true)
  })
  it("refuses a price outside the grammar", () => {
    expect(validateServiceInput({ ...good, price: "-5" })).toMatchObject({ ok: false, errors: { price: expect.any(String) } })
  })
  it("needs a whole number of minutes from 5 to 600", () => {
    for (const d of ["4", "601", "0", "-10", "12.5", "90 min", "1e2"]) {
      expect(validateServiceInput({ ...good, duration: d })).toMatchObject({ ok: false, errors: { duration: expect.any(String) } })
    }
    expect(validateServiceInput({ ...good, duration: "5" }).ok).toBe(true)
    expect(validateServiceInput({ ...good, duration: "600" }).ok).toBe(true)
  })
  it("reports every bad field at once", () => {
    const r = validateServiceInput({ name: "", price: "x", duration: "1" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["duration", "name", "price"])
  })
})

describe("feeOwedCents", () => {
  it("sums the stored fee of completed and paid bookings only", () => {
    const rows = [
      { status: "completed" as const, commissionCents: 1283 },
      { status: "paid" as const, commissionCents: 1500 },
      { status: "confirmed" as const, commissionCents: 900 },
      { status: "cancelled" as const, commissionCents: 700 },
      { status: "requested" as const, commissionCents: 300 },
    ]
    expect(feeOwedCents(rows)).toBe(2783)
    expect(feeOwedCents([])).toBe(0)
  })
})
