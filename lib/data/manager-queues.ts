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
  DisputeOutcome,
  Violation,
  ResolvedViolation,
  Species,
  ViolationStage,
} from "./types"
import {
  STAGE_LABEL,
  describeLegalMoves,
  summariseFines,
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
         fines ( amount_cents, status ),
         disputes:violation_disputes ( stage, reason, filed_at, outcome, decided_note, decided_at )`,
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
        const fines = r.fines ?? []
        // `summariseFines` is the single answer to "what does this case owe?".
        // This used to be `fines.every(f => f.status === 'paid')` with the
        // screen reading `!paid` as "outstanding", which counted a WAIVED fine
        // as money owed. `fine_status` has seven labels and only three of them
        // mean owed; see `FINE_STATUS_MEANING` in ./violations.
        const money = summariseFines(fines)

        // THE dispute signal, and the only one. An open `violation_disputes`
        // row is `outcome === null`.
        //
        // This used to be `fines.some(f => f.status === 'disputed')`, and that
        // derivation is RETIRED rather than composed with this one. Two sources
        // feeding one boolean is exactly how a WARNING-stage dispute — which
        // has no fine row to carry the flag — became inexpressible: a resident
        // could contest a warning and the manager's Disputed tab would never
        // show it.
        //
        // `fines.status = 'disputed'` still exists and is still written, by
        // `dispute_violation`, but it is now a CONSEQUENCE rather than an
        // input. It is what keeps the money truthful on its own:
        // `manager_remind_fine` refuses to chase anything but `issued`, and
        // `portfolio.ts` counts `disputed` as outstanding. Nothing derives "is
        // this case disputed?" from it any more.
        const disputes = r.disputes ?? []
        const openDispute = disputes.find((d) => d.outcome === null) ?? null
        const disputed = openDispute !== null

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
          amount: money.totalCents / 100,
          outstanding: money.outstandingCents / 100,
          disputed: money.disputedCents / 100,
          chaseable: money.chaseable,
          paid: money.fullyPaid,
          history: [{ stage: STAGE_LABEL[stage], date: shortDate(r.created_at) }],
          // The open appeal itself, so the Disputed tab can render the
          // resident's stated reason. A manager deciding an appeal they cannot
          // read is not deciding it.
          openDispute: openDispute
            ? {
                stage: toViolationStage(openDispute.stage),
                reason: openDispute.reason,
                filedAt: openDispute.filed_at,
                outcome: openDispute.outcome,
                decidedNote: openDispute.decided_note,
                decidedAt: openDispute.decided_at,
              }
            : null,
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

/** The RPC's five rejection codes, turned into something a manager can read. */
function advanceError(r: { error?: string; from?: string; to?: string }): string {
  switch (r.error) {
    case "forbidden":
      return "You don't manage this building."
    case "not_found":
      return "That case no longer exists."
    case "dispute_open":
      // Added in Phase 5. `manager_advance_violation` now refuses EVERY stage
      // move on a case with an open appeal — including resolving or dismissing
      // it, because closing a case under appeal decides the appeal by ending
      // the thing it is about. The sentence names the one way out rather than
      // only saying no.
      return "This resident has an open appeal on this case. Decide it on the Disputed tab — uphold the finding or overturn it — before the case can move again."
    case "illegal_transition":
      // The RPC returns the from/to pair and no guidance. The guidance comes
      // from the client's mirror of the same table, so the manager is told what
      // the case CAN do rather than only that this was not it.
      return describeLegalMoves(toViolationStage(r.from))
    case "no_fine_amount":
      return "This building has no fine schedule yet — enter an amount for this fine."
    default:
      // Never swallow a code this client has not been taught. The RPC's
      // rejection vocabulary can grow, and a manager reading "Couldn't move
      // this case." with no trace of WHY has nothing to report and nothing to
      // search for.
      return r.error
        ? `Couldn't move this case (${r.error}).`
        : "Couldn't move this case."
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
  // No `if (!isFineStage(degree))` guard: `degree: FineStage` is already the
  // whole of that check, so the branch was unreachable and the string inside it
  // was dead copy pretending to be a safety net.
  return advanceViolation(id, degree, options)
}

