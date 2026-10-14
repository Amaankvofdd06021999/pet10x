import { describe, it, expect } from "vitest"
import { validateAppointmentType, typePriceLabel } from "./appointment-type-form"

describe("validateAppointmentType", () => {
  it("accepts a name, whole minutes and a price, trimming the name", () => {
    expect(validateAppointmentType({ name: "  Dental check ", duration: "45", price: "$120.50" })).toEqual({
      ok: true,
      value: { name: "Dental check", durationMin: 45, priceCents: 12050 },
    })
  })

  it("stores an empty price as 0 — shown as Price on request", () => {
    expect(validateAppointmentType({ name: "Sick visit", duration: "30", price: "  " })).toEqual({
      ok: true,
      value: { name: "Sick visit", durationMin: 30, priceCents: 0 },
    })
  })

  it("requires a duration of 5 to 600 whole minutes — the calendar needs one", () => {
    const err = "Enter whole minutes from 5 to 600."
    for (const bad of ["", "4", "601", "30.5", "30 min", "-10", "abc"]) {
      const res = validateAppointmentType({ name: "Exam", duration: bad, price: "" })
      expect(res).toEqual({ ok: false, errors: { duration: err } })
    }
    expect(validateAppointmentType({ name: "Exam", duration: "5", price: "" }).ok).toBe(true)
    expect(validateAppointmentType({ name: "Exam", duration: "600", price: "" }).ok).toBe(true)
  })

  it("requires a name of 2 to 80 characters", () => {
    expect(validateAppointmentType({ name: " a ", duration: "30", price: "" })).toEqual({
      ok: false,
      errors: { name: "Use 2 to 80 characters." },
    })
    expect(validateAppointmentType({ name: "x".repeat(81), duration: "30", price: "" })).toEqual({
      ok: false,
      errors: { name: "Use 2 to 80 characters." },
    })
  })

  it("refuses a price it would have to guess at, and reports every field at once", () => {
    expect(validateAppointmentType({ name: "", duration: "", price: "-5" })).toEqual({
      ok: false,
      errors: {
        name: "Use 2 to 80 characters.",
        duration: "Enter whole minutes from 5 to 600.",
        price: "Enter a price like 85 or 85.50.",
      },
    })
  })
})

describe("typePriceLabel", () => {
  it("says Price on request for 0 and a formatted amount otherwise", () => {
    expect(typePriceLabel(0)).toBe("Price on request")
    expect(typePriceLabel(8500)).toBe("$85.00")
  })
})
