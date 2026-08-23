"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  useBuildingPets,
  useBuildingResidents,
  approveResidentLink,
  denyResidentLink,
  removeResident,
  useViolations,
  useResolvedViolations,
} from "@/lib/data"
import { advanceViolation, resolveDispute, resolveViolation } from "@/lib/data/manager-queues"
// Phase 6: moved to a pure, tested module. See `lib/data/fine-schedule.ts`.
import { readFineSchedule } from "@/lib/data/fine-schedule"
import { STAGE_LABEL, controlsForCase, isFineStage, nextStage } from "@/lib/data/violations"
import { shortDate } from "@/lib/dates"
import type { ViolationStage } from "@/lib/data/types"
import {
  useEmergencyTokens,
  issueEmergencyToken,
  revokeEmergencyToken,
} from "@/lib/data/manager"
import { useComplianceInputs } from "@/lib/data/portfolio"
import { useStrata } from "./portal-context"
import { WorkQueueScreen } from "./queue-screen"
import { BuildingBylawsEditor } from "./bylaws-editor"
import { StatTile, SectionCard, Spinner, EmptyState } from "./strata-ui"
import {
  ArrowLeft,
  Inbox,
  Users,
  Gavel,
  Scale,
  QrCode,
  Check,
  X,
  UserMinus,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Copy,
  Ban,
  Plus,
} from "lucide-react"

const DETAIL_TABS = [
  { id: "work", label: "Work", icon: Inbox },
  { id: "residents", label: "Residents", icon: Users },
  { id: "violations", label: "Violations", icon: Gavel },
  { id: "bylaws", label: "Bylaws", icon: Scale },
  { id: "emergency", label: "Emergency", icon: QrCode },
] as const

