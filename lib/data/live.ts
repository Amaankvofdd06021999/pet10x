"use client"

/**
 * Pet10x — LIVE data layer (pets + care logging).
 *
 * Dual-mode: when Supabase is configured these read/write the real database
 * (the signed-in owner's pets + care_entries / care_targets); otherwise they
 * fall back to the consolidated mock data so the app still renders offline.
 *
 * Hooks fetch on mount and expose `refetch`. The app shell remounts screens on
 * navigation, so cross-screen freshness comes "for free" — no global cache.
 */

import { useCallback, useEffect, useReducer, useState } from "react"
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { petFileSignedUrls, isStoragePath, uploadPetFile, deletePetFile } from "@/lib/supabase/storage"
import type { Database } from "@/lib/supabase/database.types"
import { PETS as MOCK_PETS } from "./mock-data"
import type {
  BuildingLink,
  CareEntry,
  CareEntryKind,
  CareTarget,
  ManagerPet,
  Pet,
  PetContact,
  PetDoc,
  PetDocKind,
  PetStatus,
  PetVaccinationRecord,
  ResidentLinkRow,
  ResidentLinkStatus,
  Species,
} from "./types"

interface BuildingRules {
  require_rabies?: boolean
  require_core_vaccines?: boolean
  require_license?: boolean
  require_insurance?: boolean
  require_spay_neuter?: boolean
}

function computeCompliance(
  pet: { neutered: boolean | null; vax: { name: string; status: string }[]; docs: { kind: string }[] },
  rules: BuildingRules,
): { pct: number; missing: string[] } {
  const checks: { ok: boolean; label: string }[] = []
  const badVax = ["expired", "missing", "rejected"]
  if (rules.require_rabies)
    checks.push({ ok: pet.vax.some((v) => /rabies/i.test(v.name) && !badVax.includes(v.status)), label: "Rabies" })
  if (rules.require_core_vaccines)
    checks.push({ ok: pet.vax.some((v) => !badVax.includes(v.status)), label: "Core vaccines" })
  if (rules.require_license) checks.push({ ok: pet.docs.some((d) => d.kind === "municipal_license"), label: "License" })
  if (rules.require_insurance) checks.push({ ok: pet.docs.some((d) => d.kind === "liability_insurance"), label: "Insurance" })
  if (rules.require_spay_neuter) checks.push({ ok: !!pet.neutered, label: "Spay/neuter" })
  if (checks.length === 0) return { pct: 100, missing: [] }
  const met = checks.filter((c) => c.ok).length
  return { pct: Math.round((met / checks.length) * 100), missing: checks.filter((c) => !c.ok).map((c) => c.label) }
}

export function useBuildingPets(): LiveResult<ManagerPet[]> {
  const [data, setData] = useState<ManagerPet[]>([])
  const [isLoading, setLoading] = useState(ENABLED)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    if (!ENABLED) {
      setLoading(false)
      return
    }
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data: blds } = await supabase.from("buildings").select("id, pet_rules")
    const rulesByBuilding = new Map<string, BuildingRules>()
    for (const b of blds ?? []) rulesByBuilding.set(b.id, (b.pet_rules as BuildingRules) ?? {})
    const { data: rows, error: err } = await supabase
      .from("pets")
      .select("id, owner_id, building_id, name, species, breed, neutered, pet_vaccinations(name, status), pet_documents(kind)")
      .not("building_id", "is", null)
      .is("deleted_at", null)
    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }
    setData(
      (rows ?? []).map((r) => {
        const rules = r.building_id ? rulesByBuilding.get(r.building_id) ?? {} : {}
        const vax = (r.pet_vaccinations as { name: string; status: string }[] | null) ?? []
        const docs = (r.pet_documents as { kind: string }[] | null) ?? []
        const { pct, missing } = computeCompliance({ neutered: r.neutered, vax, docs }, rules)
        return {
          id: r.id,
          ownerId: r.owner_id,
          buildingId: r.building_id,
          name: r.name,
          species: r.species as Species,
          breed: r.breed ?? "",
          compliancePct: pct,
          missing,
        }
      }),
    )
    setError(null)
    setLoading(false)
  }, [])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

