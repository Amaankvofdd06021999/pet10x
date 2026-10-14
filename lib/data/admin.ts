"use client"

/**
 * Pet10x — Super-admin data layer (buildings + business verification).
 * All reads/writes rely on RLS `is_admin()` (the caller's profiles.is_super_admin).
 * Manager invites go through the server route /api/admin/invite (service role).
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { buildingDeleteError, buildingHasHistory } from "./building-archive"
import { businessTierError, isOpenRequest, type BusinessTier } from "./business-tier"
import { parsePlatformStats, userFlagsError, type AdminUser, type PlatformStats } from "./admin-users"

type BuildingRow = Database["public"]["Tables"]["buildings"]["Row"]
type BusinessRow = Database["public"]["Tables"]["businesses"]["Row"]

export interface PetRules {
  requires_registry?: boolean
  require_rabies?: boolean
  require_core_vaccines?: boolean
  require_license?: boolean
  require_insurance?: boolean
  require_spay_neuter?: boolean
  /**
   * Enforcement policy, not a compliance rule: may a manager issue a fine
   * without a warning first? Off means the ladder insists on a warning, which
   * is the order most bylaws assume. Deliberately NOT in RULE_TOGGLES — those
   * feed computeCompliance, and this changes nobody's score.
   */
  allow_direct_fine?: boolean
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
  /** Set when an admin took the building off Pet10x; null when live. */
  archivedAt: string | null
  /** The city its managers' municipal-report summary covers. Admin-set only. */
  municipalityId: string | null
  /**
   * Whether anything at all references the building — blocking tables (fines,
   * notifications, payouts, listings) and cascading ones (units, residents,
   * pets, reports…) alike. True when unknown, so Delete is never offered on a
   * guess.
   */
  hasHistory: boolean
}

export interface AdminBusiness {
  id: string
  name: string
  category: string
  isVerified: boolean
  tier: BusinessTier
  ownerId: string
  createdAt: string
  /** The business's open verification request, if it has one. */
  openRequest: AdminVerificationRequest | null
}

export interface AdminVerificationRequest {
  id: string
  kind: string
  licenceNumber: string | null
  issuingBody: string | null
  createdAt: string
}

