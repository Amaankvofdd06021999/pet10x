import { describe, it, expect } from "vitest"
import { nextEmergencyState, type EmergencyViewState } from "./emergency-state"

type D = { name: string }
const empty: EmergencyViewState<D> = { data: null, stale: false, denied: false, lastOk: null }
const shown: EmergencyViewState<D> = { data: { name: "old" }, stale: false, denied: false, lastOk: 1000 }

describe("nextEmergencyState", () => {
  it("valid: fresh data, not stale, lastOk is now", () => {
    expect(nextEmergencyState(shown, { kind: "valid", data: { name: "new" } }, 5000)).toEqual({
      data: { name: "new" },
      stale: false,
      denied: false,
      lastOk: 5000,
    })
  })

  it("valid after a stale spell clears stale", () => {
    const stale = { ...shown, stale: true }
    expect(nextEmergencyState(stale, { kind: "valid", data: { name: "n" } }, 9).stale).toBe(false)
  })

  it("network with data keeps the data and marks it stale, lastOk unchanged", () => {
    expect(nextEmergencyState(shown, { kind: "network" }, 5000)).toEqual({
      data: { name: "old" },
      stale: true,
      denied: false,
      lastOk: 1000,
    })
  })

  it("network without data is not a denial", () => {
    const r = nextEmergencyState(empty, { kind: "network" }, 5000)
    expect(r.data).toBeNull()
    expect(r.denied).toBe(false)
  })

  it("denied wipes the data, even when stale", () => {
    const r = nextEmergencyState({ ...shown, stale: true }, { kind: "denied" }, 5000)
    expect(r).toEqual({ data: null, stale: false, denied: true, lastOk: null })
  })
})
