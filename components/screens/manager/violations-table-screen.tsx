"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Plus, Search, FileWarning, Gavel, Download } from "lucide-react"
import {
  useViolationsLive, useResolvedViolationsLive, useViolationSubjects,
  openViolation, fetchCaseLedger, resolveViolation, dismissViolation, resolveDispute,
  issueFine, remindAboutFine,
  type ViolationSubject,
} from "@/lib/data/manager-queues"
import { setFineStatus } from "@/lib/data/portfolio"
import { useBuildingPetRules } from "@/lib/data/building-rules-live"
import { useIncidents, setIncidentStatus, escalateIncident } from "@/lib/data/incidents"
import { useNoticeKinds, useViolationNotices, issueNotice } from "@/lib/data/clinic/notices"
import { useCaseTimeline, stampOf, type CaseEvent } from "@/lib/data/case-timeline"
import {
  parseAmountToCents, readFineSchedule, formatCentsForInput, scheduledCents, fineNoteRequired, defaultFineDueOn,
  type FineSchedule,
} from "@/lib/data/fine-schedule"
import { settleableFines, fineDegreeToIssue } from "@/lib/data/fine-actions"
import { closedCaseLabel } from "@/lib/data/violations"
import type { CaseFine, Violation } from "@/lib/data/types"
import { toCsv, downloadCsv } from "@/lib/csv"
import { DataTable, type Column } from "@/components/screens/shared/data-table"
import { useBuildingScope } from "@/lib/data/use-building-scope"
import { ledgerColumnKeys } from "@/lib/data/building-scope"
import { ScopeNotice } from "@/components/screens/manager/scope-notice"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  SectionCard, Spinner, LoadError, EmptyState, Button, Pill, Modal, Field,
  TextInput, TextArea, Select, SegmentedTabs, Toolbar, StatTile,
} from "@/components/screens/shared/ui"

type Tab = "cases" | "resolved" | "incidents"

const STAGE_TONE: Record<string, "neutral" | "good" | "warn" | "bad" | "info" | "accent"> = {
  open: "neutral",
  warning: "warn",
  fine_1: "bad",
  fine_2: "bad",
  resolved: "good",
  dismissed: "neutral",
}

/**
 * Two formatters, deliberately named for their unit.
 *
 * `Violation.amount` / `.outstanding` arrive already divided (manager-queues.ts
 * maps `totalCents / 100`), while `violation_notices.amount_cents` is raw cents.
 * A single money() helper divided both and rendered a $20 fine as $0.20 on the
 * case header while the notice beneath it read $20.00. The unit belongs in the
 * name.
 */
const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" })
function fromDollars(amount: number): string {
  return CAD.format(amount)
}
function fromCents(cents: number): string {
  return CAD.format(cents / 100)
}

/**
 * A Building column for a manager of more than one building, so a row is never
 * just "Unit 402". Secondary: on a phone the line above the tabs names the
 * building instead, and the table keeps its width for the case itself.
 */
function buildingColumn<T>(nameOf: (row: T) => string | null): Column<T> {
  return {
    key: "building",
    header: "Building",
    secondary: true,
    sortValue: (r) => nameOf(r) ?? "",
    render: (r) => <span className="text-muted-foreground">{nameOf(r) ?? "—"}</span>,
  }
}

/**
 * The manager's bylaw desk.
 *
 * A record list wants a table: sortable by who owes the most, filterable down
 * to "fines outstanding", and scannable at eighty rows. The card grid this
 * replaces could not do any of those things.
 */
