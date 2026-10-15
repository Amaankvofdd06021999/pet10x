"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { approveResidentLink, denyResidentLink } from "@/lib/data"
import { decideRegistration } from "@/lib/data/manager-queues"
import { groupBulkByBuilding } from "@/lib/data/bulk-approve"
import { setIncidentStatus, escalateIncident } from "@/lib/data/incidents"
import { setFineStatus } from "@/lib/data/portfolio"
import { SETTLEABLE_IN_CASE } from "@/lib/data/fine-actions"
import type { FineStatus } from "@/lib/data/violations"
import { useWorkQueue, type QueueItem, type Urgency } from "@/lib/data/work-queue"
import { PetDocumentReviewControls } from "@/components/screens/manager/pet-document-review"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { decisionError } from "@/lib/data/decision-errors"
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
  CheckCheck,
} from "lucide-react"

// A call that threw rather than answering: the same sentence a failed save gets.
const THROWN = decisionError({}) ?? "Couldn't save that. Try again."

const URGENCY_DOT: Record<Urgency, string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-muted-foreground",
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
  /** `reason` is what the confirm dialog collected, or null when it asked for none. */
  run: (reason: string | null) => Promise<{ error: string | null }>
  /**
   * Asked before running, in a ConfirmDialog. Money acts cannot be undone from
   * here, and a deny tells someone no — each says what happens first.
   */
  confirm?: {
    title: string
    description: string
    confirmLabel: string
    danger?: boolean
    reason?: { label: string; required: boolean }
  }
}

function actionsFor(item: QueueItem): RowAction[] {
  switch (item.kind) {
    case "registration":
      return [
        { label: "Approve", tone: "approve", run: () => decideRegistration(item.refId, true) },
        // The function refuses a deny without a note (20261015000001), and the
        // owner reads it, so the row asks for one rather than firing on tap.
        {
          label: "Deny",
          tone: "deny",
          confirm: {
            title: "Deny this registration?",
            description: "The owner is told it wasn't approved, with your reason, and can apply again.",
            confirmLabel: "Deny registration",
            danger: true,
            reason: { label: "Reason (the owner reads this)", required: true },
          },
          run: (reason) => decideRegistration(item.refId, false, reason ?? undefined),
        },
      ]
    case "link":
      return [
        { label: "Approve", tone: "approve", run: () => approveResidentLink(item.refId) },
        {
          label: "Deny",
          tone: "deny",
          confirm: {
            title: "Deny this request to join?",
            description: "They're told the request wasn't approved, and can ask again.",
            confirmLabel: "Deny request",
            danger: true,
            reason: { label: "Reason (the resident reads this)", required: false },
          },
          run: (reason) => denyResidentLink(item.refId, reason ?? undefined),
        },
      ]
    case "incident":
      return [
        { label: "Investigate", tone: "neutral", run: () => setIncidentStatus(item.refId, "investigating") },
        { label: "Escalate", tone: "escalate", run: () => escalateIncident(item.refId) },
        { label: "Dismiss", tone: "deny", run: () => setIncidentStatus(item.refId, "dismissed") },
      ]
    case "accommodation":
      /* NO ACTIONS HERE, DELIBERATELY, since Phase 7. This row is a pointer to
       * the Approvals screen, the same as `document` below.
       *
       * Two of these three buttons could not survive the phase and the third
       * should not have.
       *
       *   Deny now REQUIRES a reason — `accommodation_requests_denial_note_ck`
       *   in the database, `note_required` from the RPC — and there is nowhere
       *   in a one-line queue row to ask for one. A Deny button that always
       *   returns note_required is worse than no Deny button.
       *
       *   Approve is gated on every required document being VERIFIED, and the
       *   manager cannot see, let alone read, a doctor's letter from here. A
       *   shortcut that approves a disability accommodation without opening the
       *   evidence is not a shortcut, it is the defect the checklist was built
       *   to remove.
       *
       *   Request info takes a note too, for the same reason: "we need more
       *   information" with no statement of what is not a request. */
      return []
    case "fine":
      // A disputed fine is under an open appeal: deciding the appeal is the
      // only move (the case view offers exactly that), so settling it here
      // would decide the appeal by the back door. Same rule as the case view.
      if (!SETTLEABLE_IN_CASE.includes(item.fineStatus as FineStatus)) return []
      return [
        // manager_set_fine_status: the only write path to a fine. It tells the
        // resident and refuses anything but an outstanding fine.
        {
          label: "Mark paid",
          tone: "approve",
          confirm: {
            title: "Record this fine as paid?",
            description: "Only do this for money already received — nothing is charged, and the resident is told.",
            confirmLabel: "Mark paid",
          },
          run: () => setFineStatus(item.refId, "paid"),
        },
        {
          label: "Waive",
          tone: "neutral",
          confirm: {
            title: "Waive this fine?",
            description: "The resident will owe nothing on it and is told.",
            confirmLabel: "Waive fine",
            danger: true,
          },
          run: () => setFineStatus(item.refId, "waived"),
        },
      ]
    case "document":
      // Rendered by PetDocumentReviewControls below instead: Reject needs a
      // note field, which a one-tap row action has nowhere to put.
      return []
  }
}

