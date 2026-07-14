"use client"

/**
 * Pet10x — Building-manager data layer (building profile, bylaws, stats,
 * emergency access tokens). Everything here is scoped by RLS
 * `manages_building()`, so a manager only ever sees/writes their own building.
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import type { PetRules } from "@/lib/data/admin"

export type { PetRules }

export interface ManagerBuilding {
  id: string
  name: string
  code: string
  address: string | null
  city: string | null
  region: string | null
  totalUnits: number | null
  rules: PetRules
}

export interface BuildingStats {
  pets: number
  /** Mean compliance across the building's pets, 0–100. */
  compliancePct: number
  openIssues: number
}

/** The building this manager runs, resolved via building_managers → buildings. */
export function useManagerBuilding() {
  const [data, setData] = useState<ManagerBuilding | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
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
      setLoading(false)
      return
    }

    // Order by is_primary so a manager who runs several buildings always lands
    // on the same one, rather than whichever row Postgres happens to return.
    const { data: link } = await supabase
      .from("building_managers")
      .select("building_id")
      .eq("profile_id", user.id)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!link?.building_id) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    const { data: b, error: err } = await supabase
      .from("buildings")
      .select("id, name, building_code, address, city, region, total_units, pet_rules")
      .eq("id", link.building_id)
      .maybeSingle()

    if (err) {
      setError(err.message)
      setData(null)
    } else if (b) {
      setData({
        id: b.id,
        name: b.name,
        code: b.building_code,
        address: b.address,
        city: b.city,
        region: b.region,
        totalUnits: b.total_units,
        rules: (b.pet_rules as PetRules) ?? {},
      })
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

/** Headline numbers for the settings screen — real counts, not placeholders. */
export function useBuildingStats(buildingId?: string) {
  const [data, setData] = useState<BuildingStats>({ pets: 0, compliancePct: 0, openIssues: 0 })
  const [isLoading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !buildingId) {
      setLoading(false)
      return
    }
    setLoading(true)

    const [{ data: pets }, { count: openCount }] = await Promise.all([
      supabase
        .from("pets")
        .select("id, neutered, pet_vaccinations(name, status), pet_documents(kind)")
        .eq("building_id", buildingId)
        .is("deleted_at", null),
      supabase
        .from("violations")
        .select("id", { count: "exact", head: true })
        .eq("building_id", buildingId)
        .is("resolved_at", null),
    ])

    const { data: b } = await supabase.from("buildings").select("pet_rules").eq("id", buildingId).maybeSingle()
    const rules = ((b?.pet_rules as PetRules) ?? {}) as PetRules

    // Mirror the compliance rules the manager roster already applies: a pet is
    // compliant when it satisfies whatever its building actually requires.
    const required: ((p: PetRow) => boolean)[] = []
    if (rules.require_rabies) required.push((p) => p.vax.some((v) => /rabies/i.test(v.name) && v.status === "valid"))
    if (rules.require_core_vaccines) required.push((p) => p.vax.some((v) => v.status === "valid"))
    if (rules.require_license) required.push((p) => p.docs.some((d) => d.kind === "license"))
    if (rules.require_insurance) required.push((p) => p.docs.some((d) => d.kind === "liability_insurance"))
    if (rules.require_spay_neuter) required.push((p) => p.neutered === true)

    type PetRow = { neutered: boolean | null; vax: { name: string; status: string }[]; docs: { kind: string }[] }
    const rows: PetRow[] = (pets ?? []).map((r) => ({
      neutered: r.neutered,
      vax: ((r.pet_vaccinations as { name: string; status: string }[] | null) ?? []),
      docs: ((r.pet_documents as { kind: string }[] | null) ?? []),
    }))

    let compliancePct = 100
    if (rows.length && required.length) {
      const total = rows.reduce((sum, p) => sum + required.filter((check) => check(p)).length / required.length, 0)
      compliancePct = Math.round((total / rows.length) * 100)
    }

    setData({ pets: rows.length, compliancePct, openIssues: openCount ?? 0 })
    setLoading(false)
  }, [buildingId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, refetch }
}

/** Edit the building's own profile fields. RLS: buildings_manager_update. */
export async function updateMyBuilding(
  id: string,
  input: { name: string; address?: string; city?: string; region?: string; totalUnits?: number | null },
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase
    .from("buildings")
    .update({
      name: input.name,
      address: input.address || null,
      city: input.city || null,
      region: input.region || null,
      total_units: input.totalUnits ?? null,
    })
    .eq("id", id)
  return { error: error?.message ?? null }
}

/** Publish the building's pet bylaws (the pet_rules JSON the whole app reads). */
export async function updateMyBuildingRules(id: string, rules: PetRules): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase
    .from("buildings")
    .update({ pet_rules: rules as Database["public"]["Tables"]["buildings"]["Update"]["pet_rules"] })
    .eq("id", id)
  return { error: error?.message ?? null }
}

/* ------------------------------------------------------------------ */
/* Emergency access tokens                                             */
/* ------------------------------------------------------------------ */

export interface EmergencyToken {
  id: string
  token: string
  expiresAt: string
  revoked: boolean
  createdAt: string
  /** True when not revoked and not past expiry. */
  isActive: boolean
}

function mapToken(r: {
  id: string
  token: string
  expires_at: string
  revoked: boolean
  created_at: string
}): EmergencyToken {
  return {
    id: r.id,
    token: r.token,
    expiresAt: r.expires_at,
    revoked: r.revoked,
    createdAt: r.created_at,
    isActive: !r.revoked && new Date(r.expires_at).getTime() > Date.now(),
  }
}

/** Tokens issued for this building, newest first. */
export function useEmergencyTokens(buildingId?: string) {
  const [data, setData] = useState<EmergencyToken[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !buildingId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: rows, error: err } = await supabase
      .from("emergency_access_tokens")
      .select("id, token, expires_at, revoked, created_at")
      .eq("building_id", buildingId)
      .order("created_at", { ascending: false })
      .limit(10)

    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData((rows ?? []).map(mapToken))
      setError(null)
    }
    setLoading(false)
  }, [buildingId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

/** Random URL-safe code for the /emergency/[code] link. */
function generateToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Issue a 4-hour emergency access token. The default expiry lives in the
 * schema (now() + 4 hours); we pass it explicitly so the value is auditable
 * from the client that created it.
 */
export async function issueEmergencyToken(
  buildingId: string,
  hours = 4,
): Promise<{ error: string | null; token?: EmergencyToken }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("emergency_access_tokens")
    .insert({
      building_id: buildingId,
      token: generateToken(),
      issued_by: user?.id ?? null,
      expires_at: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
    })
    .select("id, token, expires_at, revoked, created_at")
    .single()

  if (error) return { error: error.message }
  return { error: null, token: mapToken(data) }
}

export async function revokeEmergencyToken(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("emergency_access_tokens").update({ revoked: true }).eq("id", id)
  return { error: error?.message ?? null }
}
