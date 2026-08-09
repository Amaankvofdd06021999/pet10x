"use client"

/**
 * What a resident still owes their building.
 *
 * Derived, never stored. A completeness column would drift the moment a
 * document was uploaded or a bylaw changed, and would then have to be
 * recomputed by something — which is the same work, done later and less
 * reliably.
 *
 * One function serves both roles: the resident's "what's missing" card and
 * the manager's Incomplete filter read the same output, so the two can never
 * disagree about what is outstanding.
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/** The five flags a building may enforce, from `buildings.pet_rules`. */
export interface BuildingPetRules {
  require_rabies?: boolean
  require_core_vaccines?: boolean
  require_license?: boolean
  require_insurance?: boolean
  require_spay_neuter?: boolean
}

export type GapId =
  | "unit"
  | "pet"
  | "rabies"
  | "core_vaccines"
  | "license"
  | "insurance"
  | "spay_neuter"
  | "emergency_contact"

export interface Gap {
  id: GapId
  /** Shown to both the resident and the manager. */
  label: string
  /** Which pet it concerns, when it is pet-specific. */
  petId?: string
  petName?: string
  /** Screen that resolves it, for the resident's deep link. */
  target: string
  /** Identification and contact block everything else; compliance can follow. */
  severity: "blocking" | "required"
}

export interface CompletenessInput {
  /** Retained on the input so callers need not change; no gap is raised for it. */
  phone: string | null
  unitId: string | null
  hasBuilding: boolean
  rules: BuildingPetRules
  pets: {
    id: string
    name: string
    neutered: boolean | null
    vaccinations: { name: string; status: string }[]
    documentKinds: string[]
    hasEmergencyContact: boolean
  }[]
}

const BAD_VAX = ["expired", "missing", "rejected"]

/**
 * The single source of truth for "what is outstanding".
 *
 * Pure and synchronous so it can be unit-tested and so the manager's list can
 * be computed from rows it already has, without a second round trip.
 */
export function computeGaps(input: CompletenessInput): Gap[] {
  const gaps: Gap[] = []

  // Phone is deliberately NOT asked for. Managers reach residents by email —
  // profiles.email is populated from the auth account for everyone, so the
  // channel exists without demanding a second one at registration.
  if (input.hasBuilding && !input.unitId) {
    // Targets the profile, not link-building. That screen only offers to
    // CANCEL the building request — tapping "Unit number" and being shown a
    // cancel button was the opposite of the intent.
    gaps.push({ id: "unit", label: "Unit number", target: "profile", severity: "blocking" })
  }

  if (input.pets.length === 0) {
    gaps.push({ id: "pet", label: "Add your pet", target: "add-pet", severity: "blocking" })
    // Nothing pet-specific can be missing when there is no pet — listing
    // rabies for a pet that does not exist reads as noise.
    return gaps
  }

  const r = input.rules
  for (const pet of input.pets) {
    const has = (kind: string) => pet.documentKinds.includes(kind)
    const vaxOk = (match: RegExp) =>
      pet.vaccinations.some((v) => match.test(v.name) && !BAD_VAX.includes(v.status))

    if (r.require_rabies && !vaxOk(/rabies/i)) {
      gaps.push({ id: "rabies", label: "Rabies vaccination", petId: pet.id, petName: pet.name, target: "pet-detail", severity: "required" })
    }
    if (r.require_core_vaccines && pet.vaccinations.filter((v) => !BAD_VAX.includes(v.status)).length === 0) {
      gaps.push({ id: "core_vaccines", label: "Core vaccinations", petId: pet.id, petName: pet.name, target: "pet-detail", severity: "required" })
    }
    if (r.require_license && !has("municipal_license")) {
      gaps.push({ id: "license", label: "Municipal licence", petId: pet.id, petName: pet.name, target: "pet-detail", severity: "required" })
    }
    if (r.require_insurance && !has("liability_insurance")) {
      gaps.push({ id: "insurance", label: "Liability insurance", petId: pet.id, petName: pet.name, target: "pet-detail", severity: "required" })
    }
    if (r.require_spay_neuter && !pet.neutered) {
      gaps.push({ id: "spay_neuter", label: "Spay / neuter confirmation", petId: pet.id, petName: pet.name, target: "pet-detail", severity: "required" })
    }

    // Not a compliance rule, and required regardless of building: the public
    // /emergency/[code] page a stranger scans is blank without it.
    if (!pet.hasEmergencyContact) {
      gaps.push({ id: "emergency_contact", label: "Emergency contact", petId: pet.id, petName: pet.name, target: "pet-detail", severity: "required" })
    }
  }

  return gaps
}

export interface CompletenessResult {
  gaps: Gap[]
  isLoading: boolean
  refetch: () => void
}

/** The signed-in resident's own outstanding items. */
export function useMyCompleteness(): CompletenessResult {
  const [gaps, setGaps] = useState<Gap[]>([])
  const [isLoading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setGaps([])
      setLoading(false)
      return
    }

    const [{ data: profile }, { data: link }, { data: pets }] = await Promise.all([
      supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle(),
      supabase
        .from("resident_links")
        .select("unit_id, building_id, status")
        .eq("profile_id", user.id)
        .in("status", ["pending", "approved"])
        .is("left_at", null)
        .maybeSingle(),
      supabase
        .from("pets")
        .select(
          "id, name, neutered, pet_vaccinations(name, status), pet_documents(kind), pet_emergency_contacts(id)",
        )
        .eq("owner_id", user.id)
        .is("deleted_at", null),
    ])

    let rules: BuildingPetRules = {}
    if (link?.building_id) {
      const { data: building } = await supabase
        .from("buildings")
        .select("pet_rules")
        .eq("id", link.building_id)
        .maybeSingle()
      rules = ((building?.pet_rules ?? {}) as BuildingPetRules) || {}
    }

    type PetRow = {
      id: string
      name: string
      neutered: boolean | null
      pet_vaccinations: { name: string; status: string }[] | null
      pet_documents: { kind: string }[] | null
      pet_emergency_contacts: { id: string }[] | null
    }

    setGaps(
      computeGaps({
        phone: profile?.phone ?? null,
        unitId: link?.unit_id ?? null,
        hasBuilding: Boolean(link?.building_id),
        rules,
        pets: ((pets ?? []) as PetRow[]).map((p) => ({
          id: p.id,
          name: p.name,
          neutered: p.neutered,
          vaccinations: p.pet_vaccinations ?? [],
          documentKinds: (p.pet_documents ?? []).map((d) => d.kind),
          hasEmergencyContact: (p.pet_emergency_contacts ?? []).length > 0,
        })),
      }),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { gaps, isLoading, refetch }
}

/** "Phone number, Unit number and 2 more" — for a one-line summary. */
export function summariseGaps(gaps: Gap[]): string {
  if (gaps.length === 0) return "All set"
  const labels = gaps.map((g) => (g.petName ? `${g.label} (${g.petName})` : g.label))
  if (labels.length <= 2) return labels.join(" and ")
  return `${labels.slice(0, 2).join(", ")} and ${labels.length - 2} more`
}
