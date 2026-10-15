import { describe, it, expect } from "vitest"
import { userToKeepOnLoadError } from "./user-fallback"

const a = { id: "a", onboarded: true }
const b = { id: "b", onboarded: true }

describe("userToKeepOnLoadError", () => {
  it("keeps the user already on screen when it is this account", () => {
    expect(userToKeepOnLoadError("a", a, null)).toBe(a)
  })
  it("falls back to the cached user for this account", () => {
    expect(userToKeepOnLoadError("a", null, a)).toBe(a)
  })
  it("prefers the on-screen user over the cache", () => {
    const cached = { id: "a", onboarded: false }
    expect(userToKeepOnLoadError("a", a, cached)).toBe(a)
  })
  it("never keeps another account's user", () => {
    expect(userToKeepOnLoadError("a", b, b)).toBeNull()
  })
  it("has nothing to keep on a first load", () => {
    expect(userToKeepOnLoadError("a", null, null)).toBeNull()
  })
})
