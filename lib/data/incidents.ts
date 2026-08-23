"use client"

/**
 * Pet10x — incident reporting (PRD §6.4).
 *
 * The reporter may be a signed-out guest who only has a building code, so RLS
 * blocks them from reading `buildings` and from inserting into
 * `incident_reports` (the insert policy requires reporter_id = auth.uid()).
 * Intake therefore goes through SECURITY DEFINER RPCs, which are the only
 * things anon may call. Manager-side reads and triage use plain RLS.
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { petFileSignedUrls, isStoragePath } from "@/lib/supabase/storage"
import type { Database } from "@/lib/supabase/database.types"

/* DERIVED from the generated enums, not retyped from them.
 *
 * Both of these were hand-written unions that happened to match
 * `incident_type` and `incident_status`. Every `Record<IncidentStatus, …>` in
 * the app is described as exhaustive over the database enum and gets its
 * compile error from that — but a hand-written union only proves the map
 * matches the HAND, so a seventh SQL value would have compiled silently until
 * someone remembered to edit this file too. That is the same drift the maps
 * exist to prevent, moved one file upstream.
 *
 * Derived, regenerating `database.types.ts` after a migration is what breaks
 * the build, which is the only moment anyone is looking. */
export type IncidentType = Database["public"]["Enums"]["incident_type"]

export type IncidentStatus = Database["public"]["Enums"]["incident_status"]

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  noise: "Noise / barking",
  aggressive: "Aggressive behaviour",
  off_leash: "Off-leash",
  waste: "Waste not cleaned",
  damage: "Property damage",
  unregistered: "Unregistered pet",
  other: "Other",
}

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  submitted: "New",
  triaged: "Acknowledged",
  investigating: "Investigating",
  linked_to_violation: "Escalated",
  dismissed: "Dismissed",
  resolved: "Resolved",
}

/** An incident is still on the manager's desk until it's resolved/dismissed/escalated. */
export function isOpenIncident(s: IncidentStatus): boolean {
  return s === "submitted" || s === "triaged" || s === "investigating"
}

/* ------------------------------------------------------------------ */
/* Guest intake — no account                                           */
/* ------------------------------------------------------------------ */

export interface PublicBuilding {
  name: string
  address: string | null
  city: string | null
  region: string | null
  postalCode: string | null
}

/**
 * Find a building by name, street or postal code, with no account.
 *
 * Deliberately returns no id and no code — see the migration. A hit tells a
 * witness "yes, this building is on Pet10x, now find its code", which is the
 * question they actually have standing outside it. The code still does the
 * authorising.
 */
export async function searchBuildingsPublic(q: string): Promise<PublicBuilding[]> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase || q.trim().length < 3) return []
  const { data, error } = await supabase.rpc("search_buildings_public", { q })
  if (error || !data) return []
  return ((data as unknown as { matches?: PublicBuilding[] }).matches ?? []).filter(Boolean)
}

/** Validate a building code against the real `buildings` table. */
export async function resolveBuildingCodeLive(
  code: string,
): Promise<{ valid: boolean; name?: string; buildingId?: string }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { valid: false }

  const { data, error } = await supabase.rpc("resolve_building_code", { p_code: code })
  if (error || !data) return { valid: false }

  const r = data as unknown as { valid: boolean; name?: string; building_id?: string }
  return r.valid ? { valid: true, name: r.name, buildingId: r.building_id } : { valid: false }
}

/** File a report. Returns the reference code the reporter can follow up with. */
export async function submitIncident(input: {
  buildingCode: string
  type: IncidentType
  description: string
  location?: string
  /** Manager-entered reports only. Guests are never asked for a unit. */
  unit?: string
  /** The pet the reporter picked from photos. */
  petId?: string
  /**
   * Storage paths of evidence already uploaded under this report's draft id.
   * The RPC validates each one against `{buildingId}/{draftUuid}/{name}` and
   * refuses the report if any path was not ours to attach.
   */
  evidencePaths?: string[]
  anonymous?: boolean
}): Promise<{ ok: boolean; reference?: string; error?: string }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { ok: false, error: "Not configured." }

  const { data, error } = await supabase.rpc("submit_incident_report", {
    p_building_code: input.buildingCode,
    p_type: input.type,
    p_description: input.description,
    p_location: input.location ?? undefined,
    p_unit: input.unit ?? undefined,
    p_anonymous: input.anonymous ?? true,
    p_pet_id: input.petId ?? undefined,
    p_evidence_paths: input.evidencePaths ?? undefined,
  })

  if (error) return { ok: false, error: error.message }

  const r = data as unknown as { ok: boolean; reference?: string; error?: string }
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.error === "invalid_code"
          ? "That building code isn't recognised."
          : r.error === "description_required"
            ? "Please describe what happened."
            : r.error === "too_many_files"
              ? "Up to 5 photos per report."
              : r.error === "bad_evidence_path"
                ? "Those photos couldn't be attached — try sending without them."
                : "Couldn't file the report.",
    }
  }
  return { ok: true, reference: r.reference }
}

