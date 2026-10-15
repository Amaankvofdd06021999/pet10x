import { describe, it, expect } from "vitest"
import {
  invoiceStatusLabel, INVOICE_STATUS_LABEL, PAYMENT_METHODS, validatePayment,
  invoiceActions, takenTodayByCurrency, takenTodayText, billingViewFor, invoicesForView, liveInvoiceByVisit,
  checkoutCompletes, convertedTotalNote, PAYMENT_METHOD_CODE, paymentMethodLabel, remainingCents,
  isPartlyPaid, shortPaidNote, invoiceStatusView, paymentProgress, paymentRows, recordPaymentError, voidInvoiceError,
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
  it("offers exactly four methods, each with the code clinic_record_payment takes", () => {
    expect(PAYMENT_METHODS).toEqual(["Cash", "Card", "E-transfer", "Other"])
    expect(PAYMENT_METHOD_CODE).toEqual({ Cash: "cash", Card: "card", "E-transfer": "e_transfer", Other: "other" })
  })

  it("accepts an amount up to what is still owed and a listed method", () => {
    expect(validatePayment({ amount: "120.50", method: "Card", remainingCents: 12050 })).toEqual({
      ok: true,
      value: { amountCents: 12050, method: "card" },
    })
    expect(validatePayment({ amount: "$40", method: "E-transfer", remainingCents: 12050 })).toEqual({
      ok: true,
      value: { amountCents: 4000, method: "e_transfer" },
    })
  })

  it("refuses an amount it cannot read, zero, or more than is still owed", () => {
    expect(validatePayment({ amount: "12,50,00", method: "Cash", remainingCents: 5000 })).toEqual({
      ok: false,
      errors: { amount: "Enter an amount like 85 or 85.50." },
    })
    expect(validatePayment({ amount: "0", method: "Cash", remainingCents: 5000 })).toEqual({
      ok: false,
      errors: { amount: "Enter an amount above zero." },
    })
    // Measured against the balance, not the total: $30 of $50 is already paid.
    expect(validatePayment({ amount: "20.01", method: "Cash", remainingCents: 2000 })).toEqual({
      ok: false,
      errors: { amount: "That's more than the $20.00 still owed." },
    })
    expect(validatePayment({ amount: "20.01", method: "Cash", remainingCents: 2000, currency: "usd" })).toEqual({
      ok: false,
      errors: { amount: "That's more than the US$20.00 still owed." },
    })
  })

  it("only takes a method from the list", () => {
    for (const method of ["", "cash", "Bitcoin", "Cheque"]) {
      expect(validatePayment({ amount: "10", method, remainingCents: 5000 })).toEqual({
        ok: false,
        errors: { method: "Choose how they paid." },
      })
    }
  })
})

describe("paymentMethodLabel", () => {
  it("names each stored method", () => {
    expect(paymentMethodLabel("cash")).toBe("Cash")
    expect(paymentMethodLabel("card")).toBe("Card")
    expect(paymentMethodLabel("e_transfer")).toBe("E-transfer")
    expect(paymentMethodLabel("other")).toBe("Other")
  })

  it("shows a method it does not know as Unknown rather than raw text", () => {
    expect(paymentMethodLabel("cheque")).toBe("Unknown")
  })
})

