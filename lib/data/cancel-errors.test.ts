import { describe, it, expect } from "vitest"
import {
  appointmentCancelError,
  bookingCancelError,
  estimateDeclineError,
  parseBookingContact,
} from "./cancel-errors"

describe("bookingCancelError", () => {
  it("is null when the cancel went through", () => {
    expect(bookingCancelError(null, { ok: true, status: "cancelled" })).toBeNull()
  })

  it("names each raise the RPC makes", () => {
    expect(bookingCancelError({ code: "42501", message: "Only the business can cancel this booking" }, null)).toBe(
      "Only the business can cancel this booking.",
    )
    expect(bookingCancelError({ code: "22023" }, null)).toBe(
      "Add a reason of 2000 characters or fewer. The customer sees it.",
    )
  })

  it("names the one {ok:false} answer", () => {
    expect(bookingCancelError(null, { ok: false, error: "not_cancellable" })).toBe(
      "This booking can't be cancelled any more. Refresh to see where it stands.",
    )
  })

  it("never shows a code it was not taught, or the database's own text", () => {
    expect(bookingCancelError({ code: "XX000", message: "boom" }, null)).toBe("Couldn't cancel the booking. Try again.")
    expect(bookingCancelError(null, { ok: false, error: "something_new" })).toBe(
      "Couldn't cancel the booking. Try again.",
    )
    expect(bookingCancelError(null, null)).toBe("Couldn't cancel the booking. Try again.")
  })
})

describe("appointmentCancelError", () => {
  it("is null when the cancel went through", () => {
    expect(appointmentCancelError(null, { ok: true })).toBeNull()
  })

  it("says to call when it is too late, and why", () => {
    expect(appointmentCancelError(null, { ok: false, error: "too_late" })).toBe(
      "The visit is less than 2 hours away. Call the practice to cancel.",
    )
  })

  it("names the rest", () => {
    expect(appointmentCancelError(null, { ok: false, error: "not_cancellable" })).toBe(
      "This visit can't be cancelled any more. Refresh to see where it stands.",
    )
    expect(appointmentCancelError({ code: "42501" }, null)).toBe("That visit isn't yours to cancel.")
    expect(appointmentCancelError({ code: "22023" }, null)).toBe("Keep the reason to 2000 characters or fewer.")
    expect(appointmentCancelError({ code: "PGRST000" }, null)).toBe("Couldn't cancel the visit. Try again.")
  })
})

describe("estimateDeclineError", () => {
  it("is null when the decline went through", () => {
    expect(estimateDeclineError(null, { ok: true, status: "declined" })).toBeNull()
  })

  it("names each refusal", () => {
    expect(estimateDeclineError({ code: "42501" }, null)).toBe("That estimate isn't yours.")
    expect(estimateDeclineError({ code: "22023" }, null)).toBe(
      "Add a note of 2000 characters or fewer. The practice sees it.",
    )
    expect(estimateDeclineError(null, { ok: false, error: "not_awaiting_approval" })).toBe(
      "This estimate has already been answered. Refresh to see where it stands.",
    )
    expect(estimateDeclineError(null, { ok: false, error: "not_an_estimate" })).toBe(
      "Only an estimate can be declined.",
    )
    expect(estimateDeclineError(null, { ok: false, error: "forbidden" })).toBe(
      "Couldn't decline the estimate. Try again.",
    )
  })
})

describe("parseBookingContact", () => {
  it("reads email and phone", () => {
    expect(parseBookingContact({ email: "sam@example.com", phone: "604 555 0100" })).toEqual({
      email: "sam@example.com",
      phone: "604 555 0100",
    })
  })

  it("treats null, blank and non-string values as nothing to show", () => {
    expect(parseBookingContact({ email: null, phone: null })).toEqual({ email: null, phone: null })
    expect(parseBookingContact({ email: "  ", phone: 6045550100 })).toEqual({ email: null, phone: null })
    expect(parseBookingContact(null)).toEqual({ email: null, phone: null })
    expect(parseBookingContact("x")).toEqual({ email: null, phone: null })
  })
})
