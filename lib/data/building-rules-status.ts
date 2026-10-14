import type { Gap } from "./completeness"

/**
 * Which `computeGaps` gap kind answers each building requirement.
 *
 * A POSITIVE GRAMMAR: the requirements that are checked per pet, named one by
 * one. Everything else (registry, weight and unit limits) has no per-pet
 * state to show, so it falls through to "none" rather than a guessed tick.
 *
 * The kinds are the ones computeGaps emits as `<kind>:<petId>`, so this
 * screen and Home's banner read one decision and can never disagree.
 */
const GAP_KIND: Record<string, string> = {
  require_rabies: "rabies",
  require_core_vaccines: "core_vaccines",
  require_license: "municipal_license",
  require_insurance: "liability_insurance",
  require_spay_neuter: "spay_neuter",
}

export type RequirementStatus =
  | { state: "met" }
  | { state: "unmet"; gap: Gap }
  | { state: "none" }

/**
 * Whether one pet meets one requirement, given that owner's current gaps.
 *
 * Absence of a gap is "met" only because computeGaps is built from the same
 * rules; callers must pass gaps computed against the building being shown.
 */
export function requirementStatus(requirementKey: string, petId: string, gaps: Gap[]): RequirementStatus {
  const kind = GAP_KIND[requirementKey]
  if (!kind) return { state: "none" }
  const gap = gaps.find((g) => g.key === `${kind}:${petId}`)
  return gap ? { state: "unmet", gap } : { state: "met" }
}
