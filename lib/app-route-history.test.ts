import { describe, expect, it } from "vitest"
import {
  canonicalRoute,
  initialRoute,
  readHistoryState,
  replaceRouteParams,
  routeToSearch,
  sameRoute,
  searchToRoute,
  tabForRoute,
} from "./app-route"

const PET = "3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"
const entry = (route: object, activeTab: string, depth: unknown) => ({ __NA: true, pet10x: true, route, activeTab, depth })

describe("tabForRoute", () => {
  it("a tab root selects itself", () => {
    expect(tabForRoute({ screen: "profile" }, "home", "resident")).toBe("profile")
    expect(tabForRoute({ screen: "community", tab: "events" }, "home", "resident")).toBe("community")
  })
  it("any other screen keeps the stored tab", () => {
    expect(tabForRoute({ screen: "pet-detail", id: PET }, "profile", "resident")).toBe("profile")
    expect(tabForRoute({ screen: "alerts" }, "alerts", "resident")).toBe("alerts")
  })
  it("cold load, or a stored tab from the other surface, falls back to the default tab", () => {
    expect(tabForRoute({ screen: "pet-detail", id: PET }, undefined, "resident")).toBe("home")
    expect(tabForRoute({ screen: "pet-detail", id: PET }, undefined, "manager")).toBe("dashboard")
    expect(tabForRoute({ screen: "add-pet" }, "approvals", "resident")).toBe("home")
    expect(tabForRoute({ screen: "add-pet" }, "nonsense", "resident")).toBe("home")
  })
})

describe("canonicalRoute", () => {
  it("drops what the URL cannot carry, so a refresh round-trips", () => {
    // handleNavigate stashes an id on any screen; only ID_BEARING screens keep it in the URL.
    const r = canonicalRoute({ screen: "add-pet", id: PET, petId: PET, tab: "documents" })
    expect(r).toEqual({ screen: "add-pet" })
    expect(searchToRoute(routeToSearch(r), "resident")).toEqual(r)
  })
  it("keeps what it can", () => {
    const r = { screen: "pet-detail" as const, id: PET, tab: "documents" }
    expect(canonicalRoute(r)).toEqual(r)
    expect(canonicalRoute({ screen: "pet-care", id: "food", petId: PET })).toEqual({ screen: "pet-care", id: "food", petId: PET })
  })
})

describe("sameRoute", () => {
  it("compares every field", () => {
    expect(sameRoute({ screen: "home" }, { screen: "home" })).toBe(true)
    expect(sameRoute({ screen: "pet-detail", id: PET }, { screen: "pet-detail", id: PET, tab: "care" })).toBe(false)
    expect(sameRoute(null, { screen: "home" })).toBe(false)
  })
})

describe("readHistoryState", () => {
  it("reads an entry the shell wrote", () => {
    expect(readHistoryState(entry({ screen: "pet-detail", id: PET }, "profile", 2), "resident")).toEqual({
      route: { screen: "pet-detail", id: PET },
      activeTab: "profile",
      depth: 2,
    })
  })
  it("ignores Next's own entries and junk", () => {
    expect(readHistoryState(null, "resident")).toBeNull()
    expect(readHistoryState({ __NA: true }, "resident")).toBeNull()
    expect(readHistoryState(entry({ screen: "evil" }, "home", 1), "resident")).toBeNull()
    expect(readHistoryState(entry({ screen: "pet-detail", id: 7 }, "home", 1), "resident")).toBeNull()
  })
  it("ignores an entry from the other persona", () => {
    expect(readHistoryState(entry({ screen: "approvals" }, "approvals", 1), "resident")).toBeNull()
  })
  it("floors a bad depth at 0", () => {
    expect(readHistoryState(entry({ screen: "home" }, "home", -3), "resident")?.depth).toBe(0)
    expect(readHistoryState(entry({ screen: "home" }, "home", "2"), "resident")?.depth).toBe(0)
  })
})

describe("initialRoute", () => {
  it("cold link to a pet: the pet, on the default tab, with nothing behind it", () => {
    expect(initialRoute(`?screen=pet-detail&id=${PET}`, null, "resident")).toEqual({
      route: { screen: "pet-detail", id: PET },
      activeTab: "home",
      depth: 0,
    })
  })
  it("legacy email link opens the pet", () => {
    expect(initialRoute(`?target=pet-detail:${PET}`, null, "resident")?.route).toEqual({ screen: "pet-detail", id: PET })
  })
  it("refresh keeps the stored tab and depth when the entry matches the URL", () => {
    const st = entry({ screen: "pet-detail", id: PET, tab: "documents" }, "profile", 2)
    expect(initialRoute(`?screen=pet-detail&id=${PET}&tab=documents`, st, "resident")).toEqual({
      route: { screen: "pet-detail", id: PET, tab: "documents" },
      activeTab: "profile",
      depth: 2,
    })
  })
  it("refresh on a tab root restores which root (they are all bare /app)", () => {
    expect(initialRoute("", entry({ screen: "profile" }, "profile", 1), "resident")?.route).toEqual({ screen: "profile" })
  })
  it("a stale entry that disagrees with the URL loses to the URL", () => {
    const st = entry({ screen: "profile" }, "profile", 1)
    expect(initialRoute("?screen=add-pet", st, "resident")).toEqual({ route: { screen: "add-pet" }, activeTab: "home", depth: 0 })
  })
  it("bare /app with no entry, or an unrenderable screen, is the tab root", () => {
    expect(initialRoute("", null, "resident")).toBeNull()
    expect(initialRoute("?screen=approvals", null, "resident")).toBeNull()
  })
})

describe("replaceRouteParams", () => {
  it("a legacy link becomes ?screen=, never both", () => {
    const s = replaceRouteParams(`?target=pet-detail:${PET}`, { screen: "pet-detail", id: PET })
    expect(s).toBe(`?screen=pet-detail&id=${PET}`)
  })
  it("a tab root clears every route param and keeps unrelated ones", () => {
    expect(replaceRouteParams("?target=bogus&screen=x&utm=1", { screen: "home" })).toBe("?utm=1")
    expect(replaceRouteParams("?target=bogus", { screen: "home" })).toBe("")
  })
})