const ENABLED = isSupabaseConfigured()

type PetRow = Database["public"]["Tables"]["pets"]["Row"]
type CareEntryRow = Database["public"]["Tables"]["care_entries"]["Row"]
type CareTargetRow = Database["public"]["Tables"]["care_targets"]["Row"]
type PetSex = Database["public"]["Enums"]["pet_sex"]

export interface LiveResult<T> {
  data: T
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/* ------------------------------- mappers -------------------------------- */

const STATUS_MAP: Record<string, PetStatus> = {
  home: "home",
  away: "away",
  at_vet: "at-vet",
  vacation: "vacation",
  deceased: "away",
}

function computeAge(dob: string): string | undefined {
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return undefined
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  let months = now.getMonth() - birth.getMonth()
  if (now.getDate() < birth.getDate()) months--
  if (months < 0) {
    years--
    months += 12
  }
  if (years <= 0) return `${Math.max(0, months)} mo`
  return months > 0 ? `${years} yr ${months} mo` : `${years} yr`
}

function mapPet(r: PetRow): Pet {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    species: r.species as Species,
    breed: r.breed ?? "",
    status: STATUS_MAP[r.status] ?? "home",
    image: r.image_url || "/placeholder.svg",
    compliance: r.compliance_pct ?? 0,
    dob: r.dob ?? undefined,
    age: r.dob ? computeAge(r.dob) : undefined,
    gender: r.sex === "male" ? "Male" : r.sex === "female" ? "Female" : "Unknown",
    weight: r.weight_grams ? `${(r.weight_grams / 1000).toFixed(1)} kg` : undefined,
    color: r.color ?? undefined,
    microchip: r.microchip ?? undefined,
    neutered: r.neutered ?? undefined,
    medical: {
      conditions: r.conditions ?? "",
      medications: r.medications_notes ?? "",
      allergies: r.allergies ?? "",
      behavioralNotes: r.behavioral_notes ?? "",
      vetClinic: r.vet_clinic ?? "",
      vetName: r.vet_name ?? "",
      vetPhone: r.vet_phone ?? "",
    },
  }
}

function mapCareEntry(r: CareEntryRow): CareEntry {
  return {
    id: r.id,
    petId: r.pet_id,
    kind: r.kind,
    label: r.label ?? undefined,
    amount: r.amount,
    unit: r.unit,
    note: r.note,
    loggedAt: r.logged_at,
  }
}

/* -------------------------------- pets ---------------------------------- */

/**
 * Shared pets cache — pets are read by Home, Profile, Pet Detail and Trackers.
 * The app shell remounts screens on navigation, so without a cache each tab
 * switch re-fetched pets AND re-signed photo URLs (visible lag). We fetch once,
 * share via a module-level store, and only re-fetch on an explicit refresh
 * (mutations) or after sign-out.
 */
let petsCache: Pet[] | null = null
let petsError: string | null = null
let petsInFlight: Promise<void> | null = null
const petsSubs = new Set<() => void>()

function notifyPets() {
  petsSubs.forEach((fn) => fn())
}

async function loadPetsInto(): Promise<void> {
  if (!ENABLED) {
    petsCache = MOCK_PETS
    notifyPets()
    return
  }
  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    petsCache = []
    notifyPets()
    return
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    petsCache = []
    petsError = null
    notifyPets()
    return
  }
  const { data: rows, error } = await supabase
    .from("pets")
    .select("*")
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
  if (error) {
    petsError = error.message
    petsCache = []
  } else {
    const mapped = (rows ?? []).map(mapPet)
    const paths = mapped.filter((p) => isStoragePath(p.image)).map((p) => p.image)
    if (paths.length) {
      const urls = await petFileSignedUrls(paths)
      for (const p of mapped) {
        if (isStoragePath(p.image)) p.image = urls[p.image] ?? "/placeholder.svg"
      }
    }
    petsCache = mapped
    petsError = null
  }
  notifyPets()
}

