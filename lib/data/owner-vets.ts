"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { useLive, must, readOutcome, sentenceFor, type LiveResult } from "./clinic/use-live"

/**
 * The owner's side of the veterinary module.
 *
 * The promise this file has to keep is that an owner can answer "who can see
 * my dog's records?" in three seconds, and undo it in one tap.
 *
 * EVERY QUERY HERE FILTERS TO THE VIEWER, and none of them lean on RLS to do
 * it. The tables below all carry a second SELECT policy for clinic staff — that
 * is what makes the clinic console work — so "whatever I am allowed to read" is
 * NOT the same question as "what is mine". Asking the loose one showed a
 * building manager five other residents' notices above an empty "no cases
 * against you". This is the trap `lib/rbac.ts` describes: a persona changes
 * which surface renders, never what a query is allowed to return. Everything a
 * practice can see is a row in `record_shares` with a scope list and an
 * expiry; revoking writes a timestamp and the next read stops.
 */

export const SCOPE_LABELS: Record<string, { label: string; detail: string; sensitive?: boolean }> = {
  identity: { label: "Basic details", detail: "Name, breed, age, sex, microchip, weight" },
  vaccinations: { label: "Vaccinations", detail: "What has been given and when it expires" },
  health_notes: { label: "Health notes", detail: "Allergies, conditions and medication notes" },
  documents: { label: "Documents", detail: "Licences, insurance and paperwork you uploaded" },
  care_log: { label: "Home care log", detail: "Feeding, weight and activity you record at home" },
  other_clinic_records: {
    label: "Other practices' records",
    detail: "Records other vets have added — needed for a referral",
    sensitive: true,
  },
}

export const DEFAULT_SCOPES = ["identity", "vaccinations", "health_notes"]

export interface VetShare {
  shareId: string
  businessId: string
  businessName: string
  city: string | null
  phone: string | null
  scopes: string[]
  expiresAt: string | null
  createdVia: string
  grantedAt: string
  petId: string
  petName: string
}

/** Every practice that can currently see something, per pet. */
export function useMyVetShares(): LiveResult<VetShare[]> {
  return useLive<VetShare[]>(
    [],
    async (db) => {
      const { data: auth } = await db.auth.getUser()
      const uid = auth.user?.id
      if (!uid) return []
      const rows = must(
        await db
          .from("record_shares")
          .select("*, businesses(id, name, city, address), pets!inner(id, name, owner_id)")
          .eq("pets.owner_id", uid)
          .is("revoked_at", null)
          .order("created_at", { ascending: false }),
      ) as Array<
        Database["public"]["Tables"]["record_shares"]["Row"] & {
          businesses: { id: string; name: string; city: string | null; address: string | null } | null
          pets: { id: string; name: string } | null
        }
      >
      return rows
        .filter((r) => r.businesses && r.pets)
        .map((r) => ({
          shareId: r.id,
          businessId: r.business_id,
          businessName: r.businesses?.name ?? "Practice",
          city: r.businesses?.city ?? null,
          phone: null,
          scopes: r.scopes ?? [],
          expiresAt: r.expires_at,
          createdVia: r.created_via,
          grantedAt: r.created_at,
          petId: r.pet_id,
          petName: r.pets?.name ?? "Pet",
        }))
    },
    [],
  )
}

export interface VetDirectoryEntry {
  id: string
  name: string
  city: string | null
  address: string | null
  isOpen: boolean
  ratingAvg: number
  ratingCount: number
}

