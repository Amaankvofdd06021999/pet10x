import { describe, expect, it } from "vitest"
import { coldLoadEntries } from "./app-route"

const PET = "3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"

describe("coldLoadEntries", () => {
  it("puts the tab root beneath a non-root screen opened cold, so Back stays in the app", () => {
    const route = { screen: "pet-detail" as const, id: PET }
    expect(coldLoadEntries({ route, activeTab: "home", depth: 0 })).toEqual([
      { route: { screen: "home" }, activeTab: "home", depth: 0, replace: true },
      { route, activeTab: "home", depth: 1, replace: false },
    ])
  })

  it("leaves a tab root alone, with or without a tab", () => {
    expect(coldLoadEntries({ route: { screen: "profile" }, activeTab: "profile", depth: 0 })).toEqual([
      { route: { screen: "profile" }, activeTab: "profile", depth: 0, replace: true },
    ])
    const lost = { screen: "community" as const, tab: "lost" }
    expect(coldLoadEntries({ route: lost, activeTab: "community", depth: 0 })).toEqual([
      { route: lost, activeTab: "community", depth: 0, replace: true },
    ])
  })

  it("leaves a refresh alone: history is already behind it", () => {
    const route = { screen: "pet-care" as const, id: "food" }
    expect(coldLoadEntries({ route, activeTab: "home", depth: 2 })).toEqual([
      { route, activeTab: "home", depth: 2, replace: true },
    ])
  })

  it("uses the manager's tab for a manager screen", () => {
    const route = { screen: "alerts" as const }
    expect(coldLoadEntries({ route, activeTab: "dashboard", depth: 0 })[0]).toEqual({
      route: { screen: "dashboard" },
      activeTab: "dashboard",
      depth: 0,
      replace: true,
    })
  })
})
