"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { approveResidentLink, denyResidentLink } from "@/lib/data"
import { decideRegistration, decideAccommodation } from "@/lib/data/manager-queues"
import { setIncidentStatus, escalateIncident } from "@/lib/data/incidents"
import { setFineStatus } from "@/lib/data/portfolio"
import { useWorkQueue, type QueueItem, type Urgency } from "@/lib/data/work-queue"
import { useStrata } from "./portal-context"
import { LoadError, Spinner, EmptyState, BuildingTag } from "./strata-ui"
import {
  Inbox,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Ban,
  DollarSign,
  FileText,
  PawPrint,
  UserPlus,
  ShieldAlert,
  Accessibility,
  Loader2,
  CheckCheck,
} from "lucide-react"

const URGENCY_DOT: Record<Urgency, string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-muted-foreground/50",
}
const KIND_ICON = {
  registration: PawPrint,
  link: UserPlus,
  incident: ShieldAlert,
  accommodation: Accessibility,
  document: FileText,
  fine: DollarSign,
} as const

interface RowAction {
  label: string
  tone: "approve" | "deny" | "neutral" | "escalate"
  run: () => Promise<{ error: string | null }>
}

function actionsFor(item: QueueItem): RowAction[] {
  switch (item.kind) {
    case "registration":
      return [
        { label: "Approve", tone: "approve", run: () => decideRegistration(item.refId, true) },
        { label: "Deny", tone: "deny", run: () => decideRegistration(item.refId, false) },
      ]
    case "link":
      return [
        { label: "Approve", tone: "approve", run: () => approveResidentLink(item.refId) },
        { label: "Deny", tone: "deny", run: () => denyResidentLink(item.refId) },
      ]
    case "incident":
      return [
        { label: "Investigate", tone: "neutral", run: () => setIncidentStatus(item.refId, "investigating") },
        { label: "Escalate", tone: "escalate", run: () => escalateIncident(item.refId) },
        { label: "Dismiss", tone: "deny", run: () => setIncidentStatus(item.refId, "dismissed") },
      ]
    case "accommodation":
      return [
        { label: "Approve", tone: "approve", run: () => decideAccommodation(item.refId, "approved") },
        { label: "Request info", tone: "neutral", run: () => decideAccommodation(item.refId, "info_requested") },
        { label: "Deny", tone: "deny", run: () => decideAccommodation(item.refId, "denied") },
      ]
    case "fine":
      return [
        { label: "Mark paid", tone: "approve", run: () => setFineStatus(item.refId, "paid") },
        { label: "Waive", tone: "neutral", run: () => setFineStatus(item.refId, "waived") },
      ]
    case "document":
      return [] // managers can't write pet_documents — informational only
  }
}

const TONE_CLASS: Record<RowAction["tone"], string> = {
  approve: "bg-success/15 text-success hover:bg-success/25",
  deny: "bg-destructive/10 text-destructive hover:bg-destructive/20",
  neutral: "bg-muted text-foreground hover:bg-muted/70",
  escalate: "bg-info/15 text-info hover:bg-info/25",
}

export function WorkQueueScreen({ scopeOverride }: { scopeOverride?: string } = {}) {
  const { items, isLoading, error, refetchAll } = useWorkQueue()
  const { selectedBuildingId, nameFor } = useStrata()
  const [busy, setBusy] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  // A scopeOverride (from a building drill-down) wins over the global switcher.
  const effectiveScope = scopeOverride ?? selectedBuildingId
  const inScope = (id: string | null | undefined) => effectiveScope === "all" || id === effectiveScope
  const scoped = useMemo(() => items.filter((i) => inScope(i.buildingId)), [items, effectiveScope])
  const safe = scoped.filter((i) => i.safeToBulk)

  async function runAction(item: QueueItem, action: RowAction) {
    setBusy(item.key)
    const { error: e } = await action.run()
    setBusy(null)
    if (e) return toast.error(`${action.label} failed`, { description: e })
    toast.success(`${action.label} · ${item.title}`)
    refetchAll()
  }

  async function bulkApprove() {
    if (!safe.length) return
    setBulkBusy(true)
    const results = await Promise.allSettled(
      safe.map((i) => (i.kind === "registration" ? decideRegistration(i.refId, true) : approveResidentLink(i.refId))),
    )
    setBulkBusy(false)
    const ok = results.filter((r) => r.status === "fulfilled" && !r.value.error).length
    const failed = safe.length - ok
    if (ok) toast.success(`Approved ${ok} safe item${ok === 1 ? "" : "s"}`)
    if (failed) toast.error(`${failed} item${failed === 1 ? "" : "s"} could not be approved`)
    refetchAll()
  }

  if (isLoading) return <Spinner />
  if (error) return <LoadError message={error} onRetry={refetchAll} />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-muted-foreground">
          <span className="font-semibold text-foreground">{scoped.length}</span> item{scoped.length === 1 ? "" : "s"} ·{" "}
          {effectiveScope === "all" ? "all buildings" : nameFor(effectiveScope)} · urgency-sorted
        </p>
        {safe.length > 0 && (
          <button
            onClick={bulkApprove}
            disabled={bulkBusy}
            className="ml-auto flex items-center gap-2 rounded-lg bg-success/15 px-3.5 py-1.5 text-[13px] font-semibold text-success transition-colors hover:bg-success/25 disabled:opacity-60"
          >
            {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Approve {safe.length} safe
          </button>
        )}
      </div>

      {scoped.length === 0 ? (
        <EmptyState icon={<Inbox className="h-8 w-8" />} title="Inbox zero" sub="Nothing is waiting on you in this scope." />
      ) : (
        <div className="space-y-2">
          {scoped.map((item) => {
            const Icon = KIND_ICON[item.kind]
            const actions = actionsFor(item)
            const rowBusy = busy === item.key
            return (
              <div
                key={item.key}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 sm:flex-row sm:items-center"
              >
                <span className={`hidden h-2 w-2 flex-shrink-0 rounded-full sm:block ${URGENCY_DOT[item.urgency]}`} />
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-4.5 w-4.5 text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full sm:hidden ${URGENCY_DOT[item.urgency]}`} />
                    <BuildingTag name={nameFor(item.buildingId)} />
                    <span className="text-[13.5px] font-semibold text-foreground">{item.title}</span>
                    <span className="text-[11px] text-muted-foreground">· {item.ageLabel}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{item.subtitle}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">{item.meta}</p>
                </div>
                {actions.length > 0 ? (
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                    {actions.map((a) => (
                      <button
                        key={a.label}
                        onClick={() => runAction(item, a)}
                        disabled={rowBusy}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50 ${TONE_CLASS[a.tone]}`}
                      >
                        {rowBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ActionIcon tone={a.tone} />
                        )}
                        {a.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="flex-shrink-0 text-[11.5px] italic text-muted-foreground">Informational</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ActionIcon({ tone }: { tone: RowAction["tone"] }) {
  if (tone === "approve") return <CheckCircle2 className="h-3.5 w-3.5" />
  if (tone === "deny") return <XCircle className="h-3.5 w-3.5" />
  if (tone === "escalate") return <ArrowUpRight className="h-3.5 w-3.5" />
  return <Ban className="h-3.5 w-3.5" />
}