/** Force-refresh the shared pets cache (called after mutations). */
export function refreshPets(): Promise<void> {
  petsInFlight = loadPetsInto().finally(() => {
    petsInFlight = null
  })
  return petsInFlight
}

/** Clear the cache (call on sign-out so the next user doesn't see stale pets). */
export function clearPetsCache() {
  petsCache = null
  petsError = null
  notifyPets()
}

export function usePets(): LiveResult<Pet[]> {
  const [, force] = useReducer((c: number) => c + 1, 0)
  useEffect(() => {
    petsSubs.add(force)
    if (petsCache === null && !petsInFlight) void refreshPets()
    return () => {
      petsSubs.delete(force)
    }
  }, [])
  return {
    data: petsCache ?? (ENABLED ? [] : MOCK_PETS),
    isLoading: ENABLED && petsCache === null,
    error: petsError,
    refetch: refreshPets,
  }
}

/** A single pet by id — defaults to the owner's first pet. */
export function usePet(petId?: string): LiveResult<Pet | null> {
  const pets = usePets()
  const pet = petId ? pets.data.find((p) => p.id === petId) ?? null : pets.data[0] ?? null
  return { data: pet, isLoading: pets.isLoading, error: pets.error, refetch: pets.refetch }
}

export interface AddPetInput {
  name: string
  species: Species
  breed?: string
  dob?: string
  sex?: PetSex
  weightKg?: number
  color?: string
  microchip?: string
  neutered?: boolean
}

export async function addPet(input: AddPetInput): Promise<{ error: string | null; pet?: Pet }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Pets can't be saved right now — backend not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "You must be signed in to add a pet." }
  const { data, error } = await supabase
    .from("pets")
    .insert({
      owner_id: user.id,
      name: input.name,
      species: input.species,
      breed: input.breed || null,
      dob: input.dob || null,
      sex: input.sex ?? null,
      weight_grams: input.weightKg ? Math.round(input.weightKg * 1000) : null,
      color: input.color || null,
      microchip: input.microchip || null,
      neutered: input.neutered ?? null,
    })
    .select()
    .single()
  if (error) return { error: error.message }
  await refreshPets()
  return { error: null, pet: mapPet(data) }
}

export async function updatePet(
  petId: string,
  patch: Partial<{
    name: string
    breed: string | null
    dob: string | null
    sex: PetSex | null
    weightKg: number | null
    color: string | null
    microchip: string | null
    neutered: boolean | null
    status: PetStatus
    conditions: string | null
    medications: string | null
    allergies: string | null
    behavioralNotes: string | null
    vetClinic: string | null
    vetName: string | null
    vetPhone: string | null
  }>,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const db: Database["public"]["Tables"]["pets"]["Update"] = {}
  if (patch.name !== undefined) db.name = patch.name
  if (patch.breed !== undefined) db.breed = patch.breed
  if (patch.dob !== undefined) db.dob = patch.dob
  if (patch.sex !== undefined) db.sex = patch.sex
  if (patch.weightKg !== undefined) db.weight_grams = patch.weightKg == null ? null : Math.round(patch.weightKg * 1000)
  if (patch.color !== undefined) db.color = patch.color
  if (patch.microchip !== undefined) db.microchip = patch.microchip
  if (patch.neutered !== undefined) db.neutered = patch.neutered
  if (patch.conditions !== undefined) db.conditions = patch.conditions
  if (patch.medications !== undefined) db.medications_notes = patch.medications
  if (patch.allergies !== undefined) db.allergies = patch.allergies
  if (patch.behavioralNotes !== undefined) db.behavioral_notes = patch.behavioralNotes
  if (patch.vetClinic !== undefined) db.vet_clinic = patch.vetClinic
  if (patch.vetName !== undefined) db.vet_name = patch.vetName
  if (patch.vetPhone !== undefined) db.vet_phone = patch.vetPhone
  if (patch.status !== undefined) {
    const rev: Record<PetStatus, Database["public"]["Enums"]["pet_status"]> = {
      home: "home",
      away: "away",
      "at-vet": "at_vet",
      vacation: "vacation",
    }
    db.status = rev[patch.status]
  }
  const { error } = await supabase.from("pets").update(db).eq("id", petId)
  if (!error) await refreshPets()
  return { error: error?.message ?? null }
}

