/**
 * Pet10x — deleting versus archiving a building, the pure half.
 *
 * Four NO ACTION foreign keys (fines, payouts, notifications,
 * business_listings) and violation_events' RESTRICT mean a building anyone has
 * used cannot be deleted, and should not be. The admin console offers Delete
 * only where `admin_building_history` counts nothing, and Archive otherwise
 * (20261008000004). If a delete still races into a 23503, the admin reads the
 * same advice, never the constraint name.
 */

export const HAS_HISTORY_MESSAGE =
  "This building has history (fines, notifications…) and can't be deleted. Archive it instead."

export interface BuildingHistoryCounts {
  fines: number
  notifications: number
  payouts: number
  business_listings: number
  violations: number
}

/** Unknown counts read as history: offering Delete on a guess is the wrong way to be wrong. */
export function buildingHasHistory(counts: BuildingHistoryCounts | undefined): boolean {
  if (!counts) return true
  return (
    counts.fines + counts.notifications + counts.payouts + counts.business_listings + counts.violations > 0
  )
}

export function buildingDeleteError(err: { code?: string; message: string }): string {
  return err.code === "23503" ? HAS_HISTORY_MESSAGE : err.message
}
