import { describe, expect, it } from "vitest"
import { computeGaps, REQUIREMENT_FLAG_TO_GAP_KIND } from "./completeness"
import { requirementStatus } from "./building-rules-status"
import { readRequirements } from "./building-rules"

const pet = (id: string, over: Partial<Parameters<typeof computeGaps>[0]["pets"][number]> = {}) => ({
  id,
  name: id,
  documentKinds: [] as string[],
  vaccinationNames: [] as string[],
  contacts: 1,
  neutered: false,
  ...over,
})

describe("requirementStatus", () => {
  // Driven by the shared table: a flag added there but not understood by
  // computeGaps (or readRequirements) fails below.
  const requirements = Object.values(REQUIREMENT_FLAG_TO_GAP_KIND)
  const petRules = Object.fromEntries(Object.keys(REQUIREMENT_FLAG_TO_GAP_KIND).map((k) => [k, true]))

  it("is unmet for every requirement a bare pet fails, carrying the gap to fix", () => {
    const { gaps } = computeGaps({ linked: true, hasUnit: true, hasAddress: true, pets: [pet("a")], requirements })
    for (const r of readRequirements(petRules)) {
      const s = requirementStatus(r.key, "a", gaps)
      expect(s.state, r.key).toBe("unmet")
    }
    const rabies = requirementStatus("require_rabies", "a", gaps)
    expect(rabies.state === "unmet" && rabies.gap.target).toEqual({ screen: "pet-detail", id: "a", tab: "vaccinations" })
  })

  it("is met when computeGaps raises no gap for that pet, and only for that pet", () => {
    const { gaps } = computeGaps({
      linked: true,
      hasUnit: true,
      hasAddress: true,
      requirements,
      pets: [
        pet("a", { vaccinationNames: ["Rabies", "DHPP"], documentKinds: ["municipal_license", "liability_insurance"], neutered: true }),
        pet("b"),
      ],
    })
    for (const r of readRequirements(petRules)) expect(requirementStatus(r.key, "a", gaps).state, r.key).toBe("met")
    expect(requirementStatus("require_license", "b", gaps).state).toBe("unmet")
  })

  it("has no per-pet state for rules nothing checks per pet", () => {
    expect(requirementStatus("requires_registry", "a", []).state).toBe("none")
    expect(requirementStatus("max_weight_kg", "a", []).state).toBe("none")
    expect(requirementStatus("max_pets_per_unit", "a", []).state).toBe("none")
  })
})