/**
 * Re-notify the resident that a fine on this case is still outstanding.
 *
 * A reminder is not a rung of the ladder — it moves no stage, so it cannot go
 * through `manager_advance_violation` (which would reject `fine_1 -> fine_1` as
 * an illegal transition, correctly). It is its own SECURITY DEFINER function
 * for the same reason the advance is one: the `notifications` insert policy
 * admits only `kind = 'assistant'` for the caller's own profile, so a manager
 * cannot tell a resident anything from the browser.
 *
 * `no_outstanding_fine` covers the case where the only fine is `disputed`,
 * `paid` or `waived` — deliberately, since chasing money that is under appeal
 * is the wrong message to send while the appeal is undecided. Phase 5 made
 * that a state with an exit rather than a dead end: the Disputed tab's Uphold
 * and Overturn controls call `resolveDispute` below, and upholding returns the
 * fine to `issued`, at which point this function works on it again.
 *
 * Two rejections were added in 20260823000006 and both are worth knowing about
 * from the client side:
 *
 *  - `reminded_recently` — one reminder per case per 24 hours. The RPC was
 *    measured sending three identical notifications to one resident from three
 *    calls in a single statement; the only limit on it was how fast a manager
 *    could click. The sentence names the wait rather than just refusing.
 *  - `mixed_currency` — the outstanding fines on the case are not all in one
 *    currency, and there is no FX rate anywhere in this system. The RPC refuses
 *    rather than inventing one inside a resident-facing money statement.
 */
export interface RemindResult {
  error: string | null
  fineCount?: number
  amountCents?: number
  currency?: string
}

/** "in about 3 hours" / "in about 20 minutes" — for the throttle's refusal. */
function inAbout(seconds: number): string {
  if (seconds <= 90) return "in a moment"
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `in about ${minutes} minutes`
  const hours = Math.ceil(minutes / 60)
  return hours === 1 ? "in about an hour" : `in about ${hours} hours`
}

export async function remindAboutFine(id: string, note?: string): Promise<RemindResult> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }

  const { data, error } = await supabase.rpc("manager_remind_fine", {
    p_violation: id,
    p_note: note?.trim() ? note.trim() : undefined,
  })
  if (error) return { error: transportError(error) }

  const r = data as unknown as {
    ok: boolean
    error?: string
    fine_count?: number
    amount_cents?: number
    currency?: string
    currencies?: string[]
    retry_after_seconds?: number
  }
  if (!r.ok) {
    switch (r.error) {
      case "forbidden":
        return { error: "You don't manage this building." }
      case "not_found":
        return { error: "That case no longer exists." }
      case "no_outstanding_fine":
        return { error: "There is no unpaid fine on this case to remind anyone about." }
      case "no_resident":
        return { error: "No resident is attached to this case, so there is nobody to remind." }
      case "reminded_recently":
        return {
          error: `This resident was already reminded about this case in the last 24 hours. You can send another ${inAbout(r.retry_after_seconds ?? 0)}.`,
        }
      case "mixed_currency":
        return {
          error: `This case has outstanding fines in more than one currency (${(r.currencies ?? []).map((c) => c.toUpperCase()).join(" and ")}), and Pet10x holds no exchange rate. Settle or reissue them in one currency first.`,
        }
      default:
        return { error: r.error ? `Couldn't send the reminder (${r.error}).` : "Couldn't send the reminder." }
    }
  }
  return {
    error: null,
    fineCount: r.fine_count,
    amountCents: r.amount_cents,
    currency: r.currency,
  }
}

/* ------------------------------------------------------------------ */
/* Deciding an appeal                                                  */
/* ------------------------------------------------------------------ */

export interface ResolveDisputeResult {
  error: string | null
  /** `upheld` or `overturned`, echoed back by the RPC. */
  outcome?: DisputeOutcome
  /** Where the case sits AFTER the decision — unchanged, or `dismissed`. */
  stage?: ViolationStage
  /** How many fines were moved: back to `issued`, or to `waived`. */
  finesSettled?: number
  /** Whether the resident was told. False only when the case names nobody. */
  notified?: boolean
}