/** Verified veterinary practices an owner can share with or book at. */
export function useVetDirectory(search: string): LiveResult<VetDirectoryEntry[]> {
  return useLive<VetDirectoryEntry[]>(
    [],
    async (db) => {
      let q = db
        .from("businesses")
        .select("id, name, city, address, is_open, rating_avg, rating_count, business_kind, tier")
        .eq("business_kind", "veterinary")
        .in("tier", ["listed", "verified"])
        .order("name")
        .limit(50)
      const term = search.trim()
      if (term) {
        const safe = term.replace(/[%,()]/g, " ")
        q = q.or(`name.ilike.%${safe}%,city.ilike.%${safe}%`)
      }
      const rows = must(await q) as Array<{
        id: string
        name: string
        city: string | null
        address: string | null
        is_open: boolean
        rating_avg: number
        rating_count: number
      }>
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        city: r.city,
        address: r.address,
        isOpen: r.is_open,
        ratingAvg: Number(r.rating_avg),
        ratingCount: r.rating_count,
      }))
    },
    [search],
  )
}

export async function grantShare(
  petId: string,
  businessId: string,
  scopes: string[],
  expiresAt?: string | null,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("owner_grant_record_share", {
    p_pet: petId,
    p_business: businessId,
    p_scopes: scopes,
    p_expires_at: expiresAt ?? undefined,
    p_via: "manual",
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  return { error: out.ok ? null : sentenceFor(out.error) }
}

export async function revokeShare(shareId: string): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("owner_revoke_record_share", { p_share: shareId })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  return { error: out.ok ? null : sentenceFor(out.error) }
}

export async function createDeskCode(
  petId: string,
  scopes: string[] = DEFAULT_SCOPES,
): Promise<{ error: string | null; code?: string }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("owner_create_desk_code", { p_pet: petId, p_scopes: scopes })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  if (!out.ok) return { error: sentenceFor(out.error) }
  return { error: null, code: out.code as string }
}

/* ------------------------- requests awaiting me -------------------------- */

export interface PendingLinkRequest {
  id: string
  businessName: string
  patientName: string
  message: string | null
  createdAt: string
}

export function usePendingLinkRequests(): LiveResult<PendingLinkRequest[]> {
  return useLive<PendingLinkRequest[]>(
    [],
    async (db) => {
      const { data: auth } = await db.auth.getUser()
      const uid = auth.user?.id
      if (!uid) return []
      const rows = must(
        await db
          .from("patient_link_requests")
          .select("*, businesses(name), clinic_patients(name)")
          .eq("profile_id", uid)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ) as Array<
        Database["public"]["Tables"]["patient_link_requests"]["Row"] & {
          businesses: { name: string } | null
          clinic_patients: { name: string } | null
        }
      >
      return rows.map((r) => ({
        id: r.id,
        businessName: r.businesses?.name ?? "A practice",
        patientName: r.clinic_patients?.name ?? "a pet",
        message: r.message,
        createdAt: r.created_at,
      }))
    },
    [],
  )
}