describe("partly paid", () => {
  const inv = { kind: "invoice", status: "sent", totalCents: 10000, paidCents: 4000, currency: "cad" }

  it("is an open invoice with some but not all of its total paid", () => {
    expect(isPartlyPaid(inv)).toBe(true)
    expect(isPartlyPaid({ ...inv, status: "approved" })).toBe(true)
    expect(isPartlyPaid({ ...inv, paidCents: 0 })).toBe(false)
    expect(isPartlyPaid({ ...inv, paidCents: 10000 })).toBe(false)
    expect(isPartlyPaid({ ...inv, status: "paid" })).toBe(false)
    expect(isPartlyPaid({ ...inv, status: "void" })).toBe(false)
    expect(isPartlyPaid({ ...inv, status: "draft" })).toBe(false)
    expect(isPartlyPaid({ ...inv, kind: "estimate" })).toBe(false)
  })

  it("labels it Partly paid, and every other bill by its status", () => {
    expect(invoiceStatusView(inv)).toEqual({ label: "Partly paid", tone: "warn" })
    expect(invoiceStatusView({ ...inv, status: "approved" })).toEqual({ label: "Partly paid", tone: "warn" })
    expect(invoiceStatusView({ ...inv, paidCents: 0 })).toEqual({ label: "Sent", tone: "warn" })
    expect(invoiceStatusView({ ...inv, paidCents: 0, status: "approved" })).toEqual({ label: "Approved", tone: "info" })
    expect(invoiceStatusView({ ...inv, status: "paid", paidCents: 10000 })).toEqual({ label: "Paid", tone: "good" })
    expect(invoiceStatusView({ ...inv, status: "void" })).toEqual({ label: "Void", tone: "neutral" })
    expect(invoiceStatusView({ ...inv, status: "mystery" })).toEqual({ label: "Unknown", tone: "neutral" })
  })

  it("says what is paid and what is left", () => {
    expect(paymentProgress(inv)).toBe("$40.00 of $100.00 paid · $60.00 left")
    expect(paymentProgress({ ...inv, paidCents: 0 })).toBe("$0.00 of $100.00 paid · $100.00 left")
  })

  it("never counts a negative balance", () => {
    expect(remainingCents({ totalCents: 10000, paidCents: 4000 })).toBe(6000)
    // A total edited below what was already paid owes nothing (clinic_record_payment's greatest(…, 0)).
    expect(remainingCents({ totalCents: 3000, paidCents: 4000 })).toBe(0)
  })
})

describe("invoiceActions", () => {
  const none = { invoiced: false }
  const est = (status: string) => ({ kind: "estimate", status, totalCents: 5000, paidCents: 0 })
  const inv = (status: string, paidCents = 0, totalCents = 5000) => ({ kind: "invoice", status, totalCents, paidCents })

  it("never offers payment on an estimate, and converts one only once approved", () => {
    expect(invoiceActions(est("draft"), none)).toEqual(["send", "void"])
    expect(invoiceActions(est("sent"), none)).toEqual(["void"])
    expect(invoiceActions(est("approved"), none)).toEqual(["convert", "void"])
    expect(invoiceActions(est("approved"), { invoiced: true })).toEqual(["void"])
    expect(invoiceActions(est("paid"), none)).toEqual([])
  })

  it("records payment on a sent or approved invoice — partly paid too — never on a draft", () => {
    expect(invoiceActions(inv("draft"), none)).toEqual(["send", "void"])
    expect(invoiceActions(inv("sent"), none)).toEqual(["record_payment", "void"])
    expect(invoiceActions(inv("approved"), none)).toEqual(["record_payment", "void"])
    expect(invoiceActions(inv("sent", 2000), none)).toEqual(["record_payment", "void"])
  })

  it("settles an open invoice with nothing left to pay instead of asking for an amount", () => {
    expect(invoiceActions(inv("sent", 0, 0), none)).toEqual(["settle", "void"])
    expect(invoiceActions(inv("approved", 5000, 4000), none)).toEqual(["settle", "void"])
  })

  it("voids a paid invoice, and offers nothing on a void or declined bill, or a status it does not know", () => {
    expect(invoiceActions(inv("paid", 5000), none)).toEqual(["void"])
    expect(invoiceActions(inv("void"), none)).toEqual([])
    expect(invoiceActions(est("declined"), none)).toEqual([])
    expect(invoiceActions(inv("mystery"), none)).toEqual([])
  })
})

