import { describe, expect, it } from "vitest"
import { buttonType } from "./button-type"

describe("buttonType", () => {
  it("defaults a real button to type=button so it never submits a form by accident", () => {
    expect(buttonType(false, undefined)).toBe("button")
  })
  it("keeps an explicit type", () => {
    expect(buttonType(false, "submit")).toBe("submit")
    expect(buttonType(false, "reset")).toBe("reset")
  })
  it("adds nothing when the button is rendered as another element", () => {
    expect(buttonType(true, undefined)).toBeUndefined()
  })
})
