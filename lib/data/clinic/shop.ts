"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { useLive, must, readOutcome, sentenceFor, type LiveResult } from "./use-live"
import { recordPaymentError, voidInvoiceError, type PaymentMethodCode } from "./billing"
import { dbErrorMessage } from "@/lib/data/db-error"

export interface Product {
  id: string
  sku: string | null
  name: string
  category: string | null
  priceCents: number
  reorderPoint: number | null
  isActive: boolean
  quantity: number
}

export function useProducts(businessId: string | null): LiveResult<Product[]> {
  return useLive<Product[]>(
    "products",
    [],
    async (db) => {
      const rows = must(
        await db
          .from("products")
          .select("*, stock_levels(quantity)")
          .eq("business_id", businessId as string)
          .order("category", { nullsFirst: false })
          .order("name"),
      ) as Array<
        Database["public"]["Tables"]["products"]["Row"] & { stock_levels: Array<{ quantity: number }> }
      >
      return rows.map((r) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        category: r.category,
        priceCents: r.price_cents,
        reorderPoint: r.reorder_point === null ? null : Number(r.reorder_point),
        isActive: r.is_active,
        quantity: (r.stock_levels ?? []).reduce((sum, s) => sum + Number(s.quantity), 0),
      }))
    },
    [businessId],
    Boolean(businessId),
  )
}

export async function saveProduct(input: {
  id?: string
  businessId: string
  name: string
  sku?: string
  category?: string
  priceCents: number
  reorderPoint?: number | null
}): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  if (!input.name.trim()) return { error: "Give the product a name." }
  const payload = {
    business_id: input.businessId,
    name: input.name.trim(),
    sku: input.sku?.trim() || null,
    category: input.category?.trim() || null,
    price_cents: Math.max(0, Math.round(input.priceCents)),
    reorder_point: input.reorderPoint ?? null,
  }
  const { error } = input.id
    ? await db.from("products").update(payload).eq("id", input.id)
    : await db.from("products").insert(payload)
  return { error: error ? dbErrorMessage(error, "Couldn't save the product. Try again.") : null }
}

export async function setStock(
  businessId: string,
  productId: string,
  locationId: string | null,
  quantity: number,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { error } = await db
    .from("stock_levels")
    .upsert(
      {
        business_id: businessId,
        product_id: productId,
        location_id: locationId,
        quantity,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_id,location_id" },
    )
  return { error: error ? dbErrorMessage(error, "Couldn't update the stock. Try again.") : null }
}

/* ------------------------------ invoices -------------------------------- */

export interface InvoiceLine {
  id: string
  description: string
  quantity: number
  unitPriceCents: number
}

export interface InvoicePayment {
  id: string
  amountCents: number
  /** cash | card | e_transfer | other (paymentMethodLabel names it). */
  method: string
  createdAt: string
}

export interface Invoice {
  id: string
  kind: string
  status: string
  number: string | null
  totalCents: number
  paidCents: number
  currency: string
  issuedOn: string | null
  createdAt: string
  patientId: string | null
  visitId: string | null
  patientName: string
  customerName: string
  ownerApprovedAt: string | null
  lines: InvoiceLine[]
  /** Every payment recorded against it (invoice_payments), oldest first. */
  payments: InvoicePayment[]
}

const INVOICE_SELECT =
  "*, clinic_patients(id, name), clinic_customers(first_name, last_name), invoice_lines(id, description, quantity, unit_price_cents), invoice_payments(id, amount_cents, method, created_at)"

type InvoiceJoined = Database["public"]["Tables"]["invoices"]["Row"] & {
  clinic_patients: { id: string; name: string } | null
  clinic_customers: { first_name: string; last_name: string | null } | null
  invoice_lines: Array<{ id: string; description: string; quantity: number; unit_price_cents: number }>
  invoice_payments: Array<{ id: string; amount_cents: number; method: string; created_at: string }> | null
}

function mapInvoice(r: InvoiceJoined): Invoice {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    number: r.number,
    totalCents: r.total_cents,
    paidCents: r.paid_cents,
    currency: r.currency,
    issuedOn: r.issued_on,
    createdAt: r.created_at,
    patientId: r.patient_id,
    visitId: r.visit_id,
    patientName: r.clinic_patients?.name ?? "—",
    customerName: r.clinic_customers
      ? [r.clinic_customers.first_name, r.clinic_customers.last_name].filter(Boolean).join(" ")
      : "—",
    ownerApprovedAt: r.owner_approved_at,
    lines: (r.invoice_lines ?? []).map((l) => ({
      id: l.id,
      description: l.description,
      quantity: Number(l.quantity),
      unitPriceCents: l.unit_price_cents,
    })),
    payments: (r.invoice_payments ?? [])
      .map((p) => ({ id: p.id, amountCents: p.amount_cents, method: p.method, createdAt: p.created_at }))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)),
  }
}

