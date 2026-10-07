import { describe, it, expect } from "vitest"
import { INVITABLE_ROLES, STAFF_ROLE_LABEL, parseClinicInvite, canDeactivate } from "./staff-invite"

const BIZ = "0b5b7a3e-6c1f-4c55-9d3e-1f2a3b4c5d6e"

describe("parseClinicInvite", () => {
  it("accepts a complete invite, trimming the name and lower-casing the email", () => {
    expect(
      parseClinicInvite({ businessId: BIZ, email: "  Ana@Vet.Test ", fullName: "  Ana Pérez ", role: "nurse" }),
    ).toEqual({ ok: true, invite: { businessId: BIZ, email: "ana@vet.test", fullName: "Ana Pérez", role: "nurse" } })
  })

  it("offers the four roles a practice can invite — never owner", () => {
    expect(INVITABLE_ROLES).toEqual(["veterinarian", "nurse", "reception", "manager"])
    const res = parseClinicInvite({ businessId: BIZ, email: "a@b.co", fullName: "A", role: "owner" })
    expect(res).toEqual({ ok: false, error: "Choose a role: veterinarian, nurse, reception or manager." })
  })

  it("requires a practice, a name and a plausible email", () => {
    expect(parseClinicInvite({ email: "a@b.co", fullName: "A", role: "nurse" })).toEqual({
      ok: false,
      error: "Choose the practice to invite them to.",
    })
    expect(parseClinicInvite({ businessId: "not-a-uuid", email: "a@b.co", fullName: "A", role: "nurse" })).toEqual({
      ok: false,
      error: "Choose the practice to invite them to.",
    })
    expect(parseClinicInvite({ businessId: BIZ, email: "a@b.co", fullName: "   ", role: "nurse" })).toEqual({
      ok: false,
      error: "Enter their name.",
    })
    expect(parseClinicInvite({ businessId: BIZ, email: "nope", fullName: "A", role: "nurse" })).toEqual({
      ok: false,
      error: "Enter a valid email address.",
    })
  })

  it("refuses a body that is not an object", () => {
    expect(parseClinicInvite(null).ok).toBe(false)
    expect(parseClinicInvite("x").ok).toBe(false)
  })

  it("caps the name at 120 characters", () => {
    const res = parseClinicInvite({ businessId: BIZ, email: "a@b.co", fullName: "x".repeat(121), role: "nurse" })
    expect(res).toEqual({ ok: false, error: "That name is too long." })
  })
})

describe("labels and deactivation", () => {
  it("names every role", () => {
    expect(STAFF_ROLE_LABEL.veterinarian).toBe("Veterinarian")
    expect(STAFF_ROLE_LABEL.nurse).toBe("Nurse / technician")
    expect(STAFF_ROLE_LABEL.owner).toBe("Owner")
  })

  it("never offers to deactivate the business owner's row, or your own", () => {
    expect(canDeactivate({ profileId: "owner" }, { ownerId: "owner", viewerId: "mgr" })).toBe(false)
    expect(canDeactivate({ profileId: "mgr" }, { ownerId: "owner", viewerId: "mgr" })).toBe(false)
    expect(canDeactivate({ profileId: "nurse" }, { ownerId: "owner", viewerId: "mgr" })).toBe(true)
  })
})