function mapBuilding(r: BuildingRow, hasHistory: boolean): AdminBuilding {
  return {
    id: r.id,
    name: r.name,
    code: r.building_code,
    address: r.address,
    city: r.city,
    region: r.region,
    rules: (r.pet_rules as PetRules) ?? {},
    createdAt: r.created_at,
    archivedAt: r.archived_at,
    municipalityId: r.municipality_id,
    hasHistory,
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
    const [{ data: rows, error: err }, { data: history }] = await Promise.all([
      supabase.from("buildings").select("*").order("created_at", { ascending: false }),
      supabase.rpc("admin_building_history"),
    ])
    if (err) {
      setError(err.message)
      setData([])
    } else {
      const counts = new Map((history ?? []).map((h) => [h.building_id, h]))
      setData((rows ?? []).map((r) => mapBuilding(r, buildingHasHistory(counts.get(r.id)?.total))))
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

/**
 * Edit a building's identity/location fields (name, code, address, city,
 * region) and the municipality its managers' city-report summary covers.
 * `municipality_id` is admin-only (buildings_archive_guard, 20261008000005):
 * a manager who could set it could read any city's reports.
 */
export async function updateBuildingDetails(
  id: string,
  input: { name: string; code: string; address?: string; city?: string; region?: string; municipalityId?: string | null },
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase
    .from("buildings")
    .update({
      name: input.name,
      building_code: input.code.toUpperCase(),
      address: input.address || null,
      city: input.city || null,
      region: input.region || null,
      ...(input.municipalityId !== undefined ? { municipality_id: input.municipalityId } : {}),
    })
    .eq("id", id)
  return { error: error?.message ?? null }
}

export interface AdminMunicipality {
  id: string
  name: string
  region: string | null
}

/** Every municipality Pet10x knows, for the building's city picker. */
export function useMunicipalities() {
  const [data, setData] = useState<AdminMunicipality[]>([])
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    void supabase
      .from("municipalities")
      .select("id, name, region")
      .order("name")
      .then(({ data: rows }) => setData((rows ?? []).map((m) => ({ id: m.id, name: m.name, region: m.region }))))
  }, [])
  return data
}

/**
 * Delete a building — only one nobody has used.
 *
 * Four foreign keys into `buildings` are NO ACTION (business_listings, fines,
 * notifications, payouts) and `violation_events` is RESTRICT behind
 * `violations`, so a building with any history cannot be deleted, and that is
 * deliberate: those rows are other people's records. The console offers Delete
 * only where `admin_building_history` counts nothing in ANY table, and Archive
 * otherwise.
 * A delete that still hits a 23503 (something arrived since the list loaded)
 * reads as the same advice — never the raw constraint text.
 *
 * "No history" means nothing references it at all — no units, residents,
 * managers, pets or reports either, since those cascade — so a delete takes
 * nothing with it but the row.
 */
export async function deleteBuilding(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("buildings").delete().eq("id", id)
  return { error: error ? buildingDeleteError(error) : null }
}

/**
 * Take a building off Pet10x without deleting anything (20261008000004).
 *
 * An archived building cannot be found by code, joined, reported to, searched
 * or posted to; its residents, pets, cases and fines stay. `buildings_archive_guard`
 * refuses the change to anyone but an admin. Restoring clears the column.
 */
export async function setBuildingArchived(id: string, archived: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { data, error } = await supabase
    .from("buildings")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id")
  if (error) return { error: error.code === "42501" ? "Only an admin can archive or restore a building." : error.message }
  if (!data || data.length === 0) return { error: "That building no longer exists." }
  return { error: null }
}

export async function deleteBusiness(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("businesses").delete().eq("id", id)
  return { error: error?.message ?? null }
}

export interface InviteResult {
  error: string | null
  /** False when the email was suppressed (non-production) or failed — inviteUrl is then set. */
  emailSent?: boolean
  inviteUrl?: string
  /** The address already had a Pet10x account (strata invite only). */
  existingAccount?: boolean
  /** The email was attempted and refused, as opposed to suppressed. */
  emailFailed?: boolean
}

export async function inviteManager(input: {
  buildingId: string
  buildingName: string
  email: string
  fullName?: string
}): Promise<InviteResult> {
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
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      emailSent?: boolean
      inviteUrl?: string
      emailFailed?: boolean
    }
    if (!res.ok || !json.ok) return { error: json.error ?? "Invite failed." }
    return { error: null, emailSent: json.emailSent, inviteUrl: json.inviteUrl, emailFailed: json.emailFailed }
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
    // Admin reads every business and every request (businesses_admin_all,
    // bver_admin); the open-status filter is what makes this the queue.
    const [{ data: rows, error: err }, { data: reqs, error: reqErr }] = await Promise.all([
      supabase.from("businesses").select("*").order("created_at", { ascending: false }),
      supabase
        .from("business_verifications")
        .select("id, business_id, kind, status, licence_number, issuing_body, created_at")
        .in("status", ["submitted", "in_review", "needs_info"])
        .order("created_at", { ascending: true }),
    ])
    if (err || reqErr) {
      setError((err ?? reqErr)!.message)
      setData([])
    } else {
      const open = new Map<string, AdminVerificationRequest>()
      for (const q of reqs ?? []) {
        if (!isOpenRequest(q.status) || open.has(q.business_id)) continue
        open.set(q.business_id, {
          id: q.id,
          kind: q.kind,
          licenceNumber: q.licence_number,
          issuingBody: q.issuing_body,
          createdAt: q.created_at,
        })
      }
      setData(
        (rows ?? []).map((r: BusinessRow) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          isVerified: r.is_verified,
          tier: r.tier,
          ownerId: r.owner_id,
          createdAt: r.created_at,
          openRequest: open.get(r.id) ?? null,
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

/**
 * Set a business's tier through admin_set_business_tier, the one door
 * (20261009000002): it keeps is_verified in step, audits, and tells the owner.
 * A direct update of `is_verified` alone would now break businesses_verified_tier_ck.
 */
export async function setBusinessTier(
  id: string,
  tier: BusinessTier,
  note?: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.rpc("admin_set_business_tier", {
    p_business: id,
    p_tier: tier,
    p_note: note?.trim() || undefined,
  })
  return { error: error ? businessTierError(error) : null }
}

/** Approve (tier → verified) or reject (note required) an open verification request. */
export async function reviewBusinessVerification(
  requestId: string,
  approve: boolean,
  note?: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.rpc("admin_review_business_verification", {
    p_request: requestId,
    p_approve: approve,
    p_note: note?.trim() || undefined,
  })
  return { error: error ? businessTierError(error) : null }
}

/* ------------------------------------------------------------------ */
/* Managers — master view across every building, with freeze/unfreeze  */
/* ------------------------------------------------------------------ */

export interface AdminManager {
  linkId: string // building_managers row id — the assignment, not the person
  id: string // profile id
  name: string
  email: string
  isPrimary: boolean
  isSuspended: boolean
  suspendedAt: string | null
  joinedAt: string // building_managers.created_at
  building: { id: string; name: string; code: string; city: string | null; region: string | null }
}

/**
 * The full manager roster across every building — one row per building_managers
 * link, joined to the manager's profile and their building.
 *
 * Deliberately unfiltered: the admin roster is small, and returning the whole
 * list lets the caller derive its filter options from a stable set (filtering
 * server-side would collapse the dropdown options to whatever's already
 * selected). PostgREST can't filter parent rows by an embedded resource without
 * an !inner join anyway, so a `.eq("building.city", …)` here would be a no-op.
 */
export function useAdminManagers() {
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
    const { data: rows, error: err } = await supabase
      .from("building_managers")
      .select(
        `id, is_primary, created_at,
         profile:profiles!building_managers_profile_id_fkey ( id, full_name, email, is_suspended, suspended_at ),
         building:buildings!building_managers_building_id_fkey ( id, name, building_code, city, region )`,
      )
      .order("created_at", { ascending: false })

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
        linkId: r.id,
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

    setData(mapped)
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

/** Remove a manager's assignment to one building (leaves their account intact). */
export async function revokeManagerFromBuilding(linkId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("building_managers").delete().eq("id", linkId)
  return { error: error?.message ?? null }
}

/**
 * Suspend / unsuspend an account, or grant / revoke super-admin, through
 * admin_set_user_flags (20261012000002) — audit-logged, and refusing an admin
 * who would lock themselves out. A suspension blocks login and RLS scope
 * everywhere, not just one building. Omit a flag to leave it alone.
 */
export async function setUserFlags(
  profileId: string,
  flags: { suspended?: boolean; superAdmin?: boolean },
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.rpc("admin_set_user_flags", {
    p_profile: profileId,
    p_suspended: flags.suspended,
    p_super_admin: flags.superAdmin,
  })
  return { error: error ? userFlagsError(error) : null }
}

/** The Managers tab's freeze button — one account, every building. */
export function setManagerSuspended(profileId: string, suspended: boolean): Promise<{ error: string | null }> {
  return setUserFlags(profileId, { suspended })
}

/* ------------------------------------------------------------------ */
/* Users — every account, searched on the server                       */
/* ------------------------------------------------------------------ */

export const ADMIN_USERS_PAGE = 50

/**
 * One page of accounts matching `query` by name or email (admin_list_users).
 * The search runs in the database — the profile table is not small enough to
 * ship to a browser and filter there.
 */
export function useAdminUsers(query: string, page: number) {
  const [data, setData] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: rows, error: err } = await supabase.rpc("admin_list_users", {
      p_query: query.trim() || undefined,
      p_limit: ADMIN_USERS_PAGE,
      p_offset: page * ADMIN_USERS_PAGE,
    })
    if (err) {
      console.error("[admin] list users failed", err)
      setError("Couldn't load accounts. Try again.")
      setData([])
      setTotal(0)
    } else {
      setData(
        (rows ?? []).map((r) => ({
          id: r.id,
          name: r.full_name || r.email || "Unnamed account",
          email: r.email ?? "",
          joinedAt: r.created_at,
          isSuspended: r.is_suspended,
          isSuperAdmin: r.is_super_admin,
          isResident: r.is_resident,
          managedBuildings: r.managed_buildings,
          ownsBusiness: r.owns_business,
          clinicStaff: r.clinic_staff,
        })),
      )
      setTotal(rows?.[0]?.total_count ?? 0)
      setError(null)
    }
    setLoading(false)
  }, [query, page])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, total, isLoading, error, refetch }
}

/** Platform counts for the Overview tab (admin_platform_stats). */
export function usePlatformStats() {
  const [data, setData] = useState<PlatformStats | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: raw, error: err } = await supabase.rpc("admin_platform_stats")
    if (err) {
      console.error("[admin] platform stats failed", err)
      setError("Couldn't load platform statistics. Try again.")
    } else {
      setData(parsePlatformStats(raw))
      setError(null)
    }
    setLoading(false)
  }, [])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

