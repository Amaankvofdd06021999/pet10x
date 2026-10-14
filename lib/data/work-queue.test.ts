import { describe, expect, it } from "vitest"
import { weightFlag, weightCheck, maxWeightKgOf, gramsToKg, RULES_UNCHECKED } from "./weight-flag"

describe("weightFlag", () => {
  it("flags a pet over the building's limit, naming the limit", () => {
    expect(weightFlag(20, 15)).toBe("Over this building's 15 kg limit")
  })
  it("formats the limit without a trailing .0", () => {
    expect(weightFlag(20, 15.0)).toBe("Over this building's 15 kg limit")
    expect(weightFlag(20, 12.5)).toBe("Over this building's 12.5 kg limit")
  })
  it("does not flag when the building sets no limit", () => {
    expect(weightFlag(20, null)).toBeNull()
  })
  it("does not flag an unknown weight", () => {
    expect(weightFlag(null, 15)).toBeNull()
  })
  it("a pet exactly at the limit is allowed", () => {
    expect(weightFlag(15, 15)).toBeNull()
  })
})

describe("maxWeightKgOf", () => {
  it("reads a positive finite number", () => {
    expect(maxWeightKgOf({ max_weight_kg: 25 })).toBe(25)
  })
  it.each([[0], [-1], ["25"], [null], [NaN], [Infinity]])("treats %s as no limit", (v) => {
    expect(maxWeightKgOf({ max_weight_kg: v })).toBeNull()
  })
  it("treats missing rules as no limit", () => {
    expect(maxWeightKgOf(null)).toBeNull()
    expect(maxWeightKgOf({})).toBeNull()
  })
})

describe("gramsToKg", () => {
  it("converts the pets.weight_grams column to kg", () => {
    expect(gramsToKg(20000)).toBe(20)
    expect(gramsToKg(null)).toBeNull()
    expect(gramsToKg(0)).toBeNull()
  })
  it("feeds weightFlag in the right unit (25,001 g is over a 25 kg limit; 25,000 g is not)", () => {
    expect(weightFlag(gramsToKg(25001), 25)).not.toBeNull()
    expect(weightFlag(gramsToKg(25000), 25)).toBeNull()
  })
})

describe("weightCheck", () => {
  const limits = new Map<string, number | null>([["a", 15], ["b", null]])
  it("uses the pet's own building", () => {
    expect(weightCheck(20, "a", limits)).toBe("Over this building's 15 kg limit")
    expect(weightCheck(20, "b", limits)).toBeNull()
  })
  it("a building missing from the response is flagged, never safe", () => {
    expect(weightCheck(5, "zzz", limits)).toBe(RULES_UNCHECKED)
    expect(weightCheck(null, "zzz", limits)).toBe(RULES_UNCHECKED)
  })
})