export function BuildingDetail({ buildingId, onBack }: { buildingId: string; onBack: () => void }) {
  const { buildings } = useStrata()
  const building = buildings.find((b) => b.id === buildingId)
  const { data: pets } = useBuildingPets()
  const [tab, setTab] = useState<(typeof DETAIL_TABS)[number]["id"]>("work")

  const scopedPets = pets.filter((p) => p.buildingId === buildingId)
  const compliance = scopedPets.length
    ? Math.round(scopedPets.reduce((s, p) => s + p.compliancePct, 0) / scopedPets.length)
    : 100

  if (!building) {
    return (
      <div className="space-y-4">
        <BackBtn onBack={onBack} />
        <EmptyState icon={<Ban className="h-8 w-8" />} title="Building not found" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <BackBtn onBack={onBack} />

      <div>
        <h2 className="text-[20px] font-bold tracking-tight text-foreground">{building.name}</h2>
        <p className="text-[12.5px] text-muted-foreground">
          {building.code}
          {building.city ? ` · ${building.city}` : ""}
          {building.region ? `, ${building.region}` : ""}
          {building.totalUnits ? ` · ${building.totalUnits} units` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Compliance"
          value={`${compliance}%`}
          tone={compliance < 75 ? "destructive" : compliance < 90 ? "warning" : "success"}
        />
        <StatTile label="Pets" value={scopedPets.length} />
        <StatTile label="Non-compliant" value={scopedPets.filter((p) => p.compliancePct < 100).length} />
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
        {DETAIL_TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                active ? "bg-card text-info shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === "work" && <WorkQueueScreen scopeOverride={buildingId} />}
      {tab === "residents" && <ResidentsPanel buildingId={buildingId} />}
      {tab === "violations" && <ViolationsPanel buildingId={buildingId} />}
      {tab === "bylaws" && <BylawsPanel buildingId={buildingId} />}
      {tab === "emergency" && <EmergencyPanel buildingId={buildingId} />}
    </div>
  )
}

function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> All buildings
    </button>
  )
}

/* ------------------------------- Residents ------------------------------- */

function ResidentsPanel({ buildingId }: { buildingId: string }) {
  const { data, isLoading, refetch } = useBuildingResidents()
  const [busy, setBusy] = useState<string | null>(null)
  const scoped = data.filter((r) => r.buildingId === buildingId)
  const pending = scoped.filter((r) => r.status === "pending")
  const members = scoped.filter((r) => r.status === "approved")

  async function act(linkId: string, fn: (id: string) => Promise<{ error: string | null }>, label: string) {
    setBusy(linkId)
    const { error } = await fn(linkId)
    setBusy(null)
    if (error) return toast.error(`${label} failed`, { description: error })
    toast.success(label)
    refetch()
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <SectionCard title={`Pending requests (${pending.length})`}>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.linkId} className="flex items-center gap-3 rounded-lg card-raised p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">{r.residentName}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{r.residentEmail ?? "—"}</p>
                </div>
                <button
                  onClick={() => act(r.linkId, approveResidentLink, "Approved")}
                  disabled={busy === r.linkId}
                  className="flex items-center gap-1 rounded-lg bg-success/15 px-3 py-1.5 text-[12px] font-semibold text-success disabled:opacity-50"
                >
                  {busy === r.linkId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Approve
                </button>
                <button
                  onClick={() => act(r.linkId, denyResidentLink, "Denied")}
                  disabled={busy === r.linkId}
                  className="flex items-center gap-1 rounded-lg bg-destructive/10 px-3 py-1.5 text-[12px] font-semibold text-destructive disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Deny
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title={`Members (${members.length})`}>
        {members.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">No approved residents yet.</p>
        ) : (
          <div className="space-y-2">
            {members.map((r) => (
              <div key={r.linkId} className="flex items-center gap-3 rounded-lg card-raised p-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-info/15 text-[13px] font-semibold text-info">
                  {r.residentName.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">{r.residentName}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {r.unit ? `Unit ${r.unit} · ` : ""}
                    {r.residentEmail ?? "—"}
                  </p>
                </div>
                <button
                  onClick={() => act(r.linkId, removeResident, "Resident removed")}
                  disabled={busy === r.linkId}
                  title="Remove from building"
                  className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground disabled:opacity-50"
                >
                  {busy === r.linkId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

/* ------------------------------- Violations ------------------------------ */

/*
 * The ladder and its labels come from `lib/data/violations` now. This panel
 * used to carry its own copy — a five-rung LADDER, an app→DB spelling map and a
 * label map — all three of which still named the pre-Phase-2 stages. The
 * spelling map is what silently disabled the button: `nextStage("open")` looked
 * up a key that no longer existed, returned null, and the Advance control
 * simply stopped rendering rather than erroring.
 *
 * AND THE APPEAL. Phase 5 taught `manager_advance_violation` to refuse every
 * stage move on a case with an open dispute, taught the MANAGER's Violations
 * screen about it, and stopped there. This panel calls the same two mutations
 * and went on rendering Advance and Resolve on a disputed case: two buttons the
 * database refuses, over an error sentence that pointed at a Disputed tab this
 * portal does not have, with no way to decide the appeal at all. Case
 * 35000000-…0007 carries exactly that dispute on live data and is reachable
 * from here.
 *
 * The fix is not another `if` in this file. `controlsForCase` states the rule
 * once — a case under appeal has exactly one legal next action — and BOTH
 * surfaces ask it. What is local to this file is only the wording and the
 * layout, which is what should be local to a screen.
 */

function ViolationsPanel({ buildingId }: { buildingId: string }) {
  const { data: open, isLoading, refetch } = useViolations()
  const { data: resolved, refetch: refetchResolved } = useResolvedViolations()
  const { buildings } = useStrata()
  const [busy, setBusy] = useState<string | null>(null)
  /** The case whose fine amount is being asked for, and the figure so far. */
  const [asking, setAsking] = useState<string | null>(null)
  const [amount, setAmount] = useState("")
  /** The appeal being decided, and the note the strata is writing on it. */
  const [deciding, setDeciding] = useState<{ id: string; upheld: boolean } | null>(null)
  const [decisionNote, setDecisionNote] = useState("")

  const scopedOpen = open.filter((v) => v.buildingId === buildingId)
  const scopedResolved = resolved.filter((v) => v.buildingId === buildingId)

  /*
   * What the building's bylaws price a fine at (AD-5), or nothing.
   *
   * Measured 2026-08-23: 0 of 6 buildings carry `fine_1_cents`/`fine_2_cents`
   * in `pet_rules`, and three of the thirteen live violations sit at `warning`.
   * So this button's next step was `warning -> fine_1` with no amount, which
   * `manager_advance_violation` refuses with `no_fine_amount` — three
   * guaranteed-failing buttons. It now asks for the amount when the bylaws do
   * not supply one, and only then advances.
   */
  const schedule = readFineSchedule(buildings.find((b) => b.id === buildingId)?.rules)

  function bylawCentsFor(stage: ViolationStage): number | null {
    const next = nextStage(stage)
    if (!next || !isFineStage(next)) return null
    return next === "fine_1" ? schedule.fine_1 : schedule.fine_2
  }

  /** True when advancing this case mints a fine the bylaws do not price. */
  function needsAmount(stage: ViolationStage): boolean {
    const next = nextStage(stage)
    return !!next && isFineStage(next) && bylawCentsFor(stage) === null
  }

  async function advance(id: string, stage: ViolationStage, amountCents?: number) {
    const next = nextStage(stage)
    if (!next) return
    setBusy(id)
    // With a bylaw schedule, no amount is passed and the DATABASE applies the
    // schedule (AD-5) rather than the client echoing a figure back at it.
    const { error, notified } = await advanceViolation(id, next, { amountCents })
    setBusy(null)
    if (error) return toast.error("Couldn't advance", { description: error })
    setAsking(null)
    setAmount("")
    toast.success(`Advanced to ${STAGE_LABEL[next]}`, {
      description: notified ? undefined : "No resident is assigned, so nobody was notified.",
    })
    refetch()
  }

  function startAdvance(id: string, stage: ViolationStage) {
    if (needsAmount(stage)) {
      setAmount("")
      setAsking(asking === id ? null : id)
      return
    }
    void advance(id, stage)
  }

  async function resolve(id: string) {
    setBusy(id)
    const { error, notified } = await resolveViolation(id, "Remedied — closed by manager")
    setBusy(null)
    if (error) return toast.error("Couldn't resolve", { description: error })
    // `notified` was dropped here while `advance` two functions up surfaced it,
    // so resolving an unassigned case implied a letter had gone out.
    toast.success("Violation resolved", {
      description: notified ? undefined : "No resident is assigned, so nobody was notified.",
    })
    refetch()
    refetchResolved()
  }

  /**
   * Decide the appeal — the action that was missing from this portal entirely.
   *
   * `manager_resolve_dispute` authorises on `manages_building(...) or
   * is_admin()`, the SAME check `manager_advance_violation` applies, so every
   * principal who could reach the Advance button on this screen can also decide
   * the appeal. There was never an authorisation reason for the gap; the RPC
   * was simply never called from here.
   *
   * Upholding leaves the case where it is and makes the money payable again;
   * overturning dismisses the case, so it leaves the open list. Both refetches
   * run, because either outcome changes which list the case belongs on.
   */
  async function decide(id: string, upheld: boolean) {
    setBusy(id)
    const r = await resolveDispute(id, upheld ? "upheld" : "overturned", decisionNote.trim() || undefined)
    setBusy(null)
    if (r.error) return toast.error("Couldn't decide the appeal", { description: r.error })
    setDeciding(null)
    setDecisionNote("")
    // Whole clauses, assembled — the same sentences the manager's Violations
    // screen reports, because it is the same decision.
    const n = r.finesSettled ?? 0
    const fineClause =
      n === 0
        ? "No fine was attached to it."
        : upheld
          ? `${n} fine${n === 1 ? " is" : "s are"} payable again.`
          : `${n} fine${n === 1 ? " was" : "s were"} waived.`
    toast.success(upheld ? "Appeal upheld" : "Appeal overturned", {
      description: `${fineClause}${r.notified ? "" : " No resident is assigned, so nobody was notified."}`,
    })
    refetch()
    refetchResolved()
  }

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-4">
      <SectionCard title={`Open violations (${scopedOpen.length})`}>
        {scopedOpen.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">No open violations.</p>
        ) : (
          <div className="space-y-2">
            {scopedOpen.map((v) => {
              // ONE question, asked of the module both surfaces share: what may
              // this case be offered? A case under appeal answers
              // "decide-appeal" and the ladder controls do not render at all.
              const controls = controlsForCase(v.stage, v.openDispute !== null)
              const next = controls.kind === "ladder" ? controls.next : null
              return (
                <div key={v.id} className="rounded-lg card-raised p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold capitalize text-foreground">{v.type}</p>
                      <p className="text-[12px] text-muted-foreground">
                        Unit {v.unit} · {v.resident} · {v.date}
                      </p>
                    </div>
                    <span className="whitespace-nowrap rounded-md bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                      {v.stageLabel}
                    </span>
                  </div>
                  {v.amount > 0 && (
                    <p className="mt-1 text-[12px] font-medium text-foreground">
                      {/*
                        `!paid` is not "unpaid": `fine_status` has seven labels
                        and a waived fine satisfies neither. `outstanding` is
                        the status-aware figure from `summariseFines`, so a fine
                        that was waived reads "settled" here rather than
                        chasing money nobody owes.
                      */}
                      Fine ${v.amount.toFixed(2)} ·{" "}
                      {v.outstanding === 0
                        ? v.paid
                          ? "paid"
                          : "settled"
                        : v.disputed > 0
                          ? `$${v.outstanding.toFixed(2)} disputed`
                          : `$${v.outstanding.toFixed(2)} unpaid`}
                    </p>
                  )}
                  {/*
                    The resident's own words, IN FULL, before any decision is
                    offered. A strata deciding an appeal it cannot read is not
                    deciding it, and this is the document a tribunal reads
                    first. `whitespace-pre-wrap` because the resident may have
                    written paragraphs and collapsing them changes what they
                    said.
                  */}
                  {v.openDispute && (
                    <div className="mt-2 rounded-lg border border-warning/40 bg-warning/5 p-2.5">
                      <p className="text-[11px] font-semibold text-warning">
                        {`Appeal against the ${STAGE_LABEL[v.openDispute.stage].toLowerCase()} stage, filed ${shortDate(
                          v.openDispute.filedAt,
                          "an unknown date",
                        )}`}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
                        {v.openDispute.reason}
                      </p>
                    </div>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {controls.kind === "decide-appeal" ? (
                      <>
                        <button
                          onClick={() => {
                            setDecisionNote("")
                            setDeciding(
                              deciding?.id === v.id && deciding.upheld ? null : { id: v.id, upheld: true },
                            )
                          }}
                          disabled={busy === v.id}
                          className="flex items-center gap-1 rounded-lg bg-warning/15 px-2.5 py-1.5 text-[12px] font-semibold text-warning disabled:opacity-50"
                        >
                          <Gavel className="h-3.5 w-3.5" /> Uphold the finding
                        </button>
                        <button
                          onClick={() => {
                            setDecisionNote("")
                            setDeciding(
                              deciding?.id === v.id && !deciding.upheld ? null : { id: v.id, upheld: false },
                            )
                          }}
                          disabled={busy === v.id}
                          className="flex items-center gap-1 rounded-lg bg-success/15 px-2.5 py-1.5 text-[12px] font-semibold text-success disabled:opacity-50"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" /> Overturn it
                        </button>
                      </>
                    ) : (
                      <>
                        {next && (
                          <button
                            onClick={() => startAdvance(v.id, v.stage)}
                            disabled={busy === v.id}
                            className="flex items-center gap-1 rounded-lg bg-info/15 px-2.5 py-1.5 text-[12px] font-semibold text-info disabled:opacity-50"
                          >
                            {busy === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                            Advance to {STAGE_LABEL[next]}
                          </button>
                        )}
                        {controls.moves.includes("resolved") && (
                          <button
                            onClick={() => resolve(v.id)}
                            disabled={busy === v.id}
                            className="flex items-center gap-1 rounded-lg bg-success/15 px-2.5 py-1.5 text-[12px] font-semibold text-success disabled:opacity-50"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" /> Resolve
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {/*
                    The consequence, with the real number, BEFORE the press —
                    and the note, which the resident reads. Inline rather than
                    in a sheet because this panel has no sheet machinery and
                    borrowing the manager screen's would mean lifting a whole
                    modal for two buttons; the wording is the part that has to
                    match, and it does.
                  */}
                  {deciding?.id === v.id && v.openDispute && (
                    <div
                      className={`mt-2 rounded-lg border p-2.5 ${
                        deciding.upheld ? "border-warning/40 bg-warning/5" : "border-success/40 bg-success/5"
                      }`}
                    >
                      <p className="text-[11.5px] leading-relaxed text-foreground">
                        <span className="font-semibold">
                          {deciding.upheld
                            ? `The case stays at ${v.stageLabel.toLowerCase()}`
                            : "The case is dismissed and closed"}
                        </span>
                        {v.disputed > 0
                          ? deciding.upheld
                            ? `, and the $${v.disputed.toFixed(2)} under appeal becomes payable again — reminders resume.`
                            : `, and the $${v.disputed.toFixed(2)} under appeal is waived.`
                          : ". No fine is attached, so no money changes."}
                        {" The resident is notified either way. "}
                        <span className="font-semibold">This cannot be undone</span>
                        {deciding.upheld
                          ? " — the resident can only dispute a later stage, not this one again."
                          : " — a dismissed case cannot be reopened; a further breach would be a new case."}
                      </p>
                      <textarea
                        value={decisionNote}
                        onChange={(e) => setDecisionNote(e.target.value)}
                        rows={2}
                        maxLength={2000}
                        placeholder="Reasons for the decision (optional) — the resident reads this."
                        className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[12.5px] text-foreground focus:border-primary focus:outline-none"
                      />
                      <div className="mt-2 flex items-center gap-1.5">
                        <button
                          onClick={() => void decide(v.id, deciding.upheld)}
                          disabled={busy === v.id}
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-50 ${
                            deciding.upheld ? "bg-warning/15 text-warning" : "bg-success/15 text-success"
                          }`}
                        >
                          {busy === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          {deciding.upheld ? "Confirm — uphold" : "Confirm — overturn"}
                        </button>
                        <button
                          onClick={() => setDeciding(null)}
                          className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {asking === v.id && next && (
                    <div className="mt-2 rounded-lg border border-warning/40 bg-warning/5 p-2.5">
                      <p className="text-[11.5px] leading-relaxed text-foreground">
                        This building has no fine schedule in its bylaws, so there is no amount to apply. Enter what
                        this {STAGE_LABEL[next].toLowerCase()}{" "}
                        should be.
                      </p>
                      <div className="mt-2 flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={amount}
                          placeholder="0.00"
                          onChange={(e) => setAmount(e.target.value)}
                          className="w-28 rounded-lg border border-border bg-background px-2 py-1.5 text-[12.5px] text-foreground focus:border-primary focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            const n = Number(amount.replace(/[^0-9.]/g, ""))
                            if (!Number.isFinite(n) || n <= 0) return toast.error("Enter an amount above $0.")
                            void advance(v.id, v.stage, Math.round(n * 100))
                          }}
                          disabled={busy === v.id}
                          className="rounded-lg bg-destructive/15 px-2.5 py-1.5 text-[12px] font-semibold text-destructive disabled:opacity-50"
                        >
                          Issue fine
                        </button>
                        <button
                          onClick={() => setAsking(null)}
                          className="rounded-lg bg-muted px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {scopedResolved.length > 0 && (
        <SectionCard title={`Resolved (${scopedResolved.length})`}>
          <div className="space-y-1.5">
            {scopedResolved.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <span className="truncate text-[12.5px] capitalize text-foreground">
                  {v.type} · Unit {v.unit}
                </span>
                <span className="whitespace-nowrap text-[11.5px] text-muted-foreground">
                  {v.outcome} · {v.resolved}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

/* --------------------------------- Bylaws -------------------------------- */

function BylawsPanel({ buildingId }: { buildingId: string }) {
  const { buildings, refetch } = useStrata()
  const { data: inputs, refetch: refetchInputs } = useComplianceInputs()
  const building = buildings.find((b) => b.id === buildingId)
  if (!building) return null
  const pets = inputs.filter((p) => p.buildingId === buildingId)
  return (
    <SectionCard title="Pet bylaws">
      <BuildingBylawsEditor
        building={building}
        pets={pets}
        onSaved={() => {
          refetch()
          refetchInputs()
        }}
      />
    </SectionCard>
  )
}

/* ------------------------------- Emergency ------------------------------- */

function EmergencyPanel({ buildingId }: { buildingId: string }) {
  const { data: tokens, isLoading, refetch } = useEmergencyTokens(buildingId)
  const [busy, setBusy] = useState(false)

  async function issue() {
    setBusy(true)
    const { error } = await issueEmergencyToken(buildingId, 4)
    setBusy(false)
    if (error) return toast.error("Couldn't issue token", { description: error })
    toast.success("4-hour emergency link issued")
    refetch()
  }
  async function revoke(id: string) {
    const { error } = await revokeEmergencyToken(id)
    if (error) return toast.error("Couldn't revoke", { description: error })
    toast.success("Token revoked")
    refetch()
  }
  function copy(token: string) {
    const url = `${window.location.origin}/emergency/${token}`
    void navigator.clipboard.writeText(url)
    toast.success("Emergency link copied")
  }

  return (
    <SectionCard
      title="Emergency access links"
      action={
        <button
          onClick={issue}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-info px-3 py-1.5 text-[12px] font-semibold text-info-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Issue 4h link
        </button>
      }
    >
      <p className="mb-3 text-[12.5px] text-muted-foreground">
        Time-boxed links let fire/emergency crews see the building&apos;s pet roster without an account.
      </p>
      {isLoading ? (
        <Spinner />
      ) : tokens.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted-foreground">No links issued yet.</p>
      ) : (
        <div className="space-y-2">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-lg card-raised p-3">
              <span
                className={`h-2 w-2 flex-shrink-0 rounded-full ${t.isActive ? "bg-success" : "bg-muted-foreground/50"}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[12px] text-foreground">/emergency/{t.token.slice(0, 12)}…</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {t.isActive ? "Active · " : t.revoked ? "Revoked · " : "Expired · "}
                  expires {new Date(t.expiresAt).toLocaleString()}
                </p>
              </div>
              {t.isActive && (
                <>
                  <button
                    onClick={() => copy(t.token)}
                    className="flex items-center rounded-lg bg-muted p-2 text-muted-foreground"
                    title="Copy link"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => revoke(t.id)}
                    className="flex items-center gap-1 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[12px] font-semibold text-destructive"
                  >
                    <Ban className="h-3.5 w-3.5" /> Revoke
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
