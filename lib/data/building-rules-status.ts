import { REQUIREMENT_FLAG_TO_GAP_KIND, type Gap } from "./completeness"

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
  const kind = REQUIREMENT_FLAG_TO_GAP_KIND[requirementKey]
  if (!kind) return { state: "none" }
  const gap = gaps.find((g) => g.key === `${kind}:${petId}`)
  return gap ? { state: "unmet", gap } : { state: "met" }
}
