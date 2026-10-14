import { describe, expect, it } from "vitest"
import { checkInviteEmail, inviteFailureMessage, roleForNewManager } from "./admin-invite"

describe("roleForNewManager", () => {
  it("elevates only a plain resident", () => {
    expect(roleForNewManager("pet_owner")).toBe("building_manager")
    expect(roleForNewManager(null)).toBe("building_manager")
  })
  it("keeps every other role", () => {
    for (const r of ["building_manager", "super_admin", "business", "something_new"]) expect(roleForNewManager(r)).toBeNull()
  })
})

describe("checkInviteEmail", () => {
  it("trims and lower-cases a valid address", () => {
    expect(checkInviteEmail("  Jo@Example.COM ")).toEqual({ ok: true, email: "jo@example.com" })
  })
  it("refuses empty and malformed addresses", () => {
    expect(checkInviteEmail("   ").ok).toBe(false)
    for (const bad of ["jo", "jo@", "jo@x", "jo @x.co", "@x.co", "a@b@c.co"]) expect(checkInviteEmail(bad).ok).toBe(false)
  })
})

describe("inviteFailureMessage", () => {
  it("names the address and hides the cause", () => {
    expect(inviteFailureMessage("a@b.co")).toBe("Couldn't invite a@b.co. Try again, or check the address.")
  })
})