describe("takenTodayByCurrency", () => {
  const tz = "America/Vancouver"
  // 2026-10-14 10:00 in Vancouver (PDT, UTC-7).
  const now = new Date("2026-10-14T17:00:00Z")
  const pay = (amountCents: number, currency: string, createdAt: string, invoiceStatus = "paid") => ({
    amountCents, currency, createdAt, invoiceStatus,
  })

  it("totals each currency separately: today only, void bills left out", () => {
    expect(
      takenTodayByCurrency(
        [
          pay(5000, "CAD", "2026-10-14T16:00:00Z"),
          // A part payment: the invoice is still open, but the money came in today.
          pay(1200, "CAD", "2026-10-14T18:00:00Z", "sent"),
          pay(4000, "USD", "2026-10-14T19:00:00Z"),
          // Yesterday in Vancouver, though the 14th in UTC.
          pay(9900, "CAD", "2026-10-14T06:30:00Z"),
          // A payment on a bill voided since: the money goes back outside the app.
          pay(7000, "CAD", "2026-10-14T16:30:00Z", "void"),
        ],
        now,
        tz,
      ),
    ).toEqual([
      { currency: "CAD", cents: 6200 },
      { currency: "USD", cents: 4000 },
    ])
  })

  it("sorts by currency whatever the order paid, and reads a lowercase code", () => {
    expect(
      takenTodayByCurrency([pay(100, "usd", "2026-10-14T16:00:00Z"), pay(200, "CAD", "2026-10-14T16:00:00Z")], now, tz),
    ).toEqual([
      { currency: "CAD", cents: 200 },
      { currency: "USD", cents: 100 },
    ])
  })

  it("reads today in the practice's zone, not the viewer's", () => {
    const row = [pay(700, "CAD", "2026-10-14T06:30:00Z")]
    // 02:30 on the 14th in Toronto; 23:30 on the 13th in Vancouver.
    expect(takenTodayByCurrency(row, now, "America/Toronto")).toEqual([{ currency: "CAD", cents: 700 }])
    expect(takenTodayByCurrency(row, now, tz)).toEqual([])
  })

  it("is empty with nothing paid", () => {
    expect(takenTodayByCurrency([], now, tz)).toEqual([])
  })
})

describe("takenTodayText", () => {
  it("shows one currency as a plain amount, and zero when nothing was taken", () => {
    expect(takenTodayText([{ currency: "CAD", cents: 12000 }])).toBe("$120.00")
    expect(takenTodayText([])).toBe("$0.00")
  })

  it("joins several currencies, each with its code", () => {
    expect(
      takenTodayText([
        { currency: "CAD", cents: 12000 },
        { currency: "USD", cents: 4000 },
      ]),
    ).toMatch(/^\$120\.00 CAD · .*40\.00 USD$/)
  })
})

describe("paymentRows", () => {
  it("lists each payment oldest first with its day in the practice's zone, method and amount", () => {
    expect(
      paymentRows(
        [
          { id: "p2", amountCents: 6000, method: "e_transfer", createdAt: "2026-10-14T16:00:00Z" },
          // 23:30 on the 12th in Vancouver, though the 13th in UTC.
          { id: "p1", amountCents: 4000, method: "cash", createdAt: "2026-10-13T06:30:00Z" },
        ],
        "America/Vancouver",
        "cad",
      ),
    ).toEqual([
      { id: "p1", date: "12 Oct 2026", method: "Cash", amount: "$40.00" },
      { id: "p2", date: "14 Oct 2026", method: "E-transfer", amount: "$60.00" },
    ])
  })

  it("is empty with no payments", () => {
    expect(paymentRows([], "America/Vancouver", "cad")).toEqual([])
  })
})

describe("recordPaymentError", () => {
  it("is null when the payment went through", () => {
    expect(recordPaymentError(null, { ok: true, paid_cents: 4000, remaining: 6000, status: "sent" })).toBeNull()
  })

  it("names what is still owed when the amount is over it", () => {
    expect(recordPaymentError(null, { ok: false, error: "over_balance", remaining: 2500 })).toBe(
      "That's more than the $25.00 still owed.",
    )
    expect(recordPaymentError(null, { ok: false, error: "over_balance", remaining: 2500 }, "usd")).toBe(
      "That's more than the US$25.00 still owed.",
    )
  })

  it("says each refusal plainly", () => {
    expect(recordPaymentError(null, { ok: false, error: "not_payable" })).toBe(
      "This invoice can't take a payment any more. Refresh to see where it stands.",
    )
    expect(recordPaymentError(null, { ok: false, error: "not_an_invoice" })).toBe(
      "Only an invoice takes payment. Convert the estimate to an invoice first.",
    )
    expect(recordPaymentError(null, { ok: false, error: "forbidden" })).toBe(
      "Only staff at this practice can change its bills.",
    )
    expect(recordPaymentError(null, { ok: false, error: "not_found" })).toBe("That bill no longer exists.")
    expect(recordPaymentError({ code: "22023", message: "Choose how it was paid" }, null)).toBe(
      "Enter an amount above zero and choose how they paid.",
    )
  })

  it("never shows the database's words for anything it was not taught", () => {
    const fallback = "Couldn't save that. Try again."
    expect(recordPaymentError({ code: "XX000", message: "relation invoice_payments does not exist" }, null)).toBe(fallback)
    expect(recordPaymentError({ message: "Failed to fetch" }, null)).toBe(fallback)
    expect(recordPaymentError(null, { ok: false, error: "constraint invoices_paid_check" })).toBe(fallback)
    expect(recordPaymentError(null, { ok: false })).toBe(fallback)
    expect(recordPaymentError(null, null)).toBe(fallback)
    // Only ok: true is success; a truthy oddity is not.
    expect(recordPaymentError(null, { ok: "yes" as unknown as boolean })).toBe(fallback)
    // over_balance without a readable balance still never invents a number.
    expect(recordPaymentError(null, { ok: false, error: "over_balance" })).toBe(
      "That's more than is still owed on this invoice.",
    )
  })
})

