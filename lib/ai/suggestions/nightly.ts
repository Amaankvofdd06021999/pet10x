/**
 * Pet10x — the cursor arithmetic for the nightly suggestions sweep.
 *
 * Pure so it can be tested without a database. The route keeps a cursor (the
 * id of the last profile it finished) in `cron_cursors`; these helpers decide
 * what to do next from the ordered list of profile ids.
 *
 * Ids compare as plain strings, which is uuid order and matches Postgres'
 * `order by id` for the lower-case text form. The cursor is a position, not a
 * reference: a profile deleted between runs simply is not in the list, and the
 * sweep carries on with the next id above it.
 */

/** The next `size` ids strictly above the cursor, and whether that is the end of the list. */
export function nextBatch(
  profileIds: string[],
  cursor: string | null,
  size: number,
): { batch: string[]; done: boolean } {
  const remaining = cursor === null ? profileIds : profileIds.filter((id) => id > cursor)
  const batch = remaining.slice(0, size)
  return { batch, done: remaining.length <= size }
}

/**
 * The cursor to store after a run. A finished sweep resets to the start; an
 * interrupted one resumes after the last profile that actually completed, so
 * a run cut off by its time budget never skips the profile it was working on.
 * Nothing completed means there is nothing to move the cursor to.
 */
export function advanceCursor(processed: string[], done: boolean): string | null {
  if (done) return null
  return processed.length > 0 ? processed[processed.length - 1] : null
}
