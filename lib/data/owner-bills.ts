/**
 * The owner's Bills view — what a practice has sent, and which estimates are
 * waiting on the owner. Pure, so the ordering and the words are unit-tested;
 * the read itself is `useMyInvoices` in `owner-vets.ts`.
 *
 * An owner never sees a draft: `invoices_owner_read` requires
 * `status <> 'draft'` (20261010000001). Pet10x takes no payment — "paid" is a
 * status the practice records — so nothing here offers to pay.
 */

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
  paid: "Paid",
  void: "Void",
}

const TONE: Record<string, BillTone> = {
  sent: "warn",
  approved: "info",
  paid: "good",
  void: "neutral",
}

export const billStatusLabel = (status: string) => LABEL[status] ?? status
export const billStatusTone = (status: string): BillTone => TONE[status] ?? "neutral"

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