describe("voidInvoiceError", () => {
  it("is null when the bill was voided", () => {
    expect(voidInvoiceError(null, { ok: true, status: "void", owner_notified: true })).toBeNull()
  })

  it("says each refusal plainly", () => {
    expect(voidInvoiceError(null, { ok: false, error: "not_voidable" })).toBe(
      "This bill can't be voided any more. Refresh to see where it stands.",
    )
    expect(voidInvoiceError(null, { ok: false, error: "forbidden" })).toBe(
      "Only staff at this practice can change its bills.",
    )
    expect(voidInvoiceError(null, { ok: false, error: "not_found" })).toBe("That bill no longer exists.")
    expect(voidInvoiceError({ code: "22023", message: "Say why" }, null)).toBe(
      "Add a reason of 2000 characters or fewer. The owner sees it if they already have the bill.",
    )
  })

  it("never shows the database's words for anything it was not taught", () => {
    expect(voidInvoiceError({ code: "42883", message: "function clinic_void_invoice does not exist" }, null)).toBe(
      "Couldn't save that. Try again.",
    )
    expect(voidInvoiceError(null, { ok: false, error: "something_new" })).toBe("Couldn't save that. Try again.")
    expect(voidInvoiceError(null, { ok: 1 as unknown as boolean })).toBe("Couldn't save that. Try again.")
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

describe("liveInvoiceByVisit", () => {
  it("maps each visit to its live invoice — not an estimate, not a voided one", () => {
    const map = liveInvoiceByVisit([
      { id: "i1", kind: "invoice", status: "draft", visitId: "v1" },
      { id: "i2", kind: "invoice", status: "void", visitId: "v2" },
      { id: "i3", kind: "estimate", status: "approved", visitId: "v3" },
      { id: "i4", kind: "invoice", status: "paid", visitId: null },
      { id: "i5", kind: "invoice", status: "paid", visitId: "v5" },
    ])
    expect([...map.entries()]).toEqual([
      ["v1", "i1"],
      ["v5", "i5"],
    ])
  })
})

describe("checkoutCompletes", () => {
  it("completes the appointment only when an invoice was just created for its own visit", () => {
    const base = { checkoutVisitId: "v1", visitId: "v1", kind: "invoice" as const, created: true }
    expect(checkoutCompletes(base)).toBe(true)
    expect(checkoutCompletes({ ...base, kind: "estimate" })).toBe(false)
    expect(checkoutCompletes({ ...base, visitId: "v2" })).toBe(false)
    expect(checkoutCompletes({ ...base, created: false })).toBe(false)
  })
})

describe("convertedTotalNote", () => {
  it("says nothing when the invoice matches the approved estimate", () => {
    expect(convertedTotalNote(12000, 12000)).toBeNull()
  })

  it("names both totals when they differ", () => {
    expect(convertedTotalNote(12000, 14550)).toBe("This invoice is $145.50; the approved estimate was $120.00.")
    expect(convertedTotalNote(12000, 9000, "usd")).toBe("This invoice is US$90.00; the approved estimate was US$120.00.")
  })
})

describe("shortPaidNote", () => {
  const base = { status: "paid", payments: [] as unknown[], paidCents: 4000, totalCents: 10000, currency: "usd" }

  it("says what was received on an old bill marked paid short, with no payments on record", () => {
    expect(shortPaidNote(base)).toBe("US$40.00 received")
  })

  it("stays quiet once payments are listed, when it is paid in full, or when the bill is not paid", () => {
    expect(shortPaidNote({ ...base, payments: [{}] })).toBeNull()
    expect(shortPaidNote({ ...base, paidCents: 10000 })).toBeNull()
    expect(shortPaidNote({ ...base, status: "sent" })).toBeNull()
  })
})
