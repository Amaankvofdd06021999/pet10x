/**
 * The owner's Bills view — what a practice has sent, and which estimates are
 * waiting on the owner. Pure, so the ordering and the words are unit-tested;
 * the read itself is `useMyInvoices` in `owner-vets.ts`.
 *
 * An owner never sees a draft: `invoices_owner_read` requires
 * `status <> 'draft'` (20261010000001). Pet10x takes no payment — "paid" is a
 * status the practice records — so nothing here offers to pay. A practice may
 * record payment in parts (clinic_record_payment, 20261016000001); the bill
 * stays sent or approved until the total is reached, so "Partly paid" is
 * derived from paid_cents, not stored.
 */

import { formatMoney } from "@/lib/data/clinic/time"

export interface OwnerBillLine {
  id: string
  description: string
  quantity: number
  unitPriceCents: number
}

export interface OwnerBill {
  id: string
  kind: "estimate" | "invoice"
  status: string
  number: string | null
  totalCents: number
  paidCents: number
  currency: string
  issuedOn: string | null
  createdAt: string
  ownerApprovedAt: string | null
  businessName: string
  petName: string
  lines: OwnerBillLine[]
}

export type BillTone = "neutral" | "good" | "warn" | "info"

const LABEL: Record<string, string> = {
  sent: "Sent",
  approved: "Approved",
  // The owner said no to an estimate (owner_decline_estimate, 20261015000005).
  declined: "Declined",
  paid: "Paid",
  void: "Void",
}

const TONE: Record<string, BillTone> = {
  sent: "warn",
  approved: "info",
  declined: "neutral",
  paid: "good",
  void: "neutral",
}

export const billStatusLabel = (status: string) => LABEL[status] ?? status
export const billStatusTone = (status: string): BillTone => TONE[status] ?? "neutral"

/**
 * The pill on a bill: its status, or "Partly paid — $40.00 of $100.00" on an
 * open invoice with some of its total paid. A voided bill reads "Void" whatever
 * was paid on it — the practice's notice tells the owner what happens to that.
 */
export function ownerBillStatus(
  b: Pick<OwnerBill, "kind" | "status" | "totalCents" | "paidCents" | "currency">,
): { label: string; tone: BillTone } {
  if (isUnpaid(b) && b.paidCents > 0 && b.paidCents < b.totalCents) {
    return {
      label: `Partly paid — ${formatMoney(b.paidCents, b.currency)} of ${formatMoney(b.totalCents, b.currency)}`,
      tone: "warn",
    }
  }
  return { label: billStatusLabel(b.status), tone: billStatusTone(b.status) }
}

export const billLabel = (b: Pick<OwnerBill, "kind" | "number">) =>
  `${b.kind === "estimate" ? "Estimate" : "Invoice"}${b.number ? ` ${b.number}` : ""}`

/** Same rounding as `invoice_recalc` (20260901000006): round(quantity * unit price). */
export const lineTotalCents = (l: Pick<OwnerBillLine, "quantity" | "unitPriceCents">) =>
  Math.round(l.quantity * l.unitPriceCents)

/** An invoice the practice still expects money for. Estimates are never "owed". */
export const isUnpaid = (b: Pick<OwnerBill, "kind" | "status">) =>
  b.kind === "invoice" && (b.status === "sent" || b.status === "approved")

/** Newest first: issue date (the day it was sent), then creation time. */
function newestFirst(a: OwnerBill, b: OwnerBill): number {
  const dayA = a.issuedOn ?? a.createdAt.slice(0, 10)
  const dayB = b.issuedOn ?? b.createdAt.slice(0, 10)
  if (dayA !== dayB) return dayA < dayB ? 1 : -1
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
}

/**
 * `awaiting`: estimates the owner can approve now (kind estimate, status sent)
 * — they lead the view. `others`: everything else. Both newest first.
 */
export function groupBills(bills: readonly OwnerBill[]): { awaiting: OwnerBill[]; others: OwnerBill[] } {
  const awaiting: OwnerBill[] = []
  const others: OwnerBill[] = []
  for (const b of bills) (b.kind === "estimate" && b.status === "sent" ? awaiting : others).push(b)
  return { awaiting: awaiting.sort(newestFirst), others: others.sort(newestFirst) }
}
