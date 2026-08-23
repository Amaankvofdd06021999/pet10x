import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { SCREEN_SURFACES, isScreenKey, resolveActionTarget, type ScreenKey } from "./navigation"

describe("resolveActionTarget", () => {
  it("returns null for an absent target, which is what a notification with no action carries", () => {
    expect(resolveActionTarget(null, "resident")).toBeNull()
    expect(resolveActionTarget(undefined, "resident")).toBeNull()
    expect(resolveActionTarget("", "resident")).toBeNull()
  })

  it("returns null for a screen the router does not render", () => {
    // The three targets planned phases will write before their screens exist.
    // Each must produce NO button until the screen is registered here.
    expect(resolveActionTarget("my-cases", "resident")).toBeNull()
    expect(resolveActionTarget("my-cases:35000000-0000-0000-0000-000000000004", "resident")).toBeNull()
    expect(resolveActionTarget("building-rules", "resident")).toBeNull()
    expect(resolveActionTarget("accommodations", "resident")).toBeNull()
  })

  it("returns null for a target registered to the other surface", () => {
    // request_building_link writes 'approvals' to every manager of the
    // building. A manager wearing the resident persona reaches no such screen.
    expect(resolveActionTarget("approvals", "resident")).toBeNull()
    expect(resolveActionTarget("approvals", "manager")).toEqual({ screen: "approvals" })
    // ...and the reverse: a manager has no Profile screen.
    expect(resolveActionTarget("profile", "manager")).toBeNull()
    expect(resolveActionTarget("profile", "resident")).toEqual({ screen: "profile" })
  })

  it("routes every action_target value live in the database today", () => {
    // Measured 2026-08-23: these are the only six shapes across 208 rows.
    expect(resolveActionTarget("pet-care", "resident")).toEqual({ screen: "pet-care" })
    expect(resolveActionTarget("services", "resident")).toEqual({ screen: "services" })
    expect(resolveActionTarget("profile", "resident")).toEqual({ screen: "profile" })
    expect(resolveActionTarget("approvals", "manager")).toEqual({ screen: "approvals" })
    expect(resolveActionTarget("pet-detail:e5ceea21-5b53-4e57-b0d2-bf2222b50e5c", "resident")).toEqual({
      screen: "pet-detail",
      id: "e5ceea21-5b53-4e57-b0d2-bf2222b50e5c",
    })
    // ...and the seventh shape, which must produce NO button. See below.
    expect(resolveActionTarget("pet-detail", "resident")).toBeNull()
  })

  it("returns null for a screen whose whole subject is an id it was not given", () => {
    /* `usePet(undefined)` falls back to `pets[0]`, so a bare `pet-detail`
       opened SOME pet's vaccination record while the notification title named
       a different one. `/api/care/reminders/run` no longer writes this, but
       SEVEN ROWS THAT SHAPE ARE ALREADY IN PRODUCTION and six of them belong
       to owners with two or three pets. The client is what has to refuse. */
    expect(resolveActionTarget("pet-detail", "resident")).toBeNull()
    expect(resolveActionTarget("pet-detail", "manager")).toBeNull()
    // Same reasoning, no live rows: the screen renders "This business isn't
    // available." with no id, which is a dead end, not a destination.
    expect(resolveActionTarget("business-detail", "resident")).toBeNull()
  })

  it("does NOT require an id from a screen that renders correctly without one", () => {
    /* The counterpart to the test above, and the reason the two lists are
       separate. `pet-care` is 157 of the 208 live rows and every one is bare:
       its id is a care KIND, and with none the tracker opens on the
       household's selected pet and its default tab. Requiring an id here
       would delete the button on three quarters of the database. */
    expect(resolveActionTarget("pet-care", "resident")).toEqual({ screen: "pet-care" })
    // `handleNavigate` CLEARS selectedPetId for ai-chat, so unscoped is the
    // designed case, not a degraded one.
    expect(resolveActionTarget("ai-chat", "resident")).toEqual({ screen: "ai-chat" })
  })

  it("drops an id `add-pet` has no prop to read", () => {
    // AddPetScreen takes no id. Carrying one would stash a pet into
    // selectedPetId for whatever screen opened next -- a stale selection with
    // no screen responsible for it.
    expect(resolveActionTarget("add-pet:e5ceea21-5b53-4e57-b0d2-bf2222b50e5c", "resident")).toEqual({
      screen: "add-pet",
    })
  })

  it("splits on the FIRST colon only, so an id containing one survives", () => {
    expect(resolveActionTarget("pet-care:vaccination:booster", "resident")).toEqual({
      screen: "pet-care",
      id: "vaccination:booster",
    })
  })

  it("drops an id the destination screen would not read", () => {
    // handleNavigate stashes any id into selectedPetId, so passing one to a
    // screen that ignores it leaves a stale pet selected for the next screen.
    expect(resolveActionTarget("profile:abc", "resident")).toEqual({ screen: "profile" })
    expect(resolveActionTarget("approvals:abc", "manager")).toEqual({ screen: "approvals" })
  })

  it("treats a trailing colon and a whitespace id as no id", () => {
    // ...which for an id-requiring screen means no button at all, exactly as
    // if the colon had never been typed.
    expect(resolveActionTarget("pet-detail:", "resident")).toBeNull()
    expect(resolveActionTarget("pet-detail:   ", "resident")).toBeNull()
    // ...and for a screen that does not require one, the screen with no id.
    expect(resolveActionTarget("pet-care:", "resident")).toEqual({ screen: "pet-care" })
    expect(resolveActionTarget("pet-care:   ", "resident")).toEqual({ screen: "pet-care" })
  })

  it("does not accept inherited Object properties as screens", () => {
    expect(isScreenKey("toString")).toBe(false)
    expect(isScreenKey("constructor")).toBe(false)
    expect(resolveActionTarget("constructor", "resident")).toBeNull()
  })
})

describe("the registry matches the router", () => {
  /**
   * The compile-time half of this coupling lives in `app/app/page.tsx`, where
   * `CONTENT_MAX` is typed `Record<ScreenKey, string>` — so a screen cannot be
   * given a width without being registered here, and cannot be registered here
   * without being given a width.
   *
   * This is the other half: a screen the router actually switches on but that
   * nobody registered would silently resolve to `null`, and the notification
   * pointing at it would lose its button for no reason a reader could see.
   */
  const routerSource = readFileSync(fileURLToPath(new URL("../app/app/page.tsx", import.meta.url)), "utf8")

  const rendered = new Set(
    Array.from(routerSource.matchAll(/currentScreen === "([^"]+)"/g), (m) => m[1]),
  )

  it("found the router's screen list at all (guards against this test silently passing on a rename)", () => {
    expect(rendered.size).toBeGreaterThan(10)
  })

  it("registers every screen the router renders", () => {
    const missing = [...rendered].filter((s) => !isScreenKey(s))
    expect(missing).toEqual([])
  })

  it("registers no screen the router cannot render", () => {
    const extra = (Object.keys(SCREEN_SURFACES) as ScreenKey[]).filter((s) => !rendered.has(s))
    expect(extra).toEqual([])
  })

  it("puts every screen on at least one surface", () => {
    for (const [screen, surfaces] of Object.entries(SCREEN_SURFACES)) {
      expect(surfaces.length, screen).toBeGreaterThan(0)
    }
  })
})
