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

import { dbErrorMessage } from "@/lib/data/db-error"

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
  return err.code === "23503" ? HAS_HISTORY_MESSAGE : dbErrorMessage(err, "Couldn't delete the building. Try again.")
}

export interface BuildingActivity {
  activeResidents: number
  openCases: number
  openReports: number
}

export interface BuildingCounts {
  pets: number
  managers: number
  /** From admin_building_activity; null when that call failed, and the summary then omits these. */
  activity: BuildingActivity | null
}

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0

/** One row of admin_building_activity, or null unless all three are whole and non-negative. */
export function parseBuildingActivity(raw: unknown): BuildingActivity | null {
  if (!raw || typeof raw !== "object") return null
  const { active_residents, open_cases, open_reports } = raw as Record<string, unknown>
  if (!isCount(active_residents) || !isCount(open_cases) || !isCount(open_reports)) return null
  return { activeResidents: active_residents, openCases: open_cases, openReports: open_reports }
}

/**
 * admin_building_history's `counts` jsonb (pets, building_managers) with the
 * live activity. History counts every resident link and every report, closed
 * ones too, so residents and cases come from admin_building_activity instead.
 * Null unless pets and managers are whole and non-negative: no numbers beats
 * wrong ones in a confirmation.
 */
export function parseBuildingCounts(raw: unknown, activity: BuildingActivity | null): BuildingCounts | null {
  if (!raw || typeof raw !== "object") return null
  const { pets, building_managers } = raw as Record<string, unknown>
  if (!isCount(pets) || !isCount(building_managers)) return null
  return { pets, managers: building_managers, activity }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * "12 residents · 9 pets · 2 managers · 3 open cases", with " · 2 open reports"
 * only when there are some. Without the activity numbers the residents and
 * case parts are left out rather than guessed.
 */
export function buildingSummary(c: BuildingCounts): string {
  const a = c.activity
  const parts: string[] = []
  if (a) parts.push(plural(a.activeResidents, "resident", "residents"))
  parts.push(plural(c.pets, "pet", "pets"), plural(c.managers, "manager", "managers"))
  if (a) {
    parts.push(plural(a.openCases, "open case", "open cases"))
    if (a.openReports > 0) parts.push(plural(a.openReports, "open report", "open reports"))
  }
  return parts.join(" · ")
}
