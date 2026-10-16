import { describe, expect, it } from "vitest"
import { canOptimize } from "./image-src"

const SUPA = "https://abcd1234.supabase.co"

describe("canOptimize", () => {
  it("optimises this site's own images", () => {
    expect(canOptimize("/hero-image.jpg", SUPA)).toBe(true)
  })
  it("optimises the project's storage, signed or public", () => {
    expect(canOptimize(`${SUPA}/storage/v1/object/sign/pet-files/a.jpg?token=x`, SUPA)).toBe(true)
    expect(canOptimize(`${SUPA}/storage/v1/object/public/avatars/a.jpg`, SUPA)).toBe(true)
  })
  it("leaves everything else to the browser", () => {
    expect(canOptimize("blob:https://pet10x.app/1234", SUPA)).toBe(false)
    expect(canOptimize("data:image/png;base64,AAAA", SUPA)).toBe(false)
    expect(canOptimize("https://images.unsplash.com/photo-1.jpg", SUPA)).toBe(false)
    expect(canOptimize("//cdn.example.com/a.jpg", SUPA)).toBe(false)
    // Same host, but not the storage API: next.config does not allow it.
    expect(canOptimize(`${SUPA}/rest/v1/pets`, SUPA)).toBe(false)
    // Another project on supabase.co.
    expect(canOptimize("https://other.supabase.co/storage/v1/object/public/a.jpg", SUPA)).toBe(false)
  })
  it("with no project configured, only local images", () => {
    expect(canOptimize("/a.jpg", undefined)).toBe(true)
    expect(canOptimize(`${SUPA}/storage/v1/object/public/a.jpg`, undefined)).toBe(false)
  })
  it("an empty or missing src is not optimisable", () => {
    expect(canOptimize("", SUPA)).toBe(false)
    expect(canOptimize(null, SUPA)).toBe(false)
  })
})
