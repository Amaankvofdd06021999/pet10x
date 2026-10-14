import { describe, expect, it } from "vitest"
import { approvalsState, defaultApprovalsTab } from "./approvals-view"

describe("approvalsState", () => {
  it("loading wins over everything", () => {
    expect(approvalsState({ isLoading: true, error: "boom", data: [] })).toBe("loading")
    expect(approvalsState({ isLoading: true, error: null, data: [1] })).toBe("loading")
  })
  it("an error is not an empty list", () => {
    expect(approvalsState({ isLoading: false, error: "boom", data: [] })).toBe("error")
  })
  it("empty only after a clean load", () => {
    expect(approvalsState({ isLoading: false, error: null, data: [] })).toBe("empty")
  })
  it("ready when there are rows", () => {
    expect(approvalsState({ isLoading: false, error: null, data: [1] })).toBe("ready")
  })
})

describe("defaultApprovalsTab", () => {
  const zero = { registrations: 0, documents: 0, accommodations: 0, incidents: 0 }
  it("falls back to registrations when nothing is waiting", () => {
    expect(defaultApprovalsTab(zero)).toBe("registrations")
  })
  it("picks the first non-empty tab in registrations, documents, accommodations, incidents order", () => {
    expect(defaultApprovalsTab({ ...zero, incidents: 3 })).toBe("incidents")
    expect(defaultApprovalsTab({ ...zero, incidents: 3, accommodations: 1 })).toBe("accommodations")
    expect(defaultApprovalsTab({ ...zero, incidents: 3, accommodations: 1, documents: 2 })).toBe("documents")
    expect(defaultApprovalsTab({ registrations: 1, documents: 2, accommodations: 1, incidents: 3 })).toBe("registrations")
  })
})
