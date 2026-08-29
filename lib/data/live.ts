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
import { petFileSignedUrls, signedUrlsIn, isStoragePath, uploadPetFile, deletePetFile } from "@/lib/supabase/storage"
import type { Database } from "@/lib/supabase/database.types"
import { daysUntil, parseDbDate } from "@/lib/dates"
import { PETS as MOCK_PETS } from "./mock-data"
import { defaultTargetsFor, defaultScheduleFor } from "./care-catalog"
import { describeWhyNot } from "./disputes"
import { toViolationStage } from "./violations"
import { formatReward } from "./community"
import { uploadCommunityImage } from "./community-media"
import type {
  AppNotification,
  BuildingLink,
  CareEntry,
  CareEntryKind,
  CareTarget,
  CommunityEvent,
  CommunityPost,
  LostFoundItem,
  LostFoundType,
  ManagerPet,
  Pet,
  PetContact,
  PetDoc,
  PetDocKind,
  PetStatus,
  PetVaccinationRecord,
  DisputeOutcome,
  ResidentCase,
  ResidentLinkRow,
  ResidentLinkStatus,
  Species,
  ViolationStage,
} from "./types"

export interface BuildingRules {
  require_rabies?: boolean
  require_core_vaccines?: boolean
  require_license?: boolean
  require_insurance?: boolean
  require_spay_neuter?: boolean
}

/**
 * Canonical compliance calculation — the single source of truth reused by the
 * manager dashboard, the strata portfolio overview, and the bylaws impact
 * preview. A vaccination counts unless its status is expired/missing/rejected;
 * license/insurance are matched by document kind; spay_neuter by the flag.
 */
export function computeCompliance(
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

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

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

/* Keyed on the ENUM. Same reason as NOTIF_ICON below and
 * INCIDENT_STATUS_STYLE in incident-card.tsx: as `Record<string, PetStatus>` a
 * sixth `pet_status` label compiled and then silently mapped to `undefined`. */
const STATUS_MAP: Record<Database["public"]["Enums"]["pet_status"], PetStatus> = {
  home: "home",
  away: "away",
  at_vet: "at-vet",
  vacation: "vacation",
  deceased: "away",
}

/*
 * `pets.date_of_birth` is a `date`, and everything below it reads LOCAL parts
 * (`getFullYear`, `getMonth`, `getDate`). Parsed bare it was a UTC midnight, so
 * west of Greenwich the local date was the day before and a pet born on the 1st
 * aged from the last day of the previous month. Cosmetic — it moves a month
 * boundary by a day, never a year — but it is the same rule as the two above,
 * and using the module costs one word.
 */
function computeAge(dob: string): string | undefined {
  const birth = parseDbDate(dob)
  if (birth === null) return undefined
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
    sizeBand: r.size_band ?? undefined,
    heightCm: r.height_cm ?? undefined,
    restraints: r.restraints ?? [],
    dietType: r.diet_type ?? undefined,
    dietNotes: r.diet_notes ?? undefined,
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
    /* Tie-break, because created_at is NOT unique.
     *
     * A household registered in one sitting — or seeded in one statement, as
     * every demo household is — gets identical created_at values, and Postgres
     * is then free to return them in any order it likes, differing between
     * queries. That made `pets[0]` genuinely non-deterministic: Home could show
     * a different pet's care on two consecutive loads with nothing changed.
     * It also matters now that this order decides which pet a schedule group
     * lists first and which pet a lost selection falls back to. */
    .order("id", { ascending: true })
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
  sizeBand?: string | null
  /** Stored in cm; the form collects inches because size charts are in inches. */
  heightCm?: number | null
  restraints?: string[]
  dietType?: string | null
  dietNotes?: string | null
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
      size_band: input.sizeBand || null,
      height_cm: input.heightCm ?? null,
      restraints: input.restraints ?? [],
      diet_type: input.dietType || null,
      diet_notes: input.dietNotes || null,
    })
    .select()
    .single()
  if (error) return { error: error.message }

  /* Seed the tracker so it is not empty on first open.
   *
   * An empty tracker asks the owner to invent a routine before they know what
   * the app does. A seeded one is something to correct, which is far easier —
   * and correcting is exactly what the numbers are for. Species-specific, so a
   * cat gets meals-in-cans and playtime rather than a dog's two walks.
   *
   * Best-effort: a pet that exists with no defaults is a minor annoyance, a
   * failed registration because a default could not be written is not. */
  await seedCareDefaults(data.id, input.species).catch((e) =>
    console.error("[addPet] could not seed care defaults", e),
  )

  await refreshPets()
  return { error: null, pet: mapPet(data) }
}

/** Species-appropriate starting targets and schedule for a brand-new pet. */
async function seedCareDefaults(petId: string, species: Species): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return

  const targets = defaultTargetsFor(species)
  // Insert with `select` so the schedule below can point at the rows created —
  // a seeded routine that is not wired to its own targets would ship the exact
  // disconnection this seeding exists to avoid.
  const byLabel = new Map<string, string>()
  if (targets.length > 0) {
    const { data: rows } = await supabase
      .from("care_targets")
      .insert(
        targets.map((t, i) => ({
          pet_id: petId,
          kind: t.kind as CareEntryKind,
          label: t.label,
          target_amount: t.amount,
          unit: t.unit,
          period: t.period,
          sort_order: i,
        })),
      )
      .select("id, label")
    for (const r of rows ?? []) byLabel.set(r.label, r.id)
  }

  const schedule = defaultScheduleFor(species)
  if (schedule.length > 0) {
    await supabase.from("pet_care_tasks").insert(
      schedule.map((t, i) => ({
        pet_id: petId,
        label: t.label,
        kind: t.kind,
        scheduled_at: t.at,
        time_label: t.at,
        sort_order: i,
        recurrence: "daily",
        target_id: t.targetLabel ? (byLabel.get(t.targetLabel) ?? null) : null,
        log_amount: t.targetLabel && byLabel.has(t.targetLabel) ? (t.logAmount ?? null) : null,
      })),
    )
  }
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

