import { describe, expect, it } from "vitest"
import {
  scopeToBuilding,
  scopeToResolvedBuilding,
  showBuildingColumn,
  scopeForStatus,
  showBuildingFor,
  scopeNotice,
  personasStatus,
  ledgerColumnKeys,
  type PersonasStatus,
} from "./building-scope"

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

describe("scopeForStatus: what a list shows while my_personas() settles", () => {
  // Buildings held -> the active building auth-context picks (ids[0]).
  const held: [string, number, string | null][] = [
    ["no building", 0, null],
    ["one building", 1, "A"],
    ["two buildings", 2, "A"],
  ]
  for (const [label, count, activeId] of held) {
    it(`${label}, loading: shows nothing, so no live buttons on another building's rows`, () => {
      expect(scopeForStatus(rows, "loading", null)).toEqual([])
      expect(showBuildingFor("loading", count)).toBe(false)
      expect(scopeNotice("loading")).toBeNull()
    })
    it(`${label}, ready: exactly scopeToBuilding and showBuildingColumn (Focus 5)`, () => {
      expect(scopeForStatus(rows, "ready", activeId)).toEqual(scopeToBuilding(rows, activeId))
      expect(showBuildingFor("ready", count)).toBe(showBuildingColumn(count))
      expect(scopeNotice("ready")).toBeNull()
    })
    it(`${label}, error: every row, labelled, with a notice`, () => {
      // activeBuildingId is null after a failed load — no grants, no choice.
      expect(scopeForStatus(rows, "error", null)).toBe(rows)
      expect(showBuildingFor("error", count)).toBe(true)
      expect(scopeNotice("error")).toBe("Couldn't load your buildings. Showing all of them.")
    })
  }
  it("loading is the Dashboard's resolve-wait rule", () => {
    expect(scopeForStatus(rows, "loading", null)).toEqual(scopeToResolvedBuilding(rows, null, true))
  })
})

describe("personasStatus", () => {
  const cases: [string, Parameters<typeof personasStatus>[0], PersonasStatus][] = [
    ["mock mode has nothing to wait for", { enabled: false, userId: "u1", result: null }, "ready"],
    ["signed out has nothing to wait for", { enabled: true, userId: null, result: null }, "ready"],
    ["signed in, no answer yet", { enabled: true, userId: "u1", result: null }, "loading"],
    ["an answer for a previous account is not this one's", { enabled: true, userId: "u2", result: { userId: "u1", ok: true } }, "loading"],
    ["answered", { enabled: true, userId: "u1", result: { userId: "u1", ok: true } }, "ready"],
    ["failed", { enabled: true, userId: "u1", result: { userId: "u1", ok: false } }, "error"],
    // A token refresh hands over a new user object for the same id; the
    // result already held for that id keeps the lists ready, not loading.
    ["a token refresh for the same account stays ready", { enabled: true, userId: "u1", result: { userId: "u1", ok: true } }, "ready"],
  ]
  for (const [name, input, want] of cases) {
    it(name, () => expect(personasStatus(input)).toBe(want))
  }
})

describe("ledgerColumnKeys", () => {
  const keys = ["case_id", "building", "buildingId", "unit", "resident"]
  it("never exports the internal building id", () => {
    expect(ledgerColumnKeys(keys, true)).toEqual(["case_id", "building", "unit", "resident"])
  })
  it("has a Building column only for a manager of more than one building", () => {
    expect(ledgerColumnKeys(keys, false)).toEqual(["case_id", "unit", "resident"])
  })
})
