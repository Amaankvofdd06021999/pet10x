"use client"

import { useCallback, useMemo } from "react"
import { useAuth } from "@/lib/auth-context"
import { scopeToBuilding, showBuildingColumn } from "./building-scope"

/**
 * The active building, as every manager list needs it: a scope for rows, a
 * name for any row's building, and whether to show that name at all.
 *
 * Kept apart from `building-scope.ts` so the pure rules there stay testable
 * in Node without pulling in the auth context.
 */
export function useBuildingScope() {
  const { activeBuildingId, managedBuildings } = useAuth()

  const names = useMemo(() => new Map(managedBuildings.map((b) => [b.id, b.name])), [managedBuildings])

  const scope = useCallback(
    <T extends { buildingId: string | null }>(rows: T[]) => scopeToBuilding(rows, activeBuildingId),
    [activeBuildingId],
  )

  return {
    activeBuildingId,
    scope,
    /** True when the manager holds more than one building; drives the column and the nav subtitle. */
    showBuilding: showBuildingColumn(managedBuildings.length),
    /** The active building's name, for the nav bar; null when none is chosen. */
    activeName: activeBuildingId ? (names.get(activeBuildingId) ?? null) : null,
    buildingName: (id: string | null) => (id ? (names.get(id) ?? null) : null),
  }
}
