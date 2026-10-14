import { describe, it, expect } from "vitest"
import {
  buildingHasHistory,
  buildingDeleteError,
  HAS_HISTORY_MESSAGE,
  parseBuildingCounts,
  buildingSummary,
} from "./building-archive"

describe("buildingHasHistory", () => {
  it("is false only when nothing at all references the building", () => {
    expect(buildingHasHistory(0)).toBe(false)
    expect(buildingHasHistory(1)).toBe(true)
  })

  it("assumes history when the counts are unknown — Delete is the dangerous default", () => {
    expect(buildingHasHistory(undefined)).toBe(true)
  })
})

describe("buildingDeleteError", () => {
  it("turns a foreign-key refusal into the archive advice, never Postgres text", () => {
    const msg = buildingDeleteError({
      code: "23503",
      message: 'update or delete on table "buildings" violates foreign key constraint "fines_building_id_fkey"',
    })
    expect(msg).toBe(HAS_HISTORY_MESSAGE)
    expect(msg).not.toMatch(/constraint|buildings"/)
  })

  it("passes other errors through as they are", () => {
    expect(buildingDeleteError({ code: "42501", message: "permission denied" })).toBe("permission denied")
  })
})

describe("parseBuildingCounts", () => {
  const raw = { resident_links: 12, pets: 9, building_managers: 2, units: 40, fines: 1 }

  it("maps the RPC's keys to what the card shows", () => {
    expect(parseBuildingCounts(raw, 3)).toEqual({ residents: 12, pets: 9, managers: 2, openCases: 3 })
  })

  it("is null unless every count is whole and non-negative", () => {
    expect(parseBuildingCounts(null, 0)).toBeNull()
    expect(parseBuildingCounts({ ...raw, pets: "9" }, 0)).toBeNull()
    expect(parseBuildingCounts({ ...raw, pets: -1 }, 0)).toBeNull()
    expect(parseBuildingCounts({ pets: 1 }, 0)).toBeNull()
  })

  it("keeps the other counts when the open-case count could not be read", () => {
    expect(parseBuildingCounts(raw, null)?.openCases).toBeNull()
  })
})

describe("buildingSummary", () => {
  it("lists residents, pets, managers and open cases", () => {
    expect(buildingSummary({ residents: 12, pets: 9, managers: 2, openCases: 3 })).toBe(
      "12 residents · 9 pets · 2 managers · 3 open cases",
    )
  })

  it("says one, not 1s", () => {
    expect(buildingSummary({ residents: 1, pets: 1, managers: 1, openCases: 1 })).toBe(
      "1 resident · 1 pet · 1 manager · 1 open case",
    )
  })

  it("says zero plainly", () => {
    expect(buildingSummary({ residents: 0, pets: 0, managers: 0, openCases: 0 })).toBe(
      "0 residents · 0 pets · 0 managers · 0 open cases",
    )
  })

  it("leaves out open cases rather than claiming none when they are unknown", () => {
    expect(buildingSummary({ residents: 2, pets: 1, managers: 1, openCases: null })).toBe("2 residents · 1 pet · 1 manager")
  })
})
