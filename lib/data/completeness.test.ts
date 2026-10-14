import { describe, expect, it } from "vitest"
import { computeGaps, nextStepAfterPet, type Gap } from "./completeness"
import { routeToSearch, searchToRoute } from "@/lib/app-route"

const max = { id: "p1", name: "Max", documentKinds: [] as string[], vaccinationNames: [] as string[], contacts: 1 }
const base = { linked: true, hasUnit: true, hasAddress: true, pets: [max], requirements: [] as string[] }

describe("computeGaps", () => {
  it("speaks to an unlinked owner without asking for an address", () => {
    const r = computeGaps({ ...base, linked: false, hasUnit: false, hasAddress: false, pets: [], requirements: [] })
    expect(r.heading).toBe("Finish your pet's profile")
    expect(r.gaps.some((g) => g.key === "address")).toBe(false)
    expect(r.gaps.map((g) => g.target.screen)).toEqual(["add-pet"])
  })

  it("asks a linked resident for unit and address, under the pet heading when no building rule is unmet", () => {
    const r = computeGaps({ ...base, hasUnit: false, hasAddress: false })
    expect(r.heading).toBe("Finish your pet's profile")
    expect(r.gaps.map((g) => g.key)).toEqual(["unit", "address"])
    expect(r.gaps[0].target).toEqual({ screen: "profile" })
    expect(r.gaps[0].label).toBe("Add your unit number")
  })

  it("sends a pet with no contact to its contacts tab", () => {
    const r = computeGaps({ ...base, pets: [{ ...max, contacts: 0 }] })
    expect(r.gaps).toEqual([
      { key: "contact:p1", label: "Add Max's emergency contact", target: { screen: "pet-detail", id: "p1", tab: "contacts" } },
    ])
  })

  it("uses hasRabies, so Rabies3yr clears it and a typo does not", () => {
    const req = ["rabies"]
    expect(computeGaps({ ...base, requirements: req, pets: [{ ...max, vaccinationNames: ["Rabies3yr"] }] }).gaps).toEqual([])
    const r = computeGaps({ ...base, requirements: req, pets: [{ ...max, vaccinationNames: ["Rabiesfree"] }] })
    expect(r.gaps).toEqual([
      { key: "rabies:p1", label: "Add Max's rabies vaccination", target: { screen: "pet-detail", id: "p1", tab: "vaccinations" } },
    ])
  })

  it("asks for required documents by name, and orders unit, contacts, vaccinations, documents, address", () => {
    const r = computeGaps({
      ...base,
      hasUnit: false,
      hasAddress: false,
      requirements: ["rabies", "core_vaccines", "municipal_license", "liability_insurance"],
      pets: [{ ...max, contacts: 0, documentKinds: ["liability_insurance"] }],
    })
    expect(r.gaps.map((g) => g.key)).toEqual(["unit", "contact:p1", "rabies:p1", "core_vaccines:p1", "municipal_license:p1", "address"])
    expect(r.gaps[4].label).toBe("Upload Max's license")
    expect(r.gaps[4].target.tab).toBe("documents")
  })

  it("asks to add a pet when there is none", () => {
    const r = computeGaps({ ...base, pets: [] })
    expect(r.gaps).toEqual([{ key: "pet", label: "Add your pet", target: { screen: "add-pet" } }])
  })

  it("says the building needs things whenever a building rule is unmet", () => {
    const r = computeGaps({ ...base, requirements: ["municipal_license"] })
    expect(r.heading).toBe("Your building needs a few things")
  })

  it("gives a pending-link owner with an unmet building rule the building heading", () => {
    // `linked` is false while the request is pending, but the building's rules
    // already apply: useMyCompleteness reads them from the pending link.
    const r = computeGaps({ ...base, linked: false, hasUnit: false, requirements: ["rabies"] })
    expect(r.heading).toBe("Your building needs a few things")
    expect(r.gaps.map((g) => g.key)).toEqual(["rabies:p1"])
  })

  it("round-trips every gap's target through the URL", () => {
    const id = "0b6f2a4e-7c1d-4e8a-9f3b-2d5c6e7f8a90"
    const pet = { id, name: "Max", documentKinds: [], vaccinationNames: [], contacts: 0, neutered: false }
    const all = [
      ...computeGaps({ linked: true, hasUnit: false, hasAddress: false, pets: [], requirements: [] }).gaps,
      ...computeGaps({
        linked: true,
        hasUnit: true,
        hasAddress: true,
        pets: [pet],
        requirements: ["rabies", "core_vaccines", "municipal_license", "liability_insurance", "spay_neuter"],
      }).gaps,
    ]
    expect(new Set(all.map((g) => g.key.split(":")[0]))).toEqual(
      new Set(["unit", "pet", "address", "contact", "rabies", "core_vaccines", "municipal_license", "liability_insurance", "spay_neuter"]),
    )
    for (const g of all) expect(searchToRoute(routeToSearch(g.target), "resident")).toEqual(g.target)
  })
})

describe("nextStepAfterPet", () => {
  const gap = (key: string): Gap => ({ key, label: key, target: { screen: "profile" } })

  it("takes the first gap, skipping the pet that was just added", () => {
    expect(nextStepAfterPet([gap("pet"), gap("contact:p1"), gap("address")])?.key).toBe("contact:p1")
    expect(nextStepAfterPet([gap("unit"), gap("pet")])?.key).toBe("unit")
  })

  it("is null when nothing else is outstanding", () => {
    expect(nextStepAfterPet([])).toBeNull()
    expect(nextStepAfterPet([gap("pet")])).toBeNull()
  })
})
