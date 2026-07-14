"use client"

/**
 * Pet10x — Super-admin data layer (buildings + business verification).
 * All reads/writes rely on RLS `is_admin()` (the caller's profiles.is_super_admin).
 * Manager invites go through the server route /api/admin/invite (service role).
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

type BuildingRow = Database["public"]["Tables"]["buildings"]["Row"]
type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"]

export interface PetRules {
  requires_registry?: boolean
  require_rabies?: boolean
  require_core_vaccines?: boolean
  require_license?: boolean
  require_insurance?: boolean
  require_spay_neuter?: boolean
  max_weight_kg?: number | null
  breed_restrictions?: string[]
  notes?: string
}

export interface AdminBuilding {
  id: string
  name: string
  code: string
  address: string | null
  city: string | null
  region: string | null
  rules: PetRules
  createdAt: string
}

export interface AdminBusiness {
  id: string
  name: string
  category: string
  isVerified: boolean
  ownerId: string
  city: string | null
  createdAt: string
}

function mapBuilding(r: BuildingRow): AdminBuilding {
  return {
    id: r.id,
    name: r.name,
    code: r.building_code,
    address: r.address,
    city: r.city,
    region: r.region,
    rules: (r.pet_rules as PetRules) ?? {},
    createdAt: r.created_at,
  }
}

export function useAdminBuildings() {
  const [data, setData] = useState<AdminBuilding[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase.from("buildings").select("*").order("created_at", { ascending: false })
    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData((rows ?? []).map(mapBuilding))
      setError(null)
    }
    setLoading(false)
  }, [])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

export async function createBuilding(input: {
  name: string
  code: string
  address?: string
  city?: string
  region?: string
  country?: string
  latitude?: number | null
  longitude?: number | null
  rules?: PetRules
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("buildings").insert({
    name: input.name,
    building_code: input.code.toUpperCase(),
    address: input.address || null,
    city: input.city || null,
    region: input.region || null,
    country: input.country || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    pet_rules: (input.rules ?? {}) as Database["public"]["Tables"]["buildings"]["Insert"]["pet_rules"],
  })
  return { error: error?.message ?? null }
}

export async function updateBuildingRules(id: string, rules: PetRules): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase
    .from("buildings")
    .update({ pet_rules: rules as Database["public"]["Tables"]["buildings"]["Update"]["pet_rules"] })
    .eq("id", id)
  return { error: error?.message ?? null }
}

export async function inviteManager(input: {
  buildingId: string
  buildingName: string
  email: string
  fullName?: string
}): Promise<{ error: string | null }> {
  try {
    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        fullName: input.fullName,
        role: "building_manager",
        buildingId: input.buildingId,
        buildingName: input.buildingName,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !json.ok) return { error: json.error ?? "Invite failed." }
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invite failed." }
  }
}

export function useAdminBusinesses() {
  const [data, setData] = useState<AdminBusiness[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("businesses")
      .select("*")
      .order("created_at", { ascending: false })
    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(
        (rows ?? []).map((r: BusinessRow) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          isVerified: r.is_verified,
          ownerId: r.owner_id,
          city: null,
          createdAt: r.created_at,
        })),
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

export async function verifyBusiness(id: string, verified: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("businesses").update({ is_verified: verified }).eq("id", id)
  return { error: error?.message ?? null }
}

/* ------------------------------------------------------------------ */
/* Managers — master view across every building, with freeze/unfreeze  */
/* ------------------------------------------------------------------ */

export interface AdminManager {
  id: string // profile id
  name: string
  email: string
  isPrimary: boolean
  isSuspended: boolean
  suspendedAt: string | null
  joinedAt: string // building_managers.created_at
  building: { id: string; name: string; code: string; city: string | null; region: string | null }
}

export interface ManagerLocationFilter {
  city?: string
  region?: string
}

/** Every building_managers row, joined to the manager's profile and building — the master roster. */
export function useAdminManagers(filter?: ManagerLocationFilter) {
  const [data, setData] = useState<AdminManager[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    let query = supabase
      .from("building_managers")
      .select(
        `id, is_primary, created_at,
         profile:profiles!building_managers_profile_id_fkey ( id, full_name, email, is_suspended, suspended_at ),
         building:buildings!building_managers_building_id_fkey ( id, name, building_code, city, region )`,
      )
      .order("created_at", { ascending: false })

    if (filter?.city) query = query.eq("building.city", filter.city)
    if (filter?.region) query = query.eq("building.region", filter.region)

    const { data: rows, error: err } = await query
    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    type JoinedRow = {
      id: string
      is_primary: boolean
      created_at: string
      profile: { id: string; full_name: string | null; email: string | null; is_suspended: boolean; suspended_at: string | null } | null
      building: { id: string; name: string; building_code: string; city: string | null; region: string | null } | null
    }

    const mapped = ((rows ?? []) as unknown as JoinedRow[])
      .filter((r) => r.profile && r.building)
      .map((r) => ({
        id: r.profile!.id,
        name: r.profile!.full_name || r.profile!.email || "Unknown",
        email: r.profile!.email ?? "",
        isPrimary: r.is_primary,
        isSuspended: r.profile!.is_suspended,
        suspendedAt: r.profile!.suspended_at,
        joinedAt: r.created_at,
        building: {
          id: r.building!.id,
          name: r.building!.name,
          code: r.building!.building_code,
          city: r.building!.city,
          region: r.building!.region,
        },
      }))
      // client-side filter fallback in case the embedded-resource .eq() above isn't supported by the PostgREST version
      .filter((m) => (filter?.city ? m.building.city === filter.city : true))
      .filter((m) => (filter?.region ? m.building.region === filter.region : true))

    setData(mapped)
    setError(null)
    setLoading(false)
  }, [filter?.city, filter?.region])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

/** Suspend or unsuspend a manager's whole account — blocks login/RLS scope everywhere, not just this building. */
export async function setManagerSuspended(profileId: string, suspended: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { error } = await supabase
    .from("profiles")
    .update({
      is_suspended: suspended,
      suspended_at: suspended ? new Date().toISOString() : null,
      suspended_by: suspended ? (user?.id ?? null) : null,
    })
    .eq("id", profileId)
  return { error: error?.message ?? null }
}
