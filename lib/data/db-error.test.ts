import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { dbErrorMessage } from "./db-error"
import { KNOWN_USER_SENTENCES, userError } from "@/lib/user-error"

const FALLBACK = "Couldn't save the service. Try again."

describe("dbErrorMessage", () => {
  let log: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    log = vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => log.mockRestore())

  it("gives the fallback for an error it does not know", () => {
    expect(dbErrorMessage({ code: "XX000", message: "internal error" }, FALLBACK)).toBe(FALLBACK)
    expect(dbErrorMessage(new Error("Failed to fetch"), FALLBACK)).toBe(FALLBACK)
  })

  it("never shows raw constraint or policy text", () => {
    for (const message of [
      'duplicate key value violates unique constraint "business_reviews_booking_id_key"',
      'new row violates row-level security policy for table "service_bookings"',
      'null value in column "name" of relation "services" violates not-null constraint',
    ]) {
      expect(dbErrorMessage({ message }, FALLBACK)).toBe(FALLBACK)
    }
  })

  it("maps the few SQLSTATEs a person can act on", () => {
    expect(dbErrorMessage({ code: "42501", message: 'permission denied for table "x"' }, FALLBACK)).toBe(
      "You don't have access to that.",
    )
    expect(dbErrorMessage({ code: "23505", message: 'duplicate key value violates "x_key"' }, FALLBACK)).toBe(
      "That already exists.",
    )
    expect(dbErrorMessage({ code: "23503", message: 'violates foreign key constraint "y_fkey"' }, FALLBACK)).toBe(
      "That's linked to other records, so it couldn't be changed.",
    )
  })

  it("passes a sentence we wrote through unchanged, whatever its code", () => {
    expect(dbErrorMessage({ code: "22023", message: "That service isn't available to book" }, FALLBACK)).toBe(
      "That service isn't available to book",
    )
    expect(dbErrorMessage(new Error("Please sign in first."), FALLBACK)).toBe("Please sign in first.")
  })

  it("keeps a raised 22023 that is not one of ours behind the fallback", () => {
    expect(dbErrorMessage({ code: "22023", message: "invalid input: p_reason too long" }, FALLBACK)).toBe(FALLBACK)
  })

  it("handles strings, null, undefined and odd shapes", () => {
    expect(dbErrorMessage("Please sign in first.", FALLBACK)).toBe("Please sign in first.")
    expect(dbErrorMessage("relation \"foo\" does not exist", FALLBACK)).toBe(FALLBACK)
    expect(dbErrorMessage(null, FALLBACK)).toBe(FALLBACK)
    expect(dbErrorMessage(undefined, FALLBACK)).toBe(FALLBACK)
    expect(dbErrorMessage({ message: 42 }, FALLBACK)).toBe(FALLBACK)
    expect(dbErrorMessage({ code: 42501 }, FALLBACK)).toBe(FALLBACK)
    expect(dbErrorMessage(12, FALLBACK)).toBe(FALLBACK)
  })

  it("logs the original exactly once", () => {
    const original = { code: "23505", message: "duplicate key" }
    dbErrorMessage(original, FALLBACK)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]).toContain(original)
  })

  it("lists its own sentences where userError can pass them through", () => {
    for (const s of ["You don't have access to that.", "That already exists."]) {
      expect(KNOWN_USER_SENTENCES.has(s)).toBe(true)
    }
  })

  it("lets a fallback it has handed out pass a later userError or a second dbErrorMessage", () => {
    const fallback = "Couldn't load available times. Try again."
    expect(userError(fallback, "Couldn't load this.")).toBe("Couldn't load this.")
    expect(dbErrorMessage({ message: "boom" }, fallback)).toBe(fallback)
    expect(userError(fallback, "Couldn't load this.")).toBe(fallback)
    expect(dbErrorMessage(new Error(fallback), "Couldn't load this.")).toBe(fallback)
  })

  it("does not remember a fallback that was never handed out", () => {
    expect(userError("Couldn't frobnicate. Try again.", "x")).toBe("x")
  })

  it("keeps a sentence one of our functions or triggers raises, with a full stop", () => {
    expect(dbErrorMessage({ code: "42501", message: "That booking isn't yours" }, FALLBACK)).toBe("That booking isn't yours.")
    expect(dbErrorMessage({ code: "22023", message: "The reason is too long (2000 characters at most)" }, FALLBACK)).toBe(
      "The reason is too long (2000 characters at most).",
    )
    expect(userError("That booking isn't yours.", "x")).toBe("That booking isn't yours.")
  })

  it("does not keep a developer hint, even one we wrote", () => {
    expect(
      dbErrorMessage({ code: "42501", message: "Call manager_advance_violation(p_violation, p_to_stage) instead." }, FALLBACK),
    ).toBe("You don't have access to that.")
  })
})
