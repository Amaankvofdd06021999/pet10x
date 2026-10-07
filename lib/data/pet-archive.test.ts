import { describe, expect, it } from "vitest"
import { ARCHIVE_REASONS, ARCHIVE_REASON_LABEL, memorialYears, parseArchiveReason } from "./pet-archive"

describe("parseArchiveReason", () => {
  it("accepts exactly the three reasons the database accepts", () => {
    expect(parseArchiveReason("passed_away")).toBe("passed_away")
    expect(parseArchiveReason("rehomed")).toBe("rehomed")
    expect(parseArchiveReason("mistake")).toBe("mistake")
  })

  it("refuses anything else, including near misses", () => {
    for (const v of ["", "Passed away", "PASSED_AWAY", "deceased", "ran_away", null, undefined, 1, {}]) {
      expect(parseArchiveReason(v)).toBeNull()
    }
  })
})

describe("ARCHIVE_REASON_LABEL", () => {
  it("labels every reason, in the order the sheet offers them", () => {
    expect(ARCHIVE_REASONS.map((r) => ARCHIVE_REASON_LABEL[r])).toEqual([
      "Passed away",
      "Rehomed",
      "Added by mistake",
    ])
  })
})

describe("memorialYears", () => {
  it("spans birth year to archive year", () => {
    expect(memorialYears("2014-05-02", "2026-03-01T12:00:00Z")).toBe("2014–2026")
  })

  it("reads a 1 January birthday as that year, not the one before", () => {
    // Bare `new Date("2015-01-01")` is UTC midnight — 2014 west of Greenwich.
    expect(memorialYears("2015-01-01", "2026-06-15T12:00:00Z")).toBe("2015–2026")
  })

  it("says nothing without a birth date — a lone year would read as a birth year", () => {
    expect(memorialYears(null, "2026-06-15T12:00:00Z")).toBeNull()
    expect(memorialYears(undefined, "2026-06-15T12:00:00Z")).toBeNull()
  })

  it("says nothing when the archive date is missing or unreadable", () => {
    expect(memorialYears("2014-05-02", null)).toBeNull()
    expect(memorialYears("2014-05-02", "not a date")).toBeNull()
  })
})
