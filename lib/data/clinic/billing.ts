/**
 * Billing's decisions, pure: what a status is called, which buttons a bill
 * offers, which tab it lives on, what counts as "taken today", and what a
 * recorded payment may be.
 *
 * Since 20261016000001 a bill moves through three doors, and the buttons
 * mirror them: clinic_set_invoice_status (draft → sent, sent → approved|draft),
 * clinic_record_payment (a sent or approved invoice takes payment in parts and
 * becomes paid only when the total is reached), and clinic_void_invoice
 * (draft, sent, approved or paid → void, with a reason). Narrowed by what each
 * kind of bill is for: an estimate is never paid (it is converted into an
 * invoice once the owner approves), and a declined estimate is final
 * (20261015000005).
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

export type StatusTone = "neutral" | "good" | "warn" | "bad" | "info"

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, StatusTone> = {
  draft: "neutral",
  sent: "warn",
  approved: "info",
  paid: "good",
  void: "neutral",
  declined: "bad",
}

type Money = { totalCents: number; paidCents: number }

/**
 * What is still owed. Never negative: a total edited below what was already
 * paid owes nothing — the same greatest(…, 0) clinic_record_payment measures by.
 */
export const remainingCents = (b: Money) => Math.max(b.totalCents - b.paidCents, 0)

/**
 * An open invoice that has taken some money but not all of it. There is no
 * such status in the database — the bill stays sent or approved until
 * clinic_record_payment reaches the total — so it is derived here.
 */
export function isPartlyPaid(b: { kind: string; status: string } & Money): boolean {
  return (
    b.kind === "invoice" &&
    (b.status === "sent" || b.status === "approved") &&
    b.paidCents > 0 &&
    b.paidCents < b.totalCents
  )
}

/**
 * Bills marked paid before payments were recorded in parts can have taken less
 * than the total and have no payment rows to explain it. Say what was received
 * rather than letting the bill read as paid in full.
 */
export function shortPaidNote(
  b: { status: string; payments: readonly unknown[] } & Money & { currency: string },
): string | null {
  if (b.status === "paid" && b.payments.length === 0 && b.paidCents < b.totalCents) {
    return `${formatMoney(b.paidCents, b.currency)} received`
  }
  return null
}

/** The pill a bill wears in Billing: its status, or "Partly paid" when it is. */
export function invoiceStatusView(b: { kind: string; status: string } & Money): { label: string; tone: StatusTone } {
  if (isPartlyPaid(b)) return { label: "Partly paid", tone: "warn" }
  return { label: invoiceStatusLabel(b.status), tone: isStatus(b.status) ? INVOICE_STATUS_TONE[b.status] : "neutral" }
}

/** "$40.00 of $100.00 paid · $60.00 left" — the line over Record payment's amount. */
export function paymentProgress(b: Money & { currency: string }): string {
  const m = (c: number) => formatMoney(c, b.currency)
  return `${m(b.paidCents)} of ${m(b.totalCents)} paid · ${m(remainingCents(b))} left`
}

/* ------------------------------- actions -------------------------------- */

/** `settle`: an open invoice with nothing left to pay (a $0 bill) is closed with a payment of 0. */
export type InvoiceAction = "send" | "record_payment" | "settle" | "convert" | "void"

/**
 * @param invoiced — the estimate's visit already has a live invoice, so
 *   converting again would bill the owner twice.
 */
export function invoiceActions(
  bill: { kind: string; status: string } & Money,
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
    if (bill.status === "sent" || bill.status === "approved") {
      // clinic_record_payment takes 0 only when nothing is owed; asking for an
      // amount there would offer a form whose only valid answer is refused.
      return remainingCents(bill) === 0 ? ["settle", "void"] : ["record_payment", "void"]
    }
    // A paid invoice can still be voided; its payments stay on record.
    if (bill.status === "paid") return ["void"]
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
 * Money taken today, in the practice's timezone: every invoice_payments row
 * recorded today, part payments included, totalled per currency — a practice
 * can bill in more than one, and adding CAD to USD gives a number that is
 * neither. A payment on a bill voided since is left out — the money goes back
 * to the owner outside the app, so it was not really taken. Sorted by code.
 */
export function takenTodayByCurrency(
  payments: Array<{ amountCents: number; currency: string; createdAt: string; invoiceStatus: string }>,
  now: Date,
  tz: string,
): Array<{ currency: string; cents: number }> {
  const today = todayISO(now, tz)
  const totals = new Map<string, number>()
  for (const p of payments) {
    if (p.invoiceStatus === "void" || todayISO(new Date(p.createdAt), tz) !== today) continue
    const currency = p.currency.toUpperCase()
    totals.set(currency, (totals.get(currency) ?? 0) + p.amountCents)
  }
  return [...totals]
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0))
}

/**
 * What the Taken today tile shows. One currency reads as a plain amount;
 * several are joined, each with its code so none can be mistaken for another
 * ("$120.00 CAD · $40.00 USD"). Nothing taken is zero.
 */
export function takenTodayText(totals: Array<{ currency: string; cents: number }>): string {
  if (totals.length === 0) return formatMoney(0)
  if (totals.length === 1) return formatMoney(totals[0].cents, totals[0].currency)
  // The code follows each amount, so the symbol is the plain "$": en-CA
  // would otherwise write US$40.00 USD.
  return totals
    .map((t) => `${formatMoney(t.cents, t.currency, "narrowSymbol")} ${t.currency}`)
    .join(" · ")
}

