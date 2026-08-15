"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * Reporting an animal to a city rather than to a building.
 *
 * Pet10x does not file with any municipality and has no integration with one.
 * It records the report, hands back a reference, and shows the real
 * animal-control contact for the area so the person can file officially. The
 * UI says all of that plainly — a screen that implied a dog attack had been
 * reported to authorities when nothing was sent would be the worst kind of
 * false reassurance.
 */

/**
 * Deliberately short. Noise, waste and damage are strata matters that a city
 * will not act on; what a municipality has jurisdiction over is animals that
 * hurt or endanger. Offering the full building list here would send people
 * down a path that ends in nothing happening.
 */
export const MUNICIPAL_TYPES = [
  {
    id: "attack_on_pet",
    label: "Attack on another pet",
    hint: "An animal bit or attacked someone's pet",
  },
  {
    id: "attack_on_person",
    label: "Attack on a person",
    hint: "An animal bit or attacked someone",
  },
  {
    id: "dangerous_animal",
    label: "Dangerous or threatening animal",
    hint: "Lunging, charging or threatening behaviour",
  },
  {
    id: "animal_at_large",
    label: "Animal running loose",
    hint: "Unattended or roaming with no owner present",
  },
] as const

export type MunicipalType = (typeof MUNICIPAL_TYPES)[number]["id"]

export interface Municipality {
  id: string
  name: string
  region: string | null
  phone: string | null
  url: string | null
  notes: string | null
}

/**
 * Which city covers a postal code.
 *
 * Coordinates are accepted and stored but are NOT used to guess a
 * municipality — without boundary data any guess is nearest-name-wins, and
 * naming the wrong city on a dangerous-animal report is worse than naming
 * none. Returns null when nothing matches, which the UI handles.
 */
export async function resolveMunicipality(
  postal?: string | null,
  lat?: number | null,
  lng?: number | null,
): Promise<Municipality | null> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return null

  const { data, error } = await supabase.rpc("resolve_municipality", {
    p_postal: postal ?? undefined,
    p_lat: lat ?? undefined,
    p_lng: lng ?? undefined,
  })
  if (error || !data) return null

  const r = data as unknown as {
    found: boolean
    id?: string
    name?: string
    region?: string | null
    phone?: string | null
    url?: string | null
    notes?: string | null
  }
  if (!r.found || !r.id || !r.name) return null
  return {
    id: r.id,
    name: r.name,
    region: r.region ?? null,
    phone: r.phone ?? null,
    url: r.url ?? null,
    notes: r.notes ?? null,
  }
}

export interface MunicipalSubmitResult {
  ok: boolean
  reference?: string
  municipality?: Municipality | null
  error?: string
}

export async function submitMunicipalReport(input: {
  type: MunicipalType
  description: string
  postalCode?: string | null
  lat?: number | null
  lng?: number | null
  location?: string | null
  anonymous?: boolean
}): Promise<MunicipalSubmitResult> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { ok: false, error: "Not configured." }

  const { data, error } = await supabase.rpc("submit_municipal_report", {
    p_type: input.type,
    p_description: input.description,
    p_postal: input.postalCode ?? undefined,
    p_lat: input.lat ?? undefined,
    p_lng: input.lng ?? undefined,
    p_location: input.location ?? undefined,
    p_anonymous: input.anonymous ?? true,
  })
  if (error) return { ok: false, error: error.message }

  const r = data as unknown as {
    ok: boolean
    error?: string
    reference?: string
    municipality?: { found: boolean; id?: string; name?: string; region?: string | null; phone?: string | null; url?: string | null; notes?: string | null }
  }
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.error === "description_required"
          ? "Please describe what happened."
          : r.error === "invalid_type"
            ? "Pick what happened."
            : "Couldn't file the report.",
    }
  }

  const m = r.municipality
  return {
    ok: true,
    reference: r.reference,
    municipality:
      m?.found && m.id && m.name
        ? { id: m.id, name: m.name, region: m.region ?? null, phone: m.phone ?? null, url: m.url ?? null, notes: m.notes ?? null }
        : null,
  }
}

/**
 * The signed-in resident's own building code.
 *
 * A linked resident reporting to their building should not be asked for a code
 * they were given once and have since thrown away. `buildings_select` already
 * lets a resident read their own building, so this needs no new RPC — and it
 * cannot reach a building they are not in.
 */
export async function myBuildingCode(): Promise<{ code: string; name: string } | null> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return null

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: link } = await supabase
    .from("resident_links")
    .select("building_id")
    .eq("profile_id", user.id)
    .in("status", ["pending", "approved"])
    .is("left_at", null)
    .maybeSingle()
  if (!link?.building_id) return null

  const { data: b } = await supabase
    .from("buildings")
    .select("building_code, name")
    .eq("id", link.building_id)
    .maybeSingle()
  return b ? { code: b.building_code, name: b.name } : null
}
