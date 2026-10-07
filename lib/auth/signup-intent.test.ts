import { describe, it, expect } from "vitest"
import { BUSINESS_CATEGORIES, parseSignupIntent, pendingBusiness } from "./signup-intent"

describe("parseSignupIntent", () => {
  it("is a resident signup when no intent is given — the resident flow posts none", () => {
    const residentBody = { email: "a@b.co", fullName: "A" }
    expect(parseSignupIntent(residentBody)).toEqual({ ok: true, intent: "resident", business: null })
    expect(parseSignupIntent({})).toEqual({ ok: true, intent: "resident", business: null })
  })

  it("ignores business fields on a resident signup", () => {
    expect(parseSignupIntent({ intent: "resident", businessName: "Paws" })).toEqual({
      ok: true,
      intent: "resident",
      business: null,
    })
  })

  it("accepts a business with a name and a known category", () => {
    expect(parseSignupIntent({ intent: "business", businessName: "  Happy Paws  ", category: "Grooming" })).toEqual({
      ok: true,
      intent: "business",
      business: { businessName: "Happy Paws", category: "Grooming" },
    })
  })

  it("defaults a missing category to Other", () => {
    expect(parseSignupIntent({ intent: "business", businessName: "Paws" })).toEqual({
      ok: true,
      intent: "business",
      business: { businessName: "Paws", category: "Other" },
    })
  })

  it("refuses a business with no name", () => {
    expect(parseSignupIntent({ intent: "business", businessName: "   " })).toEqual({
      ok: false,
      error: "Enter your business name.",
    })
    expect(parseSignupIntent({ intent: "business" })).toMatchObject({ ok: false })
  })

  it("refuses a name past the limit", () => {
    expect(parseSignupIntent({ intent: "business", businessName: "x".repeat(121) })).toEqual({
      ok: false,
      error: "Business name is too long (120 characters at most).",
    })
  })

  it("refuses a category that is not offered", () => {
    expect(parseSignupIntent({ intent: "business", businessName: "Paws", category: "Casino" })).toEqual({
      ok: false,
      error: "Choose a category from the list.",
    })
  })

  it("refuses an intent it does not know", () => {
    expect(parseSignupIntent({ intent: "admin" })).toEqual({ ok: false, error: "Invalid request." })
    expect(parseSignupIntent({ intent: 7 })).toEqual({ ok: false, error: "Invalid request." })
  })

  it("offers every category the business form lists", () => {
    for (const c of BUSINESS_CATEGORIES) {
      expect(parseSignupIntent({ intent: "business", businessName: "P", category: c })).toMatchObject({ ok: true })
    }
  })
})

describe("pendingBusiness", () => {
  it("reads back what start stored", () => {
    expect(pendingBusiness({ businessName: "Paws", category: "Training" })).toEqual({
      businessName: "Paws",
      category: "Training",
    })
  })

  it("is null for anything that is not a stored business", () => {
    expect(pendingBusiness(null)).toBeNull()
    expect(pendingBusiness("Paws")).toBeNull()
    expect(pendingBusiness([])).toBeNull()
    expect(pendingBusiness({ businessName: "", category: "Other" })).toBeNull()
    expect(pendingBusiness({ businessName: "Paws" })).toBeNull()
  })
})