export async function setPetPhoto(petId: string, file: File): Promise<{ error: string | null }> {
  const { path, error } = await uploadPetFile({ petId, file, prefix: "photo" })
  if (error || !path) return { error: error ?? "Upload failed." }
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error: uerr } = await supabase.from("pets").update({ image_url: path }).eq("id", petId)
  if (!uerr) await refreshPets()
  return { error: uerr?.message ?? null }
}

/* ---------------------- pet documents / vax / contacts ------------------ */

function docStatusFromExpiry(expiresOn?: string | null): Database["public"]["Enums"]["doc_status"] {
  if (!expiresOn) return "active"
  const exp = new Date(expiresOn).getTime()
  if (Number.isNaN(exp)) return "active"
  const now = Date.now()
  if (exp < now) return "expired"
  if (exp < now + 30 * 86_400_000) return "expiring"
  return "current"
}

type DocRow = Database["public"]["Tables"]["pet_documents"]["Row"]
type VaxRow = Database["public"]["Tables"]["pet_vaccinations"]["Row"]
type ContactRow = Database["public"]["Tables"]["pet_emergency_contacts"]["Row"]

export function usePetDocuments(petId?: string): LiveResult<PetDoc[]> {
  const [data, setData] = useState<PetDoc[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !petId) {
      setData([])
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("pet_documents")
      .select("*")
      .eq("pet_id", petId)
      .order("created_at", { ascending: false })
    if (err) setError(err.message)
    else {
      setData(
        (rows ?? []).map((r: DocRow) => ({
          id: r.id,
          petId: r.pet_id ?? petId,
          kind: r.kind as PetDocKind,
          name: r.name,
          status: r.status,
          storagePath: r.storage_path,
          expiresOn: r.expires_on,
          verifiedAt: r.verified_at,
        })),
      )
      setError(null)
    }
    setLoading(false)
  }, [petId])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

export async function addPetDocument(input: {
  petId: string
  kind: PetDocKind
  name?: string
  file?: File
  expiresOn?: string | null
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  let storagePath: string | null = null
  if (input.file) {
    const up = await uploadPetFile({ petId: input.petId, file: input.file, prefix: input.kind })
    if (up.error) return { error: up.error }
    storagePath = up.path
  }
  const { error } = await supabase.from("pet_documents").insert({
    pet_id: input.petId,
    kind: input.kind,
    name: input.name || null,
    storage_path: storagePath,
    expires_on: input.expiresOn || null,
    status: docStatusFromExpiry(input.expiresOn),
  })
  return { error: error?.message ?? null }
}

export async function deletePetDocument(doc: PetDoc): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  if (doc.storagePath) await deletePetFile(doc.storagePath)
  const { error } = await supabase.from("pet_documents").delete().eq("id", doc.id)
  return { error: error?.message ?? null }
}

export function usePetVaccinations(petId?: string): LiveResult<PetVaccinationRecord[]> {
  const [data, setData] = useState<PetVaccinationRecord[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !petId) {
      setData([])
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("pet_vaccinations")
      .select("*")
      .eq("pet_id", petId)
      .order("expires_on", { ascending: true, nullsFirst: false })
    if (err) setError(err.message)
    else {
      setData(
        (rows ?? []).map((r: VaxRow) => ({
          id: r.id,
          petId: r.pet_id,
          name: r.name,
          givenOn: r.given_on,
          expiresOn: r.expires_on,
          status: r.status,
        })),
      )
      setError(null)
    }
    setLoading(false)
  }, [petId])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

