import { describe, expect, it } from "vitest"
import { pickPet } from "./pet-picker"

describe("pickPet", () => {
  it("sends a household with no pets to add one", () => {
    expect(pickPet([])).toEqual({ kind: "add" })
  })

  it("opens the only pet directly, with its id", () => {
    expect(pickPet([{ id: "p1" }])).toEqual({ kind: "open", petId: "p1" })
  })

  it("asks when there is more than one", () => {
    expect(pickPet([{ id: "p1" }, { id: "p2" }])).toEqual({ kind: "choose" })
    expect(pickPet([{ id: "p1" }, { id: "p2" }, { id: "p3" }])).toEqual({ kind: "choose" })
  })
})
