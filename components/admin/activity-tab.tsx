"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, ScrollText } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { auditActorLabel, describeAuditEntry, isAnonymousEntry } from "@/lib/data/audit-log"
import { ADMIN_AUDIT_AREAS, adminAuditFilter } from "@/lib/data/admin-audit"
import { AUDIT_PAGE, type AuditEntry } from "@/lib/data/audit-log-live"

/**
 * Admin console › Activity. The platform-wide audit log, newest first, fifty
 * at a time with "Load more". `audit_select` admits admins to every row, so
 * unlike the manager's screen this does not filter by building. The raw
 * metadata and the ip hash are never shown; anonymous reporters stay anonymous.
 */
export function ActivityTab() {
  const [area, setArea] = useState<string | null>(null)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Bumped on every chip change and every new request; a response whose token
  // is no longer current (a slow earlier chip, an old "Load more") is dropped.
  const token = useRef(0)

  // `cursor` is the last row shown (keyset on created_at, id, so rows written
  // meanwhile cannot shift a page and repeat a row); null replaces the list.
  const load = useCallback(
    async (cursor: { at: string; id: string } | null) => {
      const mine = ++token.current
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setLoading(false)
        return
      }
      setLoading(true)
      let q = supabase
        .from("audit_log")
        .select("id, actor_id, actor_role, action, entity_type, metadata, created_at")
      const filter = area ? adminAuditFilter(area) : null
      if (filter) q = q.or(filter)
      // Ids are uuids and timestamps come from the database; both are quoted.
      if (cursor) q = q.or(`created_at.lt."${cursor.at}",and(created_at.eq."${cursor.at}",id.lt.${cursor.id})`)
      // One extra row says whether another page exists without a count.
      const { data: fetched, error: err } = await q
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(AUDIT_PAGE + 1)
      if (mine !== token.current) return
      if (err) {
        console.error("[admin-activity] load failed", err)
        setError("Couldn't load the activity log. Try again.")
        setLoading(false)
        return
      }
      const rows = (fetched ?? []).slice(0, AUDIT_PAGE)
      const safe = rows.map((r) => (isAnonymousEntry(r) ? { ...r, actor_id: null } : r))
      const ids = [...new Set(safe.filter((r) => r.actor_id).map((r) => r.actor_id as string))]
      const names = new Map<string, string>()
      if (ids.length > 0) {
        const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", ids)
        for (const p of people ?? []) if (p.full_name) names.set(p.id, p.full_name)
      }
      if (mine !== token.current) return
      const next: AuditEntry[] = safe.map((r) => ({
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
      }))
      setEntries((prev) => (cursor ? [...prev, ...next] : next))
      setHasMore((fetched ?? []).length > AUDIT_PAGE)
      setError(null)
      setLoading(false)
    },
    [area],
  )

  const lastCursor = () => {
    const last = entries[entries.length - 1]
    return last ? { at: last.at, id: last.id } : null
  }

  useEffect(() => {
    setEntries([])
    setHasMore(false)
    void load(null)
  }, [load])

  return (
    <div>
      <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
        Every recorded change across Pet10x, newest first. Anonymous reports stay anonymous here.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
        {[{ id: null, label: "All" } as { id: string | null; label: string }, ...ADMIN_AUDIT_AREAS].map((a) => (
          <button
            key={a.label}
            onClick={() => setArea(a.id)}
            aria-pressed={area === a.id}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
              area === a.id ? "bg-primary-strong text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {loading && entries.length === 0 ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-center">
          <p className="text-[13px] text-foreground">{error}</p>
          <button onClick={() => void load(lastCursor())} className="mt-2 text-[13px] font-semibold text-primary-text">
            Try again
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <ScrollText className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-[13px] text-muted-foreground">Nothing recorded here yet.</p>
        </div>
      ) : (
        <>
          <ol className="overflow-hidden rounded-2xl card-raised">
            {entries.map((e, i) => (
              <li key={e.id} className={`px-3.5 py-2.5 ${i === entries.length - 1 ? "" : "border-b border-border"}`}>
                <p className="text-[13.5px] leading-snug text-foreground">
                  <span className="font-semibold">{e.actor}</span> {e.sentence}
                </p>
                <time dateTime={e.at} className="text-[11.5px] text-muted-foreground">
                  {new Date(e.at).toLocaleString("en-CA", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            ))}
          </ol>
          {hasMore && (
            <button
              onClick={() => void load(lastCursor())}
              disabled={loading}
              className="mx-auto mt-3 flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Load more
            </button>
          )}
        </>
      )}
    </div>
  )
}
