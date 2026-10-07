"use client"

/**
 * Pet10x — one building's audit log, a page at a time.
 *
 * `audit_select` admits admins and `manages_building(building_id)`; the query
 * still names the building, because RLS is the floor and an admin wearing the
 * manager persona would otherwise read every building's log here. `ip_hash`
 * is never selected, and `metadata` is read only to write the sentence.
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import {
  auditActorLabel,
  auditAreaFilter,
  describeAuditEntry,
  isAnonymousEntry,
  type AuditArea,
} from "./audit-log"

export const AUDIT_PAGE = 50

export interface AuditEntry {
  id: string
  at: string
  actor: string
  sentence: string
}

export function useBuildingAuditLog(buildingId: string | undefined, area: AuditArea | null, page: number) {
  const [data, setData] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !buildingId) {
      setLoading(false)
      return
    }
    setLoading(true)
    let q = supabase
      .from("audit_log")
      .select("id, actor_id, actor_role, action, entity_type, metadata, created_at", { count: "exact" })
      .eq("building_id", buildingId)
    if (area) q = q.or(auditAreaFilter(area))
    const { data: rows, error: err, count } = await q
      .order("created_at", { ascending: false })
      .range(page * AUDIT_PAGE, page * AUDIT_PAGE + AUDIT_PAGE - 1)
    if (err) {
      console.error("[audit] load failed", err)
      setError("Couldn't load the audit log. Try again.")
      setData([])
      setTotal(0)
      setLoading(false)
      return
    }

    // Names only for actors who may be named; an anonymous reporter's id is
    // never sent anywhere, not even to ask for a name we would not show.
    const named = [
      ...new Set((rows ?? []).filter((r) => r.actor_id && !isAnonymousEntry(r)).map((r) => r.actor_id as string)),
    ]
    const names = new Map<string, string>()
    if (named.length > 0) {
      // Readable where profiles RLS allows (co-managers, residents of the
      // building); anyone else falls back to their role.
      const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", named)
      for (const p of people ?? []) if (p.full_name) names.set(p.id, p.full_name)
    }

    setData(
      (rows ?? []).map((r) => ({
        id: r.id,
        at: r.created_at,
        actor: auditActorLabel({
          action: r.action,
          metadata: r.metadata,
          actorId: r.actor_id,
          actorName: r.actor_id ? (names.get(r.actor_id) ?? null) : null,
          actorRole: r.actor_role,
        }),
        sentence: describeAuditEntry({ action: r.action, entityType: r.entity_type, metadata: r.metadata }),
      })),
    )
    setTotal(count ?? 0)
    setError(null)
    setLoading(false)
  }, [buildingId, area, page])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, total, isLoading, error, refetch }
}
