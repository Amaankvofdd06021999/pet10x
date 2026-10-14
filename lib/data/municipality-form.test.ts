import { describe, expect, it } from "vitest"
import { parsePostalPrefixes, validateMunicipalityForm } from "./municipality-form"

describe("parsePostalPrefixes", () => {
  it("splits on commas and whitespace, uppercases and keeps order", () => {
    expect(parsePostalPrefixes("v6b, V6C  v5k")).toEqual({ ok: true, value: ["V6B", "V6C", "V5K"] })
  })
  it("reports every token that is not a Canadian FSA", () => {
    expect(parsePostalPrefixes("V6B, 123")).toEqual({ ok: false, bad: ["123"] })
    expect(parsePostalPrefixes("V6B1, V6B")).toEqual({ ok: false, bad: ["V6B1"] })
  })
  it("accepts an empty string as no prefixes", () => {
    expect(parsePostalPrefixes("")).toEqual({ ok: true, value: [] })
    expect(parsePostalPrefixes("  , ")).toEqual({ ok: true, value: [] })
  })
  it("deduplicates", () => {
    expect(parsePostalPrefixes("V6B v6b V6B")).toEqual({ ok: true, value: ["V6B"] })
  })
})

const base = { name: "Vancouver", region: "BC", prefixes: "V6B", phone: "", url: "" }

describe("validateMunicipalityForm", () => {
  it("accepts a minimal valid form and normalises it", () => {
    const r = validateMunicipalityForm({ ...base, name: "  Vancouver ", phone: "+1 (604) 555-0100", url: "https://vancouver.ca/pets" })
    expect(r).toEqual({
      ok: true,
      value: { name: "Vancouver", region: "BC", postalPrefixes: ["V6B"], phone: "+1 (604) 555-0100", url: "https://vancouver.ca/pets" },
    })
  })
  it("turns blank optional fields into null", () => {
    const r = validateMunicipalityForm(base)
    expect(r.ok && r.value.phone).toBeNull()
    expect(r.ok && r.value.url).toBeNull()
  })
  it("requires a name of 2 to 80 characters and a region of 2 to 40", () => {
    const bad = (v: Partial<typeof base>) => {
      const r = validateMunicipalityForm({ ...base, ...v })
      return r.ok ? {} : r.errors
    }
    expect(bad({ name: "V" }).name).toBeTruthy()
    expect(bad({ name: "x".repeat(81) }).name).toBeTruthy()
    expect(bad({ region: " " }).region).toBeTruthy()
    expect(bad({ region: "x".repeat(41) }).region).toBeTruthy()
  })
  it("checks phone against the allowed characters", () => {
    expect(validateMunicipalityForm({ ...base, phone: "call us" }).ok).toBe(false)
    expect(validateMunicipalityForm({ ...base, phone: "123" }).ok).toBe(false)
  })
  it("accepts only http and https URLs", () => {
    expect(validateMunicipalityForm({ ...base, url: "javascript:alert(1)" }).ok).toBe(false)
    expect(validateMunicipalityForm({ ...base, url: "vancouver.ca" }).ok).toBe(false)
    expect(validateMunicipalityForm({ ...base, url: "http://vancouver.ca" }).ok).toBe(true)
  })
  it("names the bad prefixes", () => {
    const r = validateMunicipalityForm({ ...base, prefixes: "V6B, 123" })
    expect(!r.ok && r.errors.prefixes).toContain("123")
  })
})
