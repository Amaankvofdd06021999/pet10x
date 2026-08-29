"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { useLive, must, readOutcome, sentenceFor, type LiveResult } from "./use-live"

export interface EmergencyArrival {
  id: string
  petName: string | null
  species: string | null
  weightGrams: number | null
  allergies: string | null
  problem: string
  triageLevel: string
  etaMinutes: number | null
  contactPhone: string | null
  status: string
  createdAt: string
  petId: string | null
  patientId: string | null
}

/** Inbound "I am on my way" alerts, newest first. */
export function useEmergencyArrivals(businessId: string | null): LiveResult<EmergencyArrival[]> {
  return useLive<EmergencyArrival[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("emergency_arrivals")
          .select("*")
          .eq("business_id", businessId as string)
          .in("status", ["incoming", "arrived"])
          .order("created_at", { ascending: false })
          .limit(30),
      ) as Array<Database["public"]["Tables"]["emergency_arrivals"]["Row"]>
      return rows.map((r) => ({
        id: r.id,
        petName: r.pet_name,
        species: r.species,
        weightGrams: r.weight_grams,
        allergies: r.allergies,
        problem: r.problem,
        triageLevel: r.triage_level,
        etaMinutes: r.eta_minutes,
        contactPhone: r.contact_phone,
        status: r.status,
        createdAt: r.created_at,
        petId: r.pet_id,
        patientId: r.patient_id,
      }))
    },
    [businessId],
    Boolean(businessId),
  )
}

export async function setArrivalStatus(id: string, status: string): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { error } = await db.from("emergency_arrivals").update({ status }).eq("id", id)
  return { error: error?.message ?? null }
}

export interface EmergencyPullRecord {
  id: string
  reason: string
  pulledAt: string
  petId: string
  reviewedAt: string | null
  reviewOutcome: string | null
}

export function useEmergencyPulls(businessId: string | null): LiveResult<EmergencyPullRecord[]> {
  return useLive<EmergencyPullRecord[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("emergency_pulls")
          .select("*")
          .eq("business_id", businessId as string)
          .order("pulled_at", { ascending: false })
          .limit(50),
      ) as Array<Database["public"]["Tables"]["emergency_pulls"]["Row"]>
      return rows.map((r) => ({
        id: r.id,
        reason: r.reason,
        pulledAt: r.pulled_at,
        petId: r.pet_id,
        reviewedAt: r.reviewed_at,
        reviewOutcome: r.review_outcome,
      }))
    },
    [businessId],
    Boolean(businessId),
  )
}

export interface EmergencyProjection {
  name: string
  species: string
  breed: string | null
  sex: string | null
  dob: string | null
  colour: string | null
  weight_grams: number | null
  allergies: string | null
  conditions: string | null
  medications_notes: string | null
  owner_name: string | null
  owner_phone: string | null
}

/**
 * Break-glass. Narrow projection, mandatory reason, owner told within seconds,
 * every pull logged and reviewable. Deliberately returns nothing about other
 * practices, no documents, and no home address.
 */
export async function emergencyPull(
  businessId: string,
  petId: string,
  reason: string,
): Promise<{ error: string | null; data?: EmergencyProjection }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  if (!reason.trim()) return { error: "A reason is required before emergency access." }
  const { data, error } = await db.rpc("clinic_emergency_pull", {
    p_business: businessId,
    p_pet: petId,
    p_reason: reason.trim(),
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  if (!out.ok) return { error: sentenceFor(out.error) }
  return { error: null, data: out.data as EmergencyProjection }
}

export interface OnCallShift {
  id: string
  startsAt: string
  endsAt: string
  phone: string | null
  note: string | null
  staffName: string
}

export function useOnCall(businessId: string | null): LiveResult<OnCallShift[]> {
  return useLive<OnCallShift[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("on_call_shifts")
          .select("*, business_staff(profiles!business_staff_profile_id_fkey(full_name))")
          .eq("business_id", businessId as string)
          .gte("ends_at", new Date().toISOString())
          .order("starts_at")
          .limit(20),
      ) as Array<
        Database["public"]["Tables"]["on_call_shifts"]["Row"] & {
          business_staff: { profiles: { full_name: string | null } | null } | null
        }
      >
      return rows.map((r) => ({
        id: r.id,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        phone: r.phone,
        note: r.note,
        staffName: r.business_staff?.profiles?.full_name ?? "On call",
      }))
    },
    [businessId],
    Boolean(businessId),
  )
}

export async function addOnCallShift(input: {
  businessId: string
  staffId: string | null
  startsAt: string
  endsAt: string
  phone?: string
}): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  if (new Date(input.endsAt) <= new Date(input.startsAt)) {
    return { error: "The shift has to end after it starts." }
  }
  const { error } = await db.from("on_call_shifts").insert({
    business_id: input.businessId,
    staff_id: input.staffId,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    phone: input.phone ?? null,
  })
  return { error: error?.message ?? null }
}
