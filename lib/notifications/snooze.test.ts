import { describe, expect, it } from "vitest"
import { safeTimeZone, snoozeOptions } from "./snooze"

/**
 * The snooze sheet's three choices, worked out in the person's own zone. The
 * cases are the ones that go wrong in practice: the evening choice offered
 * after the evening has started, and "8 AM tomorrow" landing at 7 or 9 on
 * the night the clocks change.
 */

const TORONTO = "America/Toronto"

/** The wall-clock time an instant reads in `tz`, as "YYYY-MM-DD HH:MM". */
function wall(d: Date, tz: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}

describe("snoozeOptions", () => {
  it("at 10:00 offers all three, labelled exactly", () => {
    const now = new Date("2026-10-15T14:00:00Z") // 10:00 EDT
    const opts = snoozeOptions(now, TORONTO)
    expect(opts.map((o) => o.key)).toEqual(["hour", "evening", "morning"])
    expect(opts.map((o) => o.label)).toEqual(["In 1 hour", "This evening (6 PM)", "Tomorrow morning (8 AM)"])
    expect(opts[0].until.getTime()).toBe(now.getTime() + 3600_000)
    expect(wall(opts[1].until, TORONTO)).toBe("2026-10-15 18:00")
    expect(wall(opts[2].until, TORONTO)).toBe("2026-10-16 08:00")
  })

  it("at 17:30 drops the evening choice", () => {
    const now = new Date("2026-10-15T21:30:00Z") // 17:30 EDT
    expect(snoozeOptions(now, TORONTO).map((o) => o.key)).toEqual(["hour", "morning"])
  })

  it("drops the evening choice from 17:00 exactly, and keeps it a minute before", () => {
    expect(snoozeOptions(new Date("2026-10-15T21:00:00Z"), TORONTO).map((o) => o.key)).toEqual(["hour", "morning"])
    expect(snoozeOptions(new Date("2026-10-15T20:59:00Z"), TORONTO).map((o) => o.key)).toEqual([
      "hour",
      "evening",
      "morning",
    ])
  })

  it("puts tomorrow morning at 08:00 local across the autumn clock change", () => {
    // Saturday 31 Oct 2026, 14:00 EDT; the clocks go back overnight.
    const opts = snoozeOptions(new Date("2026-10-31T18:00:00Z"), TORONTO)
    const morning = opts.find((o) => o.key === "morning")!
    expect(wall(morning.until, TORONTO)).toBe("2026-11-01 08:00")
    expect(morning.until.toISOString()).toBe("2026-11-01T13:00:00.000Z") // EST, UTC-5
  })

  it("puts tomorrow morning at 08:00 local across the spring clock change", () => {
    // Saturday 7 Mar 2026, 10:00 EST; the clocks go forward overnight.
    const opts = snoozeOptions(new Date("2026-03-07T15:00:00Z"), TORONTO)
    const morning = opts.find((o) => o.key === "morning")!
    expect(morning.until.toISOString()).toBe("2026-03-08T12:00:00.000Z") // EDT, UTC-4
  })

  it("reads the hour in the zone given, not the machine's", () => {
    // 16:00 in Vancouver is 19:00 in Toronto: evening offered in one, not the other.
    const now = new Date("2026-10-15T23:00:00Z")
    expect(snoozeOptions(now, "America/Vancouver").map((o) => o.key)).toContain("evening")
    expect(snoozeOptions(now, TORONTO).map((o) => o.key)).not.toContain("evening")
    const evening = snoozeOptions(now, "America/Vancouver").find((o) => o.key === "evening")!
    expect(wall(evening.until, "America/Vancouver")).toBe("2026-10-15 18:00")
  })
})

describe("safeTimeZone", () => {
  it("keeps a zone Intl accepts", () => {
    expect(safeTimeZone("America/Toronto", "Europe/London")).toBe("America/Toronto")
  })

  it("falls back for a zone Intl rejects, without throwing", () => {
    expect(safeTimeZone("Mars/Olympus_Mons", "Europe/London")).toBe("Europe/London")
    expect(safeTimeZone("not a zone", "Europe/London")).toBe("Europe/London")
  })

  it("falls back when nothing is stored", () => {
    expect(safeTimeZone(null, "Europe/London")).toBe("Europe/London")
    expect(safeTimeZone(undefined, "Europe/London")).toBe("Europe/London")
    expect(safeTimeZone("", "Europe/London")).toBe("Europe/London")
  })
})
