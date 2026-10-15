import { describe, it, expect } from "vitest"
import { INVITABLE_ROLES, STAFF_ROLE_LABEL, parseClinicInvite, canEditMember, staffErrorSentence, staffGuardSentence } from "./staff-invite"

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

  it("never offers to edit the business owner's row, or your own", () => {
    expect(canEditMember({ profileId: "owner" }, { ownerId: "owner", viewerId: "mgr" })).toBe(false)
    expect(canEditMember({ profileId: "mgr" }, { ownerId: "owner", viewerId: "mgr" })).toBe(false)
    expect(canEditMember({ profileId: "nurse" }, { ownerId: "owner", viewerId: "mgr" })).toBe(true)
  })
})

describe("staffErrorSentence", () => {
  it("turns business_staff_guard's refusals into sentences", () => {
    expect(staffErrorSentence("You cannot change your own role or access")).toBe(
      "You cannot change your own role or access.",
    )
    expect(staffErrorSentence("Nobody can be given the owner role")).toBe("Nobody can be given the owner role.")
    expect(staffErrorSentence("Nobody can be added to a practice as owner")).toBe("Nobody can be given the owner role.")
    expect(staffErrorSentence("Only the practice owner can change their own role or access")).toBe(
      "Only the practice owner can change their own row.",
    )
  })

  it("never passes a raw database message through", () => {
    expect(staffErrorSentence('new row violates row-level security policy for table "business_staff"')).toBe(
      "Try again, or ask the practice owner.",
    )
  })
})

describe("staffGuardSentence", () => {
  it("is the guard's sentence, or null for anything the guard did not say", () => {
    expect(staffGuardSentence("You cannot change your own role or access")).toBe("You cannot change your own role or access.")
    expect(staffGuardSentence('new row violates row-level security policy for table "business_staff"')).toBeNull()
  })
})
