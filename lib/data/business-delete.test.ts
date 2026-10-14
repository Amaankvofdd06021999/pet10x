import { describe, it, expect } from "vitest"
import {
  canDeleteBusiness,
  deleteBusinessError,
  footprintError,
  footprintLines,
  nameMatches,
  parseFootprint,
  HAS_RECORDS_MESSAGE,
  NAME_MISMATCH_MESSAGE,
  type BusinessFootprint,
} from "./business-delete"

const EMPTY: BusinessFootprint = { patients: 0, visits: 0, invoices: 0, staff: 0, openBookings: 0, appointments: 0 }

describe("parseFootprint", () => {
  it("reads the RPC's six counts, renaming open_bookings", () => {
    expect(
      parseFootprint({ patients: 3, visits: 5, invoices: 2, staff: 1, open_bookings: 0, appointments: 4 }),
    ).toEqual({ patients: 3, visits: 5, invoices: 2, staff: 1, openBookings: 0, appointments: 4 })
  })

  it("refuses anything that is not six whole, non-negative counts — no counts, no delete", () => {
    expect(parseFootprint(null)).toBeNull()
    expect(parseFootprint("x")).toBeNull()
    expect(parseFootprint({ patients: 0, visits: 0, invoices: 0, staff: 0, open_bookings: 0 })).toBeNull()
    expect(
      parseFootprint({ patients: "0", visits: 0, invoices: 0, staff: 0, open_bookings: 0, appointments: 0 }),
    ).toBeNull()
    expect(
      parseFootprint({ patients: -1, visits: 0, invoices: 0, staff: 0, open_bookings: 0, appointments: 0 }),
    ).toBeNull()
    expect(
      parseFootprint({ patients: 1.5, visits: 0, invoices: 0, staff: 0, open_bookings: 0, appointments: 0 }),
    ).toBeNull()
  })
})

describe("canDeleteBusiness", () => {
  it("allows an empty business", () => {
    expect(canDeleteBusiness(EMPTY)).toBe(true)
  })

  it("allows staff and future appointments — shown, not blocking, as in the database", () => {
    expect(canDeleteBusiness({ ...EMPTY, staff: 2, appointments: 3 })).toBe(true)
  })

  it("refuses patients, visits, invoices or open bookings", () => {
    expect(canDeleteBusiness({ ...EMPTY, patients: 1 })).toBe(false)
    expect(canDeleteBusiness({ ...EMPTY, visits: 1 })).toBe(false)
    expect(canDeleteBusiness({ ...EMPTY, invoices: 1 })).toBe(false)
    expect(canDeleteBusiness({ ...EMPTY, openBookings: 1 })).toBe(false)
  })

  it("refuses when the counts are unknown", () => {
    expect(canDeleteBusiness(null)).toBe(false)
  })
})

describe("nameMatches", () => {
  it("matches exactly after trimming both sides", () => {
    expect(nameMatches("  Paws & Co ", "Paws & Co")).toBe(true)
    expect(nameMatches("Paws & Co", " Paws & Co  ")).toBe(true)
  })

  it("is case-sensitive, and a blank name never matches", () => {
    expect(nameMatches("paws & co", "Paws & Co")).toBe(false)
    expect(nameMatches("   ", "   ")).toBe(false)
    expect(nameMatches("", "")).toBe(false)
  })
})

describe("footprintLines", () => {
  it("says each count in words, singular and plural", () => {
    expect(
      footprintLines({ patients: 1, visits: 2, invoices: 0, staff: 1, openBookings: 3, appointments: 1 }),
    ).toEqual([
      "1 patient",
      "2 visits",
      "0 invoices",
      "1 staff member besides the owner",
      "3 open bookings",
      "1 upcoming appointment",
    ])
  })
})

describe("deleteBusinessError", () => {
  it("maps the RPC's refusals to sentences", () => {
    expect(deleteBusinessError({ error: "name_mismatch" })).toBe("That name doesn't match.")
    expect(NAME_MISMATCH_MESSAGE).toBe("That name doesn't match.")
    expect(deleteBusinessError({ error: "has_records" })).toBe(
      "This business has clinic records. Set its tier to Registered instead.",
    )
    expect(HAS_RECORDS_MESSAGE).toBe("This business has clinic records. Set its tier to Registered instead.")
    expect(deleteBusinessError({ error: "not_found" })).toBe("That business no longer exists.")
  })

  it("maps a refused caller, and never shows anything else raw", () => {
    expect(deleteBusinessError({ code: "42501", message: "Only a Pet10x admin can delete a business" })).toBe(
      "Only a Pet10x admin can delete a business.",
    )
    expect(deleteBusinessError({ error: "something_new" })).toBe("Something went wrong. Try again.")
    expect(deleteBusinessError({ code: "XX000", message: 'relation "x" does not exist' })).toBe(
      "Something went wrong. Try again.",
    )
  })
})

describe("footprintError", () => {
  it("says why the counts could not load", () => {
    expect(footprintError({ code: "42501", message: "x" })).toBe("Only a Pet10x admin can delete a business.")
    expect(footprintError({ code: "P0002", message: "x" })).toBe("That business no longer exists.")
    expect(footprintError({ message: "fetch failed" })).toBe("Couldn't load what this business holds. Try again.")
  })
})
