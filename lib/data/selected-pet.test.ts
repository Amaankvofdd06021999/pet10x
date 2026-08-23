import { describe, expect, it } from "vitest"
import { resolveSelectedPet } from "./selected-pet"
import type { Pet } from "./types"

/**
 * One predicate, five lifecycles.
 *
 * The rule under test is stated positively — "the stored id IF AND ONLY IF it
 * names a pet in the current list, otherwise pets[0], otherwise undefined" —
 * so these cases are not a denylist of failures but the same sentence read
 * from five directions. A dangling id after a soft delete, a second account on
 * one device, a private-mode browser that stored nothing and a first-run
 * household are all the same branch.
 */

function pet(id: string, name: string): Pet {
  return {
    id,
    ownerId: "owner",
    name,
    species: "dog",
    breed: "Mixed",
    status: "home",
    image: "/placeholder.svg",
    compliance: 0,
  }
}

const buddy = pet("p1", "Buddy")
const lola = pet("p2", "Lola")
const zoe = pet("p3", "Zoe")
const household = [buddy, lola, zoe]

describe("resolveSelectedPet", () => {
  it("returns the stored pet when the id names one in the list", () => {
    expect(resolveSelectedPet("p2", household)).toBe(lola)
  })

  it("falls back to the first pet when the stored id names nothing", () => {
    // Lola soft-deleted: she leaves usePets, so her id is dangling.
    expect(resolveSelectedPet("p2", [buddy, zoe])).toBe(buddy)
  })

  it("falls back to the first pet when nothing is stored", () => {
    expect(resolveSelectedPet(null, household)).toBe(buddy)
  })

  it("returns undefined for a household with no pets", () => {
    expect(resolveSelectedPet(null, [])).toBeUndefined()
  })

  it("returns undefined rather than throwing when a stored id outlives the last pet", () => {
    expect(resolveSelectedPet("p2", [])).toBeUndefined()
  })
})
