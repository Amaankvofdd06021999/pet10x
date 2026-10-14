import { describe, it, expect } from "vitest"
import { calendarColumns } from "./calendar-columns"

const vet = { id: "s1", name: "Dr Lee", bookable: true }
const nurse = { id: "s2", name: "Sam", bookable: true }
const admin = { id: "s3", name: "Front desk", bookable: false }

describe("calendarColumns", () => {
  it("shows one column per bookable clinician and no Unassigned when everything is assigned", () => {
    expect(calendarColumns([vet, admin, nurse], [{ staffId: "s1" }, { staffId: "s2" }])).toEqual([
      { id: "s1", name: "Dr Lee" },
      { id: "s2", name: "Sam" },
    ])
  })

  it("adds an Unassigned column last when any appointment has no clinician", () => {
    expect(calendarColumns([vet], [{ staffId: "s1" }, { staffId: null }])).toEqual([
      { id: "s1", name: "Dr Lee" },
      { id: null, name: "Unassigned" },
    ])
  })

  it("shows Unassigned alone when nobody is bookable, even on an empty day", () => {
    expect(calendarColumns([admin], [])).toEqual([{ id: null, name: "Unassigned" }])
    expect(calendarColumns([], [])).toEqual([{ id: null, name: "Unassigned" }])
  })

  it("never adds Unassigned twice", () => {
    expect(calendarColumns([admin], [{ staffId: null }, { staffId: null }])).toEqual([
      { id: null, name: "Unassigned" },
    ])
  })

  it("gives a non-bookable or inactive clinician with an appointment its own column, before Unassigned", () => {
    expect(calendarColumns([vet, admin], [{ staffId: "s3" }, { staffId: null }])).toEqual([
      { id: "s1", name: "Dr Lee" },
      { id: "s3", name: "Front desk (not bookable)" },
      { id: null, name: "Unassigned" },
    ])
  })

  it("adds no column for a non-bookable clinician with no appointments", () => {
    expect(calendarColumns([vet, admin], [{ staffId: "s1" }])).toEqual([{ id: "s1", name: "Dr Lee" }])
  })

  it("puts an appointment for an unknown staff id in Unassigned", () => {
    expect(calendarColumns([vet], [{ staffId: "gone" }])).toEqual([
      { id: "s1", name: "Dr Lee" },
      { id: null, name: "Unassigned" },
    ])
  })
})
