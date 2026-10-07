import { describe, expect, it } from "vitest"
import { adminConfirmationMatches, parsePlatformStats, personaLabels, userFlagsError } from "./admin-users"

const nobody = { isSuperAdmin: false, managedBuildings: 0, ownsBusiness: false, clinicStaff: false, isResident: false }

describe("personaLabels", () => {
  it("is empty for an account that has done nothing yet", () => {
    expect(personaLabels(nobody)).toEqual([])
  })

  it("counts buildings, singular and plural", () => {
    expect(personaLabels({ ...nobody, managedBuildings: 1 })).toEqual(["Manager of 1 building"])
    expect(personaLabels({ ...nobody, managedBuildings: 5 })).toEqual(["Manager of 5 buildings"])
  })

  it("lists every persona, most privileged first", () => {
    expect(
      personaLabels({ isSuperAdmin: true, managedBuildings: 2, ownsBusiness: true, clinicStaff: true, isResident: true }),
    ).toEqual(["Admin", "Manager of 2 buildings", "Business", "Clinic staff", "Resident"])
  })
})

describe("userFlagsError", () => {
  it("names the self-lockout refusal", () => {
    expect(userFlagsError({ code: "42501", message: "You can't suspend or demote your own account" })).toBe(
      "You can't suspend or remove admin from your own account.",
    )
  })
  it("never shows a raw message", () => {
    expect(userFlagsError({ code: "XX000", message: 'relation "x" does not exist' })).toBe(
      "Couldn't update that account. Try again.",
    )
    expect(userFlagsError({ code: "42501", message: "permission denied" })).toBe(
      "Only a Pet10x admin can change an account's access.",
    )
    expect(userFlagsError({ code: "P0002" })).toBe("That account no longer exists.")
  })
})

describe("adminConfirmationMatches", () => {
  it("wants the email, ignoring case and outer spaces", () => {
    expect(adminConfirmationMatches(" Dana@Example.com ", "dana@example.com")).toBe(true)
    expect(adminConfirmationMatches("dana", "dana@example.com")).toBe(false)
    expect(adminConfirmationMatches("", "")).toBe(false)
  })
})

describe("parsePlatformStats", () => {
  it("reads the RPC's jsonb", () => {
    expect(
      parsePlatformStats({
        users: 48,
        pets: 61,
        buildings_active: 6,
        buildings_archived: 1,
        businesses_by_tier: { registered: 3, verified: 2 },
        incidents_30d: 4,
        open_violations: 7,
        bookings_30d: 9,
        ai_conversations_30d: 12,
      }),
    ).toEqual({
      users: 48,
      pets: 61,
      buildingsActive: 6,
      buildingsArchived: 1,
      businessesByTier: { registered: 3, listed: 0, verified: 2 },
      incidents30d: 4,
      openViolations: 7,
      bookings30d: 9,
      aiConversations30d: 12,
    })
  })
  it("reads nothing as zeros rather than throwing", () => {
    expect(parsePlatformStats(null).users).toBe(0)
    expect(parsePlatformStats({ businesses_by_tier: null }).businessesByTier).toEqual({
      registered: 0,
      listed: 0,
      verified: 0,
    })
  })
})
