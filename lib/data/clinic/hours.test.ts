import { describe, it, expect } from "vitest"
import { validateHours, fromDbTime, collapseHours, nextSession, WEEKDAY_ORDER, WEEKDAY_LABEL } from "./hours"

describe("validateHours", () => {
  it("accepts no rows at all — a clinician with no hours simply has no slots", () => {
    expect(validateHours([])).toEqual({ ok: true })
  })

  it("accepts a working week and a split shift that touches but does not overlap", () => {
    expect(
      validateHours([
        { weekday: 1, start: "09:00", end: "12:00" },
        { weekday: 1, start: "12:00", end: "17:30" },
        { weekday: 2, start: "00:00", end: "23:59" },
        { weekday: 0, start: "10:00", end: "14:00" },
      ]),
    ).toEqual({ ok: true })
  })

  it("only allows HH:MM on a 24-hour clock", () => {
    for (const bad of ["9:00", "24:00", "09:60", "09:00:00", "9am", "", " 09:00", "0900"]) {
      expect(validateHours([{ weekday: 1, start: bad, end: "17:00" }])).toEqual({
        ok: false,
        error: "Monday: enter times as HH:MM on a 24-hour clock, like 09:00 or 17:30.",
      })
      expect(validateHours([{ weekday: 3, start: "09:00", end: bad }])).toEqual({
        ok: false,
        error: "Wednesday: enter times as HH:MM on a 24-hour clock, like 09:00 or 17:30.",
      })
    }
    expect(validateHours([{ weekday: 1, start: "23:00", end: "23:59" }])).toEqual({ ok: true })
  })

  it("requires the end to come after the start", () => {
    expect(validateHours([{ weekday: 5, start: "17:00", end: "09:00" }])).toEqual({
      ok: false,
      error: "Friday: the end time must be after the start time.",
    })
    expect(validateHours([{ weekday: 5, start: "09:00", end: "09:00" }])).toEqual({
      ok: false,
      error: "Friday: the end time must be after the start time.",
    })
  })

  it("refuses overlapping sessions on the same day, in any order", () => {
    const err = { ok: false, error: "Tuesday: two sessions overlap. Make one end before the next starts." }
    expect(
      validateHours([
        { weekday: 2, start: "13:00", end: "17:00" },
        { weekday: 2, start: "09:00", end: "13:30" },
      ]),
    ).toEqual(err)
    expect(
      validateHours([
        { weekday: 2, start: "09:00", end: "17:00" },
        { weekday: 2, start: "10:00", end: "11:00" },
      ]),
    ).toEqual(err)
  })

  it("lets the same hours repeat on different days", () => {
    expect(
      validateHours([
        { weekday: 1, start: "09:00", end: "17:00" },
        { weekday: 2, start: "09:00", end: "17:00" },
      ]),
    ).toEqual({ ok: true })
  })

  it("only allows weekdays 0 (Sunday) to 6 (Saturday)", () => {
    for (const weekday of [-1, 7, 1.5, Number.NaN]) {
      expect(validateHours([{ weekday, start: "09:00", end: "17:00" }])).toEqual({
        ok: false,
        error: "Choose a day of the week.",
      })
    }
  })
})

describe("fromDbTime", () => {
  it("drops the seconds Postgres returns on a time column", () => {
    expect(fromDbTime("09:00:00")).toBe("09:00")
    expect(fromDbTime("17:30")).toBe("17:30")
  })
})

describe("collapseHours", () => {
  it("merges identical rows (one per location) and sorts by day and start", () => {
    expect(
      collapseHours([
        { weekday: 2, start: "09:00", end: "17:00" },
        { weekday: 1, start: "13:00", end: "17:00" },
        { weekday: 1, start: "09:00", end: "12:00" },
        { weekday: 2, start: "09:00", end: "17:00" },
      ]),
    ).toEqual([
      { weekday: 1, start: "09:00", end: "12:00" },
      { weekday: 1, start: "13:00", end: "17:00" },
      { weekday: 2, start: "09:00", end: "17:00" },
    ])
  })
})

describe("weekday labels", () => {
  it("runs Monday to Sunday, using Postgres dow numbers", () => {
    expect(WEEKDAY_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(WEEKDAY_LABEL[0]).toBe("Sunday")
    expect(WEEKDAY_LABEL[1]).toBe("Monday")
  })
})

describe("nextSession", () => {
  it("starts an empty day at 09:00–17:00", () => {
    expect(nextSession(3, [])).toEqual({ weekday: 3, start: "09:00", end: "17:00" })
  })

  it("starts where the latest session ends", () => {
    expect(nextSession(1, [{ weekday: 1, start: "09:00", end: "12:00" }])).toEqual({ weekday: 1, start: "12:00", end: "17:00" })
    expect(
      nextSession(1, [
        { weekday: 1, start: "13:00", end: "18:00" },
        { weekday: 1, start: "09:00", end: "12:00" },
      ]),
    ).toEqual({ weekday: 1, start: "18:00", end: "23:59" })
  })

  it("offers nothing once the day is used up, or while a time is half-typed", () => {
    expect(nextSession(1, [{ weekday: 1, start: "18:00", end: "23:59" }])).toBeNull()
    expect(nextSession(1, [{ weekday: 1, start: "09:00", end: "" }])).toBeNull()
  })
})
