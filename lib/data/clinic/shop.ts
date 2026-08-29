"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { useLive, must, readOutcome, sentenceFor, type LiveResult } from "./use-live"

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
  return { error: error?.message ?? null }
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
  return { error: error?.message ?? null }
}

/* ------------------------------ invoices -------------------------------- */

export interface InvoiceLine {
  id: string
  description: string
  quantity: number
  unitPriceCents: number
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
  patientName: string
  customerName: string
  ownerApprovedAt: string | null
  lines: InvoiceLine[]
}

const INVOICE_SELECT =
  "*, clinic_patients(id, name), clinic_customers(first_name, last_name), invoice_lines(id, description, quantity, unit_price_cents)"

type InvoiceJoined = Database["public"]["Tables"]["invoices"]["Row"] & {
  clinic_patients: { id: string; name: string } | null
  clinic_customers: { first_name: string; last_name: string | null } | null
  invoice_lines: Array<{ id: string; description: string; quantity: number; unit_price_cents: number }>
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
  }
}

export function useInvoices(businessId: string | null): LiveResult<Invoice[]> {
  return useLive<Invoice[]>(
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

/** Build an invoice from what the visit actually recorded. */
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
  if (vErr || !visit) return { error: vErr?.message ?? "Visit not found." }

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
  if (iErr || !inv) return { error: iErr?.message ?? "Could not create the invoice." }

  const services = (visit.visit_services ?? []) as Array<{
    name: string
    quantity: number
    unit_price_cents: number
  }>
  if (services.length > 0) {
    const { error: lErr } = await db.from("invoice_lines").insert(
      services.map((s) => ({
        invoice_id: inv.id,
        business_id: visit.business_id,
        description: s.name,
        quantity: s.quantity,
        unit_price_cents: s.unit_price_cents,
      })),
    )
    if (lErr) return { error: lErr.message, invoiceId: inv.id }
  }
  return { error: null, invoiceId: inv.id }
}

export async function setInvoiceStatus(
  invoiceId: string,
  status: string,
  paidCents?: number,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("clinic_set_invoice_status", {
    p_invoice: invoiceId,
    p_status: status,
    p_paid_cents: paidCents ?? undefined,
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  return { error: out.ok ? null : sentenceFor(out.error) }
}
