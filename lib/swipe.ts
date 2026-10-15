/**
 * Is a finger that has moved (dx, dy) since it landed swiping a row sideways,
 * or scrolling the list it sits in?
 *
 * Decided once per touch, from the first clear movement, and scrolling wins
 * anything ambiguous: a list that opens rows when you meant to scroll it is
 * worse than a row that wants a clearer swipe. Sideways only when the move is
 * more than SLOP pixels AND more than 1.5 times as wide as it is tall.
 */

/** Movement below this (px) is a finger settling, or a tap — not a decision. */
const SLOP = 10
const HORIZONTAL_RATIO = 1.5

export type SwipeIntent = "horizontal" | "vertical" | "undecided"

export function swipeIntent(dx: number, dy: number): SwipeIntent {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax <= SLOP && ay <= SLOP) return "undecided"
  return ax > SLOP && ax > HORIZONTAL_RATIO * ay ? "horizontal" : "vertical"
}