export interface IncidentStatusResult {
  found: boolean
  reference?: string
  status?: IncidentStatus
  type?: IncidentType
  building?: string
  filedAt?: string
  escalated?: boolean
}

/** Look a report up by its reference code — how an anonymous reporter closes the loop. */
export async function lookupIncident(reference: string): Promise<IncidentStatusResult> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { found: false }

  const { data, error } = await supabase.rpc("incident_status_by_reference", { p_ref: reference })
  if (error || !data) return { found: false }

  const r = data as unknown as {
    found: boolean
    reference?: string
    status?: IncidentStatus
    type?: IncidentType
    building?: string
    filed_at?: string
    escalated?: boolean
  }
  if (!r.found) return { found: false }

  return {
    found: true,
    reference: r.reference,
    status: r.status,
    type: r.type,
    building: r.building,
    filedAt: r.filed_at,
    escalated: r.escalated,
  }
}

/* ------------------------------------------------------------------ */
/* Manager side — the triage queue                                     */
/* ------------------------------------------------------------------ */

export interface ManagerIncident {
  id: string
  buildingId: string | null
  buildingName: string | null
  type: IncidentType
  status: IncidentStatus
  description: string
  location: string | null
  unitInvolved: string | null
  isAnonymous: boolean
  reference: string | null
  createdAt: string
  /** The pet the reporter picked out, if they recognised one. */
  petId: string | null
  petName: string | null
  petBreed: string | null
  petSpecies: string | null
  petPhotoUrl: string | null
  /** The unit the identified pet lives in — the manager may see this; the reporter may not. */
  petUnit: string | null
  petOwnerName: string | null
  /** Photos the reporter attached, signed for an hour. Empty for most reports. */
  evidenceUrls: string[]
  /**
   * How many photos the report actually carries. Kept alongside the signed
   * URLs so the card can tell "the reporter sent none" (say nothing) apart
   * from "signing failed" (say so) — those must not look the same.
   */
  evidenceCount: number
}

/**
 * Every incident for the buildings this manager runs.
 *
 * Scoped explicitly to those buildings rather than left to RLS. The policy
 * reads `is_manager_of(building_id) OR is_admin()`, so for an ordinary manager
 * an unscoped select happens to return the right rows — and for a super admin
 * it silently returns every building on Pet10x in one undifferentiated queue,
 * with the tab counts to match. RLS is the floor, not the filter.
 */
