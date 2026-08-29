"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { useLive, must, readOutcome, sentenceFor, type LiveResult } from "./use-live"

type VisitRow = Database["public"]["Tables"]["visits"]["Row"]

export interface VisitService {
  id: string
  name: string
  quantity: number
  unitPriceCents: number
}

export interface Visit {
  id: string
  visitedOn: string
  reason: string | null
  summary: string | null
  internalNote: string | null
  weightGrams: number | null
  temperatureC: number | null
  nextDueOn: string | null
  nextDueReason: string | null
  status: string
  staffName: string
  patientId: string
  customerId: string | null
  services: VisitService[]
  totalCents: number
  publishedAt: string | null
}

export interface PatientVaccination {
  id: string
  name: string
  product: string | null
  batch: string | null
  givenOn: string
  expiresOn: string | null
  note: string | null
  publishedAt: string | null
}

const VISIT_SELECT =
  "*, business_staff(profiles!business_staff_profile_id_fkey(full_name)), visit_services(id, name, quantity, unit_price_cents)"

type VisitJoined = VisitRow & {
  business_staff: { profiles: { full_name: string | null } | null } | null
  visit_services: Array<{ id: string; name: string; quantity: number; unit_price_cents: number }>
}

function mapVisit(r: VisitJoined, published: Map<string, string>): Visit {
  const services = (r.visit_services ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    quantity: Number(s.quantity),
    unitPriceCents: s.unit_price_cents,
  }))
  return {
    id: r.id,
    visitedOn: r.visited_on,
    reason: r.reason,
    summary: r.summary,
    internalNote: r.internal_note,
    weightGrams: r.weight_grams,
    temperatureC: r.temperature_c === null ? null : Number(r.temperature_c),
    nextDueOn: r.next_due_on,
    nextDueReason: r.next_due_reason,
    status: r.status,
    staffName: r.business_staff?.profiles?.full_name ?? "Team",
    patientId: r.patient_id,
    customerId: r.customer_id,
    services,
    totalCents: services.reduce((sum, s) => sum + Math.round(s.quantity * s.unitPriceCents), 0),
    publishedAt: published.get(r.id) ?? null,
  }
}

export function usePatientVisits(patientId: string | null): LiveResult<Visit[]> {
  return useLive<Visit[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("visits")
          .select(VISIT_SELECT)
          .eq("patient_id", patientId as string)
          .order("visited_on", { ascending: false })
          .limit(100),
      ) as VisitJoined[]
      const pubs = must(
        await db
          .from("record_publications")
          .select("source_id, published_at")
          .eq("patient_id", patientId as string)
          .eq("source_kind", "visit_summary")
          .is("withdrawn_at", null),
      ) as Array<{ source_id: string | null; published_at: string }>
      const map = new Map<string, string>()
      for (const p of pubs) if (p.source_id) map.set(p.source_id, p.published_at)
      return rows.map((r) => mapVisit(r, map))
    },
    [patientId],
    Boolean(patientId),
  )
}

export function useVisit(visitId: string | null): LiveResult<Visit | null> {
  return useLive<Visit | null>(
    null,
    async (db) => {
      const rows = must(
        await db.from("visits").select(VISIT_SELECT).eq("id", visitId as string).limit(1),
      ) as VisitJoined[]
      if (!rows[0]) return null
      const pubs = must(
        await db
          .from("record_publications")
          .select("source_id, published_at")
          .eq("source_id", visitId as string)
          .is("withdrawn_at", null),
      ) as Array<{ source_id: string | null; published_at: string }>
      const map = new Map<string, string>()
      for (const p of pubs) if (p.source_id) map.set(p.source_id, p.published_at)
      return mapVisit(rows[0], map)
    },
    [visitId],
    Boolean(visitId),
  )
}

export function usePatientVaccinations(patientId: string | null): LiveResult<PatientVaccination[]> {
  return useLive<PatientVaccination[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("patient_vaccinations")
          .select("*")
          .eq("patient_id", patientId as string)
          .order("given_on", { ascending: false }),
      ) as Array<Database["public"]["Tables"]["patient_vaccinations"]["Row"]>
      const pubs = must(
        await db
          .from("record_publications")
          .select("source_id, published_at")
          .eq("patient_id", patientId as string)
          .eq("source_kind", "vaccination")
          .is("withdrawn_at", null),
      ) as Array<{ source_id: string | null; published_at: string }>
      const map = new Map<string, string>()
      for (const p of pubs) if (p.source_id) map.set(p.source_id, p.published_at)
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        product: r.product,
        batch: r.batch,
        givenOn: r.given_on,
        expiresOn: r.expires_on,
        note: r.note,
        publishedAt: map.get(r.id) ?? null,
      }))
    },
    [patientId],
    Boolean(patientId),
  )
}

export async function createVisit(input: {
  businessId: string
  patientId: string
  customerId: string | null
  staffId: string | null
  reason?: string
}): Promise<{ error: string | null; visitId?: string }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db
    .from("visits")
    .insert({
      business_id: input.businessId,
      patient_id: input.patientId,
      customer_id: input.customerId,
      staff_id: input.staffId,
      reason: input.reason ?? null,
    })
    .select("id")
    .single()
  if (error) return { error: error.message }
  return { error: null, visitId: data?.id }
}

export async function updateVisit(
  id: string,
  patch: Database["public"]["Tables"]["visits"]["Update"],
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { error } = await db.from("visits").update(patch).eq("id", id)
  return { error: error?.message ?? null }
}

export async function addVisitService(
  visitId: string,
  businessId: string,
  name: string,
  unitPriceCents: number,
  quantity = 1,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  if (!name.trim()) return { error: "Give the service a name." }
  const { error } = await db.from("visit_services").insert({
    visit_id: visitId,
    business_id: businessId,
    name: name.trim(),
    quantity,
    unit_price_cents: Math.max(0, Math.round(unitPriceCents)),
  })
  return { error: error?.message ?? null }
}

export async function removeVisitService(id: string): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { error } = await db.from("visit_services").delete().eq("id", id)
  return { error: error?.message ?? null }
}

export async function recordVaccination(input: {
  businessId: string
  patientId: string
  visitId?: string | null
  staffId?: string | null
  name: string
  product?: string
  batch?: string
  givenOn: string
  expiresOn?: string | null
}): Promise<{ error: string | null; id?: string }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  if (!input.name.trim()) return { error: "Which vaccine was given?" }
  const { data, error } = await db
    .from("patient_vaccinations")
    .insert({
      business_id: input.businessId,
      patient_id: input.patientId,
      visit_id: input.visitId ?? null,
      administered_by: input.staffId ?? null,
      name: input.name.trim(),
      product: input.product?.trim() || null,
      batch: input.batch?.trim() || null,
      given_on: input.givenOn,
      expires_on: input.expiresOn || null,
    })
    .select("id")
    .single()
  if (error) return { error: error.message }
  return { error: null, id: data?.id }
}

/**
 * Hand a record back to the owner. Always an explicit act — internal notes and
 * anything about the person rather than the animal stay with the practice.
 */
export async function publishRecord(
  patientId: string,
  sourceKind: "vaccination" | "visit_summary",
  sourceId: string,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("clinic_publish_record", {
    p_patient: patientId,
    p_source_kind: sourceKind,
    p_source_id: sourceId,
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  return { error: out.ok ? null : sentenceFor(out.error) }
}

export async function withdrawPublication(
  publicationId: string,
  reason?: string,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("clinic_withdraw_publication", {
    p_publication: publicationId,
    p_reason: reason ?? undefined,
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  return { error: out.ok ? null : sentenceFor(out.error) }
}