export function ManagerViolationsScreen({ onNavigate }: { onNavigate?: (screen: string, id?: string) => void }) {
  const [tab, setTab] = useState<Tab>("cases")
  const [search, setSearch] = useState("")
  const [stageFilter, setStageFilter] = useState<string>("all")
  // The active building's cases, closed cases and reports. Scoped here, once,
  // so every count, tile and table below is of the same rows.
  // Until the buildings are known each list reads as loading, so no table
  // offers Escalate or Dismiss on another building's rows in the meantime.
  const { activeBuildingId, scope, loading: scopeLoading, showBuilding, activeName, notice, buildingName } =
    useBuildingScope()
  const activeRaw = useViolationsLive()
  const resolvedRaw = useResolvedViolationsLive()
  const incidentsRaw = useIncidents()
  // Memoised so `filtered` below recomputes on new rows, not on every render.
  const activeRows = useMemo(() => scope(activeRaw.data), [scope, activeRaw.data])
  const resolvedRows = useMemo(() => scope(resolvedRaw.data), [scope, resolvedRaw.data])
  const incidentRows = useMemo(() => scope(incidentsRaw.data), [scope, incidentsRaw.data])
  const active = { ...activeRaw, data: activeRows, isLoading: activeRaw.isLoading || scopeLoading }
  const resolved = { ...resolvedRaw, data: resolvedRows, isLoading: resolvedRaw.isLoading || scopeLoading }
  const incidents = { ...incidentsRaw, data: incidentRows, isLoading: incidentsRaw.isLoading || scopeLoading }
  const [logOpen, setLogOpen] = useState(false)
  const [selected, setSelected] = useState<Violation | null>(null)
  // A case (with its fine and close actions) or a half-logged violation from
  // one building must not stay open after switching to another.
  const [scopedFor, setScopedFor] = useState(activeBuildingId)
  if (scopedFor !== activeBuildingId) {
    setScopedFor(activeBuildingId)
    setSelected(null)
    setLogOpen(false)
  }

  const rows = activeRows
  const source = active

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((v) => {
      if (stageFilter !== "all") {
        if (stageFilter === "outstanding" && v.outstanding <= 0) return false
        if (stageFilter === "disputed" && !v.openDispute) return false
        if (!["outstanding", "disputed"].includes(stageFilter) && v.stage !== stageFilter) return false
      }
      if (!term) return true
      return [v.pet, v.resident, v.unit, v.type, v.stageLabel]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(term))
    })
  }, [rows, search, stageFilter])

  const columns: Column<Violation>[] = [
    {
      key: "pet",
      header: "Pet",
      sortValue: (v) => v.pet,
      render: (v) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{v.pet || "Unidentified"}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">{v.type}</p>
        </div>
      ),
    },
    {
      key: "resident",
      header: "Resident",
      sortValue: (v) => v.resident,
      render: (v) => <span className="text-foreground">{v.resident || "—"}</span>,
    },
    {
      key: "unit",
      header: "Unit",
      sortValue: (v) => v.unit,
      width: "w-20",
      render: (v) => <span className="tabular-nums text-muted-foreground">{v.unit || "—"}</span>,
    },
    {
      key: "stage",
      header: "Stage",
      sortValue: (v) => v.stage,
      render: (v) => (
        <span className="flex flex-wrap items-center gap-1">
          <Pill tone={STAGE_TONE[v.stage] ?? "neutral"}>{v.stageLabel}</Pill>
          {v.openDispute && (
            <Pill tone="info" title="An appeal is open — decide it before this case can move">
              Appeal · decide
            </Pill>
          )}
        </span>
      ),
    },
    {
      key: "outstanding",
      header: "Owed",
      align: "right",
      sortValue: (v) => v.outstanding,
      width: "w-24",
      render: (v) =>
        v.amount === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={v.outstanding > 0 ? "font-semibold text-destructive" : "text-success-strong"}>
            {v.outstanding > 0 ? fromDollars(v.outstanding) : "Settled"}
          </span>
        ),
    },
    {
      key: "date",
      header: "Opened",
      sortValue: (v) => v.date,
      secondary: true,
      width: "w-28",
      render: (v) => <span className="text-muted-foreground">{v.date}</span>,
    },
    ...(showBuilding ? [buildingColumn<Violation>((v) => buildingName(v.buildingId))] : []),
  ]

  const counts = {
    all: rows.length,
    outstanding: rows.filter((v) => v.outstanding > 0).length,
    disputed: rows.filter((v) => v.openDispute).length,
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 px-4 pb-8 pt-4">
      <ScopeNotice notice={notice} />
      {/* Phone only: on desktop the tables carry a Building column. */}
      {showBuilding && activeName && (
        <p className="text-[13px] font-semibold text-muted-foreground md:hidden">{activeName}</p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open cases" value={active.data.length} />
        <StatTile label="Fines owed" value={fromDollars(active.data.reduce((s, v) => s + v.outstanding, 0))}
          tone={counts.outstanding ? "warn" : "good"} />
        <StatTile
          label="Under appeal"
          value={counts.disputed}
          tone={counts.disputed ? "info" : "default"}
          hint={counts.disputed ? "waiting on you — nothing else can move" : undefined}
          onClick={counts.disputed ? () => { setTab("cases"); setStageFilter("disputed") } : undefined}
        />
        <StatTile label="Incident reports" value={incidents.data.length}
          onClick={() => setTab("incidents")} tone="accent" />
      </div>

      <Toolbar>
        <SegmentedTabs
          label="Bylaw views"
          active={tab}
          onChange={setTab}
          tabs={[
            { id: "cases", label: "Cases", count: active.data.length },
            { id: "resolved", label: "Closed", count: resolved.data.length },
            { id: "incidents", label: "Incidents", count: incidents.data.length },
          ]}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="secondary"
            onClick={async () => {
              const res = await fetchCaseLedger()
              if (res.error) return toast.error("Couldn't export", { description: res.error })
              // The export is the screen's building too: scoped the same way,
              // with a building column only when it can differ between rows.
              const rows = scope(res.rows ?? []).map((r) => ({
                ...r,
                building: buildingName(r.buildingId, r.building) ?? "—",
              })) as unknown as Record<string, unknown>[]
              const cols = ledgerColumnKeys(Object.keys(rows[0] ?? {}), showBuilding).map((k) => ({ key: k, label: k }))
              if (cols.length === 0) return toast("Nothing to export yet.")
              downloadCsv("bylaw-cases.csv", toCsv(rows, cols))
            }}>
            <Download className="h-4 w-4" aria-hidden="true" /> Export
          </Button>
          <Button size="sm" onClick={() => setLogOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Log a violation
          </Button>
        </div>
      </Toolbar>

      {tab !== "incidents" && (
        <Toolbar>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <label htmlFor="viol-search" className="sr-only">Search cases</label>
            <input
              id="viol-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pet, resident, unit or type"
              className="w-full rounded-xl border border-input bg-card py-2 pl-9 pr-3 text-[13.5px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>
          <label htmlFor="viol-stage" className="sr-only">Filter by stage</label>
          <Select id="viol-stage" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="w-auto">
            <option value="all">All stages ({counts.all})</option>
            <option value="outstanding">Fines owed ({counts.outstanding})</option>
            <option value="disputed">Under appeal ({counts.disputed})</option>
            <option value="open">Open</option>
            <option value="warning">Warning</option>
            <option value="fine_1">First fine</option>
            <option value="fine_2">Second fine</option>
          </Select>
        </Toolbar>
      )}

      {tab === "incidents" ? (
        <IncidentsTable
          incidents={incidents}
          onEscalated={() => { incidents.refetch(); active.refetch() }}
          nameOf={showBuilding ? (i) => buildingName(i.buildingId, i.buildingName) : null}
        />
      ) : tab === "resolved" ? (
        <ClosedTable resolved={resolved} nameOf={showBuilding ? (r) => buildingName(r.buildingId) : null} />
      ) : source.isLoading ? (
        <Spinner label="Loading cases" />
      ) : source.error ? (
        <LoadError message={source.error} onRetry={source.refetch} />
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          getRowId={(v) => v.id}
          onRowClick={setSelected}
          initialSort={{ key: "stage", dir: "asc" }}
          caption="Bylaw cases"
          empty={
            <EmptyState
              title={search || stageFilter !== "all" ? "Nothing matches" : "No cases"}
              detail={
                search || stageFilter !== "all"
                  ? "Clear the filters to see everything."
                  : "Log one directly, or escalate an incident report."
              }
              icon={<Gavel className="h-5 w-5" aria-hidden="true" />}
              action={<Button size="sm" onClick={() => setLogOpen(true)}>Log a violation</Button>}
            />
          }
        />
      )}

      <LogViolationModal
        // Remounted per building, so a subject picked in one is never carried
        // into the next opening.
        key={activeBuildingId ?? "all"}
        scope={scope}
        scopeLoading={scopeLoading}
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onLogged={(id) => {
          setLogOpen(false)
          active.refetch()
          const v = active.data.find((x) => x.id === id)
          if (v) setSelected(v)
        }}
      />

      <CaseModal
        // The freshest copy of the row: settling a fine re-reads the list, and
        // the modal must not keep offering Mark paid on the fine just paid.
        violation={selected ? (active.data.find((v) => v.id === selected.id) ?? selected) : null}
        onClose={() => setSelected(null)}
        onChanged={() => {
          active.refetch()
          resolved.refetch()
        }}
      />
    </div>
  )
}

/* ------------------------------- incidents ------------------------------- */

function IncidentsTable({
  incidents,
  onEscalated,
  nameOf,
}: {
  incidents: ReturnType<typeof useIncidents>
  onEscalated: () => void
  /** A row's building name; set only when the Building column should show. */
  nameOf: ((row: ReturnType<typeof useIncidents>["data"][number]) => string | null) | null
}) {
  const [busy, setBusy] = useState<string | null>(null)
  type Row = (typeof incidents.data)[number]

  const columns: Column<Row>[] = [
    {
      key: "type",
      header: "Report",
      sortValue: (i) => i.type,
      render: (i) => (
        <div className="min-w-0">
          <p className="truncate font-semibold capitalize text-foreground">{String(i.type).replace(/_/g, " ")}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">{i.reference ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "pet",
      header: "Identified pet",
      sortValue: (i) => i.petName ?? "",
      render: (i) => <span>{i.petName ?? <span className="text-muted-foreground">Not identified</span>}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (i) => i.status,
      render: (i) => <Pill tone={i.status === "dismissed" ? "neutral" : i.status === "linked_to_violation" ? "accent" : "warn"}>
        {String(i.status).replace(/_/g, " ")}
      </Pill>,
    },
    {
      key: "evidence",
      header: "Evidence",
      secondary: true,
      sortValue: (i) => i.evidenceCount ?? 0,
      render: (i) => <span className="text-muted-foreground tabular-nums">{i.evidenceCount ?? 0}</span>,
    },
    ...(nameOf ? [buildingColumn<Row>(nameOf)] : []),
    {
      key: "act",
      header: "",
      align: "right",
      render: (i) =>
        i.status === "linked_to_violation" ? (
          <span className="text-[11.5px] text-muted-foreground">Escalated</span>
        ) : (
          <span className="flex justify-end gap-1.5">
            <Button
              size="sm"
              busy={busy === i.id}
              onClick={async (e) => {
                e.stopPropagation()
                if (!i.petId) {
                  toast.error("Identify the pet on this report before escalating it — a case needs a subject.")
                  return
                }
                setBusy(i.id)
                const res = await escalateIncident(i.id)
                setBusy(null)
                if (res.error) toast.error("Couldn't escalate", { description: res.error })
                else onEscalated()
              }}
            >
              Escalate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async (e) => {
                e.stopPropagation()
                setBusy(i.id)
                await setIncidentStatus(i.id, "dismissed")
                setBusy(null)
                onEscalated()
              }}
            >
              Dismiss
            </Button>
          </span>
        ),
    },
  ]

  if (incidents.isLoading) return <Spinner label="Loading reports" />
  if (incidents.error) return <LoadError message={incidents.error} onRetry={incidents.refetch} />

  return (
    <DataTable
      rows={incidents.data}
      columns={columns}
      getRowId={(i) => i.id}
      caption="Incident reports"
      initialSort={{ key: "status", dir: "asc" }}
      empty={
        <EmptyState
          title="No incident reports"
          detail="Reports filed from the lobby code or by residents land here first."
          icon={<FileWarning className="h-5 w-5" aria-hidden="true" />}
        />
      }
    />
  )
}

/* ---------------------------- log a violation ---------------------------- */

/**
 * Opening a case and issuing the first notice are one job, so they are one
 * flow with a visible progression. Step one identifies who it is about; step
 * two is what the resident actually receives. Step two can be skipped — a case
 * may legitimately sit open while it is looked into.
 */
function LogViolationModal({
  scope, scopeLoading, open, onClose, onLogged,
}: {
  /** The active building's scope: a case is logged against someone in the building being worked. */
  scope: <T extends { buildingId: string | null }>(rows: T[]) => T[]
  /** True until the buildings are known; the picker waits rather than offering every building. */
  scopeLoading: boolean
  open: boolean
  onClose: () => void
  onLogged: (id: string) => void
}) {
  const subjectsRaw = useViolationSubjects()
  const subjectRows = useMemo(() => scope(subjectsRaw.data), [scope, subjectsRaw.data])
  const subjects = { ...subjectsRaw, data: subjectRows, isLoading: subjectsRaw.isLoading || scopeLoading }
  const [step, setStep] = useState<1 | 2>(1)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<ViolationSubject | null>(null)
  const [type, setType] = useState("noise")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return subjects.data.slice(0, 8)
    return subjects.data
      .filter((s) => [s.petName, s.residentName, s.unitNumber].some((f) => f.toLowerCase().includes(term)))
      .slice(0, 12)
  }, [subjects.data, search])

  function reset() {
    setStep(1)
    setCreatedId(null)
    setPicked(null)
    setSearch("")
    setError(null)
  }

  async function createCase() {
    if (!picked) return setError("Choose who the case is about.")
    setBusy(true)
    setError(null)
    const res = await openViolation({
      buildingId: picked.buildingId,
      type,
      petId: picked.petId,
      residentId: picked.residentId ?? undefined,
      unitId: picked.unitId ?? undefined,
    })
    setBusy(false)
    if (res.error) return setError(res.error)
    setCreatedId(res.id ?? null)
    setStep(2)
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title={step === 1 ? "Log a violation" : `Issue the first notice`}
      description={
        step === 1
          ? "Find the pet, the resident or the unit."
          : `Case opened for ${picked?.petName ?? "this pet"}. What does the resident receive?`
      }
      footer={
        step === 1 ? (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button busy={busy} onClick={() => void createCase()}>Open case &amp; continue</Button>
          </>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              const id = createdId
              reset()
              if (id) onLogged(id)
            }}
          >
            Leave it open for now
          </Button>
        )
      }
    >
      <Stepper step={step} />

      {step === 1 ? (
        <div className="flex flex-col gap-3">
          <Field label="Search" hint="Pet name, resident name or unit number">
            {(p) => (
              <TextInput {...p} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Bramble, Novak, 402…" />
            )}
          </Field>

          {subjects.isLoading ? (
            <Spinner />
          ) : matches.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">No pet, resident or unit matches that.</p>
          ) : (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {matches.map((s) => {
                const on = picked?.petId === s.petId
                return (
                  <li key={s.petId}>
                    <button
                      type="button"
                      onClick={() => setPicked(s)}
                      aria-pressed={on}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left ${
                        on ? "border-primary bg-primary/10" : "border-border hover:bg-secondary"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold text-foreground">{s.petName}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {s.residentName} · Unit {s.unitNumber}
                        </span>
                      </span>
                      {on && <Pill tone="accent">Selected</Pill>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <Field label="What happened" required error={error}>
            {(p) => (
              <Select {...p} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="noise">Noise</option>
                <option value="aggressive">Aggressive behaviour</option>
                <option value="off_leash">Off leash</option>
                <option value="waste">Waste not cleared</option>
                <option value="damage">Damage</option>
                <option value="unregistered">Unregistered pet</option>
                <option value="other">Other</option>
              </Select>
            )}
          </Field>
        </div>
      ) : createdId ? (
        <NoticeForm
          violationId={createdId}
          stage="open"
          onIssued={() => {
            const id = createdId
            reset()
            if (id) onLogged(id)
          }}
        />
      ) : null}
    </Modal>
  )
}

function Stepper({ step }: { step: 1 | 2 }) {
  const steps = ["Who and what", "What they receive"]
  return (
    <ol className="mb-4 flex items-center gap-2" aria-label={`Step ${step} of 2`}>
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2
        const done = step > n
        const on = step === n
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                done ? "bg-success-strong text-white" : on ? "bg-primary-strong text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span className={`truncate text-[12px] ${on ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {label}
            </span>
            {i === 0 && <span className="h-px flex-1 bg-border" aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}

/* ------------------------------- case view ------------------------------- */

/**
 * The acts that close a case or decide its appeal, each behind a ConfirmDialog
 * that asks for the reason the resident reads. That reason replaced the fixed
 * "Dismissed by manager" / "Resolved by manager", which told the resident
 * nothing about why.
 */
type CloseAct = "dismiss" | "resolve" | "upheld" | "overturned"

const CLOSE_COPY: Record<
  CloseAct,
  { title: string; description: string; confirmLabel: string; danger: boolean; required: boolean; done: string }
> = {
  dismiss: {
    title: "Dismiss this case?",
    description: "The case closes as filed in error. This can't be undone.",
    confirmLabel: "Dismiss case",
    danger: true,
    required: true,
    done: "Case dismissed",
  },
  resolve: {
    title: "Mark this case resolved?",
    description: "The case closes as remedied. This can't be undone.",
    confirmLabel: "Mark resolved",
    danger: false,
    required: true,
    done: "Case resolved",
  },
  upheld: {
    title: "Uphold this notice?",
    description:
      "The appeal fails. The case stays where it is and any disputed fine goes back to owed. This can't be undone.",
    confirmLabel: "Uphold",
    danger: true,
    required: true,
    done: "Appeal upheld",
  },
  overturned: {
    title: "Overturn this notice?",
    description: "The appeal succeeds. The case is dismissed and its fines are waived. This can't be undone.",
    confirmLabel: "Overturn",
    danger: false,
    // A finding for the resident needs no defence; upholding against them does.
    required: false,
    done: "Appeal overturned",
  },
}

/** The money acts a case offers, each behind its own confirm. */
type MoneyAct =
  | { kind: "paid" | "waived"; fine: CaseFine }
  | { kind: "remind" }
  | { kind: "fine"; degree: "fine_1" | "fine_2" }

function CaseModal({
  violation, onClose, onChanged,
}: {
  violation: Violation | null
  onClose: () => void
  onChanged: () => void
}) {
  const notices = useViolationNotices(violation?.id ?? null)
  const timeline = useCaseTimeline(violation?.id ?? null)
  // The schedule of THIS case's building, read directly: the portfolio list
  // leaves out archived buildings and is empty for an admin, and either would
  // have shown "no fine schedule" on a building that has one.
  const rules = useBuildingPetRules(violation?.buildingId ?? undefined)
  const schedule = rules.data ? readFineSchedule(rules.data) : null
  const [issuing, setIssuing] = useState(false)
  const [money, setMoney] = useState<MoneyAct | null>(null)
  const [closing, setClosing] = useState<CloseAct | null>(null)
  const openedId = violation?.id ?? null

  // Re-read the case list when a case is opened. The modal renders from a row
  // captured when the table loaded, and a case that moved since then would
  // otherwise offer actions the database will refuse.
  useEffect(() => {
    if (openedId) onChanged()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedId])

  if (!violation) return null

  // Asked of the pure helpers, which copy the ladder rule rather than
  // restating it here. Under an open appeal both answer "nothing".
  const owed = violation.openDispute ? [] : settleableFines(violation.fines)
  const degree = fineDegreeToIssue(violation.stage, violation.openDispute !== null)

  /** The confirmed close or appeal decision. A failure stays in the dialog, beside the reason. */
  async function confirmClose(act: CloseAct, reason: string | null): Promise<{ error: string | null }> {
    if (!violation) return { error: null }
    const res =
      act === "dismiss"
        ? await dismissViolation(violation.id, reason ?? "")
        : act === "resolve"
          ? await resolveViolation(violation.id, reason ?? "")
          : await resolveDispute(violation.id, act, reason ?? undefined)
    if (res.error) {
      // These all mean the same thing: this screen is looking at an older
      // version of the case than the database is. A red message on a dead
      // dialog is the wrong answer — close, reload and say why.
      if (
        (act === "upheld" || act === "overturned") &&
        /no appeal waiting|already been recorded|no_open_dispute|dispute_open|not a move/i.test(res.error)
      ) {
        onChanged()
        onClose()
        toast.error("This case has already moved — the appeal was decided somewhere else, or in another tab. Reloaded.")
        return { error: null }
      }
      return { error: res.error }
    }
    toast.success(CLOSE_COPY[act].done)
    if (act === "upheld" || act === "overturned") {
      timeline.refetch()
      notices.refetch()
    }
    onChanged()
    onClose()
    return { error: null }
  }

  return (
    <>
      <Modal
        // Closed while a confirm is up: this Modal sits above the dialog layer
        // and takes Escape at the document, so the two cannot share the screen.
        open={violation !== null && !issuing && money === null && closing === null}
        onClose={onClose}
        title={`${violation.pet || "Case"} · ${violation.stageLabel}`}
        description={`${violation.resident || "Resident"} · Unit ${violation.unit || "—"} · ${violation.type}`}
        wide
        footer={
          violation.openDispute ? (
            <p className="text-[12px] text-muted-foreground">
              Decide the appeal above before this case can move again.
            </p>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setClosing("dismiss")}>Dismiss</Button>
              <Button variant="secondary" onClick={() => setClosing("resolve")}>Mark resolved</Button>
              {degree && (
                <Button variant="danger" onClick={() => setMoney({ kind: "fine", degree })}>
                  {degree === "fine_1" ? "Issue fine" : "Issue second fine"}
                </Button>
              )}
              <Button onClick={() => setIssuing(true)}>Issue a notice</Button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Stage" value={violation.stageLabel} />
            <StatTile label="Issued" value={violation.amount ? fromDollars(violation.amount) : "—"} />
            <StatTile label="Owed" value={violation.outstanding ? fromDollars(violation.outstanding) : "—"}
              tone={violation.outstanding ? "bad" : "good"} />
            <StatTile label="Opened" value={violation.date} />
          </div>

          {violation.openDispute && (
            <AppealPanel violation={violation} onChoose={setClosing} />
          )}

          {owed.length > 0 && (
            <SectionCard
              title="Fines owed"
              subtitle="Record money received offline, waive a fine, or remind the resident"
              actions={
                violation.chaseable ? (
                  <Button size="sm" variant="secondary" onClick={() => setMoney({ kind: "remind" })}>
                    Send reminder
                  </Button>
                ) : undefined
              }
            >
              <ul className="flex flex-col divide-y divide-border">
                {owed.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold tabular-nums text-foreground">
                        {fromCents(f.amountCents)}
                        {f.currency.toUpperCase() !== "CAD" && ` ${f.currency.toUpperCase()}`}
                      </span>
                      <Pill tone={f.status === "issued" ? "bad" : "warn"}>
                        {f.status === "issued" ? "Owed" : "Partly paid"}
                      </Pill>
                    </span>
                    <span className="flex gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => setMoney({ kind: "paid", fine: f })}>
                        Mark paid
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setMoney({ kind: "waived", fine: f })}>
                        Waive
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          <SectionCard
            title="What happened, in order"
            subtitle="Every stage, notice, fine and appeal on this case"
          >
            {timeline.isLoading ? (
              <Spinner />
            ) : timeline.data.length === 0 ? (
              <EmptyState title="Nothing has happened yet" detail="Opening a case tells the resident nothing on its own." />
            ) : (
              <Timeline events={timeline.data} />
            )}
          </SectionCard>
        </div>
      </Modal>

      <Modal
        open={issuing}
        onClose={() => setIssuing(false)}
        title="Issue a notice"
        description={`${violation.pet || "This case"} · currently ${violation.stageLabel}`}
      >
        <NoticeForm
          violationId={violation.id}
          stage={violation.stage}
          onIssued={() => {
            setIssuing(false)
            notices.refetch()
            timeline.refetch()
            onChanged()
          }}
        />
      </Modal>

      <ConfirmDialog
        open={closing !== null}
        onOpenChange={(open) => {
          if (!open) setClosing(null)
        }}
        title={closing ? CLOSE_COPY[closing].title : ""}
        description={closing ? CLOSE_COPY[closing].description : ""}
        confirmLabel={closing ? CLOSE_COPY[closing].confirmLabel : "Confirm"}
        tone={closing && CLOSE_COPY[closing].danger ? "danger" : "default"}
        reason={{ label: "Reason (the resident reads this)", required: closing ? CLOSE_COPY[closing].required : true }}
        onConfirm={(reason) => (closing ? confirmClose(closing, reason) : Promise.resolve({ error: null }))}
      />

      {money && (
        <MoneyActModal
          act={money}
          violation={violation}
          schedule={schedule}
          onClose={() => setMoney(null)}
          onDone={() => {
            setMoney(null)
            timeline.refetch()
            notices.refetch()
            onChanged()
          }}
        />
      )}
    </>
  )
}

const MONEY_TITLE: Record<MoneyAct["kind"], string> = {
  paid: "Mark this fine paid?",
  waived: "Waive this fine?",
  remind: "Send a reminder?",
  fine: "Issue a fine",
}

/**
 * The confirm for every money act on a case.
 *
 * One component, because the four differ only in what they say and which
 * mutation they call; four copies of the busy / error / refetch handling is
 * where they would drift. The fine branch carries the retired
 * `violations-screen.tsx` ActionSheet's amount rule: the bylaw schedule is the
 * default, and a fine the schedule does not price — or priced differently —
 * must say why.
 */
function MoneyActModal({
  act, violation, schedule, onClose, onDone,
}: {
  act: MoneyAct
  violation: Violation
  schedule: FineSchedule | null
  onClose: () => void
  onDone: () => void
}) {
  const degree = act.kind === "fine" ? act.degree : "fine_1"
  /** What the bylaw says this degree costs, in cents, or null when unset. */
  const bylawCents = scheduledCents(schedule, degree)

  const [note, setNote] = useState("")
  const [amount, setAmount] = useState(bylawCents !== null ? formatCentsForInput(bylawCents) : "")
  // Today + 30, the same default the strata portal's fine confirm starts with.
  const [dueOn, setDueOn] = useState(() => (act.kind === "fine" ? defaultFineDueOn() : ""))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = act.kind === "fine" ? parseAmountToCents(amount) : null
  const enteredCents = typeof parsed === "number" ? parsed : null
  const noSchedule = act.kind === "fine" && bylawCents === null
  const deviates = act.kind === "fine" && bylawCents !== null && enteredCents !== null && enteredCents !== bylawCents
  // The only place a note is compulsory: a fine nobody's bylaw prices, or one
  // priced differently from it, is a decision the record has to explain.
  const noteRequired = act.kind === "fine" && fineNoteRequired(bylawCents, enteredCents)

  async function submit() {
    setError(null)
    if (act.kind === "fine") {
      if (enteredCents === null) return setError("Enter an amount like 250 or 1,000.")
      if (noteRequired && !note.trim()) return setError("Say what this amount is based on.")
    }
    setBusy(true)
    let err: string | null = null
    let success = ""
    if (act.kind === "paid" || act.kind === "waived") {
      const r = await setFineStatus(act.fine.id, act.kind, note)
      err = r.error
      const what = act.kind === "paid" ? "Fine recorded as paid" : "Fine waived"
      success = r.notified ? `${what} and the resident notified.` : `${what}. No resident is assigned, so nobody was notified.`
    } else if (act.kind === "remind") {
      const r = await remindAboutFine(violation.id, note)
      err = r.error
      success = r.amountCents !== undefined ? `Reminder sent — ${fromCents(r.amountCents)} outstanding.` : "Reminder sent."
    } else {
      const r = await issueFine(violation.id, degree, {
        // Left off when the manager kept the bylaw figure, so the DATABASE
        // applies the schedule rather than the client echoing it back.
        amountCents: enteredCents !== null && enteredCents !== bylawCents ? enteredCents : undefined,
        dueOn: dueOn || undefined,
        note: note.trim() || undefined,
      })
      err = r.error
      const sum = r.amountCents !== undefined ? `${fromCents(r.amountCents)} ` : ""
      success = r.notified
        ? `${sum}fine issued and the resident notified.`
        : `${sum}fine issued. No resident is assigned, so nobody was notified.`
    }
    setBusy(false)
    if (err) return setError(err)
    toast.success(success)
    onDone()
  }

  const confirmLabel =
    act.kind === "paid" ? "Mark paid" : act.kind === "waived" ? "Waive fine" : act.kind === "remind" ? "Send reminder" : "Issue fine"

  return (
    <Modal
      open
      onClose={onClose}
      title={MONEY_TITLE[act.kind]}
      description={`${violation.pet || "This case"} · ${violation.resident || "Resident"} · Unit ${violation.unit || "—"}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={act.kind === "fine" ? "danger" : "primary"} busy={busy} onClick={() => void submit()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {(act.kind === "paid" || act.kind === "waived") && (
          <p className="text-[13px] leading-relaxed text-foreground">
            {act.kind === "paid" ? (
              <>
                Record the <span className="font-semibold">{fromCents(act.fine.amountCents)}</span> fine as paid. This
                records money you have already received outside Pet10x — nothing is charged.
              </>
            ) : (
              <>
                Waive the <span className="font-semibold">{fromCents(act.fine.amountCents)}</span> fine. The resident will
                owe nothing on it.
              </>
            )}{" "}
            The resident is told, and a settled fine can&apos;t be reopened.
          </p>
        )}
        {act.kind === "remind" && (
          <p className="text-[13px] leading-relaxed text-foreground">
            The resident is reminded of everything still owed on this case ({fromDollars(violation.outstanding)}). One
            reminder per case per day.
          </p>
        )}
        {act.kind === "fine" && (
          <>
            {noSchedule ? (
              <p className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-[12px] leading-relaxed text-foreground">
                <span className="font-semibold">This building has no fine schedule.</span> Nothing in its bylaws says what a{" "}
                {degree === "fine_1" ? "first" : "second"} fine should cost, so the amount below is yours. Say what it is
                based on — the note is kept with the case.
              </p>
            ) : (
              <p className="rounded-xl bg-primary/5 p-3 text-[12px] leading-relaxed text-foreground">
                <span className="font-semibold">
                  Bylaw schedule: ${formatCentsForInput(bylawCents)} {schedule?.currency}
                </span>{" "}
                for a {degree === "fine_1" ? "first" : "second"} fine. Leave it and the schedule is applied; change it and
                you are recording a deliberate deviation.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount" required hint={deviates ? "Differs from the bylaw schedule — explain below." : "Dollars, e.g. 250 or 1,000"}>
                {(p) => <TextInput {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
              </Field>
              <Field label="Due by">
                {(p) => <TextInput {...p} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />}
              </Field>
            </div>
          </>
        )}
        <Field
          label={act.kind === "fine" ? "Note" : "Note (optional)"}
          required={act.kind === "fine" && noteRequired}
          hint="The resident reads this exactly as written."
        >
          {(p) => <TextArea {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {error && <p className="text-[12.5px] font-medium text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}

/**
 * The degree picker. Shared by the new-case wizard and the case view so the two
 * cannot drift about what may be issued.
 */
function NoticeForm({
  violationId, stage, onIssued,
}: {
  violationId: string
  stage: string
  onIssued: () => void
}) {
  const kinds = useNoticeKinds()
  const [kind, setKind] = useState("warning")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [amount, setAmount] = useState("")
  const [dueOn, setDueOn] = useState("")
  const [visible, setVisible] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chosen = kinds.data.find((k) => k.code === kind)

  return (
    <div className="flex flex-col gap-3">
      <fieldset>
        <legend className="mb-1.5 text-[12px] font-semibold text-foreground">What are you issuing?</legend>
        <div className="flex flex-col gap-1.5">
          {kinds.data.map((k) => (
            <label
              key={k.code}
              className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${
                kind === k.code ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="notice-kind"
                value={k.code}
                checked={kind === k.code}
                onChange={() => {
                  setKind(k.code)
                  setVisible(k.defaultVisible)
                  setError(null)
                }}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-foreground">
                  {k.label}
                  {k.movesCase && <Pill tone="warn">Moves the case</Pill>}
                  {k.createsFine && <Pill tone="bad">Levies money</Pill>}
                </span>
                {k.description && <span className="block text-[12px] text-muted-foreground">{k.description}</span>}
                {k.code === "fine" && stage === "open" && (
                  <span className="mt-1 block text-[11.5px] text-warning-strong">
                    This case has no warning yet. Unless your building allows a direct fine, this will be refused.
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Heading" hint="Left blank, the notice uses the type's own name.">
        {(p) => <TextInput {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={chosen?.label ?? ""} />}
      </Field>

      <Field label="What it says" required={chosen?.requiresBody} hint="The resident reads this exactly as written.">
        {(p) => <TextArea {...p} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>

      {chosen?.requiresAmount && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount" required hint="Dollars, e.g. 250 or 1,000">
            {(p) => <TextInput {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
          </Field>
          <Field label="Due by">
            {(p) => <TextInput {...p} type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />}
          </Field>
        </div>
      )}

      <label className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-[12.5px]">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="mt-0.5" />
        <span>
          <span className="font-semibold text-foreground">The resident can see this</span>
          <span className="block text-muted-foreground">
            Untick to keep it on the file without sending it.
          </span>
        </span>
      </label>

      {error && <p className="text-[12.5px] font-medium text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button
          busy={busy}
          onClick={async () => {
            setError(null)
            let cents: number | null = null
            if (chosen?.requiresAmount) {
              const parsed = parseAmountToCents(amount)
              if (parsed === null || parsed === "invalid") {
                setError("Enter an amount like 250 or 1,000.")
                return
              }
              cents = parsed
            }
            setBusy(true)
            const res = await issueNotice({
              violationId,
              kind,
              title: title || undefined,
              body: body || undefined,
              amountCents: cents,
              dueOn: dueOn || null,
              visibleToResident: visible,
            })
            setBusy(false)
            if (res.error) setError(res.error)
            else onIssued()
          }}
        >
          Issue {chosen?.label ?? "notice"}
        </Button>
      </div>
    </div>
  )
}

function ClosedTable({
  resolved,
  nameOf,
}: {
  resolved: ReturnType<typeof useResolvedViolationsLive>
  /** A row's building name; set only when the Building column should show. */
  nameOf: ((row: ReturnType<typeof useResolvedViolationsLive>["data"][number]) => string | null) | null
}) {
  type Row = (typeof resolved.data)[number]
  const columns: Column<Row>[] = [
    { key: "type", header: "Case", sortValue: (r) => r.type, render: (r) => <span className="font-semibold text-foreground">{r.type}</span> },
    { key: "unit", header: "Unit", sortValue: (r) => r.unit, width: "w-20", render: (r) => <span className="tabular-nums text-muted-foreground">{r.unit || "—"}</span> },
    {
      key: "outcome", header: "Outcome", sortValue: (r) => closedCaseLabel(r.stage).label,
      // The pill is the STAGE; the manager's reason sits under it, clamped to
      // two lines with the whole text on hover. Reading the tone off the reason
      // (`includes("dismiss")`) stopped working once the reason became free text.
      render: (r) => {
        const { label, tone } = closedCaseLabel(r.stage)
        return (
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <Pill tone={tone}>{label}</Pill>
            {r.outcome && (
              <span title={r.outcome} className="line-clamp-2 text-[12px] text-muted-foreground">{r.outcome}</span>
            )}
          </span>
        )
      },
    },
    { key: "resolved", header: "Closed", sortValue: (r) => r.resolved, secondary: true, render: (r) => <span className="text-muted-foreground">{r.resolved}</span> },
    ...(nameOf ? [buildingColumn<Row>(nameOf)] : []),
  ]
  if (resolved.isLoading) return <Spinner label="Loading closed cases" />
  if (resolved.error) return <LoadError message={resolved.error} onRetry={resolved.refetch} />
  return (
    <DataTable
      rows={resolved.data}
      columns={columns}
      getRowId={(r) => r.id}
      caption="Closed bylaw cases"
      initialSort={{ key: "resolved", dir: "desc" }}
      empty={<EmptyState title="Nothing closed yet" detail="Cases you resolve or dismiss are kept here." />}
    />
  )
}

/**
 * A case as a vertical stream. Ordered by real timestamps, so "was the fine
 * issued before or after they appealed?" is answerable at a glance — which is
 * the first question anyone asks about a contested case.
 */
function Timeline({ events }: { events: CaseEvent[] }) {
  const dot: Record<CaseEvent["tone"], string> = {
    neutral: "bg-muted-foreground",
    warn: "bg-warning",
    bad: "bg-destructive",
    good: "bg-success",
    info: "bg-info",
  }
  return (
    <ol className="relative flex flex-col gap-4 pl-5">
      <span className="absolute bottom-2 left-[5px] top-2 w-px bg-border" aria-hidden="true" />
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={`absolute -left-[15px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-card ${dot[e.tone]}`}
            aria-hidden="true"
          />
          <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-foreground">
            {e.title}
            {e.amountCents !== null && <Pill tone="bad">{fromCents(e.amountCents)}</Pill>}
          </p>
          <p className="text-[11.5px] tabular-nums text-muted-foreground">{stampOf(e.at)}</p>
          {e.detail && (
            <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted-foreground">{e.detail}</p>
          )}
        </li>
      ))}
    </ol>
  )
}

/**
 * Deciding an appeal.
 *
 * This is the ONLY legal move on a case while an appeal is open — the ladder
 * refuses every other transition with `dispute_open`, which is the
 * procedural-fairness rule the whole thing exists to enforce: a resident who
 * contested a warning and was fined before anyone read the appeal was not
 * heard. So the panel is the loudest thing on the case, and the other buttons
 * stand down until it is answered.
 *
 * The two outcomes do genuinely different things, and the copy says so rather
 * than making the manager remember:
 *   upheld     — the notice stands, disputed fines go back to owed
 *   overturned — the case is dismissed and its fines are waived
 */
function AppealPanel({
  violation, onChoose,
}: {
  violation: Violation
  /**
   * Opens the confirm, which asks for the reason and makes the call. The
   * buttons carry no busy state: the case modal (and this panel with it) is
   * hidden while the confirm is up, so they are never visible mid-call.
   */
  onChoose: (outcome: "upheld" | "overturned") => void
}) {
  const filed = violation.openDispute?.filedAt
  return (
    <div className="rounded-xl border-2 border-info/40 bg-info/5 p-4">
      <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-info">
        <Gavel className="h-4 w-4" aria-hidden="true" />
        The resident has appealed
        <Pill tone="info">Awaiting your decision</Pill>
      </p>
      {filed && <p className="mt-0.5 text-[11.5px] tabular-nums text-muted-foreground">Filed {stampOf(filed)}</p>}

      <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-info/40 pl-3 text-[13px] leading-relaxed text-foreground">
        {violation.openDispute?.reason || "No reason given."}
      </blockquote>

      <p className="mt-3 text-[12px] text-muted-foreground">
        Nothing else can happen on this case until you answer — the ladder refuses every other move, and no
        fine reminder is sent. You give your reasoning in the next step; the resident reads it exactly as written.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChoose("upheld")}
          className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-left transition-colors hover:bg-warning/15"
        >
          <span className="block text-[13.5px] font-semibold text-warning-strong">
            Uphold
          </span>
          <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
            The appeal fails. The case stays where it is and any disputed fine goes back to owed.
          </span>
        </button>
        <button
          type="button"
          onClick={() => onChoose("overturned")}
          className="rounded-xl border border-success/50 bg-success/10 p-3 text-left transition-colors hover:bg-success/15"
        >
          <span className="block text-[13.5px] font-semibold text-success-strong">
            Overturn
          </span>
          <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
            The appeal succeeds. The case is dismissed and its fines are waived.
          </span>
        </button>
      </div>
    </div>
  )
}
