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
} from "./types"
import {
  STAGE_LABEL,
  describeLegalMoves,
  isFineStage,
  tabFor,
  toViolationStage,
  type FineStage,
} from "./violations"

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
        `id, building_id, name, species, breed, dob, weight_grams, created_at, registration_status,
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
      building_id: string | null
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
          buildingId: r.building_id,
          unit: first(r.unit)?.unit_number ?? "—",
          resident: first(r.owner)?.full_name ?? "Unknown",
          species: r.species as Species,
          name: r.name,
          breed: r.breed ?? "—",
          weight: r.weight_grams ? `${(r.weight_grams / 1000).toFixed(1)} kg` : "—",
          age: ageFrom(r.dob),
          submitted: shortDate(r.created_at),
          createdAt: r.created_at,
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
  // Managers have no RLS UPDATE on pets — go through the SECURITY DEFINER RPC,
  // which authorises via manages_building() and performs the write. A plain
  // .update() here would silently match zero rows for a non-admin manager.
  const { error } = await supabase.rpc("manager_decide_registration", { p_pet: petId, p_approve: approve })
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
        `id, building_id, type, status, animal_desc, legal_note, created_at,
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
      building_id: string | null
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
          buildingId: r.building_id,
          unit: first(r.unit)?.unit_number ?? "—",
          resident: first(r.resident)?.full_name ?? "Unknown",
          type: r.type === "service_animal" ? ("Service Animal" as const) : ("ESA" as const),
          animal: pet ? `${pet.name}${pet.breed ? ` (${pet.breed})` : ""}` : (r.animal_desc ?? "—"),
          submitted: shortDate(r.created_at),
          createdAt: r.created_at,
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
         pet:pets ( name, building_id, unit:units ( unit_number ), owner:profiles!pets_owner_id_fkey ( full_name ) )`,
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
            building_id: string | null
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
          buildingId: r.pet!.building_id,
          unit: first(r.pet!.unit)?.unit_number ?? "—",
          resident: first(r.pet!.owner)?.full_name ?? "Unknown",
          pet: r.pet!.name,
          type: r.name ?? r.kind.replace(/_/g, " "),
          expiring: r.expires_on ? shortDate(r.expires_on) : "—",
          expiresOn: r.expires_on,
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

/*
 * The stage vocabulary, the ladder and the tab mapping all live in
 * `./violations` now. They used to be three private consts here, which is why
 * the drift went unseen: nothing outside this file could read them and no test
 * could reach them. `DB_STAGE_TO_APP` in particular translated the DB's labels
 * into a hyphenated app spelling and had no key for `resolved` or `dismissed`,
 * so those two stages resolved to `undefined` and were then coerced back to
 * `"investigation"` by a `??`. See `violations.ts` for why the translation is
 * gone entirely.
 */

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
        `id, building_id, type, stage, created_at,
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
      building_id: string | null
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
        const stage = toViolationStage(r.stage)
        const fines = r.fines ?? []
        const amount = fines.reduce((s, f) => s + (f.amount_cents ?? 0), 0) / 100
        const paid = fines.length > 0 && fines.every((f) => f.status === "paid")
        // The only dispute signal that exists today. `violations.disputed_at`
        // is AD-7's, and not yet migrated.
        const disputed = fines.some((f) => f.status === "disputed")

        return {
          id: r.id,
          buildingId: r.building_id,
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
          tab: tabFor(stage, fines.length > 0, disputed),
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
      .select(`id, building_id, type, resolved_at, resolution_outcome, unit:units ( unit_number )`)
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
      building_id: string | null
      type: string
      resolved_at: string | null
      resolution_outcome: string | null
      unit: { unit_number: string } | { unit_number: string }[] | null
    }
    const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

    setData(
      ((rows ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        buildingId: r.building_id,
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

/* ------------------------------------------------------------------ */
/* Violations — mutations                                              */
/* ------------------------------------------------------------------ */

/**
 * Both of these used to be a plain `.update()` on `violations.stage`.
 *
 * Neither works any more, and `advanceViolation` had in fact never worked: it
 * wrote the pre-Phase-2 labels, so its callers' `nextStage` lookup returned
 * null and the Advance button never rendered at all. Since
 * `20260823000002_violations_stage_guard.sql` a direct stage UPDATE raises
 * 42501 for everyone including the table owner, so
 * `manager_advance_violation` is not merely the preferred path, it is the only
 * one. It also does four things a client-side update never could: writes the
 * `violation_events` row, mints the fine, notifies the resident (the
 * `notifications` insert policy admits only `kind = 'assistant'` for self, so
 * the browser cannot), and audits — all in one transaction.
 */

export interface AdvanceResult {
  error: string | null
  /** The stage the case is now at, on success. */
  stage?: ViolationStage
  /** False when the case has no resident to tell. Not a failure. */
  notified?: boolean
  fineId?: string
  amountCents?: number
}

export interface AdvanceOptions {
  /**
   * On a terminal step this doubles as the case's `resolution_outcome`, which
   * the resolved-cases queue renders as a short label — so pass a label, not a
   * paragraph.
   */
  note?: string
  /** Overrides the building's bylaw schedule. Only read entering a fine degree. */
  amountCents?: number
  /** ISO date (`YYYY-MM-DD`). Only read entering a fine degree. */
  dueOn?: string
}

/**
 * A Postgrest failure, with its hint.
 *
 * The guards this phase added raise 42501 with a `hint` that names the RPC to
 * call instead, or the one column a fine allows to change. Reporting only
 * `message` shows the manager "new row violates row-level security policy" and
 * withholds the sentence written to tell them what to do about it.
 */
function transportError(e: { message: string; hint?: string | null } | null): string | null {
  if (!e) return null
  const hint = e.hint?.trim()
  return hint ? `${e.message} ${hint}` : e.message
}

/** The RPC's four rejection codes, turned into something a manager can read. */
function advanceError(r: { error?: string; from?: string; to?: string }): string {
  switch (r.error) {
    case "forbidden":
      return "You don't manage this building."
    case "not_found":
      return "That case no longer exists."
    case "illegal_transition":
      // The RPC returns the from/to pair and no guidance. The guidance comes
      // from the client's mirror of the same table, so the manager is told what
      // the case CAN do rather than only that this was not it.
      return describeLegalMoves(toViolationStage(r.from))
    case "no_fine_amount":
      return "This building has no fine schedule yet — enter an amount for this fine."
    default:
      return "Couldn't move this case."
  }
}

/**
 * Move a violation one legal step along the ladder, or close it.
 *
 * `toStage` is a target, not a direction: the database rejects anything the
 * ladder does not allow, and `nextStage`/`LEGAL_TRANSITIONS` in
 * `./violations` are what a screen should consult before offering a control.
 */
export async function advanceViolation(
  id: string,
  toStage: ViolationStage,
  options: AdvanceOptions = {},
): Promise<AdvanceResult> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }

  const { data, error } = await supabase.rpc("manager_advance_violation", {
    p_violation: id,
    p_to_stage: toStage,
    p_note: options.note ?? undefined,
    // Left undefined rather than null so the RPC's own defaults apply and the
    // building's bylaw schedule is used. An explicit amount overrides it; an
    // explicit 0 is refused rather than silently replaced.
    p_amount_cents: options.amountCents ?? undefined,
    p_due_on: options.dueOn ?? undefined,
  })
  if (error) return { error: transportError(error) }

  const r = data as unknown as {
    ok: boolean
    error?: string
    from?: string
    stage?: string
    notified?: boolean
    fine_id?: string
    amount_cents?: number
  }
  if (!r.ok) return { error: advanceError(r) }

  return {
    error: null,
    stage: toViolationStage(r.stage),
    notified: r.notified ?? false,
    fineId: r.fine_id,
    amountCents: r.amount_cents,
  }
}

/**
 * Close a case as remedied.
 *
 * `resolved` is reachable from every non-terminal rung, so this needs no stage
 * argument. `outcome` becomes both the event note and the case's
 * `resolution_outcome`.
 */
export async function resolveViolation(id: string, outcome: string): Promise<AdvanceResult> {
  return advanceViolation(id, "resolved", { note: outcome })
}

/** Close a case as filed in error. The record stays; no delete path exists. */
export async function dismissViolation(id: string, reason: string): Promise<AdvanceResult> {
  return advanceViolation(id, "dismissed", { note: reason })
}

/**
 * Issue a fine by advancing into a fine degree.
 *
 * `degree` is explicit rather than inferred from the case's current stage: the
 * caller already knows which rung it is on, and inferring it here would mean
 * this function silently choosing to issue a second fine when it was asked for
 * a first. Both amount and due date are optional — omitting the amount is the
 * normal path, and makes the building's bylaw schedule (AD-5) the default so
 * that a deviation is a deliberate act. With no schedule and no override the
 * RPC refuses rather than writing a zero-dollar fine.
 */
export async function issueFine(
  id: string,
  degree: FineStage,
  options: AdvanceOptions = {},
): Promise<AdvanceResult> {
  if (!isFineStage(degree)) return { error: "Not a fine degree." }
  return advanceViolation(id, degree, options)
}