export async function decideLinkRequest(
  requestId: string,
  accept: boolean,
  petId?: string,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("owner_decide_patient_link", {
    p_request: requestId,
    p_accept: accept,
    p_pet: petId ?? undefined,
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  return { error: out.ok ? null : sentenceFor(out.error) }
}

export interface PendingShareRequest {
  id: string
  businessName: string
  petName: string
  scopes: string[]
  message: string | null
}

export function usePendingShareRequests(): LiveResult<PendingShareRequest[]> {
  return useLive<PendingShareRequest[]>(
    [],
    async (db) => {
      const { data: auth } = await db.auth.getUser()
      const uid = auth.user?.id
      if (!uid) return []
      const rows = must(
        await db
          .from("record_share_requests")
          .select("*, businesses(name), pets(name)")
          .eq("profile_id", uid)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ) as Array<
        Database["public"]["Tables"]["record_share_requests"]["Row"] & {
          businesses: { name: string } | null
          pets: { name: string } | null
        }
      >
      return rows.map((r) => ({
        id: r.id,
        businessName: r.businesses?.name ?? "A practice",
        petName: r.pets?.name ?? "your pet",
        scopes: r.scopes ?? [],
        message: r.message,
      }))
    },
    [],
  )
}

export async function decideShareRequest(
  requestId: string,
  approve: boolean,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("owner_decide_share_request", {
    p_request: requestId,
    p_approve: approve,
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  return { error: out.ok ? null : sentenceFor(out.error) }
}

/* ---------------------------- records back ------------------------------ */

export interface ClinicRecord {
  id: string
  title: string
  summary: string | null
  sourceKind: string
  publishedAt: string
  businessName: string
  petId: string
  petName: string
}

/** What practices have handed back — the attested half of the timeline. */
export function useClinicRecords(petId?: string | null): LiveResult<ClinicRecord[]> {
  return useLive<ClinicRecord[]>(
    [],
    async (db) => {
      const { data: auth } = await db.auth.getUser()
      const uid = auth.user?.id
      if (!uid) return []
      let q = db
        .from("record_publications")
        .select("*, businesses(name), pets!inner(id, name, owner_id)")
        .eq("pets.owner_id", uid)
        .is("withdrawn_at", null)
        .order("published_at", { ascending: false })
        .limit(100)
      if (petId) q = q.eq("pet_id", petId)
      const rows = must(await q) as Array<
        Database["public"]["Tables"]["record_publications"]["Row"] & {
          businesses: { name: string } | null
          pets: { id: string; name: string } | null
        }
      >
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        summary: r.summary,
        sourceKind: r.source_kind,
        publishedAt: r.published_at,
        businessName: r.businesses?.name ?? "Practice",
        petId: r.pet_id,
        petName: r.pets?.name ?? "Pet",
      }))
    },
    [petId ?? ""],
  )
}

/* --------------------------- appointments ------------------------------- */

export interface OwnerAppointment {
  id: string
  startsAt: string
  endsAt: string
  status: string
  reason: string | null
  businessName: string
  petName: string
}

export function useMyVetAppointments(): LiveResult<OwnerAppointment[]> {
  return useLive<OwnerAppointment[]>(
    [],
    async (db) => {
      const { data: auth } = await db.auth.getUser()
      const uid = auth.user?.id
      if (!uid) return []
      const rows = must(
        await db
          .from("appointments")
          .select("*, businesses(name), clinic_patients!inner(name, pets!inner(owner_id))")
          .eq("clinic_patients.pets.owner_id", uid)
          .gte("starts_at", new Date(Date.now() - 30 * 86400_000).toISOString())
          .order("starts_at")
          .limit(50),
      ) as Array<
        Database["public"]["Tables"]["appointments"]["Row"] & {
          businesses: { name: string } | null
          clinic_patients: { name: string } | null
        }
      >
      return rows.map((r) => ({
        id: r.id,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        status: r.status,
        reason: r.reason,
        businessName: r.businesses?.name ?? "Practice",
        petName: r.clinic_patients?.name ?? "Pet",
      }))
    },
    [],
  )
}

export async function bookVetAppointment(input: {
  businessId: string
  typeId: string
  petId: string
  startsAt: string
  staffId?: string | null
  note?: string
  share: boolean
}): Promise<{ error: string | null; status?: string }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("owner_book_appointment", {
    p_business: input.businessId,
    p_type: input.typeId,
    p_pet: input.petId,
    p_starts_at: input.startsAt,
    p_staff: input.staffId ?? undefined,
    p_note: input.note ?? undefined,
    p_share: input.share,
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  if (!out.ok) return { error: sentenceFor(out.error) }
  return { error: null, status: out.status as string }
}

/** "Tell them I am coming" — one tap from the emergency card. */
export async function notifyArrival(
  businessId: string,
  petId: string,
  problem: string,
  etaMinutes?: number,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("owner_notify_arrival", {
    p_business: businessId,
    p_pet: petId,
    p_problem: problem,
    p_eta_minutes: etaMinutes ?? undefined,
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  return { error: out.ok ? null : sentenceFor(out.error) }
}

export async function unlinkPatient(patientId: string): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("owner_unlink_patient", { p_patient: patientId })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  return { error: out.ok ? null : sentenceFor(out.error) }
}
