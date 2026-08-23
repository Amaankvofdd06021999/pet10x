import { describe, it, expect } from "vitest"
import {
  readFineSchedule,
  parseAmountToCents,
  formatCentsForInput,
  formatFineAmount,
  MIN_FINE_CENTS,
  MAX_FINE_CENTS,
} from "./fine-schedule"

describe("readFineSchedule", () => {
  it("reads a schedule written as JSON numbers", () => {
    expect(readFineSchedule({ fine_1_cents: 25000, fine_2_cents: 50000, fine_currency: "CAD" })).toEqual({
      fine_1: 25000,
      fine_2: 50000,
      currency: "CAD",
    })
  })

  it("answers null for a building with no schedule — the normal case before Phase 6", () => {
    expect(readFineSchedule({ requires_registry: true })).toEqual({ fine_1: null, fine_2: null, currency: "CAD" })
    expect(readFineSchedule(null)).toEqual({ fine_1: null, fine_2: null, currency: "CAD" })
    expect(readFineSchedule(undefined)).toEqual({ fine_1: null, fine_2: null, currency: "CAD" })
  })

  /**
   * The reader and `manager_advance_violation` have to refuse the SAME shapes,
   * or the client displays a bylaw default the database will not charge.
   * `jsonb_typeof(v_bylaw) = 'number'` is the RPC's whole test.
   */
  it.each([
    ["a string", "25000"],
    ["a boolean", true],
    ["an object", { amount: 25000 }],
    ["an array", [25000]],
    ["a JSON null", null],
    ["zero", 0],
    ["a negative", -100],
  ])("ignores %s, exactly as the RPC does", (_label, value) => {
    expect(readFineSchedule({ fine_1_cents: value }).fine_1).toBeNull()
  })

  it("floors a fractional value, as floor((v #>> '{}')::numeric)::integer does", () => {
    expect(readFineSchedule({ fine_1_cents: 25000.9 }).fine_1).toBe(25000)
  })

  it("upper-cases the currency and falls back to CAD", () => {
    expect(readFineSchedule({ fine_currency: "usd" }).currency).toBe("USD")
    expect(readFineSchedule({ fine_currency: "   " }).currency).toBe("CAD")
    expect(readFineSchedule({ fine_currency: 42 }).currency).toBe("CAD")
  })
})

describe("parseAmountToCents", () => {
  it.each([
    ["250", 25000],
    ["250.00", 25000],
    ["250.5", 25050],
    ["250.55", 25055],
    ["$250", 25000],
    ["$ 250.00", 25000],
    ["  250  ", 25000],
    ["$1,250.50", 125050],
    ["1,250", 125000],
    ["10000", 1000000],
    ["10,000.00", 1000000],
    ["0.01", 1],
  ])("accepts %s", (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents)
  })

  it("treats an empty field as 'no schedule for this degree', not an error", () => {
    expect(parseAmountToCents("")).toBeNull()
    expect(parseAmountToCents("   ")).toBeNull()
  })

  it.each([
    ["0", "zero is a price of nothing, not an absence — the RPC refuses it too"],
    ["0.00", "same, written the long way"],
    ["-5", "negative"],
    ["1e3", "scientific notation"],
    ["12.345", "three decimal places — there is no such coin"],
    ["10000.01", "one cent over the RPC's 1000000 ceiling"],
    ["99999", "in the plain grammar but far over the ceiling"],
    ["abc", "not a number"],
    ["25 000", "a space is not a thousands separator here"],
    ["2,50", "a European decimal comma — 2.50 to its typist, 250 to a stripper"],
    ["1,2,3", "commas in positions that mean nothing"],
    ["250$", "a trailing symbol"],
    ["$", "a symbol and nothing else"],
    [".50", "no whole part"],
    ["250.", "a trailing point"],
  ])("rejects %s (%s)", (input) => {
    expect(parseAmountToCents(input)).toBe("invalid")
  })

  it("agrees with the RPC's bounds exactly at both edges", () => {
    expect(parseAmountToCents("0.01")).toBe(MIN_FINE_CENTS)
    expect(parseAmountToCents("10000")).toBe(MAX_FINE_CENTS)
    expect(parseAmountToCents("10000.01")).toBe("invalid")
  })
})

/**
 * THE LOAD-BEARING TEST.
 *
 * For everything a manager can type: parse it to cents, store it the way
 * `manager_set_fine_schedule` stores it (`to_jsonb(integer)` — a JSON number),
 * and read it back. The number the editor sent must be the number the resident
 * and the manager are shown, and the number the database will charge.
 *
 * This is the assertion that would have caught a text cast in the RPC: a
 * schedule written as `"25000"` reads back as `null`, which looks like "no
 * schedule" on every screen while sitting in the jsonb looking configured.
 */
describe("round trip: typed → stored → read", () => {
  it.each([
    ["250", 25000],
    ["250.00", 25000],
    ["$1,250.50", 125050],
    ["0.01", 1],
    ["10000", 1000000],
  ])("%s survives the trip", (typed, expectedCents) => {
    const cents = parseAmountToCents(typed)
    expect(cents).toBe(expectedCents)

    // What manager_set_fine_schedule writes: a JSON number, never a string.
    const stored = { fine_1_cents: cents as number, fine_2_cents: cents as number, fine_currency: "CAD" }
    const read = readFineSchedule(stored)

    expect(read.fine_1).toBe(expectedCents)
    expect(read.fine_2).toBe(expectedCents)
    expect(read.currency).toBe("CAD")

    // And the editor redisplays it as something it would itself accept.
    expect(parseAmountToCents(formatCentsForInput(read.fine_1))).toBe(expectedCents)
  })

  it("a null degree round-trips as an ABSENT key, not a JSON null", () => {
    expect(parseAmountToCents("")).toBeNull()
    // The RPC removes the key. Both spellings must read as "no schedule", but
    // only the absent one is what it actually writes.
    expect(readFineSchedule({ fine_currency: "CAD" }).fine_2).toBeNull()
    expect(readFineSchedule({ fine_2_cents: null, fine_currency: "CAD" }).fine_2).toBeNull()
  })

  it("a text-cast schedule is refused, which is why the RPC must write a number", () => {
    expect(readFineSchedule({ fine_1_cents: "25000" }).fine_1).toBeNull()
  })
})

describe("formatCentsForInput", () => {
  it.each([
    [25000, "250.00"],
    [125050, "1250.50"],
    [1, "0.01"],
    [1000000, "10000.00"],
  ])("%d → %s", (cents, expected) => {
    expect(formatCentsForInput(cents)).toBe(expected)
  })

  it("renders an unset degree as an empty field, which parses back to null", () => {
    expect(formatCentsForInput(null)).toBe("")
    expect(formatCentsForInput(undefined)).toBe("")
    expect(parseAmountToCents(formatCentsForInput(null))).toBeNull()
  })
})

describe("formatFineAmount", () => {
  it("says so when there is nothing set, rather than showing $0.00", () => {
    expect(formatFineAmount(null, "CAD")).toBe("Not set")
  })
  it("renders an amount with its currency", () => {
    expect(formatFineAmount(25000, "cad")).toBe("$250.00 CAD")
  })
})
