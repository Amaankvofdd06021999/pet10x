"use client"

/**
 * Pet10x — Strata portfolio data layer.
 *
 * Everything here is RLS-scoped to the buildings the caller manages
 * (`manages_building()`), so a single *unfiltered* query returns exactly the
 * manager's portfolio — one round trip per source, never N per building. The
 * building switcher filters the already-fetched arrays in memory, so flipping
 * buildings is instant and never re-queries.
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { LiveResult } from "./live"
import type { PetRules, InviteResult } from "./admin"

/* ------------------------------------------------------------------ */
/* Buildings I manage                                                  */
/* ------------------------------------------------------------------ */

export interface PortfolioBuilding {
  id: string
  name: string
  code: string
  city: string | null
  region: string | null
  totalUnits: number | null
  rules: PetRules
  isPrimary: boolean
}

/** Buildings the signed-in manager runs, derived from building_managers (authoritative + gives is_primary). */
export function usePortfolioBuildings(): LiveResult<PortfolioBuilding[]> {
  const [data, setData] = useState<PortfolioBuilding[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setLoading(false)
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
      .from("building_managers")
      .select(
        "is_primary, building:buildings!building_managers_building_id_fkey ( id, name, building_code, city, region, total_units, pet_rules )",
      )
      .eq("profile_id", user.id)

    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    type Row = {
      is_primary: boolean
      building:
        | {
            id: string
            name: string
            building_code: string
            city: string | null
            region: string | null
            total_units: number | null
            pet_rules: unknown
          }
        | { id: string }[]
        | null
    }
    const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

    const mapped = ((rows ?? []) as unknown as Row[])
      .map((r) => {
        const b = first(r.building) as {
          id: string
          name: string
          building_code: string
          city: string | null
          region: string | null
          total_units: number | null
          pet_rules: unknown
        } | null
        if (!b) return null
        return {
          id: b.id,
          name: b.name,
          code: b.building_code,
          city: b.city,
          region: b.region,
          totalUnits: b.total_units,
          rules: (b.pet_rules as PetRules) ?? {},
          isPrimary: r.is_primary,
        }
      })
      .filter((x): x is PortfolioBuilding => !!x)
      .sort((a, b) => a.name.localeCompare(b.name))

    setData(mapped)
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

/* ------------------------------------------------------------------ */
/* Outstanding fines                                                   */
/* ------------------------------------------------------------------ */

export interface OutstandingFine {
  id: string
  buildingId: string | null
  unit: string
  resident: string
  amount: number
  status: "issued" | "partially_paid" | "disputed"
  createdAt: string
  dueOn: string | null
}

/** Fines still owed (issued / partially paid / disputed). RLS-scoped. */
export function useOutstandingFines(): LiveResult<OutstandingFine[]> {
  const [data, setData] = useState<OutstandingFine[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setLoading(false)
    setLoading(true)
    const { data: rows, error: err } = await supabase
      .from("fines")
      .select(
        "id, building_id, amount_cents, status, created_at, due_on, unit:units ( unit_number ), resident:profiles!fines_resident_id_fkey ( full_name )",
      )
      .in("status", ["issued", "partially_paid", "disputed"])
      .order("created_at", { ascending: true })

    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    type Row = {
      id: string
      building_id: string | null
      amount_cents: number
      status: string
      created_at: string
      due_on: string | null
      unit: { unit_number: string } | { unit_number: string }[] | null
      resident: { full_name: string | null } | { full_name: string | null }[] | null
    }
    const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

    setData(
      ((rows ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        buildingId: r.building_id,
        unit: first(r.unit)?.unit_number ?? "—",
        resident: first(r.resident)?.full_name ?? "Unassigned",
        amount: (r.amount_cents ?? 0) / 100,
        status: r.status as OutstandingFine["status"],
        createdAt: r.created_at,
        dueOn: r.due_on,
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
/* Raw compliance inputs — for the bylaws impact preview               */
/* ------------------------------------------------------------------ */

export interface PetComplianceInput {
  petId: string
  buildingId: string | null
  name: string
  neutered: boolean | null
  vax: { name: string; status: string }[]
  docs: { kind: string }[]
}

/** Per-pet raw inputs so the bylaws editor can recompute compliance under proposed rules. */
export function useComplianceInputs(): LiveResult<PetComplianceInput[]> {
  const [data, setData] = useState<PetComplianceInput[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setLoading(false)
    setLoading(true)
    const { data: rows, error: err } = await supabase
      .from("pets")
      .select("id, building_id, name, neutered, pet_vaccinations ( name, status ), pet_documents ( kind )")
      .not("building_id", "is", null)
      .is("deleted_at", null)

    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    setData(
      (rows ?? []).map((r) => ({
        petId: r.id,
        buildingId: r.building_id,
        name: r.name,
        neutered: r.neutered,
        vax: (r.pet_vaccinations as { name: string; status: string }[] | null) ?? [],
        docs: (r.pet_documents as { kind: string }[] | null) ?? [],
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
/* Team / delegation                                                   */
/* ------------------------------------------------------------------ */

export interface CoManager {
  linkId: string // building_managers row id (the assignment)
  profileId: string
  name: string
  email: string
  isPrimary: boolean
  buildingId: string
  buildingName: string
  joinedAt: string
}

/** Every manager assignment across the buildings I manage (RLS bm_select). */
export function usePortfolioTeam(): LiveResult<CoManager[]> {
  const [data, setData] = useState<CoManager[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setLoading(false)
    setLoading(true)
    const { data: rows, error: err } = await supabase
      .from("building_managers")
      .select(
        `id, is_primary, created_at, building_id,
         profile:profiles!building_managers_profile_id_fkey ( id, full_name, email ),
         building:buildings!building_managers_building_id_fkey ( name )`,
      )
      .order("created_at", { ascending: true })

    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    type Row = {
      id: string
      is_primary: boolean
      created_at: string
      building_id: string
      profile: { id: string; full_name: string | null; email: string | null } | { id: string }[] | null
      building: { name: string } | { name: string }[] | null
    }
    const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

    setData(
      ((rows ?? []) as unknown as Row[]).map((r) => {
        const prof = first(r.profile) as { id: string; full_name: string | null; email: string | null } | null
        return {
          linkId: r.id,
          profileId: prof?.id ?? "",
          name: prof?.full_name || prof?.email || "Manager",
          email: prof?.email ?? "",
          isPrimary: r.is_primary,
          buildingId: r.building_id,
          buildingName: first(r.building)?.name ?? "",
          joinedAt: r.created_at,
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

/** Invite a co-manager to a building you primary-manage (server route, service role). */
export async function inviteCoManager(input: {
  buildingId: string
  buildingName: string
  email: string
  fullName?: string
}): Promise<InviteResult> {
  try {
    const res = await fetch("/api/strata/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        fullName: input.fullName,
        buildingId: input.buildingId,
        buildingName: input.buildingName,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      emailSent?: boolean
      inviteUrl?: string
    }
    if (!res.ok || !json.ok) return { error: json.error ?? "Invite failed." }
    return { error: null, emailSent: json.emailSent, inviteUrl: json.inviteUrl }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invite failed." }
  }
}

/** Remove a co-manager assignment (RLS bm_primary_delete — primary managers only). */
export async function removeCoManager(linkId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("building_managers").delete().eq("id", linkId)
  return { error: error?.message ?? null }
}

/** Waive or mark-paid an outstanding fine (RLS fines_manager_write). */
export async function setFineStatus(id: string, status: "paid" | "waived"): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("fines").update({ status }).eq("id", id)
  return { error: error?.message ?? null }
}

/* ------------------------------------------------------------------ */
/* CSV export (pure client-side)                                       */
/* ------------------------------------------------------------------ */

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map((c) => escape(c.label)).join(",")
  const body = rows.map((row) => columns.map((c) => escape(row[c.key])).join(",")).join("\n")
  return `${header}\n${body}`
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
