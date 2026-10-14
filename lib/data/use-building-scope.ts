"use client"

import { useCallback, useMemo } from "react"
import { useAuth } from "@/lib/auth-context"
import { scopeForStatus, scopeNotice, showBuildingFor } from "./building-scope"

/**
 * The active building, as every manager list needs it: a scope for rows, a
 * name for any row's building, whether to show that name, and whether the
 * buildings are known yet.
 *
 * Kept apart from `building-scope.ts` so the rules there stay testable in Node
 * without pulling in the auth context. Every decision is made there; this only
 * wires it to `useAuth()`.
 */
export function useBuildingScope() {
  const { activeBuildingId, managedBuildings, personasStatus } = useAuth()

  const names = useMemo(() => new Map(managedBuildings.map((b) => [b.id, b.name])), [managedBuildings])

  const scope = useCallback(
    <T extends { buildingId: string | null }>(rows: T[]) => scopeForStatus(rows, personasStatus, activeBuildingId),
    [personasStatus, activeBuildingId],
  )
  const loading = personasStatus === "loading"

  /**
   * A query, scoped, that also reads as loading until the buildings are known,
   * so each screen shows its own spinner instead of an empty state.
   */
  const scopeQuery = useCallback(
    <T extends { buildingId: string | null }, Q extends { data: T[]; isLoading: boolean }>(q: Q): Q => ({
      ...q,
      data: scope(q.data),
      isLoading: q.isLoading || loading,
    }),
    [scope, loading],
  )

  /**
   * One source for a row's building name: the manager's own buildings first,
   * then the row's joined name (all there is after a failed load).
   */
  const buildingName = useCallback(
    (id: string | null, joined?: string | null) => (id ? (names.get(id) ?? null) : null) ?? joined ?? null,
    [names],
  )

  return {
    activeBuildingId,
    status: personasStatus,
    loading,
    scope,
    scopeQuery,
    /** Drives the Building column/labels and the nav subtitle. */
    showBuilding: showBuildingFor(personasStatus, managedBuildings.length),
    /** The active building's name, for the nav bar; null when none is chosen. */
    activeName: activeBuildingId ? (names.get(activeBuildingId) ?? null) : null,
    /** "Couldn't load your buildings. Showing all of them." after a failed load, else null. */
    notice: scopeNotice(personasStatus),
    buildingName,
  }
}
