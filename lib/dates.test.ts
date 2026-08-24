/**
 * The one date rule, pinned.
 *
 * EVERY ASSERTION HERE IS TRUE IN EVERY ZONE, and that is a requirement rather
 * than a nicety: Phase 5's review found the test for a timezone bug was itself
 * zone-bound — green at UTC-7, `1 failed | 26 passed` at UTC-10 — which means
 * it could not have caught the bug it was written for anywhere but the author's
 * desk. The suite is run under a second `TZ` in verification for exactly this.
 *
 * The technique is to assert PROPERTIES that hold in every zone rather than
 * literals that hold in one:
 *
 *   - a calendar date renders as the calendar date it was written as, which is
 *     zone-independent by construction — that is the whole claim of the module;
 *   - instants are compared against locally constructed `Date`s, never against
 *     a hardcoded string;
 *   - `now` is injected everywhere it matters, so "today" is never the machine's.
 */

import { describe, expect, it } from "vitest"
import {
  addCalendarDays,
  calendarDaysBetween,
  daysUntil,
  isCalendarDate,
  localDayKey,
  longDate,
  parseDbDate,
  shortDate,
  shortDay,
  todayKey,
} from "./dates"

describe("isCalendarDate", () => {
  it("accepts exactly a bare YYYY-MM-DD", () => {
    expect(isCalendarDate("2026-06-27")).toBe(true)
    expect(isCalendarDate("2026-06-27T00:00:00Z")).toBe(false)
    expect(isCalendarDate("2026-6-27")).toBe(false)
    expect(isCalendarDate("")).toBe(false)
    expect(isCalendarDate("not a date")).toBe(false)
  })
})

describe("parseDbDate", () => {
  it("reads a calendar date as LOCAL midnight, in any zone", () => {
    const d = parseDbDate("2026-06-27")!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)
    expect(d.getDate()).toBe(27)
    expect(d.getHours()).toBe(0)
  })

  it("is the exact defect it was written for: bare parse is not the same date", () => {
    // `new Date("2026-06-27")` is UTC midnight. West of Greenwich its LOCAL
    // date is the 26th; east of it, the 27th. The module's answer is the 27th
    // everywhere, which is the point. Asserted as an inequality of local dates
    // rather than a literal, so it holds in both directions.
    const bare = new Date("2026-06-27")
    const ours = parseDbDate("2026-06-27")!
    expect(ours.getDate()).toBe(27)
    if (bare.getTimezoneOffset() > 0) expect(bare.getDate()).toBe(26)
  })

  it("parses an instant as an instant", () => {
    const iso = "2026-06-27T18:30:00.000Z"
    expect(parseDbDate(iso)!.getTime()).toBe(new Date(iso).getTime())
  })

  it("passes a Date through and refuses an unusable one", () => {
    const d = new Date(2026, 5, 27)
    expect(parseDbDate(d)).toBe(d)
    expect(parseDbDate(new Date(NaN))).toBeNull()
    expect(parseDbDate(null)).toBeNull()
    expect(parseDbDate(undefined)).toBeNull()
    expect(parseDbDate("")).toBeNull()
    expect(parseDbDate("nonsense")).toBeNull()
  })
})

describe("formatters", () => {
  it("render a calendar date as itself, in any zone", () => {
    expect(longDate("2026-06-27")).toBe("June 27, 2026")
    expect(shortDate("2026-08-23")).toBe("Aug 23, 2026")
    expect(shortDay("2026-08-23")).toBe("Aug 23")
  })

  it("render the resident-facing dates that were wrong before the fix", () => {
    // Measured in the browser at UTC-7 before Phase 5's fix: each of these
    // rendered one day early. `fines.due_on` is a payment deadline.
    expect(longDate("2026-08-23")).toBe("August 23, 2026")
    expect(longDate("2026-07-25")).toBe("July 25, 2026")
  })

  it("render an instant in the viewer's zone", () => {
    const local = new Date(2026, 7, 23, 18, 0, 0)
    expect(shortDate(local.toISOString())).toBe("Aug 23, 2026")
  })

  it("let each surface keep its own fallback", () => {
    expect(longDate(null)).toBe("—")
    expect(longDate(null, "an unknown date")).toBe("an unknown date")
    expect(shortDay(null)).toBe("")
    expect(shortDate("nonsense", "an unknown date")).toBe("an unknown date")
  })
})