/* ------------------------------- payment -------------------------------- */

export const PAYMENT_METHODS = ["Cash", "Card", "E-transfer", "Other"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** What clinic_record_payment's p_method accepts, one for each label. */
export type PaymentMethodCode = "cash" | "card" | "e_transfer" | "other"
export const PAYMENT_METHOD_CODE: Record<PaymentMethod, PaymentMethodCode> = {
  Cash: "cash",
  Card: "card",
  "E-transfer": "e_transfer",
  Other: "other",
}

function isMethod(m: string): m is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(m)
}

export function paymentMethodLabel(code: string): string {
  for (const m of PAYMENT_METHODS) if (PAYMENT_METHOD_CODE[m] === code) return m
  return "Unknown"
}

const overBalance = (remaining: number, currency = "cad") =>
  `That's more than the ${formatMoney(remaining, currency)} still owed.`

export type PaymentErrors = { amount?: string; method?: string }

/** One payment against what is still owed — part of the bill or all of it. */
export function validatePayment(input: {
  amount: string
  method: string
  remainingCents: number
  currency?: string
}): { ok: true; value: { amountCents: number; method: PaymentMethodCode } } | { ok: false; errors: PaymentErrors } {
  const errors: PaymentErrors = {}
  const parsed = parsePriceCents(input.amount)
  if (!parsed.ok) errors.amount = "Enter an amount like 85 or 85.50."
  else if (parsed.cents === 0) errors.amount = "Enter an amount above zero."
  else if (parsed.cents > input.remainingCents) errors.amount = overBalance(input.remainingCents, input.currency)
  if (!isMethod(input.method)) errors.method = "Choose how they paid."
  if (Object.keys(errors).length > 0 || !parsed.ok || !isMethod(input.method)) return { ok: false, errors }
  return { ok: true, value: { amountCents: parsed.cents, method: PAYMENT_METHOD_CODE[input.method] } }
}

/** A payment as the invoice sheet lists it: the day in the practice's zone, method, amount. Oldest first. */
export function paymentRows(
  payments: Array<{ id: string; amountCents: number; method: string; createdAt: string }>,
  tz: string,
  currency: string,
): Array<{ id: string; date: string; method: string; amount: string }> {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short", year: "numeric" })
  return [...payments]
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    .map((p) => ({
      id: p.id,
      date: day.format(new Date(p.createdAt)),
      method: paymentMethodLabel(p.method),
      amount: formatMoney(p.amountCents, currency),
    }))
}

/* -------------------------------- errors -------------------------------- */

/*
 * clinic_record_payment and clinic_void_invoice refuse in two ways: a raise
 * (22023 — the amount, the method or the reason) and an `{ok:false, error}`
 * answer. Neither reaches the screen as written. The codes are an allow-list:
 * anything this file has not been taught reads as the one "try again"
 * sentence, never the database's text (the rule cancel-errors.ts follows).
 */

/** The fields of a Postgrest error this reads. `message` is never shown. */
export type BillingRaise = { code?: string | null; message?: string } | null
/** The jsonb the RPCs return. */
export type BillingAnswer = { ok?: boolean; error?: string; remaining?: unknown; [key: string]: unknown } | null

const RETRY = "Couldn't save that. Try again."

const SHARED_ANSWERS: Record<string, string> = {
  forbidden: "Only staff at this practice can change its bills.",
  not_found: "That bill no longer exists.",
}

const PAYMENT_ANSWERS: Record<string, string> = {
  ...SHARED_ANSWERS,
  not_payable: "This invoice can't take a payment any more. Refresh to see where it stands.",
  not_an_invoice: "Only an invoice takes payment. Convert the estimate to an invoice first.",
}

const VOID_ANSWERS: Record<string, string> = {
  ...SHARED_ANSWERS,
  not_voidable: "This bill can't be voided any more. Refresh to see where it stands.",
}

const has = (o: Record<string, string>, k: string | undefined | null): k is string =>
  typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k)

/** clinic_record_payment, as a sentence. Null when it went through. */
export function recordPaymentError(e: BillingRaise, r: BillingAnswer, currency = "cad"): string | null {
  if (e) return e.code === "22023" ? "Enter an amount above zero and choose how they paid." : RETRY
  if (r?.ok === true) return null
  if (r?.error === "over_balance") {
    const left = r.remaining
    return typeof left === "number" && Number.isInteger(left) && left >= 0
      ? overBalance(left, currency)
      : "That's more than is still owed on this invoice."
  }
  return has(PAYMENT_ANSWERS, r?.error) ? PAYMENT_ANSWERS[r.error as string] : RETRY
}

/** clinic_void_invoice, as a sentence. Null when it went through. */
export function voidInvoiceError(e: BillingRaise, r: BillingAnswer): string | null {
  if (e) {
    return e.code === "22023"
      ? "Add a reason of 2000 characters or fewer. The owner sees it if they already have the bill."
      : RETRY
  }
  if (r?.ok === true) return null
  return has(VOID_ANSWERS, r?.error) ? VOID_ANSWERS[r.error as string] : RETRY
}
