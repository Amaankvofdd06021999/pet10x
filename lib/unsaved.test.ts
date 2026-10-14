import { describe, expect, it } from "vitest"
import { isDirty } from "./unsaved"

describe("isDirty", () => {
  it("is false when nothing changed", () => {
    expect(isDirty({ name: "Lola", species: "dog" }, { name: "Lola", species: "dog" })).toBe(false)
  })

  it("trims strings: a field of only spaces is still empty", () => {
    expect(isDirty({ name: "" }, { name: " " })).toBe(false)
    expect(isDirty({ name: "Lola" }, { name: "  Lola " })).toBe(false)
  })

  it("is true when a field changed", () => {
    expect(isDirty({ name: "" }, { name: "L" })).toBe(true)
    expect(isDirty({ neutered: false }, { neutered: true })).toBe(true)
    expect(isDirty({ species: null }, { species: "dog" })).toBe(true)
  })

  it("treats empty string, null and undefined as the same empty", () => {
    expect(isDirty({ name: null }, { name: "" })).toBe(false)
    expect(isDirty({ name: undefined }, { name: null })).toBe(false)
    expect(isDirty({}, { name: "" })).toBe(false)
    expect(isDirty({ name: "" }, {})).toBe(false)
  })

  it("compares arrays by their items, so a re-created empty list is not a change", () => {
    expect(isDirty({ restraints: [] }, { restraints: [] })).toBe(false)
    expect(isDirty({ restraints: [] }, { restraints: ["leash"] })).toBe(true)
    expect(isDirty({ restraints: ["a", "b"] }, { restraints: ["a", "b"] })).toBe(false)
  })

  it("an empty array counts as empty", () => {
    expect(isDirty({ photos: null }, { photos: [] })).toBe(false)
  })

  it("compares other values by identity", () => {
    const file = { name: "x.png" }
    expect(isDirty({ photo: file }, { photo: file })).toBe(false)
    expect(isDirty({ photo: null }, { photo: file })).toBe(true)
  })
})
