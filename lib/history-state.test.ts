import { describe, it, expect } from "vitest"
import { historyStateWithout } from "./history-state"

describe("historyStateWithout", () => {
  it("keeps Next's keys but always drops __NA", () => {
    const state = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { t: 1 }, other: 2 }
    expect(historyStateWithout(state)).toEqual({ __PRIVATE_NEXTJS_INTERNALS_TREE: { t: 1 }, other: 2 })
  })
  it("drops the extra keys asked for", () => {
    const state = { __NA: true, pet10x: true, route: { screen: "home" }, activeTab: "home", depth: 2, keep: 1 }
    expect(historyStateWithout(state, ["pet10x", "route", "activeTab", "depth"])).toEqual({ keep: 1 })
  })
  it("never mutates the state it was given", () => {
    const state = { __NA: true, keep: 1 }
    historyStateWithout(state)
    expect(state).toEqual({ __NA: true, keep: 1 })
  })
  it("reads a missing or non-object state as empty", () => {
    expect(historyStateWithout(null)).toEqual({})
    expect(historyStateWithout(undefined)).toEqual({})
    expect(historyStateWithout("x")).toEqual({})
  })
})
