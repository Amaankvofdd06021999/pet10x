import { describe, expect, it } from "vitest"
import { bylawsPublished, fineScheduleSet, setupChecklist, setupHiddenKey, setupRows } from "./building-setup"
import { searchToRoute, routeToSearch } from "../app-route"

const none = { bylawsPublished: false, fineScheduleSet: false, houseRulesCount: 0, staffCount: 0 }

describe("setupChecklist", () => {
  it("lists the four jobs in order, all undone for a new building", () => {
    const rows = setupChecklist(none)
    expect(rows.map((r) => [r.key, r.label, r.done])).toEqual([
      ["bylaws", "Publish your pet bylaws", false],
      ["fines", "Set the fine schedule", false],
      ["rules", "Publish a house rule", false],
      ["staff", "Add a co-manager or staff member", false],
    ])
  })
  it("marks each row done from its own input", () => {
    expect(setupChecklist({ ...none, bylawsPublished: true }).map((r) => r.done)).toEqual([true, false, false, false])
    expect(setupChecklist({ ...none, fineScheduleSet: true }).map((r) => r.done)).toEqual([false, true, false, false])
    expect(setupChecklist({ ...none, houseRulesCount: 1 }).map((r) => r.done)).toEqual([false, false, true, false])
    expect(setupChecklist({ ...none, staffCount: 2 }).map((r) => r.done)).toEqual([false, false, false, true])
  })
  it("points each row at a Settings sheet that the URL can carry", () => {
    for (const row of setupChecklist(none)) {
      expect(row.target.screen).toBe("settings")
      const search = routeToSearch({ screen: "settings", tab: row.target.tab })
      expect(searchToRoute(search, "manager")).toEqual({ screen: "settings", tab: row.target.tab })
    }
  })
})

describe("setup inputs", () => {
  it("bylaws count as published once any machine-checked rule is on", () => {
    expect(bylawsPublished({})).toBe(false)
    expect(bylawsPublished({ require_rabies: false })).toBe(false)
    expect(bylawsPublished({ require_rabies: true })).toBe(true)
    expect(bylawsPublished({ max_weight_kg: 20 })).toBe(true)
    expect(bylawsPublished(null)).toBe(false)
    expect(bylawsPublished({ notes: "Bylaw 3(4)" })).toBe(true)
    expect(bylawsPublished({ notes: "  " })).toBe(false)
  })
  it("the fine schedule is set once either fine has a price", () => {
    expect(fineScheduleSet({})).toBe(false)
    expect(fineScheduleSet({ fine_1_cents: 5000 })).toBe(true)
    expect(fineScheduleSet({ fine_2_cents: 0 })).toBe(false)
  })
  it("hides per building", () => {
    expect(setupHiddenKey("b1")).toBe("pet10x.setup-hidden.b1")
  })
})

describe("setupRows", () => {
  const base = { bylawsPublished: true, fineScheduleSet: true, houseRulesCount: 1 }
  it("holds the staff row back while counting", () => {
    expect(setupRows(base, "loading").map((r) => r.key)).toEqual(["bylaws", "fines", "rules"])
  })
  it("keeps the card useful when the count fails: staff row says so and is not done", () => {
    const rows = setupRows(base, "error")
    expect(rows).toHaveLength(4)
    expect(rows[3]).toMatchObject({ key: "staff", label: "Couldn't check staff", done: false })
  })
  it("uses the count when known", () => {
    expect(setupRows(base, 1).every((r) => r.done)).toBe(true)
  })
})
