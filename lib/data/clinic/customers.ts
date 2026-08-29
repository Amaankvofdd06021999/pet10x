"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { useLive, must, readOutcome, sentenceFor, type LiveResult } from "./use-live"

type CustomerRow = Database["public"]["Tables"]["clinic_customers"]["Row"]
type PatientRow = Database["public"]["Tables"]["clinic_patients"]["Row"]

export interface ClinicCustomer {
  id: string
  firstName: string
  lastName: string | null
  fullName: string
  email: string | null
  phone: string | null
  city: string | null
  alertNote: string | null
  serviceReminders: boolean
  isLinked: boolean
  profileId: string | null
  patientCount: number
  patients: ClinicPatientSummary[]
}

export interface ClinicPatientSummary {
  id: string
  name: string
  species: string
  breed: string | null
  dob: string | null
  isDeceased: boolean
  isLinked: boolean
}

export interface ClinicPatient extends ClinicPatientSummary {
  customerId: string
  customerName: string
  customerPhone: string | null
  petId: string | null
  sex: string | null
  colour: string | null
  microchip: string | null
  weightGrams: number | null
  neutered: boolean | null
  allergies: string | null
  conditions: string | null
  medicationsNotes: string | null
  behaviouralAlert: string | null
  notes: string | null
}

function fullName(r: { first_name: string; last_name: string | null }): string {
  return [r.first_name, r.last_name].filter(Boolean).join(" ")
}

/** Search tolerates what reception hears on the phone: name, phone, or chip. */
export function useClinicCustomers(businessId: string | null, search: string): LiveResult<ClinicCustomer[]> {
  return useLive<ClinicCustomer[]>(
    [],
    async (db) => {
      let q = db
        .from("clinic_customers")
        .select("*, clinic_patients(id, name, species, breed, dob, is_deceased, pet_id)")
        .eq("business_id", businessId as string)
        .eq("is_active", true)
        .order("last_name", { nullsFirst: false })
        .limit(200)
      const term = search.trim()
      if (term) {
        const safe = term.replace(/[%,()]/g, " ")
        q = q.or(
          `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`,
        )
      }
      const rows = must(await q) as Array<
        CustomerRow & { clinic_patients: Array<Pick<PatientRow, "id" | "name" | "species" | "breed" | "dob" | "is_deceased" | "pet_id">> }
      >
      return rows.map((r) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        fullName: fullName(r),
        email: r.email,
        phone: r.phone,
        city: r.city,
        alertNote: r.alert_note,
        serviceReminders: r.service_reminders,
        isLinked: r.profile_id !== null,
        profileId: r.profile_id,
        patientCount: r.clinic_patients?.length ?? 0,
        patients: (r.clinic_patients ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          species: p.species,
          breed: p.breed,
          dob: p.dob,
          isDeceased: p.is_deceased,
          isLinked: p.pet_id !== null,
        })),
      }))
    },
    [businessId, search],
    Boolean(businessId),
  )
}

export function useClinicPatient(patientId: string | null): LiveResult<ClinicPatient | null> {
  return useLive<ClinicPatient | null>(
    null,
    async (db) => {
      const rows = must(
        await db
          .from("clinic_patients")
          .select("*, clinic_customers(id, first_name, last_name, phone)")
          .eq("id", patientId as string)
          .limit(1),
      ) as Array<PatientRow & { clinic_customers: Pick<CustomerRow, "id" | "first_name" | "last_name" | "phone"> | null }>
      const r = rows[0]
      if (!r) return null
      return {
        id: r.id,
        name: r.name,
        species: r.species,
        breed: r.breed,
        dob: r.dob,
        isDeceased: r.is_deceased,
        isLinked: r.pet_id !== null,
        customerId: r.customer_id,
        customerName: r.clinic_customers ? fullName(r.clinic_customers) : "Customer",
        customerPhone: r.clinic_customers?.phone ?? null,
        petId: r.pet_id,
        sex: r.sex,
        colour: r.colour,
        microchip: r.microchip,
        weightGrams: r.weight_grams,
        neutered: r.neutered,
        allergies: r.allergies,
        conditions: r.conditions,
        medicationsNotes: r.medications_notes,
        behaviouralAlert: r.behavioural_alert,
        notes: r.notes,
      }
    },
    [patientId],
    Boolean(patientId),
  )
}

