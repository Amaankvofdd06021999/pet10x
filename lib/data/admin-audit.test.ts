import { describe, expect, it } from "vitest"
import { adminAuditFilter, ADMIN_AUDIT_AREAS } from "./admin-audit"

describe("adminAuditFilter", () => {
  it("builds an or-filter from the area's prefixes", () => {
    expect(adminAuditFilter("accounts")).toBe("action.like.user.%")
    expect(adminAuditFilter("pets")).toBe("action.like.pet.%,action.like.pet_document.%")
  })
  it("refuses an id that is not on the list", () => {
    expect(adminAuditFilter("x,action.like.%")).toBeNull()
  })
  it("has unique ids", () => {
    const ids = ADMIN_AUDIT_AREAS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
