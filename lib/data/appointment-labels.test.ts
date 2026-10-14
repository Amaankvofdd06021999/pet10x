import { describe, expect, it } from "vitest"
import { appointmentLabel, appointmentTone, canOwnerCancel, isClinicBusiness } from "./appointment-labels"

describe("appointmentLabel", () => {
  it("says each status in plain words", () => {
    expect(appointmentLabel("requested")).toBe("Waiting for the clinic to confirm")
    expect(appointmentLabel("booked")).toBe("Confirmed")
    expect(appointmentLabel("checked_in")).toBe("Checked in")
    expect(appointmentLabel("in_progress")).toBe("With the vet")
    expect(appointmentLabel("completed")).toBe("Done")
    expect(appointmentLabel("cancelled")).toBe("Cancelled")
    expect(appointmentLabel("no_show")).toBe("Missed")
  })

  it("names the two statuses the live enum spells differently", () => {
    // appointment_status has `arrived` where the brief says checked_in, and a
    // `ready` step between the vet and going home.
    expect(appointmentLabel("arrived")).toBe("Checked in")
    expect(appointmentLabel("ready")).toBe("Ready to go home")
  })

  it("never shows a status it was not taught", () => {
    expect(appointmentLabel("teleported")).toBe("Status unknown")
    expect(appointmentLabel("")).toBe("Status unknown")
    expect(appointmentLabel("constructor")).toBe("Status unknown")
    expect(appointmentLabel("Requested")).toBe("Status unknown")
  })
})

describe("appointmentTone", () => {
  it("flags the waiting and the missed, and is neutral for anything unknown", () => {
    expect(appointmentTone("requested")).toBe("warn")
    expect(appointmentTone("booked")).toBe("good")
    expect(appointmentTone("no_show")).toBe("bad")
    expect(appointmentTone("whatever")).toBe("neutral")
  })
})

describe("canOwnerCancel", () => {
  const now = new Date("2026-10-14T12:00:00Z")

  it("allows a requested or booked visit more than 2 hours away", () => {
    expect(canOwnerCancel("requested", "2026-10-14T14:00:01Z", now)).toBe(true)
    expect(canOwnerCancel("booked", "2026-10-20T09:00:00Z", now)).toBe(true)
  })

  it("refuses at 2 hours or less, exactly as owner_cancel_appointment does", () => {
    expect(canOwnerCancel("booked", "2026-10-14T14:00:00Z", now)).toBe(false)
    expect(canOwnerCancel("booked", "2026-10-14T13:00:00Z", now)).toBe(false)
    expect(canOwnerCancel("requested", "2026-10-14T11:00:00Z", now)).toBe(false)
  })

  it("refuses every other status", () => {
    for (const s of ["arrived", "checked_in", "in_progress", "ready", "completed", "cancelled", "no_show", ""]) {
      expect(canOwnerCancel(s, "2026-10-20T09:00:00Z", now)).toBe(false)
    }
  })

  it("refuses a start time it cannot read", () => {
    expect(canOwnerCancel("booked", "not a date", now)).toBe(false)
    expect(canOwnerCancel("booked", "", now)).toBe(false)
  })
})

describe("isClinicBusiness", () => {
  it("is a veterinary practice, by kind — the same test My vets uses", () => {
    expect(isClinicBusiness({ businessKind: "veterinary" })).toBe(true)
    expect(isClinicBusiness({ businessKind: "grooming" })).toBe(false)
    expect(isClinicBusiness({ businessKind: null })).toBe(false)
    expect(isClinicBusiness({ businessKind: "Veterinary" })).toBe(false)
  })
})