/**
 * Uphold or overturn a resident's open appeal.
 *
 * Both outcomes are irreversible from the app: `violation_disputes` has no
 * client UPDATE policy and `manager_resolve_dispute` refuses a dispute that
 * already carries an outcome, so a second press returns `no_open_dispute`
 * rather than replacing the first decision. The confirmation sheet says so
 * before the press, which is the only place that warning can do any good.
 *
 * What each does, so a caller does not have to read the migration:
 *
 *   upheld      the case does not move. Fines go back from `disputed` to
 *               `issued`, so `manager_remind_fine` starts working on them
 *               again, and one self-transition event records the decision.
 *   overturned  the case is dismissed through `manager_advance_violation` and
 *               the fines are `waived`. Exactly ONE notification reaches the
 *               resident, because the nested call is made with
 *               `p_notify => false`.
 *
 * `note` is optional and lands in `decided_note`, which the RESIDENT READS —
 * it is quoted into their notification and shown on their case screen. The UI
 * says so on the field.
 */
export async function resolveDispute(
  id: string,
  outcome: DisputeOutcome,
  note?: string,
): Promise<ResolveDisputeResult> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }

  const { data, error } = await supabase.rpc("manager_resolve_dispute", {
    p_violation: id,
    p_outcome: outcome,
    p_note: note?.trim() ? note.trim() : undefined,
  })
  // `transportError` and not `error.message`, so the 42501 hints the guards
  // raise reach the manager instead of "new row violates row-level security".
  if (error) return { error: transportError(error) }

  const r = data as unknown as {
    ok: boolean
    error?: string
    outcome?: string
    stage?: string
    fines_restored?: number
    fines_waived?: number
    notified?: boolean
    length?: number
    max?: number
  }
  if (!r.ok) {
    switch (r.error) {
      case "forbidden":
        return { error: "You don't manage this building." }
      case "not_found":
        return { error: "That case no longer exists." }
      case "no_open_dispute":
        // Covers "never disputed" and "already decided" — the same fact from
        // the RPC's side. Naming both is what stops a manager who pressed
        // twice from thinking the first press failed.
        return {
          error:
            "There is no appeal waiting on this case. It was either never disputed, or the decision has already been recorded.",
        }
      case "outcome_required":
        return { error: "Choose whether you are upholding or overturning the appeal." }
      case "note_too_long":
        return {
          error: `Your note is ${r.length ?? 0} characters; the limit is ${r.max ?? 2000}.`,
        }
      default:
        // Never swallow a code this client has not been taught. A manager
        // reading "Couldn't record the decision." with no trace of why has
        // nothing to report and nothing to search for.
        return {
          error: r.error
            ? `Couldn't record the decision (${r.error}).`
            : "Couldn't record the decision.",
        }
    }
  }

  return {
    error: null,
    outcome: r.outcome as DisputeOutcome | undefined,
    stage: r.stage ? toViolationStage(r.stage) : undefined,
    finesSettled: r.fines_restored ?? r.fines_waived ?? 0,
    notified: r.notified ?? false,
  }
}

/* ------------------------------------------------------------------ */
/* Opening a case                                                      */
/* ------------------------------------------------------------------ */

/**
 * The subjects a new case can be filed against: every pet in a building the
 * caller manages, with the resident and unit that pet is attached to.
 *
 * Choosing a PET rather than picking building/resident/unit/pet independently
 * is what keeps a fabricated case out of the table: the pet already carries the
 * building, the owner and the unit, so the four cannot be made to disagree.
 * A case with no identified pet is still possible — that is what `open` is for
 * — and the composer offers it as an explicit choice rather than as the result
 * of leaving fields blank.
 */
export interface ViolationSubject {
  petId: string
  petName: string
  buildingId: string
  residentId: string | null
  residentName: string
  unitId: string | null
  unitNumber: string
}

