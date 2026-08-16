"use client"

import { useMemo, useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { AlertTriangle, Inbox, Loader2, Search } from "lucide-react"
import { useIncidents, isOpenIncident, INCIDENT_TYPE_LABEL, type IncidentStatus } from "@/lib/data/incidents"
import { IncidentCard } from "@/components/screens/manager/incident-card"

/**
 * Incident reports, in full.
 *
 * Reports already appeared as a tab inside Approvals, next to registrations and
 * documents — queues where the manager decides yes or no. An incident is not
 * that: it is a complaint from a neighbour or a stranger that gets worked, and
 * once it is resolved or dismissed it becomes the history a manager needs when
 * the same dog is reported a third time. Buried in a tab, that history was
 * unreachable and unsearchable.
 *
 * The Approvals tab stays as the "needs attention" view; this is the record.
 */

type Filter = "open" | "all" | IncidentStatus

const FILTERS: { id: Filter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "investigating", label: "Investigating" },
  { id: "resolved", label: "Resolved" },
  { id: "dismissed", label: "Dismissed" },
  { id: "all", label: "All" },
]

export function ManagerIncidentsScreen({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const { data: incidents, isLoading, refetch } = useIncidents()
  const [filter, setFilter] = useState<Filter>("open")
  const [q, setQ] = useState("")

  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, all: incidents.length }
    for (const i of incidents) {
      if (isOpenIncident(i.status)) c.open += 1
      c[i.status] = (c[i.status] ?? 0) + 1
    }
    return c
  }, [incidents])

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    return incidents.filter((i) => {
      if (filter === "open" ? !isOpenIncident(i.status) : filter !== "all" && i.status !== filter) return false
      if (!term) return true
      // Reference, pet, unit, owner and the text itself — the five things a
      // manager has to hand when they come back to a report.
      return [
        i.reference,
        i.petName,
        i.petUnit,
        i.petOwnerName,
        i.unitInvolved,
        i.location,
        i.description,
        INCIDENT_TYPE_LABEL[i.type],
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    })
  }, [incidents, filter, q])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Incident reports"
        largeTitle={false}
        leftAction={<NavBackButton onClick={() => onNavigate?.("dashboard")} />}
      />

      <div className="sticky top-16 z-30 bg-background px-4 pb-3">
        <div className="relative mb-2.5">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by reference, pet, unit or text"
            aria-label="Search incident reports"
            className="w-full rounded-xl border border-input bg-card py-2.5 pl-9 pr-3 text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
                filter === f.id ? "bg-primary-strong text-primary-strong-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {f.label}
              <span className="ml-1 opacity-70">({counts[f.id] ?? 0})</span>
            </button>
          ))}
        </div>
      </div>

      <main className="ios-scroll flex-1 px-4 pb-24">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              {incidents.length === 0 ? (
                <Inbox className="h-6 w-6 text-primary" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-primary" />
              )}
            </div>
            <h3 className="mt-4 text-[15px] font-semibold text-foreground">
              {incidents.length === 0 ? "No reports yet" : "Nothing matches"}
            </h3>
            <p className="mx-auto mt-1 max-w-[24rem] text-[13px] leading-relaxed text-muted-foreground">
              {incidents.length === 0
                ? "Reports filed by residents, or by anyone with your building code, land here."
                : "Try a different filter or search term."}
            </p>
          </div>
        ) : (
          <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
            {visible.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} onChange={refetch} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