export function useClinicPatients(businessId: string | null, search: string): LiveResult<ClinicPatient[]> {
  return useLive<ClinicPatient[]>(
    [],
    async (db) => {
      let q = db
        .from("clinic_patients")
        .select("*, clinic_customers(id, first_name, last_name, phone)")
        .eq("business_id", businessId as string)
        .eq("is_active", true)
        .order("name")
        .limit(200)
      const term = search.trim()
      if (term) {
        const safe = term.replace(/[%,()]/g, " ")
        q = q.or(`name.ilike.%${safe}%,microchip.ilike.%${safe}%,breed.ilike.%${safe}%`)
      }
      const rows = must(await q) as Array<
        PatientRow & { clinic_customers: Pick<CustomerRow, "id" | "first_name" | "last_name" | "phone"> | null }
      >
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        species: r.species,
        breed: r.breed,
        dob: r.dob,
        isDeceased: r.is_deceased,
        isLinked: r.pet_id !== null,
        customerId: r.customer_id,
        customerName: r.clinic_customers ? fullName(r.clinic_customers) : "Customer",
        customerPhone: r.clinic_customers?.phone ?? null,
        petId: r.pet_id,
        sex: r.sex,
        colour: r.colour,
        microchip: r.microchip,
        weightGrams: r.weight_grams,
        neutered: r.neutered,
        allergies: r.allergies,
        conditions: r.conditions,
        medicationsNotes: r.medications_notes,
        behaviouralAlert: r.behavioural_alert,
        notes: r.notes,
      }))
    },
    [businessId, search],
    Boolean(businessId),
  )
}

export interface NewCustomerInput {
  firstName: string
  lastName?: string
  email?: string
  phone?: string
  city?: string
  petName?: string
  species?: Database["public"]["Enums"]["pet_species"]
  breed?: string
}

/** Reception's fastest path: a person and their animal in one action. */
export async function createCustomerWithPatient(
  businessId: string,
  input: NewCustomerInput,
): Promise<{ error: string | null; customerId?: string; patientId?: string }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  if (!input.firstName.trim()) return { error: "A first name is required." }

  const { data: cust, error: cErr } = await db
    .from("clinic_customers")
    .insert({
      business_id: businessId,
      first_name: input.firstName.trim(),
      last_name: input.lastName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      city: input.city?.trim() || null,
    })
    .select("id")
    .single()
  if (cErr || !cust) return { error: cErr?.message ?? "Could not create the customer." }

  if (!input.petName?.trim()) return { error: null, customerId: cust.id }

  const { data: pat, error: pErr } = await db
    .from("clinic_patients")
    .insert({
      business_id: businessId,
      customer_id: cust.id,
      name: input.petName.trim(),
      species: input.species ?? "dog",
      breed: input.breed?.trim() || null,
    })
    .select("id")
    .single()
  if (pErr) return { error: pErr.message, customerId: cust.id }
  return { error: null, customerId: cust.id, patientId: pat?.id }
}

/** A household usually has more than one animal. */
export async function addPatientToCustomer(
  businessId: string,
  customerId: string,
  input: {
    name: string
    species?: Database["public"]["Enums"]["pet_species"]
    breed?: string
    dob?: string
    sex?: Database["public"]["Enums"]["pet_sex"]
    microchip?: string
  },
): Promise<{ error: string | null; patientId?: string }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  if (!input.name.trim()) return { error: "What is the animal called?" }
  const { data, error } = await db
    .from("clinic_patients")
    .insert({
      business_id: businessId,
      customer_id: customerId,
      name: input.name.trim(),
      species: input.species ?? "dog",
      breed: input.breed?.trim() || null,
      dob: input.dob || null,
      sex: input.sex ?? "unknown",
      microchip: input.microchip?.trim() || null,
    })
    .select("id")
    .single()
  if (error) return { error: error.message }
  return { error: null, patientId: data?.id }
}