// Approve is the one primary action on a row; the rest are secondary, with
// the tone carried by the icon (ActionIcon), never by coloured words.
const TONE_VARIANT: Record<RowAction["tone"], "primary" | "secondary"> = {
  approve: "primary",
  deny: "secondary",
  neutral: "secondary",
  escalate: "secondary",
}

export function WorkQueueScreen({ scopeOverride }: { scopeOverride?: string } = {}) {
  const { items, isLoading, error, refetchAll } = useWorkQueue()
  const { selectedBuildingId, nameFor } = useStrata()
  const [busy, setBusy] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  // The row action whose confirm dialog is open.
  const [confirming, setConfirming] = useState<{ item: QueueItem; action: RowAction } | null>(null)

  // A scopeOverride (from a building drill-down) wins over the global switcher.
  const effectiveScope = scopeOverride ?? selectedBuildingId
  const inScope = (id: string | null | undefined) => effectiveScope === "all" || id === effectiveScope
  const scoped = useMemo(() => items.filter((i) => inScope(i.buildingId)), [items, effectiveScope])
  const safe = scoped.filter((i) => i.safeToBulk)

  async function runAction(item: QueueItem, action: RowAction) {
    if (action.confirm) return setConfirming({ item, action })
    setBusy(item.key)
    const { error: e } = await action.run(null)
    setBusy(null)
    if (e) return toast.error(`${action.label} failed`, { description: e })
    toast.success(`${action.label} · ${item.title}`)
    refetchAll()
  }

  /** The confirmed half of runAction: a failure stays in the dialog, beside the reason. */
  async function runConfirmed(reason: string | null) {
    if (!confirming) return { error: null }
    const { item, action } = confirming
    setBusy(item.key)
    const { error: e } = await action.run(reason)
    setBusy(null)
    if (e) return { error: e }
    toast.success(`${action.label} · ${item.title}`)
    refetchAll()
    return { error: null }
  }

  /** The confirmed bulk approve. Each failure keeps its own sentence (decisionError). */
  async function bulkApprove() {
    if (!safe.length) return { error: null }
    setBulkBusy(true)
    const results = await Promise.allSettled(
      safe.map((i) => (i.kind === "registration" ? decideRegistration(i.refId, true) : approveResidentLink(i.refId))),
    )
    setBulkBusy(false)
    const reasons: string[] = []
    let ok = 0
    for (const r of results) {
      if (r.status === "fulfilled" && !r.value.error) ok++
      else reasons.push(r.status === "fulfilled" ? (r.value.error ?? THROWN) : THROWN)
    }
    const failed = reasons.length
    if (ok) toast.success(`Approved ${ok} of ${safe.length}`)
    if (failed) {
      toast.error(`${failed} of ${safe.length} could not be approved`, {
        description: [...new Set(reasons)].join(" "),
      })
    }
    refetchAll()
    return { error: null }
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
          <Button size="sm" onClick={() => setBulkOpen(true)} loading={bulkBusy} className="ml-auto">
            {!bulkBusy && <CheckCheck />}
            Approve {safe.length}{" "}
            safe
          </Button>
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
                className="flex flex-col gap-3 rounded-xl card-raised p-3.5 sm:flex-row sm:items-center"
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
                {item.kind === "document" && item.doc ? (
                  <div className="flex-shrink-0">
                    <PetDocumentReviewControls doc={item.doc} onDone={refetchAll} />
                  </div>
                ) : actions.length > 0 ? (
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                    {actions.map((a) => (
                      <Button
                        key={a.label}
                        variant={TONE_VARIANT[a.tone]}
                        size="sm"
                        onClick={() => runAction(item, a)}
                        loading={rowBusy}
                      >
                        {!rowBusy && <ActionIcon tone={a.tone} />}
                        {a.label}
                      </Button>
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

      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title={`Approve ${safe.length} safe item${safe.length === 1 ? "" : "s"}?`}
        description={
          // Spans, not div/ul: the dialog renders this inside a <p>.
          <span className="block space-y-2 text-left">
            <span className="block">Each has no flags against its building&apos;s rules. They are told right away.</span>
            {groupBulkByBuilding(safe, nameFor).map((g) => (
              <span key={g.building} className="block">
                <span className="block text-[12px] font-semibold text-foreground">{g.building}</span>
                {g.labels.map((l, i) => (
                  <span key={i} className="block text-[12.5px]">
                    {l}
                  </span>
                ))}
              </span>
            ))}
          </span>
        }
        confirmLabel={`Approve ${safe.length}`}
        onConfirm={bulkApprove}
      />

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title={confirming?.action.confirm?.title ?? ""}
        description={confirming?.action.confirm?.description ?? ""}
        confirmLabel={confirming?.action.confirm?.confirmLabel ?? "Confirm"}
        tone={confirming?.action.confirm?.danger ? "danger" : "default"}
        reason={confirming?.action.confirm?.reason}
        onConfirm={runConfirmed}
      />
    </div>
  )
}

function ActionIcon({ tone }: { tone: RowAction["tone"] }) {
  if (tone === "approve") return <CheckCircle2 className="h-3.5 w-3.5" />
  if (tone === "deny") return <XCircle className="h-3.5 w-3.5 text-destructive" />
  if (tone === "escalate") return <ArrowUpRight className="h-3.5 w-3.5 text-info" />
  return <Ban className="h-3.5 w-3.5" />
}
