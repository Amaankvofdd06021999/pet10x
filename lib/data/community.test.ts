import { describe, expect, it } from "vitest"
import {
  attendancePercent,
  categoryClass,
  formatEventDate,
  formatReward,
  lostFoundShareText,
  CATEGORY_COLORS,
} from "./community"

describe("categoryClass", () => {
  it("returns the class for each of the seven categories the database allows", () => {
    for (const name of Object.keys(CATEGORY_COLORS)) {
      expect(categoryClass(name)).toBe(CATEGORY_COLORS[name])
    }
  })

  /* The raw `CATEGORY_COLORS[category]` lookup returned undefined here, and
   * React renders undefined into className as the literal string "undefined". */
  it("falls back to General for an unknown category, never undefined", () => {
    expect(categoryClass("Gardening")).toBe(CATEGORY_COLORS.General)
    expect(categoryClass(null)).toBe(CATEGORY_COLORS.General)
    expect(categoryClass(undefined)).toBe(CATEGORY_COLORS.General)
    expect(categoryClass("")).toBe(CATEGORY_COLORS.General)
    expect(categoryClass("toString")).toBe(CATEGORY_COLORS.General)
  })

  /* A plain object index reaches Object.prototype, so `CATEGORY_COLORS["toString"]`
   * is a FUNCTION and `?? General` never fires. React renders a function into
   * className as its whole source text. This is what caught it. */
  it("never returns anything but a string, including for prototype keys", () => {
    for (const v of ["", "x", "constructor", "__proto__", "toString", "valueOf", "hasOwnProperty", null, undefined]) {
      expect(typeof categoryClass(v)).toBe("string")
      expect(categoryClass(v)).not.toContain("native code")
    }
  })
})

describe("formatEventDate", () => {
  it("splits an instant into a weekday, a day number and a time", () => {
    const parts = formatEventDate("2026-06-27T18:00:00Z")
    expect(parts.day).toMatch(/^[A-Z][a-z]{2}$/)
    expect(parts.date).toMatch(/^\d{1,2}$/)
    expect(parts.time).toMatch(/\d/)
    expect(parts.full).toContain(parts.day)
    expect(parts.full).toContain(parts.date)
  })

  /* The screen did `event.date.split(", ")[1]?.split(" ")[1]`, which is
   * `undefined` for any string that does not happen to contain ", ". A clean
   * tsc and a green suite both wave that through. */
  it("returns em-dashes rather than undefined or NaN for unparseable input", () => {
    for (const bad of ["", "not a date", null, undefined]) {
      const parts = formatEventDate(bad)
      expect(parts.day).toBe("—")
      expect(parts.date).toBe("—")
      expect(parts.time).toBe("—")
      expect(parts.full).toBe("—")
      expect(JSON.stringify(parts)).not.toContain("Invalid")
      expect(JSON.stringify(parts)).not.toContain("NaN")
    }
  })
})

describe("attendancePercent", () => {
  it("is a percentage when there is a cap", () => {
    expect(attendancePercent(0, 20)).toBe(0)
    expect(attendancePercent(5, 20)).toBe(25)
    expect(attendancePercent(20, 20)).toBe(100)
  })

  /* events.max_attendees is NULLABLE, and the screen's old expression
   * `(attendees / maxAttendees) * 100` yields Infinity for it — rendered as
   * `width: Infinity%`. Null means NO BAR. */
  it("is null for a null cap — not Infinity and not 100", () => {
    expect(attendancePercent(3, null)).toBeNull()
    expect(attendancePercent(3, undefined)).toBeNull()
    expect(attendancePercent(0, null)).toBeNull()
  })

  it("is null for a zero or negative cap rather than Infinity", () => {
    expect(attendancePercent(3, 0)).toBeNull()
    expect(attendancePercent(3, -5)).toBeNull()
  })

  it("clamps an over-subscribed event to 100 so the bar cannot overflow", () => {
    expect(attendancePercent(30, 20)).toBe(100)
  })
})