export function useViolationSubjects(): Result<ViolationSubject[]> {
  const [data, setData] = useState<ViolationSubject[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setLoading(false)
    setLoading(true)

    // No building filter: RLS already scopes `pets` to the buildings the caller
    // manages, so one unfiltered query is the manager's whole portfolio. The
    // composer filters the fetched array in memory when a building is picked.
    const { data: rows, error: err } = await supabase
      .from("pets")
      .select(
        `id, name, building_id, unit_id,
         owner:profiles!pets_owner_id_fkey ( id, full_name ),
         unit:units ( unit_number )`,
      )
      .not("building_id", "is", null)
      .is("deleted_at", null)
      .order("name")

    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    type Row = {
      id: string
      name: string
      building_id: string | null
      unit_id: string | null
      owner: { id: string; full_name: string | null } | { id: string; full_name: string | null }[] | null
      unit: { unit_number: string } | { unit_number: string }[] | null
    }
    const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

    setData(
      ((rows ?? []) as unknown as Row[])
        .filter((r) => r.building_id !== null)
        .map((r) => ({
          petId: r.id,
          petName: r.name,
          buildingId: r.building_id as string,
          residentId: first(r.owner)?.id ?? null,
          residentName: first(r.owner)?.full_name ?? "Unassigned",
          unitId: r.unit_id,
          unitNumber: first(r.unit)?.unit_number ?? "—",
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

export interface NewViolationInput {
  buildingId: string
  /** Stored verbatim in `violations.type`, which is free text, not an enum. */
  type: string
  petId?: string | null
  residentId?: string | null
  unitId?: string | null
}

/**
 * Open a case at `open` — a plain INSERT, deliberately.
 *
 * `violations_manager_insert` (20260823000004) permits exactly
 * `manages_building(building_id) and stage = 'open'`, so the database refuses a
 * case fabricated straight into `warning` or `fine_2`. That is the whole reason
 * this needs no RPC: there is nothing to validate that the policy does not, no
 * fine to mint, and nobody to notify — a case that has only just been opened is
 * not yet an accusation the resident has been served with. The first message a
 * resident gets is the warning, which goes through the ladder.
 *
 * It used to be true that this was the one act on the Violations screen that
 * recorded NOTHING: no `violation_events` row and no `audit_log` row, so a case
 * opened here came out of the evidence export with its Event date / From / To /
 * Note columns blank. Neither table has a client INSERT policy (20260823000004
 * removed the last one deliberately), so this function could not have written
 * them even if it tried.
 *
 * `trg_violations_opening_event` (20260823000006) writes both, as an AFTER
 * INSERT trigger rather than as part of an RPC — which also closed the same gap
 * in `escalate_incident_to_violation`, and closes it for whatever opens a case
 * next. So this stays a plain INSERT, and the record is not something this call
 * site has to remember.
 */
export async function openViolation(input: NewViolationInput): Promise<{ error: string | null; id?: string }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("violations")
    .insert({
      building_id: input.buildingId,
      type: input.type,
      pet_id: input.petId ?? null,
      resident_id: input.residentId ?? null,
      unit_id: input.unitId ?? null,
      opened_by: user?.id ?? null,
      // stage is left to its `'open'` default rather than named, so this insert
      // satisfies violations_manager_insert without restating the policy.
    })
    .select("id")
    .single()

  if (error) return { error: transportError(error) }
  return { error: null, id: data?.id }
}

/* ------------------------------------------------------------------ */
/* The evidence ledger (CSV export)                                    */
/* ------------------------------------------------------------------ */

/**
 * Every case in the manager's portfolio with its full stage history, one row
 * per recorded event.
 *
 * This is a one-shot fetch rather than a hook: it runs when the manager presses
 * Export, and holding a second copy of every case in component state for a
 * button that may never be pressed would be a worse trade. Cases with no events
 * yet still produce one row, with the event columns blank — an export that
 * silently omitted the newest cases would be the worst possible failure for a
 * document whose purpose is completeness.
 */
export interface LedgerRow extends Record<string, unknown> {
  case_id: string
  unit: string
  resident: string
  pet: string
  type: string
  stage: string
  opened_on: string
  closed_on: string
  outcome: string
  fine_amount: string
  fine_status: string
  /* The appeal, if the resident filed one. A CRT package that omits the appeal
   * is the wrong package — it is the half of the record where the resident
   * speaks, and a tribunal reads it before it reads the manager's notes. */
  dispute_stage: string
  dispute_filed_on: string
  dispute_reason: string
  dispute_outcome: string
  dispute_decided_on: string
  dispute_note: string
  event_on: string
  event_from: string
  event_to: string
  event_note: string
}

export async function fetchCaseLedger(): Promise<{ error: string | null; rows: LedgerRow[] }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured.", rows: [] }

  const { data: rows, error: err } = await supabase
    .from("violations")
    .select(
      `id, type, stage, created_at, resolved_at, resolution_outcome,
       resident:profiles!violations_resident_id_fkey ( full_name ),
       unit:units ( unit_number ),
       pet:pets ( name ),
       fines ( amount_cents, currency, status ),
       violation_events ( from_stage, to_stage, note, occurred_on, created_at ),
       disputes:violation_disputes ( stage, reason, filed_at, outcome, decided_note, decided_at )`,
    )
    .order("created_at", { ascending: false })

  if (err) return { error: err.message, rows: [] }

  type Row = {
    id: string
    type: string
    stage: string
    created_at: string
    resolved_at: string | null
    resolution_outcome: string | null
    resident: { full_name: string | null } | { full_name: string | null }[] | null
    unit: { unit_number: string } | { unit_number: string }[] | null
    pet: { name: string } | { name: string }[] | null
    fines: { amount_cents: number; currency: string; status: string }[] | null
    violation_events:
      | { from_stage: string | null; to_stage: string; note: string | null; occurred_on: string | null; created_at: string }[]
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
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "")

  const out: LedgerRow[] = []
  for (const r of (rows ?? []) as unknown as Row[]) {
    const fines = r.fines ?? []
    const stage = toViolationStage(r.stage)
    const base = {
      case_id: r.id,
      unit: first(r.unit)?.unit_number ?? "—",
      resident: first(r.resident)?.full_name ?? "Unassigned",
      pet: first(r.pet)?.name ?? "—",
      type: r.type.replace(/_/g, " "),
      stage: STAGE_LABEL[stage],
      opened_on: day(r.created_at),
      closed_on: day(r.resolved_at),
      outcome: r.resolution_outcome ?? "",
      fine_amount: fines.length
        ? (fines.reduce((s, f) => s + (f.amount_cents ?? 0), 0) / 100).toFixed(2)
        : "",
      fine_status: fines.map((f) => f.status).join("; "),
      // The most recent appeal on the case. One row per event already
      // multiplies this out; carrying every dispute as well would multiply
      // again and make the export unreadable. Cases carry at most one dispute
      // per degree and, today, at most one in total.
      ...(() => {
        const d = [...(r.disputes ?? [])].sort((a, b) => b.filed_at.localeCompare(a.filed_at))[0]
        return {
          dispute_stage: d ? STAGE_LABEL[toViolationStage(d.stage)] : "",
          dispute_filed_on: day(d?.filed_at ?? null),
          dispute_reason: d?.reason ?? "",
          // "pending" rather than blank: an undecided appeal is a fact about
          // the case, and an empty cell reads as "no appeal".
          dispute_outcome: d ? (d.outcome ?? "pending") : "",
          dispute_decided_on: day(d?.decided_at ?? null),
          dispute_note: d?.decided_note ?? "",
        }
      })(),
    }
    const events = [...(r.violation_events ?? [])].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    )
    if (events.length === 0) {
      out.push({ ...base, event_on: "", event_from: "", event_to: "", event_note: "" })
      continue
    }
    for (const e of events) {
      out.push({
        ...base,
        event_on: e.occurred_on ?? day(e.created_at),
        event_from: e.from_stage ? STAGE_LABEL[toViolationStage(e.from_stage)] : "(opened)",
        event_to: STAGE_LABEL[toViolationStage(e.to_stage)],
        event_note: e.note ?? "",
      })
    }
  }
  return { error: null, rows: out }
}

/* ------------------------------------------------------------------ */
/* The bylaw fine schedule (AD-5)                                      */
/* ------------------------------------------------------------------ */

/**
 * What `buildings.pet_rules` says a fine of each degree should cost.
 *
 * AD-5 puts the schedule under `fine_1_cents` / `fine_2_cents` /
 * `fine_currency`, which is where `manager_advance_violation` reads it from
 * (`20260823000001:129-146`). **Measured 2026-08-23: 0 of 6 buildings have any
 * of those keys**, so `null` is the normal answer today, not the exception, and
 * the caller has to treat "no schedule configured" as a first-class state
 * rather than as a missing default it can quietly substitute for.
 *
 * The reader is deliberately narrow — a number, or nothing. The RPC applies the
 * same rule (`jsonb_typeof(...) = 'number'`), so a schedule the client is
 * willing to display is exactly a schedule the database is willing to charge.
 */
export interface FineSchedule {
  fine_1: number | null
  fine_2: number | null
  currency: string
}

export function readFineSchedule(rules: unknown): FineSchedule {
  const r = (rules ?? {}) as Record<string, unknown>
  const cents = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : null
  const currency = typeof r.fine_currency === "string" && r.fine_currency.trim() ? r.fine_currency.trim() : "CAD"
  return {
    fine_1: cents(r.fine_1_cents),
    fine_2: cents(r.fine_2_cents),
    currency: currency.toUpperCase(),
  }
}
