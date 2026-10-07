import { describe, it, expect } from "vitest"
import { BUSINESS_CATEGORIES, codeHashInput, decideStart, parseSignupIntent, pendingBusiness } from "./signup-intent"

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

describe("decideStart", () => {
  const now = Date.parse("2026-10-07T12:00:00Z")
  const base = { nowMs: now, cooldownSeconds: 60, maxSends: 5 }
  const sentAgo = (s: number) => new Date(now - s * 1000).toISOString()
  const paws = { businessName: "Paws", category: "Grooming" }

  it("sends when nothing is pending", () => {
    expect(decideStart({ ...base, existing: null, intent: "resident", business: null })).toEqual({ kind: "send" })
  })

  it("leaves a matching code alone inside the cooldown", () => {
    expect(
      decideStart({
        ...base,
        existing: { send_count: 1, last_sent_at: sentAgo(20), intent: "resident", business: null },
        intent: "resident",
        business: null,
      }),
    ).toEqual({ kind: "cooldown", retryAfterSeconds: 40 })
    expect(
      decideStart({
        ...base,
        existing: { send_count: 1, last_sent_at: sentAgo(20), intent: "business", business: paws },
        intent: "business",
        business: { ...paws },
      }),
    ).toEqual({ kind: "cooldown", retryAfterSeconds: 40 })
  })

  it("refuses to flip a live code's account type inside the cooldown, either way", () => {
    expect(
      decideStart({
        ...base,
        existing: { send_count: 1, last_sent_at: sentAgo(10), intent: "resident", business: null },
        intent: "business",
        business: paws,
      }),
    ).toEqual({ kind: "conflict", retryAfterSeconds: 50 })
    expect(
      decideStart({
        ...base,
        existing: { send_count: 1, last_sent_at: sentAgo(10), intent: "business", business: paws },
        intent: "resident",
        business: null,
      }),
    ).toMatchObject({ kind: "conflict" })
  })

  it("refuses to rename a pending business inside the cooldown", () => {
    expect(
      decideStart({
        ...base,
        existing: { send_count: 1, last_sent_at: sentAgo(10), intent: "business", business: paws },
        intent: "business",
        business: { businessName: "Attacker Co", category: "Grooming" },
      }),
    ).toMatchObject({ kind: "conflict" })
  })

  it("sends a fresh code after the cooldown, whatever the intent", () => {
    expect(
      decideStart({
        ...base,
        existing: { send_count: 2, last_sent_at: sentAgo(61), intent: "resident", business: null },
        intent: "business",
        business: paws,
      }),
    ).toEqual({ kind: "send" })
  })

  it("stops at the send cap", () => {
    expect(
      decideStart({
        ...base,
        existing: { send_count: 5, last_sent_at: sentAgo(120), intent: "resident", business: null },
        intent: "resident",
        business: null,
      }),
    ).toEqual({ kind: "cap" })
  })
})

describe("codeHashInput", () => {
  it("keeps the resident input as it was before intents", () => {
    expect(codeHashInput("a@b.co", "123456", "resident", "pep")).toBe("a@b.co:123456:pep")
  })

  it("binds a business intent, so the same code hashes differently", () => {
    expect(codeHashInput("a@b.co", "123456", "business", "pep")).toBe("a@b.co:business:123456:pep")
    expect(codeHashInput("a@b.co", "123456", "business", "pep")).not.toBe(
      codeHashInput("a@b.co", "123456", "resident", "pep"),
    )
  })
})
