import { describe, expect, it } from "vitest"
import { personaForTarget, surfaceForPersona } from "./navigation-persona"

describe("personaForTarget", () => {
  it("names the resident persona for a resident target opened while wearing manager", () => {
    // `my-cases` is RESIDENT-only: a manager reads those cases from the other side.
    expect(personaForTarget("my-cases", ["pet-owner", "building-manager"], "building-manager")).toBe("pet-owner")
    expect(personaForTarget("home", ["pet-owner", "building-manager"], "building-manager")).toBe("pet-owner")
  })

  it("names the manager persona for a manager target opened while wearing resident", () => {
    expect(personaForTarget("approvals", ["pet-owner", "building-manager"], "pet-owner")).toBe("building-manager")
  })

  it("returns null for a manager-only target when only pet-owner was granted", () => {
    expect(personaForTarget("approvals", ["pet-owner"], "pet-owner")).toBeNull()
  })

  it("returns null for a target the router does not know", () => {
    expect(personaForTarget("lost-and-found", ["pet-owner", "building-manager"], "pet-owner")).toBeNull()
    expect(personaForTarget("", ["pet-owner", "building-manager"], "pet-owner")).toBeNull()
  })

  it("prefers the worn persona whenever it can render the target", () => {
    // `alerts` and `my-vets:bills` render on both surfaces: no switch.
    expect(personaForTarget("alerts", ["pet-owner", "building-manager"], "building-manager")).toBe("building-manager")
    expect(personaForTarget("my-vets:bills", ["pet-owner", "building-manager"], "building-manager")).toBe(
      "building-manager",
    )
    expect(personaForTarget("home", ["pet-owner", "building-manager"], "pet-owner")).toBe("pet-owner")
  })

  it("returns null for a target no surface can open, such as an id-required screen with no id", () => {
    expect(personaForTarget("pet-detail", ["pet-owner", "building-manager"], "building-manager")).toBeNull()
  })

  it("never names a persona that was not granted", () => {
    expect(personaForTarget("my-cases", ["building-manager"], "building-manager")).toBeNull()
  })

  it("only switches to a persona /app renders, never one that lives on another route", () => {
    // Admin and strata live at /admin and /strata-portal; switching to them
    // would leave the app instead of opening the target.
    expect(personaForTarget("approvals", ["pet-owner", "strata-manager", "super-admin"], "pet-owner")).toBeNull()
  })

  it("reads a console target as nobody's in /app", () => {
    expect(personaForTarget("business:bookings", ["pet-owner", "building-manager"], "pet-owner")).toBeNull()
  })
})

describe("surfaceForPersona", () => {
  it("renders the manager surface only for the building-manager persona", () => {
    expect(surfaceForPersona("building-manager")).toBe("manager")
    expect(surfaceForPersona("pet-owner")).toBe("resident")
    // What `/app` has always shown anyone else who reaches it.
    expect(surfaceForPersona("super-admin")).toBe("resident")
  })
})