export function useIncidents() {
  const [data, setData] = useState<ManagerIncident[]>([])
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
      setData([])
      setLoading(false)
      return
    }

    const { data: mine } = await supabase
      .from("building_managers")
      .select("building_id")
      .eq("profile_id", user.id)
    const buildingIds = (mine ?? []).map((m) => m.building_id).filter(Boolean) as string[]
    if (buildingIds.length === 0) {
      setData([])
      setError(null)
      setLoading(false)
      return
    }

    const { data: rows, error: err } = await supabase
      .from("incident_reports")
      .select(
        `id, building_id, type, status, description, location_text, unit_involved, is_anonymous,
         reference_code, created_at, pet_id, evidence_paths,
         building:buildings!incident_reports_building_id_fkey ( name ),
         pet:pets!incident_reports_pet_id_fkey (
           id, name, breed, species, image_url,
           unit:units!pets_unit_id_fkey ( unit_number ),
           owner:profiles!pets_owner_id_fkey ( full_name )
         )`,
      )
      .in("building_id", buildingIds)
      .order("created_at", { ascending: false })

    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    const first = <T,>(v: T | T[] | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

    type Row = (typeof rows extends (infer R)[] ? R : never) & Record<string, unknown>
    const mapped = ((rows ?? []) as unknown as Row[]).map((r) => {
      const b = first(r.building as { name: string } | null)
      const pet = first(
        r.pet as {
          id: string
          name: string
          breed: string | null
          species: string | null
          image_url: string | null
          unit: { unit_number: string } | { unit_number: string }[] | null
          owner: { full_name: string | null } | { full_name: string | null }[] | null
        } | null,
      )
      const evidencePaths = ((r.evidence_paths as string[] | null) ?? []).filter(Boolean)
      return {
        id: r.id as string,
        buildingId: (r.building_id as string) ?? null,
        buildingName: b?.name ?? null,
        type: r.type as IncidentType,
        status: r.status as IncidentStatus,
        description: r.description as string,
        location: (r.location_text as string) ?? null,
        unitInvolved: (r.unit_involved as string) ?? null,
        isAnonymous: Boolean(r.is_anonymous),
        reference: (r.reference_code as string) ?? null,
        createdAt: r.created_at as string,
        petId: pet?.id ?? null,
        petName: pet?.name ?? null,
        petBreed: pet?.breed ?? null,
        petSpecies: pet?.species ?? null,
        petPhotoUrl: pet?.image_url ?? null,
        petUnit: first(pet?.unit ?? null)?.unit_number ?? null,
        petOwnerName: first(pet?.owner ?? null)?.full_name ?? null,
        evidencePaths,
        evidenceUrls: [] as string[],
        evidenceCount: evidencePaths.length,
      }
    })

    // Photos are storage paths, not URLs. Sign them so the tiles resolve.
    const paths = mapped.map((m) => m.petPhotoUrl).filter((p): p is string => !!p && isStoragePath(p))
    if (paths.length > 0) {
      const signed = await petFileSignedUrls(paths)
      for (const m of mapped) {
        if (m.petPhotoUrl && signed[m.petPhotoUrl]) m.petPhotoUrl = signed[m.petPhotoUrl]
      }
    }

    // The reporter's photos live in a different bucket from the pet photos above:
    // `guest-evidence`, foldered by building, readable only by that building's
    // manager. One batch for the whole queue.
    const evidencePaths = mapped.flatMap((m) => m.evidencePaths)
    if (evidencePaths.length > 0) {
      const { data: urls } = await supabase.storage.from("guest-evidence").createSignedUrls(evidencePaths, 3600)
      const signed: Record<string, string> = {}
      for (const u of urls ?? []) if (u.signedUrl && u.path) signed[u.path] = u.signedUrl
      for (const m of mapped) m.evidenceUrls = m.evidencePaths.map((p) => signed[p]).filter(Boolean)
    }

    setData(mapped)
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

/** Move an incident along the triage path. */
export async function setIncidentStatus(id: string, status: IncidentStatus): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from("incident_reports")
    .update({ status, triaged_by: user?.id ?? null })
    .eq("id", id)
  return { error: error?.message ?? null }
}

/** Turn an incident into a violation, atomically, keeping the paper trail linked. */
export async function escalateIncident(id: string): Promise<{ error: string | null; violationId?: string }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }

  const { data, error } = await supabase.rpc("escalate_incident_to_violation", { p_incident: id })
  if (error) return { error: error.message }

  const r = data as unknown as { ok: boolean; error?: string; violation_id?: string }
  if (!r.ok) return { error: r.error === "forbidden" ? "You don't manage this building." : "Couldn't escalate." }
  return { error: null, violationId: r.violation_id }
}

/* ------------------------- pets, for identification ------------------------ */

/**
 * A pet a reporter can point at: name, species, breed and a photo, nothing else.
 *
 * The shape only — fetching it lives in `reportablePetsSigned`
 * (`lib/data/evidence.ts`), which goes through `/api/report/pets` so the photo
 * URLs are signed on the server. Do not add a browser-side fetcher back here:
 * a guest holds no session, so signing from the browser returns null for every
 * photo and the pet picker renders blank — the bug that route exists to fix.
 */
export interface ReportablePet {
  id: string
  name: string
  species: string
  breed: string | null
  /** Signed URL, or null when the pet has no photo. */
  photoUrl: string | null
}