/**
 * A document's status from its expiry date — a COMPLIANCE BADGE, not a string.
 *
 * `pet_documents.expires_on` and `pet_vaccinations.expires_on` are both `date`
 * columns: bare `YYYY-MM-DD`, a square on a calendar. This function used to do
 * `new Date(expiresOn).getTime() < Date.now()`, comparing a UTC MIDNIGHT
 * against a local instant — so at UTC-7 a document expiring TODAY read
 * `expired` from local midnight until 17:00, and the resident's card and the
 * manager's queue both said their vaccination had lapsed while it had not.
 *
 * `daysUntil` keys both sides to the same local calendar day, so the day of
 * expiry is `0` and the boundary is stated in the same units the rule is
 * written in: a thing that expires today has NOT expired.
 *
 * THE 30-DAY BOUNDARY MOVED BY ONE DAY IN THAT REWRITE, DELIBERATELY, AND IT IS
 * SAID HERE BECAUSE A SILENT BOUNDARY MOVE IS INDISTINGUISHABLE FROM A SLIP.
 * The old test was `exp < now + 30 * 86_400_000` — strictly inside thirty days —
 * so a document expiring in EXACTLY thirty days badged `current`. `days <= 30`
 * badges it `expiring`. Day 30 changed sides; days 0-29 and 31+ did not.
 *
 * Inclusive is the one that matches the sentence the badge is a rendering of.
 * "Expiring within 30 days" includes the thirtieth day in every reading a
 * resident or a manager would give it, and the whole point of the rewrite was to
 * state the rule in the units it is written in rather than in milliseconds. The
 * exclusive form was also not a decision anybody made: it was what
 * `<` happened to mean once a 30-day offset had been added to an instant.
 *
 * It errs toward warning a day early, which is the direction a compliance badge
 * should err — the cost of `expiring` a day early is one day of a yellow chip,
 * and the cost of `current` a day late is a resident who thinks they have time.
 * Nothing else in the repo defines the window, so this function is the only
 * place the 30 is written down and there is nothing to keep in step with it.
 */
