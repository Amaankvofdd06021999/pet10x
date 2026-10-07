/**
 * Pet10x — deleting versus archiving a building, the pure half.
 *
 * Four NO ACTION foreign keys (fines, payouts, notifications,
 * business_listings) and violation_events' RESTRICT mean a building anyone has
 * used cannot be deleted, and should not be — and the tables that CASCADE
 * (units, residents, pets, reports) would be erased with it. The admin console
 * offers Delete only where `admin_building_history` counts nothing in any of
 * them, and Archive otherwise (20261008000004, widened 20261008000007). If a delete still races into a 23503, the admin reads the
 * same advice, never the constraint name.
 */

export const HAS_HISTORY_MESSAGE =
  "This building has history (fines, notifications…) and can't be deleted. Archive it instead."

/**
 * `total` is admin_building_history's sum over EVERY table that references the
 * building — cascading ones too (units, residents, pets, reports…), since a
 * delete would take those with it. Unknown reads as history: offering Delete
 * on a guess is the wrong way to be wrong.
 */
export function buildingHasHistory(total: number | undefined): boolean {
  return total === undefined || total > 0
}

export function buildingDeleteError(err: { code?: string; message: string }): string {
  return err.code === "23503" ? HAS_HISTORY_MESSAGE : err.message
}
