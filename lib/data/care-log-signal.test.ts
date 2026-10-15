import { describe, expect, it, vi } from "vitest"
import { careLogged, onCareLogged } from "./care-log-signal"

/**
 * Home's care tiles and the schedule strip above them are separate
 * components with separate reads. Ticking "Breakfast" logs a food entry
 * through setCareTaskDone; this signal is how the Food tile hears about it
 * without a remount.
 */
describe("care log signal", () => {
  it("tells a listener for that pet, and not one for another", () => {
    const lola = vi.fn()
    const max = vi.fn()
    const offLola = onCareLogged("lola", lola)
    const offMax = onCareLogged("max", max)
    careLogged("lola")
    expect(lola).toHaveBeenCalledTimes(1)
    expect(max).not.toHaveBeenCalled()
    offLola()
    offMax()
  })

  it("an entry whose pet is unknown (a delete by id) tells every listener", () => {
    const lola = vi.fn()
    const off = onCareLogged("lola", lola)
    careLogged(undefined)
    expect(lola).toHaveBeenCalledTimes(1)
    off()
  })

  it("stops after unsubscribing", () => {
    const lola = vi.fn()
    const off = onCareLogged("lola", lola)
    off()
    careLogged("lola")
    expect(lola).not.toHaveBeenCalled()
  })
})
