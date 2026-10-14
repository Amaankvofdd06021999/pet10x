/**
 * One building at a time.
 *
 * A manager may hold several buildings, and RLS returns every one of them. The
 * persona switcher picks an "Active building", but only some screens followed
 * it, so Residents, Approvals, Violations and Incidents mixed buildings under
 * labels like "Unit 402" that exist in all of them. Every manager list now
 * passes through here, client-side, so the queries and RLS are unchanged.
 */

/**
 * The rows belonging to the active building.
 *
 * `null` means no building is chosen — a manager with none, or grants still
 * loading — and returns the rows untouched, so a manager with zero buildings
 * sees exactly what RLS gave them. Once a building is active, a row with no
 * building cannot be shown as that building's and is dropped.
 */
export function scopeToBuilding<T extends { buildingId: string | null }>(
  rows: T[],
  activeBuildingId: string | null,
): T[] {
  if (activeBuildingId === null) return rows
  return rows.filter((r) => r.buildingId === activeBuildingId)
}

/**
 * A Building column (or label) only earns its space when there is more than
 * one building it could say. With one, it would repeat the same name on every
 * row, so one-building managers see the screen as it was.
 */
export function showBuildingColumn(managedCount: number): boolean {
  return managedCount > 1
}

/**
 * The Dashboard's scoping, which waits for `useManagerBuilding` to resolve.
 *
 * While the building is still resolving it shows nothing rather than a flash
 * of every building's rows; once it resolves to no building at all, the
 * RLS-scoped rows are the honest fallback rather than a blank screen. A
 * building that is already known stays applied through a refetch.
 */
export function scopeToResolvedBuilding<T extends { buildingId: string | null }>(
  rows: T[],
  resolvedBuildingId: string | null,
  resolving: boolean,
): T[] {
  if (resolvedBuildingId === null && resolving) return []
  return scopeToBuilding(rows, resolvedBuildingId)
}
