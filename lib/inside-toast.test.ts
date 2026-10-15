import { describe, expect, it, vi } from "vitest"
import { isInsideToast, keepOpenForToasts } from "./inside-toast"

// vitest runs in Node: stand-ins for DOM nodes that answer `closest`.
const node = (inToast: boolean) => ({ closest: (sel: string) => (inToast && sel === "[data-sonner-toaster]" ? {} : null) })

describe("isInsideToast", () => {
  it("is true for a node inside the Sonner toaster", () => {
    expect(isInsideToast(node(true) as unknown as EventTarget)).toBe(true)
  })
  it("is false for any other node, a non-element, or nothing", () => {
    expect(isInsideToast(node(false) as unknown as EventTarget)).toBe(false)
    expect(isInsideToast({} as EventTarget)).toBe(false)
    expect(isInsideToast(null)).toBe(false)
  })
})

describe("keepOpenForToasts", () => {
  const event = (inToast: boolean) => ({ target: node(inToast), preventDefault: vi.fn() })

  it("prevents the dismiss for a tap on a toast, and still calls the caller's handler", () => {
    const caller = vi.fn()
    const e = event(true)
    keepOpenForToasts(caller)(e as never)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(caller).toHaveBeenCalledWith(e)
  })
  it("leaves any other outside tap alone", () => {
    const e = event(false)
    keepOpenForToasts()(e as never)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})
