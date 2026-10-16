import { describe, expect, it } from "vitest"
import { Constants } from "@/lib/supabase/database.types"
import {
  ACCOMMODATION_CLOSED,
  ACCOMMODATION_OPEN,
  ACCOMMODATION_NOT_QUEUED,
  CLOSED_PAGE_SIZE,
  CLOSED_WINDOW_DAYS,
  INCIDENT_CLOSED,
  INCIDENT_OPEN,
  closedCutoff,
  nextClosedCursor,
} from "./approvals-filter"

describe("incident status lists", () => {
  const all = Constants.public.Enums.incident_status
  it("every status is in exactly one list", () => {
    for (const s of all) {
      const hits = [INCIDENT_OPEN, INCIDENT_CLOSED].filter((l) => (l as readonly string[]).includes(s)).length
      expect(hits, s).toBe(1)
    }
  })
  it("the lists name nothing the enum does not have", () => {
    for (const s of [...INCIDENT_OPEN, ...INCIDENT_CLOSED]) expect(all as readonly string[]).toContain(s)
  })
  it("open is submitted, triaged and investigating", () => {
    expect([...INCIDENT_OPEN].sort()).toEqual(["investigating", "submitted", "triaged"])
  })
})

describe("accommodation status lists", () => {
  const all = Constants.public.Enums.accommodation_status
  it("every status is in exactly one of open, closed or not-queued", () => {
    for (const s of all) {
      const hits = [ACCOMMODATION_OPEN, ACCOMMODATION_CLOSED, ACCOMMODATION_NOT_QUEUED].filter((l) =>
        (l as readonly string[]).includes(s),
      ).length
      expect(hits, s).toBe(1)
    }
  })
  it("a draft is the resident's own and never in the manager's queue", () => {
    expect(ACCOMMODATION_NOT_QUEUED).toEqual(["draft"])
  })
  it("open is pending and info_requested; closed is decided or withdrawn", () => {
    expect([...ACCOMMODATION_OPEN].sort()).toEqual(["info_requested", "pending"])
    expect([...ACCOMMODATION_CLOSED].sort()).toEqual(["approved", "denied", "withdrawn"])
  })
})

describe("closedCutoff", () => {
  it("is 90 days before now, as an ISO instant", () => {
    expect(CLOSED_WINDOW_DAYS).toBe(90)
    expect(closedCutoff(new Date("2026-10-15T12:00:00.000Z"))).toBe("2026-07-17T12:00:00.000Z")
  })
  it("crosses a year boundary", () => {
    expect(closedCutoff(new Date("2026-02-01T00:00:00.000Z"))).toBe("2025-11-03T00:00:00.000Z")
  })
})

describe("nextClosedCursor", () => {
  const cutoff = "2026-07-17T12:00:00.000Z"
  const full = (n: number) => Array.from({ length: n }, (_, i) => ({ ts: `2026-10-${String(15 - i).padStart(2, "0")}T00:00:00.000Z` }))
  it("a full page continues from its oldest row", () => {
    const rows = full(CLOSED_PAGE_SIZE)
    expect(CLOSED_PAGE_SIZE).toBe(50)
    expect(nextClosedCursor(rows.map((r) => r.ts), { cutoff, firstPage: true })).toBe(rows[rows.length - 1].ts)
  })
  it("a short first page has exhausted the window, so older starts at the cutoff", () => {
    expect(nextClosedCursor(["2026-10-01T00:00:00.000Z"], { cutoff, firstPage: true })).toBe(cutoff)
    expect(nextClosedCursor([], { cutoff, firstPage: true })).toBe(cutoff)
  })
  it("a short later page is the end of history", () => {
    expect(nextClosedCursor(["2026-05-01T00:00:00.000Z"], { cutoff, firstPage: false })).toBeNull()
    expect(nextClosedCursor([], { cutoff, firstPage: false })).toBeNull()
  })
  it("a full later page continues from its oldest row", () => {
    const ts = full(CLOSED_PAGE_SIZE).map((r) => r.ts)
    expect(nextClosedCursor(ts, { cutoff, firstPage: false })).toBe(ts[ts.length - 1])
  })
})
