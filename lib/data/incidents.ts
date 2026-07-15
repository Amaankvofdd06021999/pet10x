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

export type IncidentType = "noise" | "aggressive" | "off_leash" | "waste" | "damage" | "unregistered" | "other"

export type IncidentStatus =
  | "submitted"
  | "triaged"
  | "investigating"
  | "linked_to_violation"
  | "dismissed"
  | "resolved"

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
  unit?: string
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
  type: IncidentType
  status: IncidentStatus
  description: string
  location: string | null
  unitInvolved: string | null
  isAnonymous: boolean
  reference: string | null
  createdAt: string
}

/** Every incident for the buildings this manager runs. Scoped by RLS. */
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
    const { data: rows, error: err } = await supabase
      .from("incident_reports")
      .select("id, building_id, type, status, description, location_text, unit_involved, is_anonymous, reference_code, created_at")
      .order("created_at", { ascending: false })

    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(
        (rows ?? []).map((r) => ({
          id: r.id,
          buildingId: r.building_id,
          type: r.type as IncidentType,
          status: r.status as IncidentStatus,
          description: r.description,
          location: r.location_text,
          unitInvolved: r.unit_involved,
          isAnonymous: r.is_anonymous,
          reference: r.reference_code,
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
