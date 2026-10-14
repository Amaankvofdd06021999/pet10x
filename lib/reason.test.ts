import { describe, expect, it } from "vitest"
import { validateReason } from "./reason"

describe("validateReason", () => {
  it("treats whitespace-only as empty", () => {
    expect(validateReason("   \n ", { required: true })).toEqual({ ok: false, error: "required" })
    expect(validateReason("   ", { required: false })).toEqual({ ok: true, value: null })
  })
  it("trims and accepts", () => {
    expect(validateReason("  Dog was leashed ", { required: true })).toEqual({ ok: true, value: "Dog was leashed" })
  })
  it("enforces max length after trimming (default 2000)", () => {
    expect(validateReason("a".repeat(2001), { required: true })).toEqual({ ok: false, error: "too_long" })
    expect(validateReason("a".repeat(5), { required: true, max: 4 })).toEqual({ ok: false, error: "too_long" })
  })
})