/* ------------------------------------------------------------------ */
/* City reports — the admin triages their status                       */
/* ------------------------------------------------------------------ */

export interface AdminMunicipalReport {
  id: string
  type: string
  description: string
  location: string | null
  reference: string | null
  status: "submitted" | "acknowledged" | "closed"
  municipality: string | null
  createdAt: string
}

/**
 * Every municipal report, newest first. `municipal_reports_select` admits
 * admins; the reporter's identity and ip hash are deliberately not selected —
 * triaging a status needs neither.
 */
export function useAdminMunicipalReports() {
  const [data, setData] = useState<AdminMunicipalReport[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("municipal_reports")
      .select("id, type, description, location_text, reference_code, status, created_at, municipality:municipalities ( name )")
      .order("created_at", { ascending: false })
      .limit(200)
    if (err) {
      setError(err.message)
      setData([])
    } else {
      type Row = {
        id: string
        type: string
        description: string
        location_text: string | null
        reference_code: string | null
        status: string
        created_at: string
        municipality: { name: string } | { name: string }[] | null
      }
      setData(
        ((rows ?? []) as unknown as Row[]).map((r) => {
          const m = Array.isArray(r.municipality) ? r.municipality[0] : r.municipality
          return {
            id: r.id,
            type: r.type,
            description: r.description,
            location: r.location_text,
            reference: r.reference_code,
            status: r.status as AdminMunicipalReport["status"],
            municipality: m?.name ?? null,
            createdAt: r.created_at,
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

/** Acknowledge or close a city report. RLS `municipal_reports_admin_write`; managers have no write path. */
export async function setMunicipalReportStatus(
  id: string,
  status: "acknowledged" | "closed",
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { data, error } = await supabase.from("municipal_reports").update({ status }).eq("id", id).select("id")
  if (error) return { error: error.message }
  // RLS filters a refused UPDATE to zero rows rather than raising.
  if (!data || data.length === 0) return { error: "Only an admin can change a city report's status." }
  return { error: null }
}
