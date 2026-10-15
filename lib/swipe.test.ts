import { describe, expect, it } from "vitest"
import { swipeIntent } from "./swipe"

/**
 * A finger that lands on a notification row may be scrolling the list or
 * swiping the row. Scrolling must win anything ambiguous: a list that opens
 * rows when you meant to scroll is worse than a row that needs a clearer swipe.
 */
describe("swipeIntent", () => {
  it("a clearly sideways move is a swipe", () => {
    expect(swipeIntent(30, 5)).toBe("horizontal")
    expect(swipeIntent(-30, 5)).toBe("horizontal")
  })

  it("a small move has not decided yet", () => {
    expect(swipeIntent(8, 0)).toBe("undecided")
    expect(swipeIntent(-10, 3)).toBe("undecided")
    expect(swipeIntent(0, 0)).toBe("undecided")
  })

  it("a mostly-vertical or diagonal move is a scroll", () => {
    expect(swipeIntent(20, 25)).toBe("vertical")
    expect(swipeIntent(15, 12)).toBe("vertical") // 15 is not more than 1.5 × 12
    expect(swipeIntent(2, -40)).toBe("vertical")
  })

  it("needs more than 1.5 times as much sideways as vertical", () => {
    expect(swipeIntent(30, 20)).toBe("vertical")
    expect(swipeIntent(31, 20)).toBe("horizontal")
  })
})