describe("localDayKey", () => {
  it("returns a calendar date unchanged", () => {
    expect(localDayKey("2026-06-27")).toBe("2026-06-27")
  })

  it("keys an instant to the viewer's day, not UTC's", () => {
    // The CRT-export defect: `iso.slice(0,10)` on an appeal filed at 6pm local
    // exported the next day west of Greenwich. Built from a local Date, so the
    // expected answer is the same everywhere.
    const evening = new Date(2026, 7, 23, 18, 0, 0)
    expect(localDayKey(evening.toISOString())).toBe("2026-08-23")
    const morning = new Date(2026, 7, 23, 6, 0, 0)
    expect(localDayKey(morning.toISOString())).toBe("2026-08-23")
  })

  it("pads single digits", () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe("2026-01-05")
  })

  it("is empty on nothing", () => {
    expect(localDayKey(null)).toBe("")
    expect(localDayKey("nonsense")).toBe("")
  })

  it("todayKey is localDayKey of now", () => {
    const now = new Date(2026, 7, 23, 23, 30, 0)
    expect(todayKey(now)).toBe("2026-08-23")
  })
})

describe("calendarDaysBetween", () => {
  it("counts squares on the calendar", () => {
    expect(calendarDaysBetween("2026-08-23", "2026-08-23")).toBe(0)
    expect(calendarDaysBetween("2026-08-23", "2026-08-24")).toBe(1)
    expect(calendarDaysBetween("2026-08-24", "2026-08-23")).toBe(-1)
    expect(calendarDaysBetween("2026-08-01", "2026-08-31")).toBe(30)
  })

  it("crosses a DST boundary without an off-by-one", () => {
    // Second Sunday in March and first Sunday in November 2026 — the US
    // transitions. A 23-hour and a 25-hour "day" both have to count as one.
    expect(calendarDaysBetween("2026-03-07", "2026-03-09")).toBe(2)
    expect(calendarDaysBetween("2026-10-31", "2026-11-02")).toBe(2)
    expect(calendarDaysBetween("2026-01-01", "2027-01-01")).toBe(365)
  })

  it("refuses anything that is not a calendar date", () => {
    expect(calendarDaysBetween("2026-08-23", "2026-08-23T00:00:00Z")).toBeNull()
    expect(calendarDaysBetween("nope", "2026-08-23")).toBeNull()
  })
})

describe("addCalendarDays", () => {
  it("lands on the right square", () => {
    expect(addCalendarDays("2026-08-23", 0)).toBe("2026-08-23")
    expect(addCalendarDays("2026-08-23", 30)).toBe("2026-09-22")
    expect(addCalendarDays("2026-03-07", 2)).toBe("2026-03-09")
    expect(addCalendarDays("2026-01-01", -1)).toBe("2025-12-31")
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29")
  })

  it("round-trips with calendarDaysBetween", () => {
    for (const n of [1, 14, 30, 180, 365]) {
      expect(calendarDaysBetween("2026-08-23", addCalendarDays("2026-08-23", n)!)).toBe(n)
    }
  })

  it("refuses an instant", () => {
    expect(addCalendarDays("2026-08-23T00:00:00Z", 1)).toBeNull()
  })
})

describe("daysUntil", () => {
  /*
   * The regression that mattered. A vaccination expiring TODAY has not
   * expired, and `Math.round((new Date(col) - Date.now()) / DAY)` said it did
   * — badging a compliance card `expired` for the first seventeen hours of the
   * day at UTC-7, and telling an LLM the booster lapsed "1 day ago".
   *
   * `now` is late in the local day on purpose: that is the moment the old
   * arithmetic was furthest wrong.
   */
  const lateToday = new Date(2026, 7, 23, 23, 30, 0)

  it("is 0 on the day itself, however late in it", () => {
    expect(daysUntil("2026-08-23", lateToday)).toBe(0)
    expect(daysUntil("2026-08-23", new Date(2026, 7, 23, 0, 1, 0))).toBe(0)
  })

  it("counts forward and back in whole days", () => {
    expect(daysUntil("2026-08-24", lateToday)).toBe(1)
    expect(daysUntil("2026-08-22", lateToday)).toBe(-1)
    expect(daysUntil("2026-09-22", lateToday)).toBe(30)
    expect(daysUntil("2026-09-23", lateToday)).toBe(31)
  })

  it("reduces an instant to the day it falls on locally", () => {
    const tomorrowEvening = new Date(2026, 7, 24, 19, 0, 0)
    expect(daysUntil(tomorrowEvening.toISOString(), lateToday)).toBe(1)
  })

  it("is null rather than NaN on nothing", () => {
    expect(daysUntil(null, lateToday)).toBeNull()
    expect(daysUntil("nonsense", lateToday)).toBeNull()
  })
})
