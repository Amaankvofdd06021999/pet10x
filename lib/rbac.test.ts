import { describe, expect, it } from "vitest"
import { canAccessRoute, defaultPersona, findRouteRule, personasFor, type PersonaGrants } from "./rbac"

describe("canAccessRoute", () => {
  it("lets a pet owner into /app", () => {
    expect(canAccessRoute("/app", { role: "pet-owner", isSuperAdmin: false })).toBe(true)
  })

  it("keeps a pet owner out of the strata portal", () => {
    expect(canAccessRoute("/strata-portal", { role: "pet-owner", isSuperAdmin: false })).toBe(false)
  })

  it("requires the admin flag for /admin, not merely the role", () => {
    expect(canAccessRoute("/admin", { role: "super-admin", isSuperAdmin: false })).toBe(false)
    expect(canAccessRoute("/admin", { role: "pet-owner", isSuperAdmin: true })).toBe(true)
  })

  it("lets the admin flag transcend every scope", () => {
    expect(canAccessRoute("/strata-portal", { role: "pet-owner", isSuperAdmin: true })).toBe(true)
  })

  it("denies a suspended account every route, admin flag included", () => {
    expect(canAccessRoute("/app", { role: "pet-owner", isSuperAdmin: true, isSuspended: true })).toBe(false)
  })

  it("treats an unmatched path as public", () => {
    expect(canAccessRoute("/login", { role: null, isSuperAdmin: false })).toBe(true)
  })

  it("matches on the longest prefix", () => {
    expect(findRouteRule("/app/anything")?.prefix).toBe("/app")
    expect(findRouteRule("/nowhere")).toBeNull()
  })
})

describe("personasFor", () => {
  const base: PersonaGrants = {
    profileId: "p1",
    defaultRole: "pet_owner",
    isSuspended: false,
    isSuperAdmin: false,
    ownsPets: true,
    managedBuildings: [],
  }

  it("gives a plain signup exactly one persona, so no switcher appears", () => {
    expect(personasFor(base)).toEqual(["pet-owner"])
  })

  it("adds building-manager from one managed building", () => {
    const grants = { ...base, managedBuildings: [{ id: "b1", name: "A", isPrimary: true }] }
    expect(personasFor(grants)).toEqual(["pet-owner", "building-manager"])
  })

  it("adds strata only from two buildings up", () => {
    const grants = {
      ...base,
      managedBuildings: [
        { id: "b1", name: "A", isPrimary: true },
        { id: "b2", name: "B", isPrimary: false },
      ],
    }
    expect(personasFor(grants)).toEqual(["pet-owner", "building-manager", "strata-manager"])
  })

  it("gives a suspended account none", () => {
    expect(personasFor({ ...base, isSuspended: true })).toEqual([])
  })

  it("treats business as its own surface, not a persona held alongside residency", () => {
    expect(personasFor({ ...base, defaultRole: "business" })).toEqual(["business"])
  })
})

describe("defaultPersona", () => {
  it("prefers a granted building over a stale role column", () => {
    // The documented regression: a granted manager whose profiles.role still
    // read pet_owner was dropped into resident onboarding, with their own
    // building nowhere in sight.
    expect(defaultPersona(["pet-owner", "building-manager"], "pet_owner")).toBe("building-manager")
  })

  it("does not send an admin who manages a building into the console every morning", () => {
    expect(defaultPersona(["pet-owner", "building-manager", "super-admin"], "super_admin")).toBe(
      "building-manager",
    )
  })

  it("returns null when nothing was granted", () => {
    expect(defaultPersona([], "pet_owner")).toBeNull()
  })
})
