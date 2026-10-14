import { describe, expect, it } from "vitest"
import { scopeToBuilding, scopeToResolvedBuilding, showBuildingColumn } from "./building-scope"

const rows = [
  { id: "a1", buildingId: "A" },
  { id: "b1", buildingId: "B" },
  { id: "n1", buildingId: null },
  { id: "a2", buildingId: "A" },
]

describe("scopeToBuilding", () => {
  it("with no active building, returns every row unchanged", () => {
    expect(scopeToBuilding(rows, null)).toBe(rows)
  })
  it("keeps only the active building's rows, in order", () => {
    expect(scopeToBuilding(rows, "A").map((r) => r.id)).toEqual(["a1", "a2"])
    expect(scopeToBuilding(rows, "B").map((r) => r.id)).toEqual(["b1"])
  })
  it("drops rows with no building once a building is active", () => {
    expect(scopeToBuilding(rows, "A").some((r) => r.buildingId === null)).toBe(false)
  })
  it("a manager of one building loses none of that building's rows", () => {
    const one = [
      { id: "a1", buildingId: "A" },
      { id: "a2", buildingId: "A" },
    ]
    expect(scopeToBuilding(one, "A")).toEqual(one)
    expect(scopeToBuilding(one, null)).toEqual(one)
  })
})

describe("showBuildingColumn", () => {
  it("only when the manager holds more than one building", () => {
    expect(showBuildingColumn(0)).toBe(false)
    expect(showBuildingColumn(1)).toBe(false)
    expect(showBuildingColumn(2)).toBe(true)
    expect(showBuildingColumn(7)).toBe(true)
  })
})

/** The Dashboard's helper before this change, verbatim, as the oracle. */
function previousInBuilding<T extends { buildingId: string | null }>(
  rows: T[],
  building: { id: string } | null,
  bLoading: boolean,
) {
  if (building) return rows.filter((r) => r.buildingId === building.id)
  return bLoading ? [] : rows
}

describe("scopeToResolvedBuilding keeps the Dashboard's previous semantics", () => {
  const cases: [string, { id: string } | null, boolean][] = [
    ["resolved, settled", { id: "A" }, false],
    ["resolved, refetching", { id: "B" }, true],
    ["still resolving", null, true],
    ["resolved to no building", null, false],
    ["resolved to a building with no rows", { id: "Z" }, false],
  ]
  for (const [name, building, loading] of cases) {
    it(name, () => {
      expect(scopeToResolvedBuilding(rows, building?.id ?? null, loading)).toEqual(
        previousInBuilding(rows, building, loading),
      )
    })
  }
})
