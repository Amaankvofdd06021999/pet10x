import { describe, it, expect } from "vitest"
import {
  invoiceStatusLabel, INVOICE_STATUS_LABEL, PAYMENT_METHODS, validatePayment,
  invoiceActions, takenTodayCents, billingViewFor, invoicesForView, invoicedVisitIds,
} from "./billing"

describe("invoiceStatusLabel", () => {
  it("title-cases every status a bill can have, including an owner's decline", () => {
    expect(INVOICE_STATUS_LABEL).toEqual({
      draft: "Draft",
      sent: "Sent",
      approved: "Approved",
      paid: "Paid",
      void: "Void",
      declined: "Declined",
    })
    expect(invoiceStatusLabel("declined")).toBe("Declined")
  })

  it("shows a status it does not know as Unknown rather than raw text", () => {
    expect(invoiceStatusLabel("something_new")).toBe("Unknown")
  })
})

describe("validatePayment", () => {
  it("offers exactly four methods", () => {
    expect(PAYMENT_METHODS).toEqual(["Cash", "Card", "E-transfer", "Other"])
  })

  it("accepts an amount up to the total and a listed method", () => {
    expect(validatePayment({ amount: "120.50", method: "Card", totalCents: 12050 })).toEqual({
      ok: true,
      value: { paidCents: 12050, method: "Card" },
    })
    expect(validatePayment({ amount: "$40", method: "E-transfer", totalCents: 12050 })).toEqual({
      ok: true,
      value: { paidCents: 4000, method: "E-transfer" },
    })
  })

  it("refuses an amount it cannot read, zero, or more than the total", () => {
    expect(validatePayment({ amount: "12,50,00", method: "Cash", totalCents: 5000 })).toEqual({
      ok: false,
      errors: { amount: "Enter an amount like 85 or 85.50." },
    })
    expect(validatePayment({ amount: "0", method: "Cash", totalCents: 5000 })).toEqual({
      ok: false,
      errors: { amount: "Enter an amount above zero." },
    })
    expect(validatePayment({ amount: "50.01", method: "Cash", totalCents: 5000 })).toEqual({
      ok: false,
      errors: { amount: "That's more than the $50.00 this invoice is for." },
    })
  })

  it("only takes a method from the list", () => {
    for (const method of ["", "cash", "Bitcoin", "Cheque"]) {
      expect(validatePayment({ amount: "10", method, totalCents: 5000 })).toEqual({
        ok: false,
        errors: { method: "Choose how they paid." },
      })
    }
  })
})

describe("invoiceActions", () => {
  const none = { invoiced: false }

  it("never offers payment on an estimate, and converts one only once approved", () => {
    expect(invoiceActions({ kind: "estimate", status: "draft" }, none)).toEqual(["send", "void"])
    expect(invoiceActions({ kind: "estimate", status: "sent" }, none)).toEqual(["void"])
    expect(invoiceActions({ kind: "estimate", status: "approved" }, none)).toEqual(["convert", "void"])
    expect(invoiceActions({ kind: "estimate", status: "approved" }, { invoiced: true })).toEqual(["void"])
    expect(invoiceActions({ kind: "estimate", status: "paid" }, none)).toEqual([])
  })

  it("records payment on a sent or approved invoice, never on a draft", () => {
    expect(invoiceActions({ kind: "invoice", status: "draft" }, none)).toEqual(["send", "void"])
    expect(invoiceActions({ kind: "invoice", status: "sent" }, none)).toEqual(["record_payment", "void"])
    expect(invoiceActions({ kind: "invoice", status: "approved" }, none)).toEqual(["record_payment", "void"])
  })

  it("offers nothing on a paid, void or declined bill, or a status it does not know", () => {
    expect(invoiceActions({ kind: "invoice", status: "paid" }, none)).toEqual([])
    expect(invoiceActions({ kind: "invoice", status: "void" }, none)).toEqual([])
    expect(invoiceActions({ kind: "estimate", status: "declined" }, none)).toEqual([])
    expect(invoiceActions({ kind: "invoice", status: "mystery" }, none)).toEqual([])
  })
})

describe("takenTodayCents", () => {
  const tz = "America/Vancouver"
  // 2026-10-14 10:00 in Vancouver (PDT, UTC-7).
  const now = new Date("2026-10-14T17:00:00Z")

  it("sums paid invoices whose payment landed today in the practice's timezone", () => {
    expect(
      takenTodayCents(
        [
          { kind: "invoice", status: "paid", paidCents: 5000, updatedAt: "2026-10-14T16:00:00Z" },
          // 23:30 on the 14th in Vancouver, though already the 15th in UTC.
          { kind: "invoice", status: "paid", paidCents: 2500, updatedAt: "2026-10-15T06:30:00Z" },
          // 23:30 on the 13th in Vancouver, though the 14th in UTC.
          { kind: "invoice", status: "paid", paidCents: 9900, updatedAt: "2026-10-14T06:30:00Z" },
          { kind: "invoice", status: "sent", paidCents: 0, updatedAt: "2026-10-14T16:00:00Z" },
          { kind: "invoice", status: "void", paidCents: 4000, updatedAt: "2026-10-14T16:00:00Z" },
          { kind: "estimate", status: "paid", paidCents: 1000, updatedAt: "2026-10-14T16:00:00Z" },
        ],
        now,
        tz,
      ),
    ).toBe(7500)
  })

  it("is zero with nothing paid", () => {
    expect(takenTodayCents([], now, tz)).toBe(0)
  })
})

describe("billing views", () => {
  const rows = [
    { id: "a", kind: "invoice", status: "draft" },
    { id: "b", kind: "invoice", status: "sent" },
    { id: "c", kind: "invoice", status: "paid" },
    { id: "d", kind: "invoice", status: "void" },
    { id: "e", kind: "estimate", status: "approved" },
    { id: "f", kind: "estimate", status: "declined" },
  ]

  it("puts each bill in exactly the view that shows it", () => {
    expect(invoicesForView(rows, "open").map((r) => r.id)).toEqual(["a", "b"])
    expect(invoicesForView(rows, "paid").map((r) => r.id)).toEqual(["c"])
    expect(invoicesForView(rows, "estimates").map((r) => r.id)).toEqual(["e", "f"])
    expect(billingViewFor(rows[0])).toBe("open")
    expect(billingViewFor(rows[2])).toBe("paid")
    expect(billingViewFor(rows[4])).toBe("estimates")
  })
})

describe("invoicedVisitIds", () => {
  it("lists visits that already have a live invoice — not an estimate, not a voided one", () => {
    const ids = invoicedVisitIds([
      { kind: "invoice", status: "draft", visitId: "v1" },
      { kind: "invoice", status: "void", visitId: "v2" },
      { kind: "estimate", status: "approved", visitId: "v3" },
      { kind: "invoice", status: "paid", visitId: null },
    ])
    expect([...ids]).toEqual(["v1"])
  })
})
