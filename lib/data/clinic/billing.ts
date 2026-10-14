/**
 * Billing's decisions, pure: what a status is called, which buttons a bill
 * offers, which tab it lives on, what counts as "taken today", and what a
 * recorded payment may be.
 *
 * The buttons mirror clinic_set_invoice_status's transition table
 * (20261010000001) — draft → sent|void, sent → approved|paid|void|draft,
 * approved → paid|void, paid → void — narrowed by what each kind of bill is
 * for: an estimate is never paid (it is converted into an invoice once the
 * owner approves), and a declined estimate is final (20261015000005).
 */

import { parsePriceCents } from "@/lib/data/fees"
import { formatMoney, todayISO } from "./time"

export const INVOICE_STATUS_LABEL = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  paid: "Paid",
  void: "Void",
  declined: "Declined",
} as const

export type InvoiceStatus = keyof typeof INVOICE_STATUS_LABEL

function isStatus(s: string): s is InvoiceStatus {
  return Object.prototype.hasOwnProperty.call(INVOICE_STATUS_LABEL, s)
}

export function invoiceStatusLabel(status: string): string {
  return isStatus(status) ? INVOICE_STATUS_LABEL[status] : "Unknown"
}

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, "neutral" | "good" | "warn" | "bad" | "info"> = {
  draft: "neutral",
  sent: "warn",
  approved: "info",
  paid: "good",
  void: "neutral",
  declined: "bad",
}

/* ------------------------------- actions -------------------------------- */

export type InvoiceAction = "send" | "record_payment" | "convert" | "void"

/**
 * @param invoiced — the estimate's visit already has a live invoice, so
 *   converting again would bill the owner twice.
 */
export function invoiceActions(
  bill: { kind: string; status: string },
  { invoiced }: { invoiced: boolean },
): InvoiceAction[] {
  if (bill.kind === "estimate") {
    if (bill.status === "draft") return ["send", "void"]
    if (bill.status === "sent") return ["void"]
    if (bill.status === "approved") return invoiced ? ["void"] : ["convert", "void"]
    return []
  }
  if (bill.kind === "invoice") {
    if (bill.status === "draft") return ["send", "void"]
    if (bill.status === "sent" || bill.status === "approved") return ["record_payment", "void"]
  }
  return []
}

/* -------------------------------- views --------------------------------- */

export type BillingView = "open" | "paid" | "estimates"

export function billingViewFor(bill: { kind: string; status: string }): BillingView {
  if (bill.kind === "estimate") return "estimates"
  return bill.status === "paid" ? "paid" : "open"
}

/** Voided invoices are kept on record but shown on no tab. */
export function invoicesForView<T extends { kind: string; status: string }>(rows: T[], view: BillingView): T[] {
  return rows.filter((r) => {
    if (r.kind === "estimate") return view === "estimates"
    if (r.status === "void") return false
    return billingViewFor(r) === view
  })
}

/**
 * Each visit's live (not voided) invoice. The one source for "is this visit
 * already billed?" — Billing's New invoice picker, Convert to invoice, and the
 * visit cards' "Open invoice" all read it, so none of them bills twice.
 */
export function liveInvoiceByVisit(
  rows: Array<{ id: string; kind: string; status: string; visitId: string | null }>,
): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of rows) {
    if (r.kind === "invoice" && r.status !== "void" && r.visitId && !out.has(r.visitId)) out.set(r.visitId, r.id)
  }
  return out
}

/**
 * Today's check-out completes the appointment only when an invoice was just
 * created for that appointment's own visit. Opening an existing invoice,
 * writing an estimate, or billing another visit on the chart just opens
 * Billing; reception can still "Check out without an invoice".
 */
export function checkoutCompletes(e: {
  checkoutVisitId: string
  visitId: string
  kind: "invoice" | "estimate"
  created: boolean
}): boolean {
  return e.created && e.kind === "invoice" && e.visitId === e.checkoutVisitId
}

/**
 * Convert to invoice rebuilds from the visit's current services, which may
 * have changed since the owner approved the estimate. When the totals differ
 * the practice is told before it sends.
 */
export function convertedTotalNote(estimateTotalCents: number, invoiceTotalCents: number, currency = "cad"): string | null {
  if (estimateTotalCents === invoiceTotalCents) return null
  return `This invoice is ${formatMoney(invoiceTotalCents, currency)}; the approved estimate was ${formatMoney(estimateTotalCents, currency)}.`
}

/* ----------------------------- taken today ------------------------------ */

/**
 * Money recorded as paid today, in the practice's timezone.
 *
 * Approximation: invoices has no paid_at column, so the payment date is
 * `updated_at` on a row whose status is `paid`. Recording a payment is the
 * last write a paid invoice gets — the only move out of `paid` is `void`,
 * which takes it out of this sum anyway — so updated_at is when it was paid.
 * `issued_on` (what this used to read) is the day it was sent, not paid.
 */
export function takenTodayCents(
  rows: Array<{ kind: string; status: string; paidCents: number; updatedAt: string }>,
  now: Date,
  tz: string,
): number {
  const today = todayISO(now, tz)
  return rows
    .filter((r) => r.kind === "invoice" && r.status === "paid" && todayISO(new Date(r.updatedAt), tz) === today)
    .reduce((sum, r) => sum + r.paidCents, 0)
}

/* ------------------------------- payment -------------------------------- */

export const PAYMENT_METHODS = ["Cash", "Card", "E-transfer", "Other"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

function isMethod(m: string): m is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(m)
}

export type PaymentErrors = { amount?: string; method?: string }

export function validatePayment(input: {
  amount: string
  method: string
  totalCents: number
}): { ok: true; value: { paidCents: number; method: PaymentMethod } } | { ok: false; errors: PaymentErrors } {
  const errors: PaymentErrors = {}
  const parsed = parsePriceCents(input.amount)
  if (!parsed.ok) errors.amount = "Enter an amount like 85 or 85.50."
  else if (parsed.cents === 0) errors.amount = "Enter an amount above zero."
  else if (parsed.cents > input.totalCents) {
    errors.amount = `That's more than the ${formatMoney(input.totalCents)} this invoice is for.`
  }
  if (!isMethod(input.method)) errors.method = "Choose how they paid."
  if (Object.keys(errors).length > 0 || !parsed.ok || !isMethod(input.method)) return { ok: false, errors }
  return { ok: true, value: { paidCents: parsed.cents, method: input.method } }
}