export function useInvoices(businessId: string | null): LiveResult<Invoice[]> {
  return useLive<Invoice[]>(
    "invoices",
    [],
    async (db) => {
      const rows = must(
        await db
          .from("invoices")
          .select(INVOICE_SELECT)
          .eq("business_id", businessId as string)
          .order("created_at", { ascending: false })
          .limit(150),
      ) as InvoiceJoined[]
      return rows.map(mapInvoice)
    },
    [businessId],
    Boolean(businessId),
  )
}

/**
 * Build an invoice (or estimate) from what the visit actually recorded. A
 * visit with no services is refused before anything is written: an empty
 * draft bills nothing and only clutters Billing.
 */
export async function invoiceFromVisit(
  visitId: string,
  kind: "estimate" | "invoice" = "invoice",
): Promise<{ error: string | null; invoiceId?: string }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data: visit, error: vErr } = await db
    .from("visits")
    .select("*, visit_services(name, quantity, unit_price_cents)")
    .eq("id", visitId)
    .single()
  if (vErr || !visit) return { error: dbErrorMessage(vErr, "Couldn't find that visit. Refresh and try again.") }
  const services = (visit.visit_services ?? []) as Array<{
    name: string
    quantity: number
    unit_price_cents: number
  }>
  if (services.length === 0) return { error: "Add a service to this visit first — there's nothing to bill yet." }

  const { data: inv, error: iErr } = await db
    .from("invoices")
    .insert({
      business_id: visit.business_id,
      customer_id: visit.customer_id,
      patient_id: visit.patient_id,
      visit_id: visit.id,
      kind,
      status: "draft",
    })
    .select("id")
    .single()
  if (iErr || !inv) return { error: dbErrorMessage(iErr, "Couldn't create the invoice. Try again.") }

  const { error: lErr } = await db.from("invoice_lines").insert(
    services.map((s) => ({
      invoice_id: inv.id,
      business_id: visit.business_id,
      description: s.name,
      quantity: s.quantity,
      unit_price_cents: s.unit_price_cents,
    })),
  )
  if (lErr) return { error: dbErrorMessage(lErr, "The invoice was created, but its lines couldn't be added. Open it and add them."), invoiceId: inv.id }
  return { error: null, invoiceId: inv.id }
}

const SAVE_FAILED = "Couldn't save that. Try again."

/**
 * Move a bill through clinic_set_invoice_status: send a draft, or (from sent)
 * approve it or take it back to draft. Paying and voiding have their own
 * doors since 20261016000001 — recordPayment and voidInvoice.
 */
export async function setInvoiceStatus(
  invoiceId: string,
  status: "sent" | "approved" | "draft",
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("clinic_set_invoice_status", { p_invoice: invoiceId, p_status: status })
  if (error) {
    console.error("clinic_set_invoice_status failed", error)
    return { error: SAVE_FAILED }
  }
  const out = readOutcome(data)
  if (out.ok !== true) return { error: sentenceFor(out.error) }
  return { error: null }
}

/**
 * Record one payment — part of what is owed or all of it — through
 * clinic_record_payment. The bill becomes paid only when the total is
 * reached. An amount of 0 settles a bill with nothing left to pay (the
 * "Mark settled" button); the RPC refuses 0 anywhere else.
 */
export async function recordPayment(
  invoiceId: string,
  amountCents: number,
  method: PaymentMethodCode,
  currency = "cad",
): Promise<{ error: string | null; status?: string }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("clinic_record_payment", {
    p_invoice: invoiceId,
    p_amount_cents: amountCents,
    p_method: method,
  })
  const answer = error ? null : (readOutcome(data) as Parameters<typeof recordPaymentError>[1])
  const sentence = recordPaymentError(error, answer, currency)
  if (sentence) {
    console.error("clinic_record_payment refused", error ?? answer)
    return { error: sentence }
  }
  return { error: null, status: typeof answer?.status === "string" ? answer.status : undefined }
}

/**
 * Void a bill with a reason, through clinic_void_invoice. Payments already
 * recorded stay on it; the owner is told (with the reason) if the bill had
 * reached them.
 */
