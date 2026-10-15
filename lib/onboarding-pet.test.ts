import { describe, it, expect } from "vitest"
import { existingPetForDone } from "./onboarding-pet"

describe("existingPetForDone", () => {
  it("is null for an owner with no current pets, so the pet step shows", () => {
    expect(existingPetForDone([])).toBeNull()
  })
  it("shows the first current pet on the done screen instead of adding another", () => {
    expect(
      existingPetForDone([
        { name: "Rex", species: "dog", image: "https://x/rex.jpg" },
        { name: "Tom", species: "cat", image: "/placeholder.svg" },
      ]),
    ).toEqual({ name: "Rex", species: "dog", photo: "https://x/rex.jpg" })
  })
  it("treats the placeholder image as no photo", () => {
    expect(existingPetForDone([{ name: "Tom", species: "cat", image: "/placeholder.svg" }])).toEqual({
      name: "Tom",
      species: "cat",
      photo: null,
    })
  })
})
