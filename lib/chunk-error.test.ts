import { describe, expect, it } from "vitest"
import { isChunkLoadError } from "./chunk-error"

describe("isChunkLoadError", () => {
  it("accepts the webpack error by name", () => {
    const e = new Error("x")
    e.name = "ChunkLoadError"
    expect(isChunkLoadError(e)).toBe(true)
  })
  it("accepts webpack and browser dynamic-import messages", () => {
    expect(isChunkLoadError(new Error("Loading chunk 42 failed."))).toBe(true)
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: /a.js"))).toBe(true)
  })
  it("rejects ordinary errors", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})
