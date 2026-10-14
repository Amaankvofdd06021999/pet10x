import { describe, expect, it } from "vitest"
import { defaultWeightUnit, formatWeight, parseWeightKg, toggleWeightUnit, type WeightFieldState } from "./units"

describe("parseWeightKg", () => {
  it("lb toggle", () => expect(parseWeightKg("70", "lb")).toEqual({ ok: true, kg: 31.8 }))
  it("unit in text wins", () => expect(parseWeightKg("70 lbs", "kg")).toEqual({ ok: true, kg: 31.8 }))
  it("comma decimal", () => expect(parseWeightKg("12,5", "kg")).toEqual({ ok: true, kg: 12.5 }))
  it("no space", () => expect(parseWeightKg("32kg", "lb")).toEqual({ ok: true, kg: 32 }))
  it("is case-insensitive", () => expect(parseWeightKg(" 12.5 KGS ", "lb")).toEqual({ ok: true, kg: 12.5 }))
  it("empty is allowed", () => expect(parseWeightKg("  ", "kg")).toEqual({ ok: true, kg: null }))
  it("refuses junk and absurd", () => {
    expect(parseWeightKg("about 30", "kg")).toEqual({ ok: false })
    expect(parseWeightKg("400", "kg")).toEqual({ ok: false })
  })
  it("refuses a bare unit, a third decimal and stray signs", () => {
    expect(parseWeightKg("kg", "kg")).toEqual({ ok: false })
    expect(parseWeightKg("1.234", "kg")).toEqual({ ok: false })
    expect(parseWeightKg("-5", "kg")).toEqual({ ok: false })
    expect(parseWeightKg("1e2", "kg")).toEqual({ ok: false })
  })
  it("caps at 150 kg after conversion", () => {
    expect(parseWeightKg("150", "kg")).toEqual({ ok: true, kg: 150 })
    expect(parseWeightKg("150.1", "kg")).toEqual({ ok: false })
    expect(parseWeightKg("330", "lb")).toEqual({ ok: true, kg: 149.7 })
    expect(parseWeightKg("331", "lb")).toEqual({ ok: false })
  })
})

describe("defaultWeightUnit", () => {
  it("only en-US defaults to lb", () => {
    expect(defaultWeightUnit("en-US")).toBe("lb")
    expect(defaultWeightUnit("en-CA")).toBe("kg")
    expect(defaultWeightUnit("en-GB")).toBe("kg")
    expect(defaultWeightUnit("")).toBe("kg")
  })
})

describe("formatWeight", () => {
  it("shows kg and lb to 0.1", () => {
    expect(formatWeight(31.8, "kg")).toBe("31.8")
    expect(formatWeight(32, "kg")).toBe("32")
    expect(formatWeight(31.8, "lb")).toBe("70.1")
  })
})

describe("zero is not a weight", () => {
  it.each(["0", "0.0", "0,00", "0.1 lb", "0.04"])("refuses %s", (t) => {
    expect(parseWeightKg(t, "lb")).toEqual({ ok: false })
  })
  it("accepts the smallest real weight", () => expect(parseWeightKg("0.1", "kg")).toEqual({ ok: true, kg: 0.1 }))
})

describe("toggleWeightUnit", () => {
  const start = (text: string, unit: "kg" | "lb"): WeightFieldState => ({ text, unit, kgExact: null })
  it("70 lb -> kg -> lb comes back to 70", () => {
    const kg = toggleWeightUnit(start("70", "lb"), "kg")
    expect(kg.text).toBe("31.8")
    expect(toggleWeightUnit(kg, "lb").text).toBe("70")
  })
  it("31.8 kg -> lb -> kg comes back to 31.8", () => {
    const lb = toggleWeightUnit(start("31.8", "kg"), "lb")
    expect(lb.text).toBe("70.1")
    expect(toggleWeightUnit(lb, "kg").text).toBe("31.8")
  })
  it("empty or invalid text only switches the unit", () => {
    expect(toggleWeightUnit(start("  ", "kg"), "lb")).toEqual({ text: "  ", unit: "lb", kgExact: null })
    expect(toggleWeightUnit(start("about 30", "kg"), "lb")).toEqual({ text: "about 30", unit: "lb", kgExact: null })
  })
  it("converts a held legacy kg even when it would not parse", () => {
    expect(toggleWeightUnit({ text: "12.55", unit: "kg", kgExact: 12.55 }, "lb").text).toBe("27.7")
  })
  it("same unit is a no-op", () => {
    const s = start("5", "kg")
    expect(toggleWeightUnit(s, "kg")).toBe(s)
  })
})
