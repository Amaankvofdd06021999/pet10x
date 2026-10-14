import { describe, expect, it } from "vitest"
import { PHONE_SHAPE, bookingContactState, telHref, validateContact } from "./business-contact"

describe("validateContact", () => {
  it("accepts blank fields — both are optional", () => {
    expect(validateContact({ phone: "", email: "  " })).toEqual({ ok: true, value: { phone: null, email: null } })
  })

  it("trims and accepts the shapes the database CHECKs allow", () => {
    expect(validateContact({ phone: " +1 (604) 555-0199 ", email: " hello@paws.ca " })).toEqual({
      ok: true,
      value: { phone: "+1 (604) 555-0199", email: "hello@paws.ca" },
    })
  })

  it("refuses a phone outside ^[+0-9 ()-]{7,20}$", () => {
    for (const bad of ["555", "604.555.0199", "call me", "+1 604 555 0199 ext 12", "1".repeat(21)]) {
      const r = validateContact({ phone: bad, email: "" })
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.errors.phone).toBe("Use digits, spaces, brackets, + or -, 7 to 20 characters.")
        expect(r.errors.email).toBeUndefined()
      }
    }
  })

  it("refuses an email that does not look like one", () => {
    for (const bad of ["paws", "paws@ca", "a b@paws.ca", "@paws.ca"]) {
      const r = validateContact({ phone: "", email: bad })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.email).toBe("Enter an email like name@example.com.")
    }
  })

  it("reports both at once", () => {
    const r = validateContact({ phone: "x", email: "y" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["email", "phone"])
  })

  it("is the same grammar as businesses_contact_phone_grammar", () => {
    expect(PHONE_SHAPE.source).toBe("^[+0-9 ()-]{7,20}$")
  })
})

describe("telHref", () => {
  it("keeps only digits and a leading +", () => {
    expect(telHref("+1 (604) 555-0199")).toBe("tel:+16045550199")
    expect(telHref("604 555 0199")).toBe("tel:6045550199")
  })
})

describe("bookingContactState", () => {
  it("shares contact for the statuses business_booking_contact answers", () => {
    for (const s of ["confirmed", "in_progress", "completed", "paid"]) expect(bookingContactState(s)).toBe("shared")
  })
  it("promises it on a request", () => {
    expect(bookingContactState("requested")).toBe("after_confirm")
  })
  it("says nothing for a booking that ended without happening, or a status it does not know", () => {
    for (const s of ["declined", "cancelled", "", "constructor"]) expect(bookingContactState(s)).toBe("none")
  })
})
