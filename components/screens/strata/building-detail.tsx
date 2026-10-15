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
import { advanceViolation, resolveDispute, resolveViolation, type AdvanceOptions } from "@/lib/data/manager-queues"
// Phase 6: moved to a pure, tested module. See `lib/data/fine-schedule.ts`.
import {
  readFineSchedule,
  scheduledCents,
  fineNoteRequired,
  formatCentsForInput,
  parseAmountToCents,
  defaultFineDueOn,
} from "@/lib/data/fine-schedule"
import { STAGE_LABEL, closedCaseLabel, controlsForCase, isFineStage, nextStage } from "@/lib/data/violations"
import { shortDate } from "@/lib/dates"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ErrorText } from "@/components/ui/error-text"
import type { ResidentLinkRow } from "@/lib/data"
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
  ArrowRight,
  ShieldCheck,
  Copy,
  Ban,
  Plus,
  Landmark,
} from "lucide-react"
import { MunicipalReportsList } from "@/components/screens/manager/municipal-reports-list"

const DETAIL_TABS = [
  { id: "work", label: "Work", icon: Inbox },
  { id: "residents", label: "Residents", icon: Users },
  { id: "violations", label: "Violations", icon: Gavel },
  { id: "bylaws", label: "Bylaws", icon: Scale },
  { id: "emergency", label: "Emergency", icon: QrCode },
  { id: "municipal", label: "Municipal", icon: Landmark },
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
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
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
      {tab === "municipal" && <MunicipalReportsList buildingId={buildingId} />}
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
  const { buildings } = useStrata()
  const buildingName = buildings.find((b) => b.id === buildingId)?.name ?? "this building"
  const [busy, setBusy] = useState<string | null>(null)
  // Deny and remove each tell a person no, so each asks first — the same
  // dialog, words and optional reason as the manager's Residents screen.
  const [confirming, setConfirming] = useState<{ kind: "deny" | "remove"; resident: ResidentLinkRow } | null>(null)
  const scoped = data.filter((r) => r.buildingId === buildingId)
  const pending = scoped.filter((r) => r.status === "pending")
  const members = scoped.filter((r) => r.status === "approved")

  async function approve(linkId: string) {
    setBusy(linkId)
    const { error } = await approveResidentLink(linkId)
    setBusy(null)
    if (error) return toast.error("Couldn't approve", { description: error })
    toast.success("Approved")
    refetch()
  }

  /** The confirmed deny or remove. A failure stays in the dialog, beside the reason. */
  async function decide(reason: string | null): Promise<{ error: string | null }> {
    if (!confirming) return { error: null }
    const { kind, resident } = confirming
    setBusy(resident.linkId)
    const fn = kind === "deny" ? denyResidentLink : removeResident
    const { error } = await fn(resident.linkId, reason ?? undefined)
    setBusy(null)
    if (error) return { error }
    toast.success(kind === "deny" ? "Request denied" : "Removed from building")
    refetch()
    return { error: null }
  }

  const who = (r: ResidentLinkRow) => (r.unit ? `${r.residentName} (Unit ${r.unit})` : r.residentName)

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
                  <p className="truncate text-[12px] text-muted-foreground">
                    Unit {r.unit ?? "not given"} · requested {shortDate(r.requestedAt)}
                  </p>
                </div>
                <Button size="sm" onClick={() => approve(r.linkId)} loading={busy === r.linkId}>
                  {busy !== r.linkId && <Check />}
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirming({ kind: "deny", resident: r })}
                  disabled={busy === r.linkId}
                >
                  <X className="text-destructive" /> Deny
                </Button>
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
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-info-soft text-[13px] font-semibold text-foreground">
                  {r.residentName.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">{r.residentName}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {r.unit ? `Unit ${r.unit} · ` : ""}
                    {r.residentEmail ?? "—"}
                  </p>
                </div>
                {/* Labelled, not a bare icon: what it does is on the button. */}
                <Button
                  variant="secondary"
                  onClick={() => setConfirming({ kind: "remove", resident: r })}
                  loading={busy === r.linkId}
                  className="px-2.5 text-meta"
                >
                  {busy !== r.linkId && <UserMinus className="text-destructive" />}
                  Remove from building
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title={
          !confirming
            ? ""
            : confirming.kind === "deny"
              ? `Deny ${who(confirming.resident)}'s request to join?`
              : `Remove ${who(confirming.resident)} from ${buildingName}?`
        }
        description={
          confirming?.kind === "remove"
            ? "They lose access and must ask to rejoin."
            : "They're told the request wasn't approved, and can ask again."
        }
        confirmLabel={confirming?.kind === "remove" ? "Remove from building" : "Deny request"}
        tone="danger"
        reason={{ label: "Reason (the resident reads this)", required: false }}
        onConfirm={decide}
      />
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
  /**
   * The case a fine is being confirmed for, and the confirm's fields: the
   * amount (pre-filled from the bylaws when they price it), the note the
   * resident reads, and the due date.
   */
  const [asking, setAsking] = useState<string | null>(null)
  const [amount, setAmount] = useState("")
  const [fineNote, setFineNote] = useState("")
  const [dueOn, setDueOn] = useState("")
  const [fineError, setFineError] = useState<string | null>(null)
  /** The close or appeal decision whose ConfirmDialog is open. */
  const [closing, setClosing] = useState<{ id: string; act: "resolve" | "upheld" | "overturned" } | null>(null)

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

  /** What the bylaws price the fine this case would advance into, or null. */
  function bylawCentsFor(stage: ViolationStage): number | null {
    const next = nextStage(stage)
    if (!next || !isFineStage(next)) return null
    // The same reader the manager's case sheet uses, so both surfaces offer
    // the figure `manager_advance_violation` would apply.
    return scheduledCents(schedule, next)
  }

  /** Advance one rung. Returns the failure, so the fine confirm can show it in place. */
  async function advance(id: string, stage: ViolationStage, options: AdvanceOptions = {}): Promise<string | null> {
    const next = nextStage(stage)
    if (!next) return null
    setBusy(id)
    const { error, notified } = await advanceViolation(id, next, options)
    setBusy(null)
    if (error) return error
    setAsking(null)
    toast.success(`Advanced to ${STAGE_LABEL[next]}`, {
      description: notified ? undefined : "No resident is assigned, so nobody was notified.",
    })
    refetch()
    return null
  }

  /**
   * A fine stage asks first — every time, not only when the bylaws are silent.
   * It used to issue a scheduled fine on one tap, with no note and no due date;
   * money the resident is told they owe is worth one look. Every other rung
   * (open → warning) still moves on the tap, as before.
   */
  function startAdvance(id: string, stage: ViolationStage) {
    const next = nextStage(stage)
    if (next && isFineStage(next)) {
      if (asking === id) return setAsking(null)
      setAmount(formatCentsForInput(bylawCentsFor(stage)))
      setFineNote("")
      setDueOn(defaultFineDueOn())
      setFineError(null)
      setAsking(id)
      return
    }
    void advance(id, stage).then((error) => {
      if (error) toast.error("Couldn't advance", { description: error })
    })
  }

  /** The confirmed fine: the same amount and note rules as the case sheet's. */
  async function issue(id: string, stage: ViolationStage) {
    const bylaw = bylawCentsFor(stage)
    const parsed = parseAmountToCents(amount)
    const cents = typeof parsed === "number" ? parsed : null
    if (cents === null) return setFineError("Enter an amount like 250 or 1,000.")
    if (fineNoteRequired(bylaw, cents) && !fineNote.trim()) return setFineError("Say what this amount is based on.")
    setFineError(null)
    const error = await advance(id, stage, {
      // Left off when the bylaw figure is kept, so the DATABASE applies the
      // schedule (AD-5) rather than the client echoing a figure back at it.
      amountCents: cents !== bylaw ? cents : undefined,
      note: fineNote.trim() || undefined,
      dueOn: dueOn || undefined,
    })
    if (error) setFineError(error)
  }

  async function resolve(id: string, reason: string): Promise<{ error: string | null }> {
    setBusy(id)
    // The reason replaced "Remedied — closed by manager": it becomes the
    // case's resolution_outcome, which the resident reads.
    const { error, notified } = await resolveViolation(id, reason)
    setBusy(null)
    if (error) return { error }
    // `notified` was dropped here while `advance` two functions up surfaced it,
    // so resolving an unassigned case implied a letter had gone out.
    toast.success("Violation resolved", {
      description: notified ? undefined : "No resident is assigned, so nobody was notified.",
    })
    refetch()
    refetchResolved()
    return { error: null }
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
  async function decide(id: string, upheld: boolean, note: string | null): Promise<{ error: string | null }> {
    setBusy(id)
    const r = await resolveDispute(id, upheld ? "upheld" : "overturned", note ?? undefined)
    setBusy(null)
    if (r.error) return { error: r.error }
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
    return { error: null }
  }

  /**
   * The consequence, with the real number, BEFORE the press. Kept from the
   * inline block this replaced: the wording is the part that has to match the
   * manager's Violations screen, and it does.
   */
  function appealConsequence(v: (typeof scopedOpen)[number], upheld: boolean): string {
    const head = upheld ? `The case stays at ${v.stageLabel.toLowerCase()}` : "The case is dismissed and closed"
    const money =
      v.disputed > 0
        ? upheld
          ? `, and the $${v.disputed.toFixed(2)} under appeal becomes payable again — reminders resume.`
          : `, and the $${v.disputed.toFixed(2)} under appeal is waived.`
        : ". No fine is attached, so no money changes."
    const tail = upheld
      ? " This can't be undone — the resident can only dispute a later stage, not this one again."
      : " This can't be undone — a dismissed case cannot be reopened; a further breach would be a new case."
    return `${head}${money} The resident is notified either way.${tail}`
  }

  const closingCase = closing ? scopedOpen.find((v) => v.id === closing.id) : undefined

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
                    <Badge variant="warning">{v.stageLabel}</Badge>
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
                    <div className="mt-2 rounded-lg border border-border bg-warning-soft p-2.5">
                      <p className="text-[11px] font-semibold text-foreground">
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
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setClosing({ id: v.id, act: "upheld" })}
                          disabled={busy === v.id}
                        >
                          <Gavel className="text-warning" /> Uphold
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setClosing({ id: v.id, act: "overturned" })}
                          disabled={busy === v.id}
                        >
                          <ShieldCheck className="text-success" /> Overturn
                        </Button>
                      </>
                    ) : (
                      <>
                        {next && (
                          <Button size="sm" onClick={() => startAdvance(v.id, v.stage)} loading={busy === v.id}>
                            {busy !== v.id && <ArrowRight />}
                            Advance to {STAGE_LABEL[next]}
                          </Button>
                        )}
                        {controls.moves.includes("resolved") && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setClosing({ id: v.id, act: "resolve" })}
                            disabled={busy === v.id}
                          >
                            <ShieldCheck className="text-success" /> Resolve
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  {asking === v.id && next && isFineStage(next) && (
                    <div className="mt-2 rounded-lg border border-border bg-warning-soft p-2.5">
                      <p className="text-[11.5px] leading-relaxed text-foreground">
                        {bylawCentsFor(v.stage) === null
                          ? `This building has no fine schedule in its bylaws, so there is no amount to apply. Enter what this ${STAGE_LABEL[next].toLowerCase()} should be, and what it is based on.`
                          : `This issues a ${STAGE_LABEL[next].toLowerCase()} at the amount the bylaws set, and tells the resident. Change the amount only with a note saying why.`}
                      </p>
                      <div className="mt-2 flex flex-wrap items-end gap-1.5">
                        <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-muted-foreground">
                          Amount
                          <input
                            type="text"
                            inputMode="decimal"
                            value={amount}
                            placeholder="0.00"
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-28 rounded-lg border border-border bg-background px-2 py-1.5 text-[12.5px] font-normal text-foreground focus:border-primary focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-muted-foreground">
                          Due by
                          <input
                            type="date"
                            value={dueOn}
                            onChange={(e) => setDueOn(e.target.value)}
                            className="rounded-lg border border-border bg-background px-2 py-1.5 text-[12.5px] font-normal text-foreground focus:border-primary focus:outline-none"
                          />
                        </label>
                      </div>
                      <label className="mt-2 flex flex-col gap-0.5 text-[11px] font-semibold text-muted-foreground">
                        Note (the resident reads this)
                        <textarea
                          value={fineNote}
                          onChange={(e) => setFineNote(e.target.value)}
                          rows={2}
                          maxLength={2000}
                          className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[12.5px] font-normal text-foreground focus:border-primary focus:outline-none"
                        />
                      </label>
                      {fineError && (
                        <ErrorText className="mt-1.5 text-[12px] font-medium">{fineError}</ErrorText>
                      )}
                      <div className="mt-2 flex items-center gap-1.5">
                        <Button variant="danger" size="sm" onClick={() => void issue(v.id, v.stage)} loading={busy === v.id}>
                          Issue {STAGE_LABEL[next].toLowerCase()}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setAsking(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={closing !== null}
        onOpenChange={(open) => {
          if (!open) setClosing(null)
        }}
        title={
          closing?.act === "resolve"
            ? "Mark this case resolved?"
            : closing?.act === "upheld"
              ? "Uphold this notice?"
              : "Overturn this notice?"
        }
        description={
          !closing || !closingCase
            ? ""
            : closing.act === "resolve"
              ? "The case closes as remedied. This can't be undone."
              : appealConsequence(closingCase, closing.act === "upheld")
        }
        confirmLabel={closing?.act === "resolve" ? "Mark resolved" : closing?.act === "upheld" ? "Uphold" : "Overturn"}
        tone={closing?.act === "upheld" ? "danger" : "default"}
        // Required to resolve or uphold — the resident is told why the case
        // closed, or why their appeal failed. Optional to overturn: a finding
        // for the resident needs no defence.
        reason={{ label: "Reason (the resident reads this)", required: closing?.act !== "overturned" }}
        onConfirm={async (reason) => {
          if (!closing) return { error: null }
          if (closing.act === "resolve") return resolve(closing.id, reason ?? "")
          return decide(closing.id, closing.act === "upheld", reason)
        }}
      />

      {scopedResolved.length > 0 && (
        // "Closed", not "Resolved": dismissed cases are listed here too.
        <SectionCard title={`Closed (${scopedResolved.length})`}>
          <div className="space-y-1.5">
            {scopedResolved.map((v) => {
              // Named by the stage. The manager's reason is free text since
              // 3.2, so it wraps under the row (two lines, full text on hover)
              // instead of sitting in a no-wrap span that ran off a phone.
              const { label, tone } = closedCaseLabel(v.stage)
              return (
                <div key={v.id} className="rounded-lg bg-muted px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[12.5px] capitalize text-foreground">
                      {v.type} · Unit {v.unit}
                    </span>
                    <span className="flex-shrink-0 text-[11.5px] text-muted-foreground">
                      <Badge variant={tone === "good" ? "success" : "neutral"}>{label}</Badge>
                      {v.resolved ? ` · ${v.resolved}` : ""}
                    </span>
                  </div>
                  {v.outcome && (
                    <p title={v.outcome} className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground">
                      {v.outcome}
                    </p>
                  )}
                </div>
              )
            })}
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
        <Button size="sm" onClick={issue} loading={busy}>
          {!busy && <Plus />} Issue 4h link
        </Button>
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
                className={`h-2 w-2 flex-shrink-0 rounded-full ${t.isActive ? "bg-success" : "bg-muted-foreground"}`}
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
                  <Button variant="quiet" size="icon-sm" onClick={() => copy(t.token)} title="Copy link" aria-label="Copy link">
                    <Copy />
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => revoke(t.id)}>
                    <Ban className="text-destructive" /> Revoke
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