/** Archiving keeps the history; deleting a customer would take the visits too. */
export async function archiveCustomer(id: string, archived = true): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { error } = await db.from("clinic_customers").update({ is_active: !archived }).eq("id", id)
  return { error: error?.message ?? null }
}

export async function updatePatient(
  id: string,
  patch: Database["public"]["Tables"]["clinic_patients"]["Update"],
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { error } = await db.from("clinic_patients").update(patch).eq("id", id)
  return { error: error?.message ?? null }
}

export async function updateCustomer(
  id: string,
  patch: Database["public"]["Tables"]["clinic_customers"]["Update"],
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { error } = await db.from("clinic_customers").update(patch).eq("id", id)
  return { error: error?.message ?? null }
}

/* --------------------------- shared records ----------------------------- */

export interface SharedRecord {
  ok: boolean
  linked: boolean
  shared: boolean
  scopes: string[]
  expiresAt: string | null
  error?: string
  data: {
    identity?: Record<string, unknown>
    health?: Record<string, string | null>
    vaccinations?: Array<Record<string, unknown>>
    documents?: Array<Record<string, unknown>>
    care_log?: Array<Record<string, unknown>>
    other_clinic_records?: Array<Record<string, unknown>>
  }
}

/**
 * The ONLY route to an owner's records. It checks the grant and writes an
 * access-log row in the same call, so "every read is logged" is true by
 * construction rather than by everyone remembering to log.
 */
export function useSharedRecord(patientId: string | null): LiveResult<SharedRecord | null> {
  return useLive<SharedRecord | null>(
    null,
    async (db) => {
      const { data, error } = await db.rpc("clinic_fetch_shared_record", { p_patient: patientId as string })
      if (error) throw new Error(error.message)
      const raw = readOutcome(data)
      if (!raw.ok) throw new Error(sentenceFor(raw.error))
      return {
        ok: true,
        linked: Boolean(raw.linked),
        shared: Boolean(raw.shared),
        scopes: (raw.scopes as string[]) ?? [],
        expiresAt: (raw.expires_at as string) ?? null,
        data: (raw.data as SharedRecord["data"]) ?? {},
      }
    },
    [patientId],
    Boolean(patientId),
  )
}

export async function requestRecordShare(
  businessId: string,
  patientId: string,
  petId: string,
  profileId: string,
  scopes: string[],
  message?: string,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { error } = await db.from("record_share_requests").insert({
    business_id: businessId,
    patient_id: patientId,
    pet_id: petId,
    profile_id: profileId,
    scopes,
    message: message ?? null,
  })
  return { error: error?.message ?? null }
}

/**
 * Ask the owner for the pet's details.
 *
 * One action for the practice; underneath it is a records request for a linked
 * patient and a link request for one that is not linked yet.
 */
export async function requestPetDetails(
  patientId: string,
  scopes?: string[],
  message?: string,
  email?: string,
): Promise<{ error: string | null; kind?: string; alreadyPending?: boolean; delivered?: boolean }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("clinic_request_pet_details", {
    p_patient: patientId,
    p_scopes: scopes ?? undefined,
    p_message: message ?? undefined,
    p_email: email ?? undefined,
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  if (!out.ok) {
    const code = out.error
    if (code === "already_shared") return { error: "This owner is already sharing with you." }
    if (code === "email_required") return { error: "Add an email to the customer first, so we know who to ask." }
    if (code === "not_permitted_for_type") return { error: "This kind of business cannot request pet records." }
    return { error: sentenceFor(code) }
  }
  return {
    error: null,
    kind: out.kind as string,
    alreadyPending: Boolean(out.already_pending),
    delivered: out.delivered !== false,
  }
}

export async function redeemDeskCode(
  businessId: string,
  code: string,
  patientId?: string,
): Promise<{ error: string | null; petId?: string }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("clinic_redeem_desk_code", {
    p_business: businessId,
    p_code: code,
    p_patient: patientId ?? undefined,
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  if (!out.ok) return { error: sentenceFor(out.error) }
  return { error: null, petId: out.pet_id as string }
}
