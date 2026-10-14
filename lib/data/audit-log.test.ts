import { describe, expect, it } from "vitest"
import { auditActorLabel, auditAreaFilter, describeAuditEntry, isAnonymousEntry } from "./audit-log"

const d = (action: string, metadata: unknown = {}) => describeAuditEntry({ action, entityType: null, metadata })

describe("describeAuditEntry", () => {
  it("says where a case moved, in words", () => {
    expect(d("violation.advanced", { from: "open", to: "fine_1" })).toBe("moved a bylaw case from open to first fine")
    expect(d("violation.advanced", { to: "dismissed" })).toBe("moved a bylaw case to dismissed")
    expect(d("violation.advanced")).toBe("moved a bylaw case")
  })

  it("states a fine's amount and its move", () => {
    expect(d("fine.status_changed", { from: "issued", to: "partially_paid", amount_cents: 15000, currency: "cad" })).toBe(
      "changed a fine of 150.00 CAD from issued to partially paid",
    )
    expect(d("fine.status_changed", { to: "waived" })).toBe("changed a fine to waived")
  })

  it("covers rules, accommodations, community, emergency and documents", () => {
    expect(d("building.fine_schedule_set")).toBe("updated the building's fine schedule")
    expect(d("building_rule.published", { published: false })).toBe("unpublished a house rule")
    expect(d("building_rule.published", { published: true })).toBe("published a house rule")
    expect(d("accommodation.decided", { from: "pending", to: "approved" })).toBe(
      "decided an accommodation request from pending to approved",
    )
    expect(d("accommodation.document_verified", { verified: false })).toBe("marked an accommodation document unverified")
    expect(d("community.post_removed", { reason: "spam", author_id: "x" })).toBe("removed a community post")
    expect(d("emergency_directory.viewed")).toBe("opened the emergency pet directory")
    expect(d("pet_document.rejected")).toBe("rejected a pet document")
  })

  it("names registration and link decisions (20261015000001)", () => {
    expect(d("pet.registration_decided", { to: "approved" })).toBe("approved a pet's registration")
    expect(d("pet.registration_decided", { to: "denied", note: "secret" })).toBe("denied a pet's registration")
    expect(d("pet.registration_decided")).toBe("decided a pet's registration")
    expect(d("resident_link.decided", { decision: "approve" })).toBe("approved a resident's request to join")
    expect(d("resident_link.decided", { decision: "deny", reason: "secret" })).toBe("denied a resident's request to join")
    expect(d("resident_link.decided", { decision: "remove" })).toBe("removed a resident from the building")
    expect(d("resident_link.decided")).toBe("decided a resident's request to join")
  })

  it("never renders the metadata, even for an action it has not met", () => {
    const out = d("parking.permit_issued", { secret: "ip-hash-like-value" })
    expect(out).toBe("changed the building's parking records")
    expect(out).not.toMatch(/ip-hash/)
    expect(d("weird")).toBe("changed the building's weird records")
  })

  it("tolerates metadata that is not an object", () => {
    expect(d("violation.advanced", null)).toBe("moved a bylaw case")
    expect(d("fine.status_changed", ["x"])).toBe("changed a fine")
  })
})

describe("auditActorLabel", () => {
  const base = { action: "violation.opened", metadata: {}, actorId: "u1", actorName: null, actorRole: null }

  it("uses the name when it is readable", () => {
    expect(auditActorLabel({ ...base, actorName: "Dana Whitlock" })).toBe("Dana Whitlock")
  })

  it("names an unreadable actor by role, never by id", () => {
    expect(auditActorLabel(base)).toBe("A manager")
    expect(auditActorLabel({ ...base, actorRole: "super_admin" })).toBe("A Pet10x admin")
    expect(auditActorLabel({ ...base, action: "accommodation.submitted" })).toBe("A resident")
  })

  it("says System or the QR holder when nobody signed in", () => {
    expect(auditActorLabel({ ...base, actorId: null })).toBe("System")
    expect(auditActorLabel({ ...base, action: "emergency_directory.viewed", actorId: null })).toBe(
      "Someone with the emergency QR code",
    )
  })

  it("never names an anonymous reporter, even when the name is to hand", () => {
    const anon = { ...base, action: "incident.submitted", metadata: { anonymous: true }, actorName: "Sarah Chen" }
    expect(auditActorLabel(anon)).toBe("An anonymous reporter")
    expect(auditActorLabel({ ...anon, metadata: {} })).toBe("An anonymous reporter")
    expect(auditActorLabel({ ...anon, metadata: { anonymous: false } })).toBe("Sarah Chen")
    expect(isAnonymousEntry({ action: "incident.submitted", metadata: null })).toBe(true)
  })
})

describe("auditAreaFilter", () => {
  it("builds a PostgREST or-filter from fixed prefixes", () => {
    expect(auditAreaFilter("violations")).toBe("action.like.violation.%")
    expect(auditAreaFilter("rules")).toBe("action.like.building_rule.%,action.like.building.%")
  })
})
