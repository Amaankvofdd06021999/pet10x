import { describe, it, expect } from "vitest"
import {
  CATEGORIES,
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  groupByCategory,
  readRequirements,
  legacyNoteDraft,
  type BuildingRule,
  type BuildingRuleCategory,
} from "./building-rules"

function rule(over: Partial<BuildingRule> = {}): BuildingRule {
  return {
    id: over.id ?? "r1",
    buildingId: over.buildingId ?? "b1",
    category: over.category ?? "parking",
    title: over.title ?? "A title",
    body: over.body ?? "A body",
    isPublished: over.isPublished ?? true,
    sortOrder: over.sortOrder ?? 0,
    createdAt: over.createdAt ?? "2026-08-01T00:00:00Z",
    updatedAt: over.updatedAt ?? "2026-08-01T00:00:00Z",
  }
}

describe("the category vocabulary", () => {
  /**
   * The one assertion that keeps the display order honest. A seventh category
   * added in SQL regenerates `CATEGORIES`; if nobody adds it to `CATEGORY_ORDER`
   * this fails, rather than the category silently never rendering.
   */
  it("CATEGORY_ORDER is a permutation of the generated enum", () => {
    expect([...CATEGORY_ORDER].sort()).toEqual([...CATEGORIES].sort())
    expect(CATEGORY_ORDER).toHaveLength(CATEGORIES.length)
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length)
  })

  it("every category has a human label, and none is its raw SQL name", () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_LABEL[c]).toBeTruthy()
      expect(CATEGORY_LABEL[c]).not.toBe(c)
    }
  })

  it("puts parking first — it is what was actually asked for", () => {
    expect(CATEGORY_ORDER[0]).toBe("parking")
  })

  it("puts 'other' last — a catch-all cannot precede what it is not", () => {
    expect(CATEGORY_ORDER[CATEGORY_ORDER.length - 1]).toBe("other")
  })
})

describe("groupByCategory", () => {
  it("returns groups in CATEGORY_ORDER, not in the input's order", () => {
    const groups = groupByCategory([
      rule({ id: "a", category: "other" }),
      rule({ id: "b", category: "parking" }),
      rule({ id: "c", category: "noise" }),
    ])
    expect(groups.map((g) => g.category)).toEqual(["parking", "noise", "other"])
  })

  it("omits empty categories entirely", () => {
    const groups = groupByCategory([rule({ category: "parking" })])
    expect(groups).toHaveLength(1)
    expect(groups[0].category).toBe("parking")
  })

  it("returns nothing at all for no rules", () => {
    expect(groupByCategory([])).toEqual([])
  })

  it("carries a rule of every category through the grouping", () => {
    const all = CATEGORIES.map((c, i) => rule({ id: c, category: c as BuildingRuleCategory, sortOrder: i }))
    const groups = groupByCategory(all)
    expect(groups).toHaveLength(CATEGORIES.length)
    expect(groups.flatMap((g) => g.rules).map((r) => r.id).sort()).toEqual([...CATEGORIES].sort())
  })

  it("sorts by sort_order within a category", () => {
    const groups = groupByCategory([
      rule({ id: "third", sortOrder: 2 }),
      rule({ id: "first", sortOrder: 0 }),
      rule({ id: "second", sortOrder: 1 }),
    ])
    expect(groups[0].rules.map((r) => r.id)).toEqual(["first", "second", "third"])
  })

  it("breaks a sort_order tie on created_at, so the list does not shuffle between renders", () => {
    const groups = groupByCategory([
      rule({ id: "later", sortOrder: 0, createdAt: "2026-08-02T00:00:00Z" }),
      rule({ id: "earlier", sortOrder: 0, createdAt: "2026-08-01T00:00:00Z" }),
    ])
    expect(groups[0].rules.map((r) => r.id)).toEqual(["earlier", "later"])
  })

  it("sorts each category independently — both start at 0", () => {
    const groups = groupByCategory([
      rule({ id: "p0", category: "parking", sortOrder: 0 }),
      rule({ id: "n0", category: "noise", sortOrder: 0 }),
      rule({ id: "p1", category: "parking", sortOrder: 1 }),
    ])
    expect(groups.find((g) => g.category === "parking")!.rules.map((r) => r.id)).toEqual(["p0", "p1"])
    expect(groups.find((g) => g.category === "noise")!.rules.map((r) => r.id)).toEqual(["n0"])
  })

  it("does not mutate its input", () => {
    const input = [rule({ id: "b", sortOrder: 1 }), rule({ id: "a", sortOrder: 0 })]
    const before = input.map((r) => r.id)
    groupByCategory(input)
    expect(input.map((r) => r.id)).toEqual(before)
  })
})

