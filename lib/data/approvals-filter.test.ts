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
  olderThanFilter,
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
  const page = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ts: `2026-10-${String(15 - i).padStart(2, "0")}T00:00:00.000Z`,
      id: `id-${String(100 - i).padStart(3, "0")}`,
    }))
  it("a full page continues from its last row, id included", () => {
    expect(CLOSED_PAGE_SIZE).toBe(50)
    const rows = page(CLOSED_PAGE_SIZE)
    expect(nextClosedCursor(rows, { cutoff, firstPage: true })).toEqual(rows[rows.length - 1])
  })
  it("ties at row 50 keep the id, so the rest of the tie is still reachable", () => {
    const tied = Array.from({ length: CLOSED_PAGE_SIZE }, (_, i) => ({ ts: "2026-10-01T00:00:00.000Z", id: `id-${99 - i}` }))
    const cursor = nextClosedCursor(tied, { cutoff, firstPage: false })
    expect(cursor).toEqual({ ts: "2026-10-01T00:00:00.000Z", id: "id-50" })
    // Rows 49..0 share the timestamp and have smaller ids: the filter admits them.
    expect(olderThanFilter("updated_at", cursor!)).toBe(
      "updated_at.lt.2026-10-01T00:00:00.000Z,and(updated_at.eq.2026-10-01T00:00:00.000Z,id.lt.id-50)",
    )
  })
  it("a short first page has exhausted the window, so older starts strictly at the cutoff", () => {
    expect(nextClosedCursor(page(1), { cutoff, firstPage: true })).toEqual({ ts: cutoff, id: null })
    expect(nextClosedCursor([], { cutoff, firstPage: true })).toEqual({ ts: cutoff, id: null })
    expect(olderThanFilter("created_at", { ts: cutoff, id: null })).toBe(`created_at.lt.${cutoff}`)
  })
  it("a short later page is the end of history", () => {
    expect(nextClosedCursor(page(3), { cutoff, firstPage: false })).toBeNull()
    expect(nextClosedCursor([], { cutoff, firstPage: false })).toBeNull()
  })
})