export async function voidInvoice(
  invoiceId: string,
  reason: string,
): Promise<{ error: string | null; ownerNotified?: boolean }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("clinic_void_invoice", { p_invoice: invoiceId, p_reason: reason })
  const answer = error ? null : (readOutcome(data) as Parameters<typeof voidInvoiceError>[1])
  const sentence = voidInvoiceError(error, answer)
  if (sentence) {
    console.error("clinic_void_invoice refused", error ?? answer)
    return { error: sentence }
  }
  return { error: null, ownerNotified: answer?.owner_notified === true }
}

/**
 * The practice's payments since a moment (Billing passes the start of the
 * practice's today), with each one's bill status — what Taken today sums
 * (takenTodayByCurrency). Read on its own rather
 * than from useInvoices, whose 150-bill window could miss a payment on an
 * older bill.
 */
export function usePaymentsSince(
  businessId: string | null,
  sinceISO: string,
): LiveResult<Array<{ amountCents: number; currency: string; createdAt: string; invoiceStatus: string }>> {
  return useLive<Array<{ amountCents: number; currency: string; createdAt: string; invoiceStatus: string }>>(
    "payments",
    [],
    async (db) => {
      const rows = must(
        await db
          .from("invoice_payments")
          .select("amount_cents, created_at, invoices(status, currency)")
          .eq("business_id", businessId as string)
          .gte("created_at", sinceISO),
      ) as Array<{ amount_cents: number; created_at: string; invoices: { status: string; currency: string } | null }>
      return rows.map((r) => ({
        amountCents: r.amount_cents,
        // A payment is in its bill's currency; "cad" only if the join came back empty.
        currency: r.invoices?.currency ?? "cad",
        createdAt: r.created_at,
        invoiceStatus: r.invoices?.status ?? "unknown",
      }))
    },
    [businessId, sinceISO],
    Boolean(businessId),
  )
}

/**
 * The bills on one patient's chart — just enough for the visit cards to know
 * which visits already have a live invoice (liveInvoiceByVisit).
 */
export function usePatientInvoices(
  patientId: string | null,
): LiveResult<Array<{ id: string; kind: string; status: string; visitId: string | null }>> {
  return useLive<Array<{ id: string; kind: string; status: string; visitId: string | null }>>(
    "this patient's invoices",
    [],
    async (db) => {
      const rows = must(
        await db.from("invoices").select("id, kind, status, visit_id").eq("patient_id", patientId as string),
      ) as Array<{ id: string; kind: string; status: string; visit_id: string | null }>
      return rows.map((r) => ({ id: r.id, kind: r.kind, status: r.status, visitId: r.visit_id }))
    },
    [patientId],
    Boolean(patientId),
  )
}

export interface BillableVisit {
  id: string
  visitedOn: string
  reason: string | null
  patientName: string
  customerName: string
  totalCents: number
  serviceCount: number
}

/**
 * Recent visits that recorded services — what "New invoice" picks from. The
 * last 60 days, newest first; whether one is already invoiced is decided on
 * the screen from the invoices it already holds (invoicedVisitIds).
 */
export function useBillableVisits(businessId: string | null, enabled = true): LiveResult<BillableVisit[]> {
  return useLive<BillableVisit[]>(
    "visits to bill",
    [],
    async (db) => {
      const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10)
      const rows = must(
        await db
          .from("visits")
          .select(
            "id, visited_on, reason, clinic_patients(name), clinic_customers(first_name, last_name), visit_services(quantity, unit_price_cents)",
          )
          .eq("business_id", businessId as string)
          .gte("visited_on", since)
          .order("visited_on", { ascending: false })
          .limit(100),
      ) as Array<{
        id: string
        visited_on: string
        reason: string | null
        clinic_patients: { name: string } | null
        clinic_customers: { first_name: string; last_name: string | null } | null
        visit_services: Array<{ quantity: number; unit_price_cents: number }>
      }>
      return rows
        .filter((r) => (r.visit_services ?? []).length > 0)
        .map((r) => ({
          id: r.id,
          visitedOn: r.visited_on,
          reason: r.reason,
          patientName: r.clinic_patients?.name ?? "—",
          customerName: r.clinic_customers
            ? [r.clinic_customers.first_name, r.clinic_customers.last_name].filter(Boolean).join(" ")
            : "—",
          totalCents: r.visit_services.reduce((sum, s) => sum + Math.round(Number(s.quantity) * s.unit_price_cents), 0),
          serviceCount: r.visit_services.length,
        }))
    },
    [businessId, enabled],
    Boolean(businessId) && enabled,
  )
}
