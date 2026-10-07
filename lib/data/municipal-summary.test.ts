import { describe, it, expect } from "vitest"
import { summariseMunicipalReports } from "./municipal-summary"

const r = (type: string, reportedOn: string) => ({ type, reportedOn })

describe("summariseMunicipalReports", () => {
  it("counts by type, most reported first", () => {
    const s = summariseMunicipalReports([
      r("animal_at_large", "2026-10-02"),
      r("dangerous_animal", "2026-10-03"),
      r("animal_at_large", "2026-09-30"),
    ])
    expect(s.total).toBe(3)
    expect(s.byType).toEqual([
      { type: "animal_at_large", count: 2 },
      { type: "dangerous_animal", count: 1 },
    ])
  })

  it("buckets by calendar month, newest first, from the day string — no time zone shifts", () => {
    const s = summariseMunicipalReports([
      r("animal_at_large", "2026-10-01"),
      r("dangerous_animal", "2026-09-30"),
      r("dangerous_animal", "2026-10-31"),
    ])
    expect(s.byMonth.map((m) => [m.month, m.total])).toEqual([
      ["2026-10", 2],
      ["2026-09", 1],
    ])
    expect(s.byMonth[0].counts).toEqual({ animal_at_large: 1, dangerous_animal: 1 })
    expect(s.byMonth[0].label).toBe("October 2026")
  })

  it("is empty for no reports", () => {
    expect(summariseMunicipalReports([])).toEqual({ total: 0, byType: [], byMonth: [] })
  })
})
