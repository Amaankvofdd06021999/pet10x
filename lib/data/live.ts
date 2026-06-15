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

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { PETS as MOCK_PETS } from "./mock-data"
import type { CareEntry, CareEntryKind, CareTarget, Pet, PetStatus, Species } from "./types"

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

export function usePets(): LiveResult<Pet[]> {
  const [data, setData] = useState<Pet[]>(ENABLED ? [] : MOCK_PETS)
  const [isLoading, setLoading] = useState(ENABLED)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!ENABLED) return
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setData([])
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("pets")
      .select("*")
      .eq("owner_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData((rows ?? []).map(mapPet))
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
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
  return { error: null, pet: mapPet(data) }
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
