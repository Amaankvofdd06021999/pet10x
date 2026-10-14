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

export interface BuildingCounts {
  residents: number
  pets: number
  managers: number
  /** Null when the open-case count could not be read; the summary then omits it. */
  openCases: number | null
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0

/**
 * admin_building_history's `counts` jsonb (resident_links, pets,
 * building_managers) plus the open-case count, which the RPC does not carry —
 * it counts every report, closed ones too. Null unless the three are whole and
 * non-negative: no numbers beats wrong ones in a confirmation.
 */
export function parseBuildingCounts(raw: unknown, openCases: number | null): BuildingCounts | null {
  if (!raw || typeof raw !== "object") return null
  const { resident_links, pets, building_managers } = raw as Record<string, unknown>
  if (!isCount(resident_links) || !isCount(pets) || !isCount(building_managers)) return null
  return { residents: resident_links, pets, managers: building_managers, openCases: openCases !== null && isCount(openCases) ? openCases : null }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "12 residents · 9 pets · 2 managers · 3 open cases" — the card line and the archive confirmation. */
export function buildingSummary(c: BuildingCounts): string {
  const parts = [plural(c.residents, "resident", "residents"), plural(c.pets, "pet", "pets"), plural(c.managers, "manager", "managers")]
  if (c.openCases !== null) parts.push(plural(c.openCases, "open case", "open cases"))
  return parts.join(" · ")
}
