import { describe, expect, it } from "vitest"
import { checkInviteEmail, inviteFailureMessage, roleForNewManager } from "./admin-invite"

describe("roleForNewManager", () => {
  it("elevates residents and other roles", () => {
    expect(roleForNewManager("pet_owner")).toBe("building_manager")
    expect(roleForNewManager("business")).toBe("building_manager")
    expect(roleForNewManager(null)).toBe("building_manager")
  })
  it("leaves managers and admins alone", () => {
    expect(roleForNewManager("building_manager")).toBeNull()
    expect(roleForNewManager("super_admin")).toBeNull()
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