export async function addPetVaccination(input: {
  petId: string
  name: string
  givenOn?: string | null
  expiresOn?: string | null
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("pet_vaccinations").insert({
    pet_id: input.petId,
    name: input.name,
    given_on: input.givenOn || null,
    expires_on: input.expiresOn || null,
    status: docStatusFromExpiry(input.expiresOn),
  })
  return { error: error?.message ?? null }
}

export async function deletePetVaccination(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("pet_vaccinations").delete().eq("id", id)
  return { error: error?.message ?? null }
}

export function usePetEmergencyContacts(petId?: string): LiveResult<PetContact[]> {
  const [data, setData] = useState<PetContact[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !petId) {
      setData([])
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("pet_emergency_contacts")
      .select("*")
      .eq("pet_id", petId)
      .order("sort_order", { ascending: true, nullsFirst: false })
    if (err) setError(err.message)
    else {
      setData(
        (rows ?? []).map((r: ContactRow) => ({
          id: r.id,
          petId: r.pet_id,
          role: r.role,
          name: r.name,
          phone: r.phone,
          sortOrder: r.sort_order,
        })),
      )
      setError(null)
    }
    setLoading(false)
  }, [petId])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

export async function addPetContact(input: {
  petId: string
  role: string
  name: string
  phone: string
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("pet_emergency_contacts").insert({
    pet_id: input.petId,
    role: input.role,
    name: input.name,
    phone: input.phone,
  })
  return { error: error?.message ?? null }
}

export async function deletePetContact(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("pet_emergency_contacts").delete().eq("id", id)
  return { error: error?.message ?? null }
}

/* ------------------------------ care log -------------------------------- */

export function useCareEntries(petId: string | undefined, kind: CareEntryKind): LiveResult<CareEntry[]> {
  const [data, setData] = useState<CareEntry[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !petId) {
      setData([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: rows, error: err } = await supabase
      .from("care_entries")
      .select("*")
      .eq("pet_id", petId)
      .eq("kind", kind)
      .order("logged_at", { ascending: false })
      .limit(100)
    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData((rows ?? []).map(mapCareEntry))
      setError(null)
    }
    setLoading(false)
  }, [petId, kind])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

export async function addCareEntry(input: {
  petId: string
  kind: CareEntryKind
  label?: string
  amount?: number | null
  unit?: string | null
  note?: string | null
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not saved — backend not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { error } = await supabase.from("care_entries").insert({
    pet_id: input.petId,
    kind: input.kind,
    label: input.label || null,
    amount: input.amount ?? null,
    unit: input.unit || null,
    note: input.note || null,
    logged_by: user?.id ?? null,
  })
  return { error: error?.message ?? null }
}

export async function deleteCareEntry(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("care_entries").delete().eq("id", id)
  return { error: error?.message ?? null }
}

/* ----------------------------- care targets ----------------------------- */

export function useCareTargets(petId: string | undefined): LiveResult<Record<string, CareTarget>> {
  const [data, setData] = useState<Record<string, CareTarget>>({})
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !petId) {
      setData({})
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase.from("care_targets").select("*").eq("pet_id", petId)
    if (err) {
      setError(err.message)
    } else {
      const map: Record<string, CareTarget> = {}
      for (const r of (rows ?? []) as CareTargetRow[]) {
        map[r.kind] = { kind: r.kind, targetAmount: r.target_amount, unit: r.unit }
      }
      setData(map)
      setError(null)
    }
    setLoading(false)
  }, [petId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

export async function setCareTarget(
  petId: string,
  kind: CareEntryKind,
  targetAmount: number | null,
  unit: string | null,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase
    .from("care_targets")
    .upsert({ pet_id: petId, kind, target_amount: targetAmount, unit }, { onConflict: "pet_id,kind" })
  return { error: error?.message ?? null }
}

/* -------------------------- building membership ------------------------- */

export async function requestBuildingLink(
  code: string,
): Promise<{ ok: boolean; error?: string; buildingName?: string; status?: string; already?: boolean }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { ok: false, error: "Not configured." }
  const { data, error } = await supabase.rpc("request_building_link", { p_code: code })
  if (error) return { ok: false, error: error.message }
  const r = (data ?? {}) as { ok: boolean; error?: string; building_name?: string; status?: string; already?: boolean }
  if (!r.ok) {
    return {
      ok: false,
      error: r.error === "invalid_code" ? "That building code wasn't found — check with your management." : "Couldn't link to that building.",
    }
  }
  return { ok: true, buildingName: r.building_name, status: r.status, already: r.already }
}

export function useMyBuildingLink(): LiveResult<BuildingLink | null> {
  const [data, setData] = useState<BuildingLink | null>(null)
  const [isLoading, setLoading] = useState(ENABLED)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    if (!ENABLED) {
      setLoading(false)
      return
    }
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setData(null)
      setLoading(false)
      return
    }
    const { data: json, error: err } = await supabase.rpc("my_building_link")
    if (err) {
      setError(err.message)
      setData(null)
    } else if (json) {
      const j = json as {
        link_id: string
        building_id: string
        building_name: string
        status: ResidentLinkStatus
        unit: string | null
        requested_at: string
      }
      setData({
        linkId: j.link_id,
        buildingId: j.building_id,
        buildingName: j.building_name,
        status: j.status,
        unit: j.unit,
        requestedAt: j.requested_at,
      })
    } else {
      setData(null)
    }
    setLoading(false)
  }, [])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

export async function leaveBuilding(): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.rpc("leave_my_building_link")
  return { error: error?.message ?? null }
}

