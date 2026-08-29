"use client"

import { useEffect, useMemo, useState } from "react"
import { Plus, Search, FileWarning, Gavel, Download } from "lucide-react"
import {
  useViolationsLive, useResolvedViolationsLive, useViolationSubjects,
  openViolation, fetchCaseLedger, resolveViolation, dismissViolation, resolveDispute,
  type ViolationSubject,
} from "@/lib/data/manager-queues"
import { useIncidents, setIncidentStatus, escalateIncident } from "@/lib/data/incidents"
import { useNoticeKinds, useViolationNotices, issueNotice } from "@/lib/data/clinic/notices"
import { useCaseTimeline, stampOf, type CaseEvent } from "@/lib/data/case-timeline"
import { parseAmountToCents } from "@/lib/data/fine-schedule"
import type { Violation } from "@/lib/data/types"
import { toCsv, downloadCsv } from "@/lib/csv"
import { DataTable, type Column } from "@/components/screens/shared/data-table"
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
  const active = useViolationsLive()
  const resolved = useResolvedViolationsLive()
  const incidents = useIncidents()
  const [logOpen, setLogOpen] = useState(false)
  const [selected, setSelected] = useState<Violation | null>(null)

  const rows = active.data
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
          <span className={v.outstanding > 0 ? "font-semibold text-destructive" : "text-success"}>
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
  ]

  const counts = {
    all: rows.length,
    outstanding: rows.filter((v) => v.outstanding > 0).length,
    disputed: rows.filter((v) => v.openDispute).length,
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 px-4 pb-8 pt-4">
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
              if (res.error) return window.alert(res.error)
              const rows = (res.rows ?? []) as unknown as Record<string, unknown>[]
              const cols = Object.keys(rows[0] ?? {}).map((k) => ({ key: k, label: k }))
              if (cols.length === 0) return window.alert("Nothing to export yet.")
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
        <IncidentsTable incidents={incidents} onEscalated={() => { incidents.refetch(); active.refetch() }} />
      ) : tab === "resolved" ? (
        <ClosedTable resolved={resolved} />
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
        violation={selected}
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
}: {
  incidents: ReturnType<typeof useIncidents>
  onEscalated: () => void
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
                  window.alert("Identify the pet on this report before escalating it — a case needs a subject.")
                  return
                }
                setBusy(i.id)
                const res = await escalateIncident(i.id)
                setBusy(null)
                if (res.error) window.alert(res.error)
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
  open, onClose, onLogged,
}: {
  open: boolean
  onClose: () => void
  onLogged: (id: string) => void
}) {
  const subjects = useViolationSubjects()
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
                done ? "bg-success text-white" : on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
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

function CaseModal({
  violation, onClose, onChanged,
}: {
  violation: Violation | null
  onClose: () => void
  onChanged: () => void
}) {
  const notices = useViolationNotices(violation?.id ?? null)
  const timeline = useCaseTimeline(violation?.id ?? null)
  const [issuing, setIssuing] = useState(false)
  const [busy, setBusy] = useState(false)
  const openedId = violation?.id ?? null

  // Re-read the case list when a case is opened. The modal renders from a row
  // captured when the table loaded, and a case that moved since then would
  // otherwise offer actions the database will refuse.
  useEffect(() => {
    if (openedId) onChanged()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedId])

  if (!violation) return null

  return (
    <>
      <Modal
        open={violation !== null && !issuing}
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
              <Button variant="ghost" busy={busy}
                onClick={async () => {
                  setBusy(true)
                  const res = await dismissViolation(violation.id, "Dismissed by manager")
                  setBusy(false)
                  if (res.error) window.alert(res.error)
                  else { onChanged(); onClose() }
                }}>Dismiss</Button>
              <Button variant="secondary" busy={busy}
                onClick={async () => {
                  setBusy(true)
                  const res = await resolveViolation(violation.id, "Resolved by manager")
                  setBusy(false)
                  if (res.error) window.alert(res.error)
                  else { onChanged(); onClose() }
                }}>Mark resolved</Button>
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
            <AppealPanel
              violation={violation}
              onDecided={() => {
                timeline.refetch()
                notices.refetch()
                onChanged()
                onClose()
              }}
              onStale={(why) => {
                onChanged()
                onClose()
                window.setTimeout(() => window.alert(why), 0)
              }}
            />
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
    </>
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

function ClosedTable({ resolved }: { resolved: ReturnType<typeof useResolvedViolationsLive> }) {
  type Row = (typeof resolved.data)[number]
  const columns: Column<Row>[] = [
    { key: "type", header: "Case", sortValue: (r) => r.type, render: (r) => <span className="font-semibold text-foreground">{r.type}</span> },
    { key: "unit", header: "Unit", sortValue: (r) => r.unit, width: "w-20", render: (r) => <span className="tabular-nums text-muted-foreground">{r.unit || "—"}</span> },
    { key: "outcome", header: "Outcome", sortValue: (r) => r.outcome, render: (r) => <Pill tone={r.outcome?.toLowerCase().includes("dismiss") ? "neutral" : "good"}>{r.outcome || "Closed"}</Pill> },
    { key: "resolved", header: "Closed", sortValue: (r) => r.resolved, secondary: true, render: (r) => <span className="text-muted-foreground">{r.resolved}</span> },
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
  violation, onDecided, onStale,
}: {
  violation: Violation
  onDecided: () => void
  /** The case moved under us — reload rather than arguing with the server. */
  onStale: (why: string) => void
}) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<"upheld" | "overturned" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function decide(outcome: "upheld" | "overturned") {
    setBusy(outcome)
    setError(null)
    const res = await resolveDispute(violation.id, outcome, note)
    setBusy(null)
    if (!res.error) return onDecided()
    // These three all mean the same thing: this screen is looking at an older
    // version of the case than the database is. A red message on a dead panel
    // is the wrong answer — reload and say why.
    if (/no appeal waiting|already been recorded|no_open_dispute|dispute_open|not a move/i.test(res.error)) {
      onStale(
        "This case has already moved — the appeal was decided somewhere else, or in another tab. Reloaded.",
      )
      return
    }
    setError(res.error)
  }

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
        fine reminder is sent.
      </p>

      <div className="mt-3">
        <Field label="Your reasoning" hint="The resident reads this exactly as written.">
          {(p) => (
            <TextArea
              {...p}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="We reviewed the photographs and the report from 12 August…"
            />
          )}
        </Field>
      </div>

      {error && <p className="mt-2 text-[12.5px] font-medium text-destructive">{error}</p>}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("upheld")}
          className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-left transition-colors hover:bg-warning/15 disabled:opacity-50"
        >
          <span className="block text-[13.5px] font-semibold text-warning-strong">
            {busy === "upheld" ? "Upholding…" : "Uphold the notice"}
          </span>
          <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
            The appeal fails. The case stays where it is and any disputed fine goes back to owed.
          </span>
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void decide("overturned")}
          className="rounded-xl border border-success/50 bg-success/10 p-3 text-left transition-colors hover:bg-success/15 disabled:opacity-50"
        >
          <span className="block text-[13.5px] font-semibold text-success">
            {busy === "overturned" ? "Overturning…" : "Find for the resident"}
          </span>
          <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
            The appeal succeeds. The case is dismissed and its fines are waived.
          </span>
        </button>
      </div>
    </div>
  )
}