function docStatusFromExpiry(expiresOn?: string | null): Database["public"]["Enums"]["doc_status"] {
  if (!expiresOn) return "active"
  const days = daysUntil(expiresOn)
  if (days === null) return "active"
  if (days < 0) return "expired"
  if (days <= 30) return "expiring"
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

/**
 * Every target for a pet, as a LIST.
 *
 * Was a map keyed by kind, which quietly encoded the old one-target-per-kind
 * limit: a second medication overwrote the first in the map even once the
 * database allowed both.
 */
export function useCareTargets(petId: string | undefined): LiveResult<CareTarget[]> {
  const [data, setData] = useState<CareTarget[]>([])
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
      .from("care_targets")
      .select("*")
      .eq("pet_id", petId)
      .order("kind")
      .order("sort_order")
      .order("label")
    if (err) {
      setError(err.message)
    } else {
      setData((rows ?? []).map(mapCareTarget))
      setError(null)
    }
    setLoading(false)
  }, [petId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

function mapCareTarget(r: CareTargetRow): CareTarget {
  return {
    id: r.id,
    petId: r.pet_id,
    kind: r.kind as CareEntryKind,
    label: r.label,
    targetAmount: r.target_amount,
    unit: r.unit,
    period: (r.period === "week" ? "week" : "day"),
    sortOrder: r.sort_order ?? 0,
    isActive: r.is_active ?? true,
  }
}

/** Create a target, or update the one already carrying this label. */
export async function upsertCareTarget(input: {
  petId: string
  kind: CareEntryKind
  label: string
  targetAmount: number | null
  unit: string | null
  period?: "day" | "week"
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const label = input.label.trim()
  if (!label) return { error: "Give the target a name." }

  // Uniqueness in the database is on lower(btrim(label)) within (pet, kind),
  // so match the same way rather than creating a near-duplicate that differs
  // only by capitalisation.
  const { data: existing } = await supabase
    .from("care_targets")
    .select("id, label")
    .eq("pet_id", input.petId)
    .eq("kind", input.kind)

  const hit = (existing ?? []).find((r) => r.label.trim().toLowerCase() === label.toLowerCase())

  if (hit) {
    const { error } = await supabase
      .from("care_targets")
      .update({
        target_amount: input.targetAmount,
        unit: input.unit,
        period: input.period ?? "day",
        label,
        updated_at: new Date().toISOString(),
      })
      .eq("id", hit.id)
    return { error: error?.message ?? null }
  }

  const { error } = await supabase.from("care_targets").insert({
    pet_id: input.petId,
    kind: input.kind,
    label,
    target_amount: input.targetAmount,
    unit: input.unit,
    period: input.period ?? "day",
    sort_order: (existing ?? []).length,
  })
  return { error: error?.message ?? null }
}

export async function deleteCareTarget(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("care_targets").delete().eq("id", id)
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
        building_address: string | null
        building_city: string | null
        building_region: string | null
        building_postal_code: string | null
      }
      setData({
        linkId: j.link_id,
        buildingId: j.building_id,
        buildingName: j.building_name,
        status: j.status,
        unit: j.unit,
        requestedAt: j.requested_at,
        buildingAddress: j.building_address,
        buildingCity: j.building_city,
        buildingRegion: j.building_region,
        buildingPostalCode: j.building_postal_code,
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
      .select("id, profile_id, building_id, status, requested_at, info_requested_at, units(unit_number), profiles!profile_id(full_name, email, phone)")
      .in("status", ["pending", "approved"])
      .is("left_at", null)
      .order("requested_at", { ascending: false })
    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(
        (rows ?? []).map((r) => {
          const prof = r.profiles as {
            full_name: string | null
            email: string | null
            phone: string | null
          } | null
          const unit = r.units as { unit_number: string } | null
          return {
            linkId: r.id,
            profileId: r.profile_id,
            buildingId: r.building_id,
            status: r.status as ResidentLinkStatus,
            unit: unit?.unit_number ?? null,
            requestedAt: r.requested_at,
            residentName: prof?.full_name || prof?.email || "Resident",
            residentEmail: prof?.email ?? null,
            residentPhone: prof?.phone ?? null,
            infoRequestedAt: r.info_requested_at ?? null,
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

/* ----------------------------- notifications ------------------------------ */

/**
 * Keyed on the ENUM, and that change found a live defect the moment it was made.
 *
 * As `Record<string, ...>` this map was missing `care` entirely, so every care
 * reminder fell through the `?? "alert"` default and rendered an AlertTriangle
 * — a hazard glyph on "Breakfast for max", every morning, since care reminders
 * shipped. `care` is not a rare kind: it is 157 of the 208 notifications in the
 * database (re-measured 2026-08-23) — three quarters of everything the Alerts
 * screen shows anybody. Nothing could have caught it, because
 * `Record<string, X>` accepts a map that is missing a key exactly as happily as
 * one that is complete.
 *
 * A correction to the first version of this note, which called it "the RED
 * AlertTriangle": the colour never came from here. The icon SHAPE comes from
 * `iconKey`; the colour comes from `SEVERITY_STYLES[severity]`
 * (`alerts-screen.tsx:34`), and all 157 live `care` rows are severity `info`,
 * which is `text-info`. It was a BLUE warning triangle. The wrong glyph is the
 * defect; the colour was an assumption, and stating it as a measurement is the
 * same failure this phase exists to remove.
 *
 * `calendar` because that is what these are: a scheduled care task falling due
 * today. Typed over the enum, an eighth `notification_kind` is now a compile
 * error here rather than another silent AlertTriangle.
 */
const NOTIF_ICON: Record<Database["public"]["Enums"]["notification_kind"], AppNotification["iconKey"]> = {
  compliance: "shield",
  incident: "alert",
  building: "calendar",
  billing: "file",
  community: "check",
  system: "alert",
  assistant: "sparkles",
  care: "calendar",
  appointment: "calendar",
  reminder: "calendar",
  clinic: "shield",
}

function mapNotification(row: {
  id: string
  /* The enum, not `string` — otherwise NOTIF_ICON below cannot be indexed by
     it, which is the whole point of typing that map over the enum. */
  kind: Database["public"]["Enums"]["notification_kind"]
  severity: string
  title: string
  body: string | null
  action_label: string | null
  action_target: string | null
  read_at: string | null
  created_at: string
}): AppNotification {
  const severity: AppNotification["severity"] = (["warning", "error", "info", "success"] as const).includes(
    row.severity as AppNotification["severity"],
  )
    ? (row.severity as AppNotification["severity"])
    : "info"
  const category: AppNotification["category"] = (["compliance", "incident", "building", "assistant", "care"] as const).includes(
    row.kind as AppNotification["category"],
  )
    ? (row.kind as AppNotification["category"])
    : "building"
  return {
    id: row.id,
    category,
    severity,
    title: row.title,
    body: row.body ?? "",
    time: timeAgo(row.created_at),
    read: !!row.read_at,
    actionLabel: row.action_label ?? undefined,
    /* Carried through raw. The screen, not this mapper, decides whether it is
       reachable — reachability depends on the persona being worn, which is not
       knowable here. See lib/navigation.ts. */
    actionTarget: row.action_target ?? undefined,
    iconKey: NOTIF_ICON[row.kind] ?? "alert",
  }
}

export function useNotifications(): LiveResult<AppNotification[]> {
  const [data, setData] = useState<AppNotification[]>([])
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

    /* Scope to the signed-in account explicitly.
     *
     * This used to select with no filter and let RLS do the narrowing, which
     * is correct for an ordinary user and wrong for a privileged one: the
     * notifications policy is `profile_id = auth.uid() OR is_admin()`, so an
     * account holding is_super_admin got EVERY user's notifications — which is
     * how building alerts addressed to managers appeared in a pet owner's
     * feed.
     *
     * RLS is a floor, not a WHERE clause. A query must ask for the rows it
     * actually wants; RLS then guarantees it cannot get more. */
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setData([])
      setLoading(false)
      return
    }

    const { data: rows, error: err } = await supabase
      .from("notifications")
      .select("id, kind, severity, title, body, action_label, action_target, read_at, created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData((rows ?? []).map(mapNotification))
      setError(null)
    }
    setLoading(false)
  }, [])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

export function useUnreadNotificationCount(): number {
  const { data } = useNotifications()
  return data.filter((n) => !n.read).length
}

export async function markNotificationRead(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null)
  return { error: error?.message ?? null }
}

/* ----------------------------- community feed ------------------------------ */

interface PostRow {
  id: string
  author_id: string | null
  category: string
  content: string
  image_url: string | null
  is_pinned: boolean
  is_official: boolean
  like_count: number
  comment_count: number
  created_at: string
}

/**
 * Who somebody is, as far as a community screen is concerned.
 *
 * NOT an embedded `profiles!fk(full_name, avatar_url)` join, and that is the
 * whole point. `profiles_select` is `(id = auth.uid()) OR is_admin() OR
 * <manager of their building>` — A RESIDENT MAY READ NO PROFILE BUT THEIR OWN —
 * so an embedded join returns NULL for every neighbour and the feed renders
 * every author as "Resident" with a placeholder avatar. Measured in a browser
 * with two real accounts; four clean gates had said nothing about it.
 *
 * `community_identities()` (20260826000005) is a SECURITY DEFINER function
 * returning exactly id, full_name and avatar_url for the caller's own
 * building's roster. It takes no arguments so it cannot be used as an oracle,
 * and it returns three columns so widening profiles_select — which would have
 * published every neighbour's address, phone and coordinates — was not needed.
 */
export interface CommunityIdentity {
  fullName: string | null
  avatarUrl: string | null
}

/**
 * Resolve whatever is in `profiles.avatar_url` into something `<Image src>` can
 * actually load.
 *
 * NOT `signedUrlsIn`, and the difference matters. `community_posts.image_url`
 * holds a path in the PRIVATE `community-media` bucket, so it is signed at read
 * time. `avatars` IS A PUBLIC BUCKET — verified against production, `public =
 * true` — and `createSignedUrl` is the wrong call for one: it costs a round
 * trip per render to mint a URL with an expiry that a public object does not
 * need and, on a bucket with no RLS gate to satisfy, buys nothing.
 *
 * The one writer today is `updateMyProfile` (lib/data/account.ts), which stores
 * `getPublicUrl(path).data.publicUrl` — an absolute `https://…`. `isStoragePath`
 * returns false for that, so it passes through untouched and this function is a
 * no-op on every one of the 48 rows currently on the platform, all of which are
 * NULL anyway.
 *
 * It exists for the OTHER shape. If anything ever stores a bare bucket path
 * here — which is what the rest of this codebase now does everywhere else, and
 * is the more likely direction of travel — the feed would render a broken
 * avatar for every neighbour, exactly the way `image_url` did before Phase 8.
 * Reading a column that can hold either shape, and discriminating with the
 * helper that already exists for the purpose, costs one branch. `getPublicUrl`
 * is synchronous and makes no request, so this stays inside the existing single
 * round trip.
 */
function resolveAvatarUrl(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  value: string | null,
): string | null {
  if (!isStoragePath(value)) return value ?? null
  return supabase.storage.from("avatars").getPublicUrl(value).data.publicUrl ?? null
}

async function communityIdentities(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
): Promise<Map<string, CommunityIdentity>> {
  const { data } = await supabase.rpc("community_identities")
  const map = new Map<string, CommunityIdentity>()
  for (const r of (data ?? []) as unknown as { id: string; full_name: string | null; avatar_url: string | null }[]) {
    map.set(r.id, { fullName: r.full_name, avatarUrl: resolveAvatarUrl(supabase, r.avatar_url) })
  }
  return map
}

function mapPost(
  row: PostRow,
  who: Map<string, CommunityIdentity>,
  liked: boolean,
  image: string | undefined,
): CommunityPost {
  const id = row.author_id ? who.get(row.author_id) : undefined
  return {
    id: row.id,
    authorId: row.author_id,
    /* "Resident" survives as the fallback for a post whose author has left the
     * building or deleted their account — author_id goes NULL by ON DELETE SET
     * NULL, which anonymises the post rather than destroying the thread. */
    author: id?.fullName ?? "Resident",
    avatar: id?.avatarUrl ?? "",
    time: timeAgo(row.created_at),
    category: row.category,
    content: row.content,
    image,
    likes: row.like_count,
    comments: row.comment_count,
    liked,
    isPinned: row.is_pinned,
    isOfficial: row.is_official,
  }
}

/** Where the viewer's community writes go, and which relationship put them there. */
export interface CommunityScope {
  buildingId: string
  buildingName: string | null
  /**
   * HOW the building was resolved — a resident link, or a manager row when
   * there was no resident link. For labelling only.
   *
   * NOT AN AUTHORITY. `via` answers "which building do I write into"; it does
   * NOT answer "may I moderate it", and using it for the second question is
   * what hid every manager control from a manager who lives in the building
   * they manage. Gate on `manages`.
   */
  via: "resident" | "manager"
  /**
   * Whether the viewer manages THIS building — the client's reading of
   * `manages_building(buildingId)`, which is what the database will actually
   * ask when the write lands.
   *
   * Separate from `via` because the two questions have different answers for
   * the same person. `via` is exclusive by construction (a resident link is
   * checked first, by design, so a person who is both reads their own feed as
   * a neighbour); manager authority is not exclusive of anything. Rachel
   * Torres manages Maple Court Residences and does not live there, so the bug
   * was invisible on this database until somebody held both relationships to
   * one building — at which point `community_posts_guard` says they may pin
   * and the screen renders no Pin button.
   *
   * This is NOT the ledgered multi-building case. A manager of five buildings
   * still gets a null scope from the branch below, because nothing here can
   * guess which of the five an announcement was meant for.
   */
  manages: boolean
}

/**
 * The building whose feed the viewer reads and writes.
 *
 * THIS USED TO BE RESIDENT-ONLY. `my_building_link()` reads `resident_links`,
 * so a MANAGER — who has a `building_managers` row and no resident link — got
 * null, and every community write refused with "Link your building before
 * posting to the community" while the screen showed them a "Post Official
 * Announcement" button. That was the behaviour for every manager on the
 * platform, on a screen that invited them to use it.
 *
 * Resident link first, because a person who is both should read their own
 * building's feed as a neighbour. A manager of more than one building gets null
 * rather than a guess: posting a Cedar Grove announcement into Harbour View is
 * worse than saying "pick a building" — and Dana Whitlock holds five on this
 * database, so this is not a hypothetical branch. `via` is returned so the
 * composer can label itself honestly.
 *
 * `manages` IS ASKED SEPARATELY, AND ALWAYS, and that is the fix for a manager
 * who is also a resident of the building they manage. The resident branch
 * returns first by design, so `via` is "resident" for that person and every
 * control gated on `via === "manager"` — Pin, the moderation sheet, the
 * announcement composer — disappeared for somebody the database says may use
 * them. One building held two ways is not the multi-building case; it is a
 * question the old shape could not express, because `via` is a single value
 * answering two questions.
 *
 * The query is scoped to the RESOLVED building, so it is the client's reading
 * of `manages_building(buildingId)` and nothing wider. A resident of Maple
 * Court who manages Cedar Grove gets manages:false here, which is correct: they
 * are a neighbour on this feed.
 */
async function currentScope(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
): Promise<CommunityScope | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase.rpc("my_building_link")
  const j = data as { building_id?: string; building_name?: string; status?: string } | null
  if (j && j.status === "approved" && j.building_id) {
    /* One extra round trip, on the ONE building we just resolved — not a list
     * of every building they manage. `head: true` with an exact count asks
     * "does this row exist" without shipping it. */
    const { count } = await supabase
      .from("building_managers")
      .select("building_id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .eq("building_id", j.building_id)
    return {
      buildingId: j.building_id,
      buildingName: j.building_name ?? null,
      via: "resident",
      manages: (count ?? 0) > 0,
    }
  }

  const { data: managed } = await supabase
    .from("building_managers")
    .select("building_id, buildings(name)")
    .eq("profile_id", user.id)
  if (!managed || managed.length !== 1) return null
  const row = managed[0] as unknown as { building_id: string; buildings: { name: string | null } | null }
  return { buildingId: row.building_id, buildingName: row.buildings?.name ?? null, via: "manager", manages: true }
}

export function useCommunityScope(): LiveResult<CommunityScope | null> {
  const [data, setData] = useState<CommunityScope | null>(null)
  const [isLoading, setLoading] = useState(ENABLED)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    if (!ENABLED) return setLoading(false)
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setLoading(false)
    setData(await currentScope(supabase))
    setError(null)
    setLoading(false)
  }, [])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

/**
 * Sign the stored image paths for a set of rows, in ONE round trip.
 *
 * `community_posts.image_url` and `lost_found.image_url` hold a storage PATH
 * from Phase 8 onward. Before Phase 8 `createCommunityPost` wrote a 365-DAY
 * SIGNED URL into that column — a dead link with a timer on it, embedding an
 * auth uid in a row every neighbour can select. `isStoragePath` is what tells
 * the two apart, and it is reused rather than re-spelled.
 */
async function signCommunityImages(values: (string | null)[]): Promise<Record<string, string>> {
  const paths = values.filter((v): v is string => isStoragePath(v))
  if (paths.length === 0) return {}
  return signedUrlsIn("community-media", paths)
}

export function useCommunityPosts(): LiveResult<CommunityPost[]> {
  const [data, setData] = useState<CommunityPost[]>([])
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
      setData([])
      setLoading(false)
      return
    }
    const scope = await currentScope(supabase)
    if (!scope) {
      setData([])
      setLoading(false)
      return
    }
    /* Name the building in the query. RLS IS THE FLOOR, THE QUERY IS THE FILTER
     * — the same correction useNotifications carries, for the same reason: a
     * privileged reader would otherwise get every building's feed. */
    const { data: rows, error: err } = await supabase
      .from("community_posts")
      .select(
        "id, author_id, category, content, image_url, is_pinned, is_official, like_count, comment_count, created_at",
      )
      .eq("building_id", scope.buildingId)
      .is("deleted_at", null)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }
    const ids = (rows ?? []).map((r) => r.id)
    let likedIds = new Set<string>()
    if (ids.length) {
      const { data: reactions } = await supabase
        .from("post_reactions")
        .select("post_id")
        .eq("profile_id", user.id)
        .in("post_id", ids)
      likedIds = new Set((reactions ?? []).map((r) => r.post_id))
    }
    const [signed, who] = await Promise.all([
      signCommunityImages((rows ?? []).map((r) => r.image_url)),
      communityIdentities(supabase),
    ])
    setData(
      (rows ?? []).map((r) => {
        const row = r as unknown as PostRow
        return mapPost(row, who, likedIds.has(row.id), row.image_url ? (signed[row.image_url] ?? undefined) : undefined)
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

/* -------------------------------- events -------------------------------- */

export function useEvents(): LiveResult<CommunityEvent[]> {
  const [data, setData] = useState<CommunityEvent[]>([])
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
    const scope = user ? await currentScope(supabase) : null
    if (!user || !scope) {
      setData([])
      setLoading(false)
      return
    }
    /* Yesterday onwards, so an event that started this morning is still on the
     * list for the people walking to it. */
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: rows, error: err } = await supabase
      .from("events")
      .select("id, title, category, starts_at, location, max_attendees, created_by")
      .eq("building_id", scope.buildingId)
      .gte("starts_at", since)
      .order("starts_at", { ascending: true })
    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }
    const ids = (rows ?? []).map((r) => r.id)
    /* The attendee list, readable at last: before `rsvps_read` (20260826000000)
     * the only policy on event_rsvps was `profile_id = auth.uid()`, so two RSVPs
     * on one event counted as ONE — to the resident AND to the manager. */
    const byEvent = new Map<string, { names: string[]; mine: boolean }>()
    if (ids.length) {
      const [{ data: rsvps }, who] = await Promise.all([
        supabase.from("event_rsvps").select("event_id, profile_id").in("event_id", ids),
        communityIdentities(supabase),
      ])
      for (const r of (rsvps ?? []) as unknown as { event_id: string; profile_id: string }[]) {
        const entry = byEvent.get(r.event_id) ?? { names: [], mine: false }
        entry.names.push(who.get(r.profile_id)?.fullName ?? "A neighbour")
        if (r.profile_id === user.id) entry.mine = true
        byEvent.set(r.event_id, entry)
      }
    }
    setData(
      (rows ?? []).map((r) => {
        const entry = byEvent.get(r.id) ?? { names: [], mine: false }
        return {
          id: r.id,
          title: r.title,
          startsAt: r.starts_at,
          location: r.location,
          attendees: entry.names.length,
          attendeeNames: entry.names,
          maxAttendees: r.max_attendees,
          category: r.category,
          createdBy: r.created_by,
          going: entry.mine,
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

/* ----------------------------- lost & found ------------------------------ */

export function useLostFound(): LiveResult<LostFoundItem[]> {
  const [data, setData] = useState<LostFoundItem[]>([])
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
    const scope = user ? await currentScope(supabase) : null
    if (!user || !scope) {
      setData([])
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("lost_found")
      .select("id, kind, pet_name, species, breed, color, last_seen, reward_cents, image_url, status, reporter_id, created_at")
      .eq("building_id", scope.buildingId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }
    const signed = await signCommunityImages((rows ?? []).map((r) => r.image_url))
    setData(
      (rows ?? []).map((r) => ({
        id: r.id,
        type: (r.kind === "found" ? "found" : "lost") as LostFoundType,
        petName: r.pet_name,
        species: r.species,
        breed: r.breed,
        color: r.color,
        lastSeen: r.last_seen,
        time: timeAgo(r.created_at),
        image: r.image_url ? (signed[r.image_url] ?? null) : null,
        rewardCents: r.reward_cents,
        reward: formatReward(r.reward_cents),
        status: (r.status === "resolved" ? "resolved" : "active") as "active" | "resolved",
        reporterId: r.reporter_id,
        buildingName: scope.buildingName,
        mine: r.reporter_id === user.id,
      })),
    )
    setError(null)
    setLoading(false)
  }, [])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

/* ------------------------------- mutations -------------------------------- */

export async function createCommunityPost(input: {
  content: string
  category: string
  imageFile?: File
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "You must be signed in." }
  const scope = await currentScope(supabase)
  if (!scope) return { error: "Link your building before posting to the community." }

  /* The PATH, not a URL. `image_url` used to receive a 365-day signed URL,
   * which embeds the uploader's auth uid in a row every neighbour can select
   * and expires while the post is still on the screen. The path is signed at
   * read time instead — the pattern petFileSignedUrls has always used. */
  let imagePath: string | undefined
  if (input.imageFile) {
    const { path, error: upErr } = await uploadCommunityImage("post", input.imageFile)
    if (upErr || !path) return { error: upErr ?? "That photo didn't upload." }
    imagePath = path
  }

  /* No `/row-level security/i` message-sniffing any more. It guessed
   * "buy a plan" from a Postgres error code, and after 20260826000000 the rule
   * it was guessing at no longer exists: every approved resident, every manager
   * and every admin of the building may post. */
  const { error } = await supabase.from("community_posts").insert({
    building_id: scope.buildingId,
    author_id: user.id,
    category: input.category,
    content: input.content,
    image_url: imagePath ?? null,
  })
  return { error: error?.message ?? null }
}

/**
 * Like or unlike a post.
 *
 * THE COUNTER IS NOT TOUCHED HERE. This function used to read `like_count`,
 * add one and write it back — an update `posts_update_own` denies to everybody
 * but the post's author, silently, with the error unchecked. So every like by a
 * neighbour incremented nothing, forever. `trg_post_reactions_count`
 * (20260826000001) now maintains it, and `community_posts_guard` RAISES on any
 * direct write to it, so putting those lines back would be a visible error
 * rather than a silent no-op.
 */
export async function togglePostLike(postId: string, currentlyLiked: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "You must be signed in." }

  if (currentlyLiked) {
    const { error } = await supabase
      .from("post_reactions")
      .delete()
      .eq("post_id", postId)
      .eq("profile_id", user.id)
    return { error: error?.message ?? null }
  }
  const { error } = await supabase.from("post_reactions").insert({ post_id: postId, profile_id: user.id })
  /* 23505 — the (post_id, profile_id) primary key. Two taps in flight at once
   * is a no-op, not a failure the resident should read about. */
  if (error && error.code !== "23505") return { error: error.message }
  return { error: null }
}

export interface PostComment {
  id: string
  authorId: string | null
  author: string
  avatar: string
  content: string
  time: string
}

export async function fetchPostComments(postId: string): Promise<PostComment[]> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return []
  const [{ data }, who] = await Promise.all([
    supabase
      .from("post_comments")
      .select("id, author_id, content, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
    communityIdentities(supabase),
  ])
  return (data ?? []).map((r) => {
    const p = r as unknown as { id: string; author_id: string | null; content: string; created_at: string }
    const id = p.author_id ? who.get(p.author_id) : undefined
    return {
      id: p.id,
      authorId: p.author_id,
      author: id?.fullName ?? "Resident",
      avatar: id?.avatarUrl ?? "",
      content: p.content,
      time: timeAgo(p.created_at),
    }
  })
}

/** Adds a comment. `comment_count` follows via trg_post_comments_count. */
export async function addPostComment(postId: string, content: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "You must be signed in." }
  const { error } = await supabase.from("post_comments").insert({ post_id: postId, author_id: user.id, content })
  return { error: error?.message ?? null }
}

/** Removes a comment. The author's own, or any comment in a building you manage. */
export async function deletePostComment(commentId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error, count } = await supabase
    .from("post_comments")
    .delete({ count: "exact" })
    .eq("id", commentId)
  if (error) return { error: error.message }
  /* RLS denies a DELETE by matching NO ROWS, not by erroring. Reporting success
   * for zero rows is how "0 rows, no error" became a bug worth a migration. */
  if (!count) return { error: "You can't remove that comment." }
  return { error: null }
}

/** Pin or unpin. `community_posts_guard` authorises it — a manager or an admin. */
export async function pinPost(postId: string, pinned: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error, count } = await supabase
    .from("community_posts")
    .update({ is_pinned: pinned }, { count: "exact" })
    .eq("id", postId)
  if (error) return { error: error.message }
  if (!count) return { error: "You can't pin that post." }
  return { error: null }
}

/**
 * Remove a post. TWO PATHS, ONE FUNCTION, chosen by who is asking.
 *
 * An AUTHOR removing their own post is not a moderation act: it is a plain
 * `update … set deleted_at`, which posts_update_own permits, and it leaves no
 * audit row because there is nothing to hold anybody to account for.
 *
 * A MANAGER or ADMIN removing somebody else's post is: it goes through
 * `moderate_community_post`, which re-checks scope and writes an `audit_log`
 * row naming the actor, the author and the reason. A browser `update` cannot
 * write audit_log — `notifs_insert_own_assistant` and the audit policies see to
 * that — so the RPC is not decoration, it is the only way the record gets kept.
 */
export async function removePost(
  postId: string,
  opts: { mine: boolean; reason?: string },
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  if (opts.mine) {
    const { error, count } = await supabase
      .from("community_posts")
      .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", postId)
    if (error) return { error: error.message }
    if (!count) return { error: "You can't remove that post." }
    return { error: null }
  }
  const { data, error } = await supabase.rpc("moderate_community_post", {
    p_post: postId,
    p_reason: opts.reason ?? undefined,
  })
  if (error) return { error: error.message }
  const r = data as unknown as { ok?: boolean; error?: string } | null
  if (!r?.ok) return { error: MODERATION_ERRORS[r?.error ?? ""] ?? "Couldn't remove that post." }
  return { error: null }
}

const MODERATION_ERRORS: Record<string, string> = {
  forbidden: "Only this building's manager can remove someone else's post.",
  not_found: "That post is no longer there.",
  already_removed: "That post has already been removed.",
  too_long: "That reason is too long.",
  unauthenticated: "You must be signed in.",
}

/* ------------------------------ event writes ------------------------------ */

export async function rsvpToEvent(eventId: string, going: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "You must be signed in." }
  if (!going) {
    const { error } = await supabase
      .from("event_rsvps")
      .delete()
      .eq("event_id", eventId)
      .eq("profile_id", user.id)
    return { error: error?.message ?? null }
  }
  const { error } = await supabase.from("event_rsvps").insert({ event_id: eventId, profile_id: user.id })
  /* 23505 is the (event_id, profile_id) primary key: already going. */
  if (error && error.code !== "23505") return { error: error.message }
  return { error: null }
}

export async function createEvent(input: {
  title: string
  category: string | null
  startsAt: string
  location: string | null
  maxAttendees: number | null
}): Promise<{ error: string | null; id: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured.", id: null }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "You must be signed in.", id: null }
  const scope = await currentScope(supabase)
  if (!scope) return { error: "Link your building before creating an event.", id: null }
  const { data, error } = await supabase
    .from("events")
    .insert({
      building_id: scope.buildingId,
      created_by: user.id,
      title: input.title,
      category: input.category,
      starts_at: input.startsAt,
      location: input.location,
      max_attendees: input.maxAttendees,
    })
    .select("id")
    .maybeSingle()
  if (error) return { error: error.message, id: null }
  return { error: null, id: data?.id ?? null }
}

/**
 * Announce an event to the whole building. MANAGER OR ADMIN ONLY.
 *
 * A resident may organise an event; only a manager may ring every neighbour
 * about it. That is the difference between organising something and announcing
 * it, and it is the only thing keeping the notification list from becoming a
 * second feed.
 */
export async function publishEvent(eventId: string, note?: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { data, error } = await supabase.rpc("publish_building_event", {
    p_event: eventId,
    p_note: note ?? undefined,
  })
  if (error) return { error: error.message }
  const r = data as unknown as { ok?: boolean; error?: string } | null
  if (!r?.ok) return { error: PUBLISH_ERRORS[r?.error ?? ""] ?? "Couldn't announce that event." }
  return { error: null }
}

const PUBLISH_ERRORS: Record<string, string> = {
  forbidden: "Only this building's manager can announce an event.",
  not_found: "That event is no longer there.",
  already_published: "This event was already announced in the last 24 hours.",
  too_long: "That note is too long.",
  unauthenticated: "You must be signed in.",
}

/* --------------------------- lost & found writes -------------------------- */

export async function reportLostFound(input: {
  kind: "lost" | "found"
  petName?: string
  species?: Species | null
  breed?: string
  color?: string
  lastSeen?: string
  rewardCents?: number | null
  imageFile?: File
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }

  let imagePath: string | undefined
  if (input.imageFile) {
    const { path, error: upErr } = await uploadCommunityImage("lf", input.imageFile)
    if (upErr || !path) return { error: upErr ?? "That photo didn't upload." }
    imagePath = path
  }

  /* NO buildingId ARGUMENT. The RPC derives it from the caller's own approved
   * resident_links row: a parameter the caller controls is a parameter the
   * caller can point at another building. */
  const { data, error } = await supabase.rpc("report_lost_found", {
    p_kind: input.kind,
    p_pet_name: input.petName ?? undefined,
    p_species: input.species ?? undefined,
    p_breed: input.breed ?? undefined,
    p_color: input.color ?? undefined,
    p_last_seen: input.lastSeen ?? undefined,
    p_reward_cents: input.rewardCents ?? undefined,
    p_image_path: imagePath ?? undefined,
  })
  if (error) return { error: error.message }
  const r = data as unknown as { ok?: boolean; error?: string; field?: string } | null
  if (!r?.ok) {
    if (r?.error === "too_long") return { error: `That ${r.field ?? "field"} is too long.` }
    return { error: LOST_FOUND_ERRORS[r?.error ?? ""] ?? "Couldn't post that report." }
  }
  return { error: null }
}

const LOST_FOUND_ERRORS: Record<string, string> = {
  unauthenticated: "You must be signed in.",
  invalid_kind: "Choose lost or found.",
  no_building: "Link your building before posting a lost or found report.",
  ambiguous_building: "Your account is linked to more than one building — contact support.",
  rate_limited: "You've posted three reports today. Try again tomorrow.",
  bad_reward: "A reward must be between $0.01 and $10,000.",
  bad_image_path: "That photo couldn't be attached.",
  image_not_found: "That photo couldn't be attached.",
}

/** Marks a report resolved. The reporter's own, or any in a building you manage. */
export async function resolveLostFound(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error, count } = await supabase
    .from("lost_found")
    .update({ status: "resolved" }, { count: "exact" })
    .eq("id", id)
  if (error) return { error: error.message }
  if (!count) return { error: "You can't resolve that report." }
  return { error: null }
}


/* ------------------------------- pet photos ------------------------------ */

export interface PetPhoto {
  id: string
  path: string
  /** Signed URL, refreshed each fetch — the bucket is private. */
  url: string | null
  caption: string | null
  sortOrder: number
}

/**
 * A pet's photo gallery.
 *
 * `pets.image_url` remains the avatar every list, card and emergency page
 * reads; this is the album beside it. The first photo is mirrored into
 * image_url on upload so those surfaces need no change.
 */
export function usePetPhotos(petId: string | undefined): LiveResult<PetPhoto[]> {
  const [data, setData] = useState<PetPhoto[]>([])
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
      .from("pet_photos")
      .select("id, path, caption, sort_order")
      .eq("pet_id", petId)
      .order("sort_order")

    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    // One batched signing call rather than one per photo.
    const urls = await petFileSignedUrls((rows ?? []).map((r) => r.path))
    setData(
      (rows ?? []).map((r) => ({
        id: r.id,
        path: r.path,
        url: urls[r.path] ?? null,
        caption: r.caption,
        sortOrder: r.sort_order,
      })),
    )
    setError(null)
    setLoading(false)
  }, [petId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

export async function addPetPhoto(petId: string, file: File): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }

  const { path, error } = await uploadPetFile({ petId, file, prefix: "photo" })
  if (error || !path) return { error: error ?? "Upload failed." }

  const { count } = await supabase
    .from("pet_photos")
    .select("id", { count: "exact", head: true })
    .eq("pet_id", petId)

  const { error: insErr } = await supabase
    .from("pet_photos")
    .insert({ pet_id: petId, path, sort_order: count ?? 0 })
  if (insErr) {
    // Do not leave the file orphaned in storage if the row failed.
    await deletePetFile(path)
    return { error: insErr.message }
  }

  // First photo becomes the avatar, so a pet is never a placeholder when it
  // demonstrably has a picture.
  if ((count ?? 0) === 0) {
    await supabase.from("pets").update({ image_url: path }).eq("id", petId)
    await refreshPets()
  }
  return { error: null }
}

export async function deletePetPhoto(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }

  const { data: row } = await supabase.from("pet_photos").select("pet_id, path").eq("id", id).maybeSingle()
  const { error } = await supabase.from("pet_photos").delete().eq("id", id)
  if (error) return { error: error.message }

  if (row) {
    await deletePetFile(row.path)
    // If this was the avatar, promote the next photo rather than leaving the
    // pet pointing at a file that no longer exists.
    const { data: pet } = await supabase.from("pets").select("image_url").eq("id", row.pet_id).maybeSingle()
    if (pet?.image_url === row.path) {
      const { data: next } = await supabase
        .from("pet_photos")
        .select("path")
        .eq("pet_id", row.pet_id)
        .order("sort_order")
        .limit(1)
        .maybeSingle()
      await supabase.from("pets").update({ image_url: next?.path ?? null }).eq("id", row.pet_id)
      await refreshPets()
    }
  }
  return { error: null }
}

/** Diet plan lives with food, not with registration. */
export async function updatePetDiet(
  petId: string,
  input: { dietType?: string | null; dietNotes?: string | null },
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase
    .from("pets")
    .update({ diet_type: input.dietType || null, diet_notes: input.dietNotes || null })
    .eq("id", petId)
  if (!error) await refreshPets()
  return { error: error?.message ?? null }
}

/* ------------------------------ vet visits ------------------------------- */

export interface VetVisit {
  id: string
  visitedOn: string
  reason: string
  clinic: string | null
  vetName: string | null
  notes: string | null
  followUpOn: string | null
}

/** A pet's visit history, newest first. */
export function usePetVetVisits(petId: string | undefined): LiveResult<VetVisit[]> {
  const [data, setData] = useState<VetVisit[]>([])
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
      .from("pet_vet_visits")
      .select("id, visited_on, reason, clinic, vet_name, notes, follow_up_on")
      .eq("pet_id", petId)
      .order("visited_on", { ascending: false })

    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(
        (rows ?? []).map((r) => ({
          id: r.id,
          visitedOn: r.visited_on,
          reason: r.reason,
          clinic: r.clinic,
          vetName: r.vet_name,
          notes: r.notes,
          followUpOn: r.follow_up_on,
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

export async function addVetVisit(input: {
  petId: string
  visitedOn: string
  reason: string
  clinic?: string | null
  vetName?: string | null
  notes?: string | null
  followUpOn?: string | null
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from("pet_vet_visits").insert({
    pet_id: input.petId,
    visited_on: input.visitedOn,
    reason: input.reason.trim(),
    clinic: input.clinic?.trim() || null,
    vet_name: input.vetName?.trim() || null,
    notes: input.notes?.trim() || null,
    follow_up_on: input.followUpOn || null,
    created_by: user?.id ?? null,
  })
  return { error: error?.message ?? null }
}

export async function deleteVetVisit(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("pet_vet_visits").delete().eq("id", id)
  return { error: error?.message ?? null }
}

/* ------------------------------------------------------------------ */
/* The resident's own bylaw cases (Phase 5)                            */
/* ------------------------------------------------------------------ */

/**
 * Every violation opened against the signed-in resident, newest first.
 *
 * `violations_select`, `vevents_select`, `fines_select` and `vdisputes_select`
 * have all admitted `resident_id = auth.uid()` since Phase 2, and until now
 * NOTHING HAD EVER QUERIED THEM. This is that half of the ladder.
 *
 * RLS IS THE FLOOR, THE QUERY IS THE FILTER. `.eq("resident_id", user.id)` is
 * explicit and must stay explicit: `violations_select` also admits
 * `manages_building(...) or is_admin()`, so an account holding either grant —
 * a manager who owns a dog, an admin looking at their own resident view —
 * would otherwise receive every case in their portfolio on their PERSONAL
 * screen. That is exactly the defect `useNotifications` above was fixed for.
 *
 * EMBED NOTHING ELSE. In particular:
 *
 *   - NO `incident_reports`. `incidents_select` admits
 *     `manages_building or is_admin or reporter_id = auth.uid()`, and the
 *     subject of a violation is the PET'S OWNER, not the reporter (AD-11) — so
 *     this embed returns silent nulls for a resident rather than an error, and
 *     the next hand to "fix" it writes a policy that hands a resident the name
 *     of the neighbour who reported them.
 *   - NO `actor:profiles` on the events. `profiles_select`'s manager clause
 *     evaluates `manages_building` AS THE CALLER, which is false for a
 *     resident, so it fails the same silent way. The deciding manager's
 *     identity is deliberately not shown: a strata decision is the strata's.
 *   - NO `evidence_paths`, no `audit_log`.
 *
 * This is a decision, not a limitation to work around. Phase 0 found
 * `emergency_directory` returning medical data it documented itself as
 * withholding, which is why it is written down here rather than left to
 * whoever edits this next.
 */
export function useMyCases(): LiveResult<ResidentCase[]> {
  const [data, setData] = useState<ResidentCase[]>([])
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
      setData([])
      setLoading(false)
      return
    }

    const { data: rows, error: err } = await supabase
      .from("violations")
      .select(
        `id, type, stage, created_at, resolved_at, resolution_outcome,
         pet:pets ( name ),
         fines ( id, amount_cents, currency, status, due_on ),
         violation_events ( id, from_stage, to_stage, note, occurred_on, created_at ),
         disputes:violation_disputes ( stage, reason, filed_at, outcome, decided_note, decided_at )`,
      )
      .eq("resident_id", user.id)
      .order("created_at", { ascending: false })

    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    type Row = {
      id: string
      type: string
      stage: string
      created_at: string
      resolved_at: string | null
      resolution_outcome: string | null
      pet: { name: string } | { name: string }[] | null
      fines:
        | { id: string; amount_cents: number; currency: string; status: string; due_on: string | null }[]
        | null
      violation_events:
        | {
            id: string
            from_stage: string | null
            to_stage: string
            note: string | null
            occurred_on: string | null
            created_at: string
          }[]
        | null
      disputes:
        | {
            stage: string
            reason: string
            filed_at: string
            outcome: DisputeOutcome | null
            decided_note: string | null
            decided_at: string | null
          }[]
        | null
    }
    const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

    setData(
      ((rows ?? []) as unknown as Row[]).map((r) => {
        const stage = toViolationStage(r.stage)
        // Oldest first. A history reads forwards, and the dispute self-
        // transition has to land after the event it contests.
        const events = [...(r.violation_events ?? [])]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((e) => ({
            id: e.id,
            fromStage: e.from_stage ? toViolationStage(e.from_stage) : null,
            toStage: toViolationStage(e.to_stage),
            note: e.note,
            occurredOn: e.occurred_on,
            createdAt: e.created_at,
          }))

        // The dispute window's anchor: the latest event that ENTERED the case's
        // current stage, falling back to the case's own creation. This is
        // `dispute_violation`'s `coalesce(max(...), v.created_at)` mirrored
        // exactly — see `lib/data/disputes.ts` for why the mirror exists and
        // how it is kept honest.
        //
        // The dispute's own self-transition has `to_stage = stage` too, so once
        // an appeal is filed the anchor moves to it. That is harmless: a case
        // with an open dispute is blocked by `hasOpenDispute` long before the
        // window is consulted, and one whose dispute was DECIDED has already
        // used up that degree, so `alreadyDisputedThisStage` blocks it first.
        const anchorIso =
          events.filter((e) => e.toStage === stage).at(-1)?.createdAt ?? r.created_at

        return {
          id: r.id,
          type: r.type.replace(/_/g, " "),
          stage,
          openedAt: r.created_at,
          resolvedAt: r.resolved_at,
          resolutionOutcome: r.resolution_outcome,
          petName: first(r.pet)?.name ?? null,
          fines: (r.fines ?? []).map((f) => ({
            id: f.id,
            amountCents: f.amount_cents,
            currency: f.currency,
            status: f.status,
            dueOn: f.due_on,
          })),
          events,
          disputes: [...(r.disputes ?? [])]
            .sort((a, b) => a.filed_at.localeCompare(b.filed_at))
            .map((d) => ({
              stage: toViolationStage(d.stage),
              reason: d.reason,
              filedAt: d.filed_at,
              outcome: d.outcome,
              decidedNote: d.decided_note,
              decidedAt: d.decided_at,
            })),
          anchorIso,
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

export interface FileDisputeResult {
  error: string | null
  stage?: ViolationStage
  /** How many fines the filing moved from `issued` to `disputed`. */
  finesMarked?: number
}

/**
 * File an appeal against the degree a case currently sits on.
 *
 * The client check in the sheet ("say why") is a COURTESY. The enforcement is
 * `dispute_violation`, which is the only writer `violation_disputes` has — the
 * table carries no client INSERT policy at all — so every one of these eight
 * codes is mapped rather than assumed unreachable. `reason_required` in
 * particular is mapped even though the sheet refuses an empty box first: a
 * client-side check that is treated as the guarantee is how a guard gets
 * deleted in a refactor and nobody notices.
 */
export async function fileDispute(
  violationId: string,
  reason: string,
): Promise<FileDisputeResult> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }

  const { data, error } = await supabase.rpc("dispute_violation", {
    p_violation: violationId,
    p_reason: reason,
  })
  if (error) {
    const hint = error.hint?.trim()
    return { error: hint ? `${error.message} ${hint}` : error.message }
  }

  const r = data as unknown as {
    ok: boolean
    error?: string
    stage?: string
    fines_marked?: number
    length?: number
    max?: number
    closed_at?: string
  }
  if (!r.ok) {
    switch (r.error) {
      case "not_found":
        return { error: "That case no longer exists." }
      case "forbidden":
        // The RPC authorises on `resident_id = auth.uid()` and nothing else —
        // no manager branch, no admin branch. Reaching this from this screen
        // means the case is not the signed-in resident's.
        return { error: "This case is not yours to dispute." }
      case "stage_not_disputable":
        return { error: describeWhyNot("stage") }
      case "already_disputed":
        return { error: describeWhyNot("already") }
      case "dispute_open":
        return { error: describeWhyNot("open") }
      case "window_closed":
        return {
          error: describeWhyNot("window", r.closed_at ? new Date(r.closed_at) : undefined),
        }
      case "reason_required":
        return { error: "Say why you are disputing this before submitting." }
      case "reason_too_long":
        return {
          error: `Your reason is ${r.length ?? 0} characters; the limit is ${r.max ?? 2000}.`,
        }
      default:
        return {
          error: r.error ? `Couldn't file the dispute (${r.error}).` : "Couldn't file the dispute.",
        }
    }
  }

  return {
    error: null,
    stage: r.stage ? toViolationStage(r.stage) : undefined,
    finesMarked: r.fines_marked ?? 0,
  }
}