describe("readRequirements — the machine-checked half, kept apart from authored text", () => {
  it("lists only the flags that are TRUE", () => {
    const reqs = readRequirements({ require_rabies: true, require_insurance: false, requires_registry: true })
    expect(reqs.map((r) => r.key)).toEqual(["requires_registry", "require_rabies"])
  })

  it("returns nothing for a building with no requirements set", () => {
    expect(readRequirements({})).toEqual([])
    expect(readRequirements(null)).toEqual([])
    expect(readRequirements(undefined)).toEqual([])
  })

  /**
   * The AD-9 assertion. `pet_rules` also holds the fine schedule and three
   * pieces of authored prose. NONE of them is a requirement a machine checks,
   * and showing them under "Requirements Pet10x checks" would be a false claim
   * on a resident-facing screen.
   */
  it("never surfaces the fine schedule or the authored prose keys", () => {
    const reqs = readRequirements({
      require_rabies: true,
      fine_1_cents: 25000,
      fine_2_cents: 50000,
      fine_currency: "CAD",
      notes: "Standard Bylaw 3(4) as amended March 2025.",
      quiet_hours: "22:00-07:00",
      designated_relief_area: "Northwest lawn, off the P1 exit",
      breed_restrictions: [],
    })
    expect(reqs.map((r) => r.key)).toEqual(["require_rabies"])
    expect(JSON.stringify(reqs)).not.toContain("25000")
    expect(JSON.stringify(reqs)).not.toContain("Bylaw 3(4)")
    expect(JSON.stringify(reqs)).not.toContain("22:00")
  })

  it("ignores a key it does not know, rather than rendering its SQL name", () => {
    expect(readRequirements({ require_bike_tag: true })).toEqual([])
  })

  it("includes the numeric limits when present — a machine does enforce those", () => {
    const reqs = readRequirements({ max_weight_kg: 25, max_pets_per_unit: 2 })
    expect(reqs.map((r) => r.label)).toEqual(["Maximum pet weight: 25 kg", "Maximum 2 pets per unit"])
  })

  it("singularises a one-pet limit", () => {
    expect(readRequirements({ max_pets_per_unit: 1 })[0].label).toBe("Maximum 1 pet per unit")
  })

  it.each([
    ["null", null],
    ["zero", 0],
    ["a string", "25"],
    ["NaN", Number.NaN],
  ])("ignores a %s weight limit rather than claiming one", (_l, value) => {
    expect(readRequirements({ max_weight_kg: value })).toEqual([])
  })

  it("reads Maple Court Residences' real live pet_rules correctly", () => {
    // Copied from the live row, 2026-08-23.
    const live = {
      notes: "Standard Bylaw 3(4) as amended March 2025. Pets existing before the amendment are grandfathered under s.123. Certified service animals are exempt from all restrictions.",
      quiet_hours: "22:00-07:00",
      max_weight_kg: 25,
      require_rabies: true,
      require_license: true,
      max_pets_per_unit: 2,
      require_insurance: false,
      requires_registry: true,
      breed_restrictions: [],
      require_spay_neuter: true,
      require_core_vaccines: true,
      designated_relief_area: "Northwest lawn, off the P1 exit",
      leash_required_common_areas: true,
    }
    expect(readRequirements(live).map((r) => r.key)).toEqual([
      "requires_registry",
      "require_rabies",
      "require_core_vaccines",
      "require_license",
      "require_spay_neuter",
      "max_weight_kg",
      "max_pets_per_unit",
    ])
  })
})

describe("legacyNoteDraft", () => {
  it("offers nothing when there is no stranded prose", () => {
    expect(legacyNoteDraft({ require_rabies: true })).toBeNull()
    expect(legacyNoteDraft({ notes: "   " })).toBeNull()
    expect(legacyNoteDraft(null)).toBeNull()
  })

  it("labels each line and separates them with a blank line", () => {
    expect(legacyNoteDraft({ quiet_hours: "22:00-07:00", notes: "Bylaw 3(4)." })).toBe(
      "Bylaw reference: Bylaw 3(4).\n\nQuiet hours: 22:00-07:00",
    )
  })

  it("includes only the keys that actually hold text", () => {
    expect(legacyNoteDraft({ designated_relief_area: "Northwest lawn" })).toBe(
      "Designated relief area: Northwest lawn",
    )
  })

  it("never copies the fine schedule into a rule body", () => {
    const draft = legacyNoteDraft({ notes: "See schedule.", fine_1_cents: 25000, fine_currency: "CAD" })
    expect(draft).toBe("Bylaw reference: See schedule.")
  })
})
