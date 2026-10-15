import { describe, expect, it } from "vitest"
import { awakeFilter } from "./inbox-filter"

/**
 * The text sent to PostgREST's `.or()`. part-j checks the SQL form of the
 * same rule; this pins the string the app actually sends, so a typo in the
 * column, the operator or the separator fails here rather than showing a
 * snoozed row (or hiding every row) in production.
 */
describe("awakeFilter", () => {
  it("is never snoozed, or snoozed until a time at or before now", () => {
    expect(awakeFilter(new Date("2026-10-15T09:30:00.000Z"))).toBe(
      "snoozed_until.is.null,snoozed_until.lte.2026-10-15T09:30:00.000Z",
    )
  })
})
