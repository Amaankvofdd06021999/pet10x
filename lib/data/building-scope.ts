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

/**
 * Whether the account's buildings are known yet.
 *
 * `loading` until `my_personas()` has answered for THIS account (an answer for
 * the previous one on a shared device does not count); `error` when it failed.
 * Mock mode and signed-out sessions have nothing to wait for.
 */
export type PersonasStatus = "loading" | "ready" | "error"

export function personasStatus(input: {
  enabled: boolean
  userId: string | null
  result: { userId: string; ok: boolean } | null
}): PersonasStatus {
  if (!input.enabled || input.userId === null) return "ready"
  if (input.result === null || input.result.userId !== input.userId) return "loading"
  return input.result.ok ? "ready" : "error"
}

/**
 * The rows a manager list may show, given how far the buildings have loaded.
 *
 * - `loading`: nothing — the Dashboard's resolve-wait rule. Before this, a
 *   manager of several buildings saw every building's rows, unlabelled, with
 *   live Approve and Remove buttons, until the switcher's choice arrived.
 * - `ready`: `scopeToBuilding`, unchanged (zero or one building as before).
 * - `error`: every row, as before this task, but labelled and explained
 *   (`showBuildingFor`, `scopeNotice`) rather than passed off as one building.
 */
export function scopeForStatus<T extends { buildingId: string | null }>(
  rows: T[],
  status: PersonasStatus,
  activeBuildingId: string | null,
): T[] {
  if (status === "loading") return scopeToResolvedBuilding(rows, null, true)
  if (status === "error") return rows
  return scopeToBuilding(rows, activeBuildingId)
}

/** Building labels: always after a failed load, since the rows may be mixed; else only for more than one building. */
export function showBuildingFor(status: PersonasStatus, managedCount: number): boolean {
  if (status === "error") return true
  if (status === "loading") return false
  return showBuildingColumn(managedCount)
}

/** The inline notice a scoped screen shows, or null. */
export function scopeNotice(status: PersonasStatus): string | null {
  return status === "error" ? "Couldn't load your buildings. Showing all of them." : null
}

/**
 * The case-ledger CSV's columns. `buildingId` is only there to scope by and is
 * never exported; `building` is a column only when it can differ between rows.
 */
export function ledgerColumnKeys(keys: string[], showBuilding: boolean): string[] {
  return keys.filter((k) => k !== "buildingId" && (showBuilding || k !== "building"))
}
