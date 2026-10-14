import { describe, it, expect } from "vitest"
import {
  buildingHasHistory,
  buildingDeleteError,
  HAS_HISTORY_MESSAGE,
  parseBuildingActivity,
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

describe("parseBuildingActivity", () => {
  it("maps the RPC row", () => {
    expect(parseBuildingActivity({ building_id: "b", active_residents: 4, open_cases: 2, open_reports: 1 })).toEqual({
      activeResidents: 4,
      openCases: 2,
      openReports: 1,
    })
  })

  it("is null unless all three are whole and non-negative", () => {
    expect(parseBuildingActivity(undefined)).toBeNull()
    expect(parseBuildingActivity({ active_residents: 1, open_cases: 1 })).toBeNull()
    expect(parseBuildingActivity({ active_residents: -1, open_cases: 0, open_reports: 0 })).toBeNull()
    expect(parseBuildingActivity({ active_residents: "1", open_cases: 0, open_reports: 0 })).toBeNull()
  })
})

describe("parseBuildingCounts", () => {
  const raw = { resident_links: 12, pets: 9, building_managers: 2, units: 40 }
  const activity = { activeResidents: 5, openCases: 3, openReports: 0 }

  it("takes pets and managers from the history and the rest from the activity", () => {
    expect(parseBuildingCounts(raw, activity)).toEqual({ pets: 9, managers: 2, activity })
  })

  it("is null unless pets and managers are whole and non-negative", () => {
    expect(parseBuildingCounts(null, activity)).toBeNull()
    expect(parseBuildingCounts({ ...raw, pets: "9" }, activity)).toBeNull()
    expect(parseBuildingCounts({ ...raw, building_managers: -1 }, activity)).toBeNull()
  })

  it("keeps pets and managers when the activity could not be read", () => {
    expect(parseBuildingCounts(raw, null)?.activity).toBeNull()
  })
})

describe("buildingSummary", () => {
  const c = (a: number, cases: number, reports: number) => ({
    pets: 9,
    managers: 2,
    activity: { activeResidents: a, openCases: cases, openReports: reports },
  })

  it("lists residents, pets, managers and open cases", () => {
    expect(buildingSummary(c(12, 3, 0))).toBe("12 residents · 9 pets · 2 managers · 3 open cases")
  })

  it("adds open reports only when there are some", () => {
    expect(buildingSummary(c(12, 3, 2))).toBe("12 residents · 9 pets · 2 managers · 3 open cases · 2 open reports")
  })

  it("says one, not 1s", () => {
    expect(buildingSummary({ pets: 1, managers: 1, activity: { activeResidents: 1, openCases: 1, openReports: 1 } })).toBe(
      "1 resident · 1 pet · 1 manager · 1 open case · 1 open report",
    )
  })

  it("says zero plainly", () => {
    expect(buildingSummary({ pets: 0, managers: 0, activity: { activeResidents: 0, openCases: 0, openReports: 0 } })).toBe(
      "0 residents · 0 pets · 0 managers · 0 open cases",
    )
  })

  it("leaves out residents and cases rather than claiming zero when the activity is unknown", () => {
    expect(buildingSummary({ pets: 1, managers: 1, activity: null })).toBe("1 pet · 1 manager")
  })
})
