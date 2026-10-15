import { describe, expect, it } from "vitest"
import { COMMISSION_RATE, type BookingStatus } from "./bookings"
import { feeCents, earningsSummary, feeOwedCents, feePercentLabel, parsePriceCents, validateServiceInput, youReceiveCents } from "./fees"

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

describe("earningsSummary", () => {
  const b = (status: BookingStatus, amountCents: number, commissionCents: number) => ({ status, amountCents, commissionCents })
  const mix = [
    b("requested", 10_000, 1_500),
    b("confirmed", 20_000, 3_000),
    b("in_progress", 5_000, 750),
    b("completed", 8_333, 1_250),
    b("completed", 4_001, 600),
    b("paid", 9_999, 1_500),
    b("paid", 12_345, 1_852),
    b("cancelled", 7_000, 1_050),
    b("declined", 3_000, 450),
  ]

  it("counts gross, fee and net over the same completed + paid set", () => {
    const s = earningsSummary(mix)
    expect(s.grossCents).toBe(8_333 + 4_001 + 9_999 + 12_345)
    expect(s.feeCents).toBe(1_250 + 600 + 1_500 + 1_852)
    expect(s.countedBookings).toBe(4)
  })
  it("reconciles exactly: gross minus fee is net", () => {
    const s = earningsSummary(mix)
    expect(s.grossCents - s.feeCents).toBe(s.netCents)
  })
  it("reports completed-but-unpaid gross as its own line, and the paid count", () => {
    const s = earningsSummary(mix)
    expect(s.waitingCents).toBe(8_333 + 4_001)
    expect(s.waitingCount).toBe(2)
    expect(s.paidCount).toBe(2)
  })
  it("ignores requested, confirmed, in-progress, cancelled and declined", () => {
    const s = earningsSummary([b("requested", 1, 1), b("confirmed", 1, 1), b("in_progress", 1, 1), b("cancelled", 1, 1), b("declined", 1, 1)])
    expect(s).toEqual({ grossCents: 0, feeCents: 0, netCents: 0, waitingCents: 0, waitingCount: 0, paidCount: 0, countedBookings: 0 })
  })
  it("is all zero for no bookings", () => {
    expect(earningsSummary([]).netCents).toBe(0)
  })
})
