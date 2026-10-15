import { describe, expect, it } from "vitest"
import { advanceCursor, nextBatch } from "./nightly"

const ids = ["a", "b", "c", "d", "e"]

describe("nextBatch", () => {
  it("starts from the beginning when there is no cursor", () => {
    expect(nextBatch(ids, null, 2)).toEqual({ batch: ["a", "b"], done: false })
  })

  it("continues after the cursor", () => {
    expect(nextBatch(ids, "b", 2)).toEqual({ batch: ["c", "d"], done: false })
  })

  it("is done when the batch reaches the end of the list", () => {
    expect(nextBatch(ids, "d", 2)).toEqual({ batch: ["e"], done: true })
  })

  it("is done when the batch exactly fills the remainder", () => {
    expect(nextBatch(ids, "c", 2)).toEqual({ batch: ["d", "e"], done: true })
  })

  it("carries on past a cursor whose profile was deleted", () => {
    expect(nextBatch(ids, "bb", 2)).toEqual({ batch: ["c", "d"], done: false })
  })

  it("starts over when the cursor is past every id", () => {
    expect(nextBatch(ids, "z", 2)).toEqual({ batch: [], done: true })
  })

  it("handles an empty list", () => {
    expect(nextBatch([], null, 2)).toEqual({ batch: [], done: true })
    expect(nextBatch([], "b", 2)).toEqual({ batch: [], done: true })
  })
})

describe("advanceCursor", () => {
  it("resets to the start when the sweep finished", () => {
    expect(advanceCursor(["e"], true)).toBeNull()
  })

  it("resumes after the last completed profile", () => {
    expect(advanceCursor(["c", "d"], false)).toBe("d")
  })

  it("has no cursor to give when nothing completed", () => {
    expect(advanceCursor([], false)).toBeNull()
  })
})
