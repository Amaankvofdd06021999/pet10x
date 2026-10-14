import { describe, expect, it } from "vitest"
import { VACCINES, canonicalVaccineKey, hasRabies, vaccineSpecies } from "./vaccines"

describe("canonicalVaccineKey", () => {
  it.each([
    ["Rabis", "rabies"],
    ["Rabies 3-year", "rabies"],
    ["Rabies3yr", "rabies"],
    ["Rabies_2024", "rabies"],
    ["RabiesVaccine", "rabies"],
    ["  rabies ", "rabies"],
    ["DA2PP", "dhpp"],
    ["DHPP (distemper combo)", "dhpp"],
    ["Bordetella", "bordetella"],
    ["Kennel cough", "bordetella"],
    ["Leptospirosis", "leptospirosis"],
    ["Lyme", "lyme"],
    ["FVRCP", "fvrcp"],
    ["FeLV (feline leukemia)", "felv"],
  ])("%s -> %s", (name, key) => expect(canonicalVaccineKey(name)).toBe(key))

  it.each(["Heartworm", "Antirabies-free", "rabiesfree", "Leukocyte test", "", "   "])("%j -> null", (name) => expect(canonicalVaccineKey(name)).toBeNull())

  it("every listed label maps back to its own key", () => {
    for (const list of Object.values(VACCINES)) for (const v of list) expect(canonicalVaccineKey(v.label)).toBe(v.key)
  })
})

describe("hasRabies", () => {
  it("is false without a rabies entry", () => expect(hasRabies(["DHPP"])).toBe(false))
  it("survives a typo", () => expect(hasRabies(["DHPP", "Rabis"])).toBe(true))
  it("is false for an empty list", () => expect(hasRabies([])).toBe(false))
})

describe("vaccineSpecies", () => {
  it("keeps dog and cat, sends everything else to other", () => {
    expect(vaccineSpecies("dog")).toBe("dog")
    expect(vaccineSpecies("cat")).toBe("cat")
    expect(vaccineSpecies("bird")).toBe("other")
    expect(vaccineSpecies(null)).toBe("other")
  })
})
