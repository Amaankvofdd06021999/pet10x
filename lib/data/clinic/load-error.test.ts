import { describe, it, expect, vi } from "vitest"
import { loadErrorSentence } from "./load-error"

describe("loadErrorSentence", () => {
  it("names what failed when the error is unknown", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(loadErrorSentence("patients", new Error('relation "x" does not exist'))).toBe(
      "Couldn't load patients. Try again.",
    )
  })

  it("names what failed for a non-Error throw", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(loadErrorSentence("the schedule", { code: "XX000", message: "boom" })).toBe(
      "Couldn't load the schedule. Try again.",
    )
  })

  it("keeps a sentence we wrote", () => {
    expect(loadErrorSentence("patients", new Error("You must be signed in."))).toBe("You must be signed in.")
  })
})
