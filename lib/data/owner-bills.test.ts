import { describe, it, expect } from "vitest"
import {
  billLabel,
  billStatusLabel,
  billStatusTone,
  groupBills,
  isUnpaid,
  lineTotalCents,
  type OwnerBill,
} from "./owner-bills"

function bill(over: Partial<OwnerBill> & { id: string }): OwnerBill {
  return {
    kind: "invoice",
    status: "sent",
    number: null,
    totalCents: 1000,
    paidCents: 0,
    currency: "cad",
    issuedOn: null,
    createdAt: "2026-10-01T10:00:00Z",
    ownerApprovedAt: null,
    businessName: "Westside Vet",
    petName: "Lola",
    lines: [],
    ...over,
  }
}

describe("billStatusLabel", () => {
  it("names the five statuses an owner can see", () => {
    expect(billStatusLabel("sent")).toBe("Sent")
    // owner_decline_estimate (20261015000005) added it.
    expect(billStatusLabel("declined")).toBe("Declined")
    expect(billStatusLabel("approved")).toBe("Approved")
    expect(billStatusLabel("paid")).toBe("Paid")
    expect(billStatusLabel("void")).toBe("Void")
  })

  it("falls back to the raw word for anything else, rather than inventing a meaning", () => {
    expect(billStatusLabel("draft")).toBe("draft")
  })

  it("gives each a tone, warn for money still owed", () => {
    expect(billStatusTone("sent")).toBe("warn")
    expect(billStatusTone("paid")).toBe("good")
    expect(billStatusTone("void")).toBe("neutral")
    expect(billStatusTone("approved")).toBe("info")
    expect(billStatusTone("declined")).toBe("neutral")
    expect(billStatusTone("whatever")).toBe("neutral")
  })
})

describe("groupBills", () => {
  it("puts sent estimates first, as the ones awaiting the owner's approval", () => {
    const g = groupBills([
      bill({ id: "inv" }),
      bill({ id: "est", kind: "estimate" }),
      bill({ id: "est-approved", kind: "estimate", status: "approved" }),
    ])
    expect(g.awaiting.map((b) => b.id)).toEqual(["est"])
    expect(g.others.map((b) => b.id).sort()).toEqual(["est-approved", "inv"])
  })

  it("sorts each group newest first, by issue date then creation", () => {
    const g = groupBills([
      bill({ id: "old", issuedOn: "2026-09-01" }),
      bill({ id: "new", issuedOn: "2026-10-05" }),
      bill({ id: "no-issue-date", createdAt: "2026-10-03T09:00:00Z" }),
      bill({ id: "e1", kind: "estimate", issuedOn: "2026-10-01" }),
      bill({ id: "e2", kind: "estimate", issuedOn: "2026-10-02" }),
    ])
    expect(g.others.map((b) => b.id)).toEqual(["new", "no-issue-date", "old"])
    expect(g.awaiting.map((b) => b.id)).toEqual(["e2", "e1"])
  })

  it("breaks a same-day tie on creation time", () => {
    const g = groupBills([
      bill({ id: "morning", issuedOn: "2026-10-05", createdAt: "2026-10-05T08:00:00Z" }),
      bill({ id: "evening", issuedOn: "2026-10-05", createdAt: "2026-10-05T18:00:00Z" }),
    ])
    expect(g.others.map((b) => b.id)).toEqual(["evening", "morning"])
  })

  it("does not reorder its input", () => {
    const input = [bill({ id: "a", issuedOn: "2026-01-01" }), bill({ id: "b", issuedOn: "2026-02-01" })]
    groupBills(input)
    expect(input.map((b) => b.id)).toEqual(["a", "b"])
  })
})

describe("isUnpaid", () => {
  it("is true for an invoice still sent or approved", () => {
    expect(isUnpaid(bill({ id: "1", status: "sent" }))).toBe(true)
    expect(isUnpaid(bill({ id: "2", status: "approved" }))).toBe(true)
  })

  it("is false once paid or void, and never for an estimate", () => {
    expect(isUnpaid(bill({ id: "3", status: "paid" }))).toBe(false)
    expect(isUnpaid(bill({ id: "4", status: "void" }))).toBe(false)
    expect(isUnpaid(bill({ id: "5", kind: "estimate", status: "sent" }))).toBe(false)
  })
})

describe("billLabel and lineTotalCents", () => {
  it("names the kind, with the practice's number when it has one", () => {
    expect(billLabel(bill({ id: "1" }))).toBe("Invoice")
    expect(billLabel(bill({ id: "2", kind: "estimate", number: "E-104" }))).toBe("Estimate E-104")
  })

  it("rounds a line the way the database's invoice_recalc does", () => {
    expect(lineTotalCents({ quantity: 2, unitPriceCents: 1250 })).toBe(2500)
    expect(lineTotalCents({ quantity: 1.5, unitPriceCents: 333 })).toBe(500)
  })
})