/* -------------------- manager: resident link queue ---------------------- */

export function useBuildingResidents(): LiveResult<ResidentLinkRow[]> {
  const [data, setData] = useState<ResidentLinkRow[]>([])
  const [isLoading, setLoading] = useState(ENABLED)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    if (!ENABLED) {
      setLoading(false)
      return
    }
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("resident_links")
      .select("id, profile_id, status, requested_at, units(unit_number), profiles!profile_id(full_name, email)")
      .in("status", ["pending", "approved"])
      .is("left_at", null)
      .order("requested_at", { ascending: false })
    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(
        (rows ?? []).map((r) => {
          const prof = r.profiles as { full_name: string | null; email: string | null } | null
          const unit = r.units as { unit_number: string } | null
          return {
            linkId: r.id,
            profileId: r.profile_id,
            status: r.status as ResidentLinkStatus,
            unit: unit?.unit_number ?? null,
            requestedAt: r.requested_at,
            residentName: prof?.full_name || prof?.email || "Resident",
            residentEmail: prof?.email ?? null,
          }
        }),
      )
      setError(null)
    }
    setLoading(false)
  }, [])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

async function decideLink(linkId: string, status: ResidentLinkStatus, left: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const patch: Database["public"]["Tables"]["resident_links"]["Update"] = {
    status,
    decided_at: new Date().toISOString(),
    decided_by: user?.id ?? null,
  }
  if (left) patch.left_at = new Date().toISOString()
  const { error } = await supabase.from("resident_links").update(patch).eq("id", linkId)
  return { error: error?.message ?? null }
}

export function approveResidentLink(linkId: string) {
  return decideLink(linkId, "approved", false)
}
export function denyResidentLink(linkId: string) {
  return decideLink(linkId, "denied", false)
}
export function removeResident(linkId: string) {
  return decideLink(linkId, "left", true)
}
