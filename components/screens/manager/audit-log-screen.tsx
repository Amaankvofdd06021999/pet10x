"use client"

import { useState } from "react"
import { Loader2, ScrollText } from "lucide-react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { AUDIT_AREAS, type AuditArea } from "@/lib/data/audit-log"
import { AUDIT_PAGE, useBuildingAuditLog } from "@/lib/data/audit-log-live"

/**
 * Settings › Audit Log. Every recorded change to the building, newest first,
 * fifty at a time, as sentences — "Dana Whitlock moved a bylaw case from open
 * to warning". The raw metadata and the ip hash are never shown.
 */
export function AuditLogScreen({
  buildingId,
  buildingName,
  onBack,
}: {
  buildingId: string
  buildingName: string
  onBack: () => void
}) {
  const [area, setArea] = useState<AuditArea | null>(null)
  const [page, setPage] = useState(0)
  const { data: entries, total, isLoading, error, refetch } = useBuildingAuditLog(buildingId, area, page)
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE))

  const pick = (a: AuditArea | null) => {
    setArea(a)
    setPage(0)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar title="Audit Log" largeTitle={false} leftAction={<NavBackButton onClick={onBack} />} />
      <main className="ios-scroll flex-1 px-4 pb-24">
        <p className="mb-3 text-[12.5px] leading-relaxed text-muted-foreground">
          Every recorded change to {buildingName}: cases, fines, rules, accommodations, incidents, community and
          emergency access. Anonymous reports stay anonymous here.
        </p>

        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by area">
          {[{ id: null, label: "All" } as { id: AuditArea | null; label: string }, ...AUDIT_AREAS].map((a) => (
            <button
              key={a.label}
              onClick={() => pick(a.id)}
              aria-pressed={area === a.id}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                area === a.id ? "bg-primary-strong text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {isLoading && entries.length === 0 ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-center">
            <p className="text-[13px] text-foreground">{error}</p>
            <button onClick={() => void refetch()} className="mt-2 text-[13px] font-semibold text-primary-text">
              Try again
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <ScrollText className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-[13px] text-muted-foreground">
              {area ? "Nothing recorded in this area yet." : "Nothing recorded for this building yet."}
            </p>
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
            {pages > 1 && (
              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || isLoading}
                  className="rounded-lg bg-muted px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
                >
                  Newer
                </button>
                <span className="text-[12px] text-muted-foreground">
                  Page {page + 1} of {pages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                  disabled={page >= pages - 1 || isLoading}
                  className="rounded-lg bg-muted px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
                >
                  Older
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
