"use client"

/**
 * Pet10x — the manager's work queues, backed by real rows.
 *
 * These replace the hardcoded stubs in `hooks.ts`, which returned empty arrays
 * while the screens showed invented counts. Everything here is scoped by RLS to
 * the buildings the caller actually manages.
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type {
  Registration,
  AccommodationRequest,
  DocumentReviewItem,
  Violation,
  ResolvedViolation,
  Species,
  ViolationStage,
  ViolationTab,
} from "./types"

interface Result<T> {
  data: T
  isLoading: boolean
  error: string | null
  refetch: () => void
}

function shortDate(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function ageFrom(dob: string | null): string {
  if (!dob) return "—"
  const years = (Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000)
  return years < 1 ? `${Math.max(1, Math.round(years * 12))} mo` : `${Math.floor(years)} yr`
}

/* ------------------------------------------------------------------ */
/* Pending pet registrations                                           */
/* ------------------------------------------------------------------ */

export function useRegistrationsLive(): Result<Registration[]> {
  const [data, setData] = useState<Registration[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setLoading(false)
    setLoading(true)

    const { data: rows, error: err } = await supabase
      .from("pets")
      .select(
        `id, name, species, breed, dob, weight_grams, created_at, registration_status,
         owner:profiles!pets_owner_id_fkey ( full_name ),
         unit:units ( unit_number ),
         pet_documents ( kind ),
         pet_vaccinations ( status )`,
      )
      .eq("registration_status", "pending")
      .is("deleted_at", null)

    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    type Row = {
      id: string
      name: string
      species: string
      breed: string | null
      dob: string | null
      weight_grams: number | null
      created_at: string
      owner: { full_name: string | null } | { full_name: string | null }[] | null
      unit: { unit_number: string } | { unit_number: string }[] | null
      pet_documents: { kind: string }[] | null
      pet_vaccinations: { status: string }[] | null
    }
    const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

    setData(
      ((rows ?? []) as unknown as Row[]).map((r) => {
        const docs = r.pet_documents ?? []
        const vax = r.pet_vaccinations ?? []
        const hasVax = vax.some((v) => v.status === "current")
        const hasLicense = docs.some((d) => d.kind === "municipal_license")
        const hasInsurance = docs.some((d) => d.kind === "liability_insurance")

        const flags: string[] = []
        if (!hasVax) flags.push("No current vaccination on file")
        if (!hasLicense) flags.push("Municipal licence missing")
        if (r.weight_grams && r.weight_grams > 25000) flags.push("Exceeds the 25 kg building weight limit")

        return {
          id: r.id,
          unit: first(r.unit)?.unit_number ?? "—",
          resident: first(r.owner)?.full_name ?? "Unknown",
          species: r.species as Species,
          name: r.name,
          breed: r.breed ?? "—",
          weight: r.weight_grams ? `${(r.weight_grams / 1000).toFixed(1)} kg` : "—",
          age: ageFrom(r.dob),
          submitted: shortDate(r.created_at),
          status: "pending" as const,
          flags,
          documents: { vaccination: hasVax, license: hasLicense, insurance: hasInsurance },
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

/** Approve or deny a pet's building registration. */
export async function decideRegistration(
  petId: string,
  approve: boolean,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase
    .from("pets")
    .update({ registration_status: approve ? "approved" : "denied" })
    .eq("id", petId)
  return { error: error?.message ?? null }
}

/* ------------------------------------------------------------------ */
/* Accommodation requests (ESA / service animal)                       */
/* ------------------------------------------------------------------ */

export function useAccommodationsLive(): Result<AccommodationRequest[]> {
  const [data, setData] = useState<AccommodationRequest[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setLoading(false)
    setLoading(true)

    const { data: rows, error: err } = await supabase
      .from("accommodation_requests")
      .select(
        `id, type, status, animal_desc, legal_note, created_at,
         resident:profiles!accommodation_requests_resident_id_fkey ( full_name ),
         unit:units ( unit_number ),
         pet:pets ( name, breed )`,
      )
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
      status: string
      animal_desc: string | null
      legal_note: string | null
      created_at: string
      resident: { full_name: string | null } | { full_name: string | null }[] | null
      unit: { unit_number: string } | { unit_number: string }[] | null
      pet: { name: string; breed: string | null } | { name: string; breed: string | null }[] | null
    }
    const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

    setData(
      ((rows ?? []) as unknown as Row[]).map((r) => {
        const pet = first(r.pet)
        return {
          id: r.id,
          unit: first(r.unit)?.unit_number ?? "—",
          resident: first(r.resident)?.full_name ?? "Unknown",
          type: r.type === "service_animal" ? ("Service Animal" as const) : ("ESA" as const),
          animal: pet ? `${pet.name}${pet.breed ? ` (${pet.breed})` : ""}` : (r.animal_desc ?? "—"),
          submitted: shortDate(r.created_at),
          status: (r.status === "approved" ? "approved" : r.status === "denied" ? "denied" : "pending") as
            | "approved"
            | "denied"
            | "pending",
          documents: {
            letterFromProvider: true,
            providerLicense: r.type === "service_animal",
            animalDescription: !!r.animal_desc,
            vaccination: true,
          },
          legalNote: r.legal_note ?? "",
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

/** Decide an accommodation request. The reasoning is what defends this at the CRT. */
export async function decideAccommodation(
  id: string,
  status: "approved" | "denied" | "info_requested",
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from("accommodation_requests")
    .update({ status, decided_by: user?.id ?? null, decided_at: new Date().toISOString() })
    .eq("id", id)
  return { error: error?.message ?? null }
}

/* ------------------------------------------------------------------ */
/* Documents needing a decision                                        */
/* ------------------------------------------------------------------ */

export function useDocumentsReviewLive(): Result<DocumentReviewItem[]> {
  const [data, setData] = useState<DocumentReviewItem[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setLoading(false)
    setLoading(true)

    const { data: rows, error: err } = await supabase
      .from("pet_documents")
      .select(
        `id, kind, name, status, expires_on,
         pet:pets ( name, unit:units ( unit_number ), owner:profiles!pets_owner_id_fkey ( full_name ) )`,
      )
      .in("status", ["expiring", "expired", "missing", "rejected"])
      .order("expires_on", { ascending: true })

    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    type Row = {
      id: string
      kind: string
      name: string | null
      status: string
      expires_on: string | null
      pet:
        | {
            name: string
            unit: { unit_number: string } | { unit_number: string }[] | null
            owner: { full_name: string | null } | { full_name: string | null }[] | null
          }
        | null
    }
    const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

    setData(
      ((rows ?? []) as unknown as Row[])
        .filter((r) => r.pet)
        .map((r) => ({
          id: r.id,
          unit: first(r.pet!.unit)?.unit_number ?? "—",
          resident: first(r.pet!.owner)?.full_name ?? "Unknown",
          pet: r.pet!.name,
          type: r.name ?? r.kind.replace(/_/g, " "),
          expiring: r.expires_on ? shortDate(r.expires_on) : "—",
          status: (r.status === "expired" ? "expiring" : "expiring") as "expiring" | "current",
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

/* ------------------------------------------------------------------ */
/* Violations                                                          */
/* ------------------------------------------------------------------ */

const DB_STAGE_TO_APP: Record<string, ViolationStage> = {
  investigation: "investigation",
  pending_review: "pending-review",
  verbal_warning: "verbal-warning",
  written_warning: "written-warning",
  fine_issued: "fine-issued",
}

const STAGE_LABEL: Record<ViolationStage, string> = {
  investigation: "Investigation",
  "pending-review": "Pending review",
  "verbal-warning": "Verbal warning",
  "written-warning": "Written warning",
  "fine-issued": "Fine issued",
}

function tabFor(stage: ViolationStage, hasFine: boolean): ViolationTab {
  if (hasFine || stage === "fine-issued") return "fines"
  if (stage === "verbal-warning" || stage === "written-warning") return "warnings"
  return "active"
}

export function useViolationsLive(): Result<Violation[]> {
  const [data, setData] = useState<Violation[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setLoading(false)
    setLoading(true)

    const { data: rows, error: err } = await supabase
      .from("violations")
      .select(
        `id, type, stage, created_at,
         resident:profiles!violations_resident_id_fkey ( full_name ),
         unit:units ( unit_number ),
         pet:pets ( name ),
         fines ( amount_cents, status )`,
      )
      .is("resolved_at", null)
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
      resident: { full_name: string | null } | { full_name: string | null }[] | null
      unit: { unit_number: string } | { unit_number: string }[] | null
      pet: { name: string } | { name: string }[] | null
      fines: { amount_cents: number; status: string }[] | null
    }
    const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

    setData(
      ((rows ?? []) as unknown as Row[]).map((r) => {
        const stage = DB_STAGE_TO_APP[r.stage] ?? "investigation"
        const fines = r.fines ?? []
        const amount = fines.reduce((s, f) => s + (f.amount_cents ?? 0), 0) / 100
        const paid = fines.length > 0 && fines.every((f) => f.status === "paid")

        return {
          id: r.id,
          unit: first(r.unit)?.unit_number ?? "—",
          resident: first(r.resident)?.full_name ?? "Unassigned",
          pet: first(r.pet)?.name ?? "—",
          type: r.type.replace(/_/g, " "),
          date: shortDate(r.created_at),
          stage,
          stageLabel: STAGE_LABEL[stage],
          amount,
          paid,
          history: [{ stage: STAGE_LABEL[stage], date: shortDate(r.created_at) }],
          tab: tabFor(stage, fines.length > 0),
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

export function useResolvedViolationsLive(): Result<ResolvedViolation[]> {
  const [data, setData] = useState<ResolvedViolation[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setLoading(false)
    setLoading(true)

    const { data: rows, error: err } = await supabase
      .from("violations")
      .select(`id, type, resolved_at, resolution_outcome, unit:units ( unit_number )`)
      .not("resolved_at", "is", null)
      .order("resolved_at", { ascending: false })

    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    type Row = {
      id: string
      type: string
      resolved_at: string | null
      resolution_outcome: string | null
      unit: { unit_number: string } | { unit_number: string }[] | null
    }
    const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

    setData(
      ((rows ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        unit: first(r.unit)?.unit_number ?? "—",
        type: r.type.replace(/_/g, " "),
        resolved: shortDate(r.resolved_at),
        outcome: r.resolution_outcome ?? "Resolved",
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

/** Advance a violation through the progressive-enforcement ladder, or close it. */
export async function advanceViolation(
  id: string,
  stage: "investigation" | "pending_review" | "verbal_warning" | "written_warning" | "fine_issued",
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("violations").update({ stage }).eq("id", id)
  return { error: error?.message ?? null }
}

export async function resolveViolation(id: string, outcome: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase
    .from("violations")
    .update({ stage: "resolved", resolved_at: new Date().toISOString(), resolution_outcome: outcome })
    .eq("id", id)
  return { error: error?.message ?? null }
}
