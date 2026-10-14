import { describe, expect, it } from "vitest"
import { validateVerification } from "./verification-form"

const ok = { licenceNumber: "VET-12345", issuingBody: "College of Veterinarians", contactName: "Dr Lee", contactPhone: "+1 (604) 555-0100" }

describe("validateVerification", () => {
  it("accepts a complete request and trims every field", () => {
    const r = validateVerification({ ...ok, licenceNumber: "  VET-12345 ", contactName: " Dr Lee " })
    expect(r).toEqual({ ok: true, value: { ...ok, licenceNumber: "VET-12345", contactName: "Dr Lee" } })
  })

  it("requires a licence number", () => {
    const r = validateVerification({ ...ok, licenceNumber: "   " })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.licenceNumber).toBeTruthy()
  })

  it.each(["ab", "-ABC123", "AB#123", "A".repeat(41)])("refuses the licence number %s", (licenceNumber) => {
    const r = validateVerification({ ...ok, licenceNumber })
    expect(r.ok).toBe(false)
  })

  it.each(["ABC", "12/34.56-7 8", "A".repeat(40)])("accepts the licence number %s", (licenceNumber) => {
    expect(validateVerification({ ...ok, licenceNumber }).ok).toBe(true)
  })

  it("requires an issuing body of 2 to 80 characters", () => {
    for (const issuingBody of ["", " ", "x", "x".repeat(81)]) {
      const r = validateVerification({ ...ok, issuingBody })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.issuingBody).toBeTruthy()
    }
    expect(validateVerification({ ...ok, issuingBody: "ab" }).ok).toBe(true)
  })

  it("allows an empty phone but refuses a malformed one", () => {
    expect(validateVerification({ ...ok, contactPhone: "" }).ok).toBe(true)
    for (const contactPhone of ["12345", "call me maybe", "+1 604 555 0100 ext 5 and more digits"]) {
      const r = validateVerification({ ...ok, contactPhone })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.contactPhone).toBeTruthy()
    }
  })

  it("reports every problem at once", () => {
    const r = validateVerification({ licenceNumber: "", issuingBody: "", contactName: "", contactPhone: "x" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["contactPhone", "issuingBody", "licenceNumber"])
  })
})