describe("formatReward", () => {
  it("formats cents as dollars", () => {
    expect(formatReward(5000)).toBe("$50")
    expect(formatReward(12345)).toBe("$123.45")
    expect(formatReward(100000)).toBe("$1,000")
  })

  it("is null for no reward — null and 0 both mean no badge", () => {
    expect(formatReward(null)).toBeNull()
    expect(formatReward(undefined)).toBeNull()
    expect(formatReward(0)).toBeNull()
    expect(formatReward(-1)).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/* The share text — a SECURITY test, not a formatting test.            */
/* ------------------------------------------------------------------ */

const FULL = {
  type: "lost" as const,
  petName: "Simba",
  species: "cat" as const,
  breed: "Tabby",
  color: "ginger",
  lastSeen: "by the mailboxes on Tuesday evening",
  buildingName: "Maple Court Residences",
  rewardCents: 5000,
}

describe("lostFoundShareText", () => {
  it("carries the things a neighbour needs in order to recognise the pet", () => {
    const text = lostFoundShareText(FULL)
    expect(text).toContain("Simba")
    expect(text).toContain("Cat")
    expect(text).toContain("Tabby")
    expect(text).toContain("ginger")
    expect(text).toContain("by the mailboxes on Tuesday evening")
    expect(text).toContain("Maple Court Residences")
    expect(text).toContain("$50")
    expect(text).toContain("LOST PET")
  })

  it("says FOUND for a found pet", () => {
    const text = lostFoundShareText({ ...FULL, type: "found" })
    expect(text).toContain("FOUND PET")
    expect(text).not.toContain("LOST PET")
  })

  /* Four separate assertions, deliberately NOT one combined regex: a single
   * alternation that stops matching because one branch was edited fails
   * silently for all four. These are the four things this text must never
   * carry, and each is named. */

  it("contains no building code", () => {
    const text = lostFoundShareText(FULL)
    // A lobby code authorises resolve_building_code and, through it, the whole
    // building's pet roster (Phase 0). The SHAPE, characterised rather than
    // enumerated: upper-case letters immediately followed by digits, as one
    // token — CDR2026, HVT2026, MCR2026, MPL2026, RIV2026, WEL2026 are the six
    // live ones and all six have it. "LOST PET" does not, which is why the
    // shape and not a bare all-caps test.
    expect(text).not.toMatch(/\b[A-Z]{2,8}\d{2,8}\b/)
    // And the six literals, so a code whose shape changes later still fails
    // here rather than passing a regex that no longer describes it.
    for (const code of ["CDR2026", "HVT2026", "MCR2026", "MPL2026", "RIV2026", "WEL2026"]) {
      expect(text).not.toContain(code)
    }
    // The building's NAME is allowed and is the point — a lost pet notice that
    // does not say where is useless. Asserted so the two are not confused.
    expect(text).toContain("Maple Court Residences")
  })

  it("contains no unit number", () => {
    const text = lostFoundShareText(FULL)
    expect(text).not.toMatch(/\bunit\b/i)
    expect(text).not.toMatch(/\bapt\b|\bapartment\b|\bsuite\b|#\s*\d/i)
  })

  it("contains no URL", () => {
    const text = lostFoundShareText(FULL)
    // A signed storage URL carries the object path verbatim, and these paths
    // embed an auth uid.
    expect(text).not.toMatch(/https?:/i)
    expect(text).not.toMatch(/\bwww\./i)
    expect(text).not.toMatch(/supabase|\.co\/|\.com\//i)
  })

  it("contains no uuid", () => {
    const text = lostFoundShareText(FULL)
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })

  /* The strongest form of the guarantee: the four forbidden things are not
   * parameters at all, so they cannot be reached. This test fails the moment
   * somebody widens the input shape, which is when the four above would start
   * being the only line of defence. */
  it("takes no parameter that could carry a code, a unit, a URL or an id", () => {
    const allowed = [
      "type",
      "petName",
      "species",
      "breed",
      "color",
      "lastSeen",
      "buildingName",
      "rewardCents",
    ].sort()
    expect(Object.keys(FULL).sort()).toEqual(allowed)
  })

  it("degrades to something readable when every optional field is absent", () => {
    const text = lostFoundShareText({
      type: "lost",
      petName: null,
      species: null,
      breed: null,
      color: null,
      lastSeen: null,
      buildingName: null,
      rewardCents: null,
    })
    expect(text).toContain("A pet")
    expect(text).not.toContain("null")
    expect(text).not.toContain("undefined")
    expect(text).not.toContain("Reward")
  })

  it("does not emit a reward line for a zero reward", () => {
    expect(lostFoundShareText({ ...FULL, rewardCents: 0 })).not.toContain("Reward")
  })
})
