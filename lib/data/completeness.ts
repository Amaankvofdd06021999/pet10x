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
import { hasRabies } from "./vaccines"
import { usePets } from "./live"
import type { ScreenKey } from "@/lib/navigation"

/** The five flags a building may enforce, from `buildings.pet_rules`. */
export interface BuildingPetRules {
  require_rabies?: boolean
  require_core_vaccines?: boolean
  require_license?: boolean
  require_insurance?: boolean
  require_spay_neuter?: boolean
}

export type GapId =
  | "address"
  | "unit"
  | "pet"
  | "rabies"
  | "core_vaccines"
  | "license"
  | "insurance"
  | "spay_neuter"
  | "emergency_contact"

export interface ComplianceGap {
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
  /** Whether a home address is on file. Only consulted when there is no building. */
  hasAddress: boolean
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
 * What a building's manager sees outstanding for a resident.
 *
 * Pure and synchronous so the manager's list can be computed from rows it
 * already has, without a second round trip. The resident's own banner reads
 * computeGaps below, which words the same facts for the person who has to act.
 */
export function computeComplianceGaps(input: CompletenessInput): ComplianceGap[] {
  const gaps: ComplianceGap[] = []

  // Phone is deliberately NOT asked for. Managers reach residents by email —
  // profiles.email is populated from the auth account for everyone, so the
  // channel exists without demanding a second one at registration.
  /* No building at all: ask for an address instead.
   *
   * A standalone owner has no resident_link, so no unit gap ever fired and the
   * banner had nothing to say to them. The address is what lets the app notice
   * their building is already on Pet10x and offer the code path. */
  if (!input.hasBuilding && !input.hasAddress) {
    gaps.push({ id: "address", label: "Home address", target: "profile", severity: "required" })
  }

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
    const rabiesOk = hasRabies(pet.vaccinations.filter((v) => !BAD_VAX.includes(v.status)).map((v) => v.name))

    if (r.require_rabies && !rabiesOk) {
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

/**
 * Which computeGaps kind answers each `buildings.pet_rules` flag, as a positive
 * grammar. One table, read by the Building rules screen's per-pet status and
 * checked against computeGaps in its test, so a flag cannot be added in one
 * place and forgotten in the other.
 */
export const REQUIREMENT_FLAG_TO_GAP_KIND: Readonly<Record<string, string>> = {
  require_rabies: "rabies",
  require_core_vaccines: "core_vaccines",
  require_license: "municipal_license",
  require_insurance: "liability_insurance",
  require_spay_neuter: "spay_neuter",
}

/** One thing the resident can fix, and the exact place to fix it. */
export interface Gap {
  key: string
  label: string
  target: { screen: ScreenKey; id?: string; tab?: "overview" | "vaccinations" | "documents" | "contacts" }
}

/** Document kinds a building can require, as the resident reads them mid-sentence. */
const DOC_REQUIREMENTS: { requirement: string; kind: string; noun: string }[] = [
  { requirement: "municipal_license", kind: "municipal_license", noun: "license" },
  { requirement: "liability_insurance", kind: "liability_insurance", noun: "liability insurance" },
]

export interface SetupInput {
  /** The viewer has an approved resident link. A pending request is not a building yet. */
  linked: boolean
  hasUnit: boolean
  hasAddress: boolean
  pets: {
    id: string
    name: string
    documentKinds: string[]
    /** Names of vaccinations that count (not expired, missing or rejected). */
    vaccinationNames: string[]
    contacts: number
    /** Only read when `requirements` includes "spay_neuter". */
    neutered?: boolean | null
  }[]
  /** Building rules in force: rabies, core_vaccines, municipal_license, liability_insurance, spay_neuter. */
  requirements: string[]
}

/**
 * What Home's banner asks the signed-in owner for, worded for their situation.
 *
 * Ordered by importance — unit, pet contacts, vaccinations, documents,
 * address — so a caller wanting "one next step" can take the first.
 */
export function computeGaps(input: SetupInput): { heading: string; gaps: Gap[] } {
  const gaps: Gap[] = []
  const wants = (r: string) => input.requirements.includes(r)

  if (input.linked && !input.hasUnit) {
    // The profile, not link-building: that screen only offers to cancel the request.
    gaps.push({ key: "unit", label: "Add your unit number", target: { screen: "profile" } })
  }

  if (input.pets.length === 0) {
    // Nothing pet-specific can be missing when there is no pet.
    gaps.push({ key: "pet", label: "Add your pet", target: { screen: "add-pet" } })
  }

  const petGaps = (pick: (pet: SetupInput["pets"][number]) => Gap[]) => input.pets.flatMap(pick)
  const at = (id: string, tab: NonNullable<Gap["target"]["tab"]>) => ({ screen: "pet-detail" as const, id, tab })

  // Required regardless of building: the public emergency page a stranger
  // scans is blank without a contact.
  gaps.push(
    ...petGaps((p) =>
      p.contacts > 0 ? [] : [{ key: `contact:${p.id}`, label: `Add ${p.name}'s emergency contact`, target: at(p.id, "contacts") }],
    ),
  )

  gaps.push(
    ...petGaps((p) => {
      const out: Gap[] = []
      if (wants("rabies") && !hasRabies(p.vaccinationNames)) {
        out.push({ key: `rabies:${p.id}`, label: `Add ${p.name}'s rabies vaccination`, target: at(p.id, "vaccinations") })
      }
      if (wants("core_vaccines") && p.vaccinationNames.length === 0) {
        out.push({ key: `core_vaccines:${p.id}`, label: `Add ${p.name}'s vaccinations`, target: at(p.id, "vaccinations") })
      }
      return out
    }),
  )

  gaps.push(
    ...petGaps((p) => {
      const out: Gap[] = []
      for (const d of DOC_REQUIREMENTS) {
        if (wants(d.requirement) && !p.documentKinds.includes(d.kind)) {
          out.push({ key: `${d.requirement}:${p.id}`, label: `Upload ${p.name}'s ${d.noun}`, target: at(p.id, "documents") })
        }
      }
      // Set on the pet's own page, not as an upload.
      if (wants("spay_neuter") && !p.neutered) {
        out.push({ key: `spay_neuter:${p.id}`, label: `Confirm ${p.name} is spayed or neutered`, target: at(p.id, "overview") })
      }
      return out
    }),
  )

  // Linked residents' address is the building's address plus their unit; an
  // unlinked owner has no building to ask it for.
  if (input.linked && !input.hasAddress) {
    gaps.push({ key: "address", label: "Add your home address", target: { screen: "profile" } })
  }

  /* The heading names who is asking. A gap raised by a building rule is the
   * building's ask — even while the link is still pending, since the rules
   * already apply to the pets being registered there. So are the unit and the
   * address: both are raised only for a linked resident, and are how the
   * building identifies them. An emergency contact alone is the owner's own
   * setup. */
  const buildingAsks = gaps.some((g) => BUILDING_GAP_KINDS.has(g.key.split(":")[0]))
  return {
    heading: buildingAsks ? "Your building needs a few things" : "Finish your pet's profile",
    gaps,
  }
}

/** Gap kinds that exist only because the resident's building asks for them. */
const BUILDING_GAP_KINDS: ReadonlySet<string> = new Set([
  "unit",
  "address",
  "rabies",
  "core_vaccines",
  ...DOC_REQUIREMENTS.map((d) => d.requirement),
  "spay_neuter",
])

/**
 * The one next step onboarding offers once the owner's pet exists.
 *
 * The first gap, in computeGaps' order of importance — skipping "pet", which
 * a read that raced the insert could still report for the pet just added.
 */
export function nextStepAfterPet(gaps: Gap[]): Gap | null {
  return gaps.find((g) => g.key !== "pet") ?? null
}

export interface CompletenessResult {
  heading: string
  gaps: Gap[]
  isLoading: boolean
  /** A read failed. The gaps are then the last good answer (or none), never
      ones computed from the failed read. */
  error: string | null
  refetch: () => void
}

const COMPLETENESS_LOAD_FAILED = "Couldn't check what your building needs. Try again."

/**
 * The signed-in resident's own outstanding items.
 *
 * Pet identity comes from the shared pets cache, which Home has already
 * loaded. This used to re-select every pet with three embeds and then, once
 * the link came back, make a second round trip for `buildings.pet_rules`. Now
 * every read it still needs — vaccinations, documents and contacts for those
 * pet ids, the profile, and the link with its building's rules embedded — goes
 * out in one `Promise.all`.
 *
 * The rules ride on the resident_links row rather than coming from the shared
 * link store, so "linked", the unit and the rules are always one answer about
 * one link: a store that failed to load cannot turn the rules into `{}` while
 * the link still reads as approved.
 *
 * A failed read keeps the previous gaps and reports `error`. Gaps computed
 * from a failed vaccinations read would ask for a rabies record already on
 * file.
 */
export function useMyCompleteness(): CompletenessResult {
  const [result, setResult] = useState<{ heading: string; gaps: Gap[] }>({ heading: "", gaps: [] })
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pets = usePets()
  const ready = !pets.isLoading
  /* Keyed on a string of what is read from each pet, not on the array: the
     cache hands over a new array after any pet mutation, and a rename or a
     neutered toggle must re-run this while an unrelated re-render must not. */
  const petKey = JSON.stringify(pets.data.map((p) => [p.id, p.name, p.neutered ?? null]))

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    if (!ready) return
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setResult({ heading: "", gaps: [] })
      setLoading(false)
      return
    }

    const petList = JSON.parse(petKey) as [string, string, boolean | null][]
    const ids = petList.map(([id]) => id)
    /* PostgREST renders `.in("pet_id", [])` as `in.()`, a syntax error rather
       than an empty result — with no pets there is nothing to ask. */
    const none = Promise.resolve({ data: [] as never[], error: null })

    const [profileRes, linkRes, vaxRes, docRes, contactRes] = await Promise.all([
      supabase.from("profiles").select("phone, street_address, postal_code").eq("id", user.id).maybeSingle(),
      supabase
        .from("resident_links")
        .select("unit_id, building_id, status, building:buildings(pet_rules)")
        .eq("profile_id", user.id)
        .in("status", ["pending", "approved"])
        .is("left_at", null)
        .maybeSingle(),
      ids.length ? supabase.from("pet_vaccinations").select("pet_id, name, status").in("pet_id", ids) : none,
      ids.length ? supabase.from("pet_documents").select("pet_id, kind").in("pet_id", ids) : none,
      ids.length ? supabase.from("pet_emergency_contacts").select("pet_id").in("pet_id", ids) : none,
    ])

    const failed = [profileRes, linkRes, vaxRes, docRes, contactRes].find((r) => r.error)
    if (failed) {
      console.error("[completeness] read failed", failed.error)
      setError(COMPLETENESS_LOAD_FAILED)
      setLoading(false)
      return
    }
    const profile = profileRes.data
    const linkRow = linkRes.data
    const vaccinations = vaxRes.data
    const documents = docRes.data
    const contacts = contactRes.data
    const building = Array.isArray(linkRow?.building) ? linkRow.building[0] : linkRow?.building

    const rules: BuildingPetRules = ((building?.pet_rules ?? {}) as BuildingPetRules) || {}

    const byPet = <T extends { pet_id: string }>(rows: T[] | null) => {
      const m = new Map<string, T[]>()
      for (const r of rows ?? []) m.set(r.pet_id, [...(m.get(r.pet_id) ?? []), r])
      return m
    }
    const vaxByPet = byPet(vaccinations as { pet_id: string; name: string; status: string }[] | null)
    const docsByPet = byPet(documents as { pet_id: string; kind: string }[] | null)
    const contactsByPet = byPet(contacts as { pet_id: string }[] | null)

    // Rule flags the building enforces, as the names computeGaps reads.
    const requirements = Object.entries(REQUIREMENT_FLAG_TO_GAP_KIND)
      .filter(([flag]) => rules[flag as keyof BuildingPetRules])
      .map(([, name]) => name)

    setResult(
      computeGaps({
        linked: linkRow?.status === "approved",
        hasUnit: Boolean(linkRow?.unit_id),
        hasAddress: Boolean(profile?.street_address?.trim() || profile?.postal_code?.trim()),
        requirements,
        pets: petList.map(([id, name, neutered]) => ({
          id,
          name,
          neutered,
          vaccinationNames: (vaxByPet.get(id) ?? []).filter((v) => !BAD_VAX.includes(v.status)).map((v) => v.name),
          documentKinds: (docsByPet.get(id) ?? []).map((d) => d.kind),
          contacts: (contactsByPet.get(id) ?? []).length,
        })),
      }),
    )
    setError(null)
    setLoading(false)
  }, [ready, petKey])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { heading: result.heading, gaps: result.gaps, isLoading, error, refetch }
}

/** "Phone number, Unit number and 2 more" — for a one-line summary. */
export function summariseGaps(gaps: ComplianceGap[]): string {
  if (gaps.length === 0) return "All set"
  const labels = gaps.map((g) => (g.petName ? `${g.label} (${g.petName})` : g.label))
  if (labels.length <= 2) return labels.join(" and ")
  return `${labels.slice(0, 2).join(", ")} and ${labels.length - 2} more`
}
