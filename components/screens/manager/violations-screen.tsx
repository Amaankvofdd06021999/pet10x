"use client"

/**
 * Pet10x — the manager's Violations screen.
 *
 * Every control here reaches the database. That is the whole of this file's
 * brief, and it was previously false of ten of them: the screen advertised
 * hardcoded tab counts (5/3/2/8) over live lists, and nine buttons called
 * `toast()` and changed nothing. Four of the ten controls turned out to be
 * assertions about capabilities that do not exist, and those were deleted
 * rather than wired up — see the removal notes at the bottom of this comment.
 *
 * TWO RULES THIS FILE FOLLOWS:
 *
 * 1. **Ask `LEGAL_TRANSITIONS` what to offer.** No stage-to-button mapping is
 *    written here: `actionsFor()` reads the mirrored ladder, so **a control the
 *    database would refuse cannot render**. That is the guarantee, and it is
 *    the one that matters — a manager never presses a button and gets a 42501.
 *
 *    The converse does NOT hold, and an earlier version of this comment claimed
 *    it did. `actionsFor` tests the ladder's answer against five hardcoded
 *    labels (`warning`, `fine_1`, `fine_2`, `resolved`, `dismissed`), so a
 *    SIXTH rung added to `LEGAL_TRANSITIONS` would render no button here until
 *    this file is edited. The direction is deliberate: an unknown stage silently
 *    offering nothing is a missing feature, whereas deriving a button for it
 *    would be this screen inventing a control it knows nothing about. Task 4
 *    deleted duplicated ladder truth from three screens; what is left here is
 *    the label and styling of each act, which is presentation, not the ladder.
 *
 * 2. **Nothing is described as done that was not measured.** The Disputed tab
 *    lists appeals and says plainly that deciding one arrives in Phase 5; the
 *    amount sheet says the building has no fine schedule when it has none
 *    (measured 2026-08-23: 0 of 6 buildings do) instead of implying a default
 *    it would then fail to apply.
 *
 * REMOVED, and why:
 *   - **Investigate** — `open` *is* the under-investigation state. The button
 *     asserted a state change that the ladder has no rung for.
 *   - **Review Case** — toasted and navigated nowhere. Its stage
 *     (`pending_review`) stopped existing in Task 1.
 *   - **Escalate to CRT** — no Civil Resolution Tribunal integration exists and
 *     none is planned this phase. The evidence export at the foot of the screen
 *     is the real version of what a manager needs for a tribunal filing.
 *   - **The "enforcement pipeline" strip** — it rendered `violation.history`,
 *     which `manager-queues.ts` builds as a single element containing the
 *     CURRENT stage. A one-step "pipeline" showing the same thing as the badge
 *     beside it is not a history. Replaced by the ladder strip, which is a true
 *     statement: the four rungs are strictly linear and the database enforces
 *     that, so a case at `fine_1` demonstrably passed through `warning`.
 */

import { useCallback, useMemo, useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { Portal } from "@/components/ui/portal"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useViolations, useResolvedViolations } from "@/lib/data"
import { usePortfolioBuildings, useOutstandingFines } from "@/lib/data/portfolio"
import {
  advanceViolation,
  dismissViolation,
  fetchCaseLedger,
  issueFine,
  openViolation,
  readFineSchedule,
  remindAboutFine,
  resolveViolation,
  useViolationSubjects,
  type FineSchedule,
} from "@/lib/data/manager-queues"
import {
  LEGAL_TRANSITIONS,
  STAGE_LABEL,
  describeLegalMoves,
  nextStage,
} from "@/lib/data/violations"
import { toCsv, downloadCsv } from "@/lib/csv"
import type { Violation, ViolationStage, ViolationTab } from "@/lib/data/types"
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  DollarSign,
  Download,
  Gavel,
  Loader2,
  Plus,
  Scale,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react"

/*
 * `ViolationTab` is imported, not redeclared.
 *
 * This file used to declare its own `type ViolationTab = "active" | "warnings"
 * | "fines" | "resolved"` — a local retyping of a shared vocabulary, which is
 * the exact defect Task 4 spent its diff removing. It had already caused one:
 * when `tabFor` gained `"disputed"`, the shadow kept `tsc` silent, and
 * violation 35…0007 (a fine at `status='disputed'`) matched no tab and rendered
 * nowhere at all, taking its 200.00 out of the Unpaid figure with it.
 */

const TAB_LABEL: Record<ViolationTab, string> = {
  active: "Active",
  warnings: "Warnings",
  fines: "Fines",
  disputed: "Disputed",
  resolved: "Resolved",
}

const STAGE_CONFIG: Record<ViolationStage, { color: string; icon: typeof AlertTriangle }> = {
  open: { color: "bg-destructive/10 text-destructive", icon: AlertTriangle },
  warning: { color: "bg-warning/10 text-warning-strong", icon: Gavel },
  fine_1: { color: "bg-destructive/10 text-destructive", icon: DollarSign },
  fine_2: { color: "bg-destructive/10 text-destructive", icon: DollarSign },
  resolved: { color: "bg-success/10 text-success", icon: CheckCircle2 },
  dismissed: { color: "bg-muted text-muted-foreground", icon: XCircle },
}

/**
 * The escalation ladder, walked rather than written down.
 *
 * `nextStage` follows `LEGAL_TRANSITIONS`, skipping the two terminals, so this
 * array is whatever the mirrored ladder currently says the rungs are. A fifth
 * rung added to the database and regenerated into `violation_stage_v2` appears
 * in this strip without this file changing.
 */
const LADDER: ViolationStage[] = (() => {
  const rungs: ViolationStage[] = ["open"]
  for (let next = nextStage("open"); next && rungs.length < 10; next = nextStage(next)) rungs.push(next)
  return rungs
})()

/** The bylaw breaches a manager can file. `violations.type` is free text in the
 *  database; this is the app stating which values it is willing to create, so
 *  the column does not accumulate a ninth spelling of "off leash". The live
 *  table already holds both `off_leash`/`leash_bylaw` and
 *  `aggressive`/`aggressive_behavior` from earlier free-text entry. */
const VIOLATION_TYPES: { value: string; label: string }[] = [
  { value: "noise", label: "Noise" },
  { value: "off_leash", label: "Off leash in a common area" },
  { value: "waste", label: "Waste not picked up" },
  { value: "aggressive_behavior", label: "Aggressive behaviour" },
  { value: "unregistered_pet", label: "Unregistered pet" },
  { value: "excess_pets", label: "More pets than the bylaw allows" },
  { value: "property_damage", label: "Property damage" },
  { value: "unattended", label: "Pet left unattended" },
]

/* ------------------------------------------------------------------ */
/* Which controls a case gets — derived, never mapped                  */
/* ------------------------------------------------------------------ */

type ActionKind = "warning" | "fine" | "resolve" | "dismiss" | "remind"

interface Action {
  kind: ActionKind
  /** Only set for `fine`. Which degree the ladder says comes next. */
  degree?: "fine_1" | "fine_2"
  label: string
  className: string
}

/**
 * The controls a case may be offered, asked of the ladder.
 *
 * Everything except `remind` is a legal transition out of the case's current
 * stage — so on a case the database would refuse, the button is not rendered
 * rather than rendered and then rejected. `remind` is not a transition at all:
 * it follows the money (an unpaid fine), not the rung, which is why a case at
 * `warning` that already carries a fine — violation 35…0002 is exactly that —
 * still gets the reminder the old `isFineStage(stage)` gate withheld from it.
 */
function actionsFor(v: Violation): Action[] {
  const legal = LEGAL_TRANSITIONS[v.stage]
  const actions: Action[] = []

  if (legal.includes("warning")) {
    actions.push({
      kind: "warning",
      label: "Issue Warning",
      className: "bg-warning/10 text-warning-strong",
    })
  }
  for (const degree of ["fine_1", "fine_2"] as const) {
    if (legal.includes(degree)) {
      actions.push({
        kind: "fine",
        degree,
        label: degree === "fine_1" ? "Issue Fine" : "Escalate to 2nd Fine",
        className: "bg-destructive/10 text-destructive",
      })
    }
  }
  // Follows the money, on the RPC's own predicate.
  //
  // `chaseable` is "at least one fine on this case reads `issued`" — exactly
  // what `manager_remind_fine` selects. The old gate was
  // `amount > 0 && !paid && tab !== "disputed"`, which rendered the button on a
  // case whose only fine had been WAIVED (`amount` sums every fine regardless
  // of status), where the RPC could only ever return `no_outstanding_fine`.
  // A control that cannot act must not exist, so the client asks the same
  // question the database will. The disputed exclusion is not lost — a
  // `disputed` fine is not `issued`, so it fails this test on its own.
  if (v.chaseable) {
    actions.push({ kind: "remind", label: "Send Reminder", className: "bg-primary/10 text-primary" })
  }
  if (legal.includes("resolved")) {
    actions.push({ kind: "resolve", label: "Resolve", className: "bg-success/10 text-success" })
  }
  if (legal.includes("dismissed")) {
    // The ladder has two terminals and the plan's control table specified an
    // exit for only one. Dismissing a case judged unfounded is a different act
    // from resolving one that was remedied, and a manager with no dismiss
    // button resolves unfounded cases instead — which corrupts the record the
    // ladder exists to keep.
    actions.push({ kind: "dismiss", label: "Dismiss", className: "bg-muted text-muted-foreground" })
  }
  return actions
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

interface Pending {
  action: Action
  violation: Violation
}

export function ManagerViolationsScreen({ onNavigate }: { onNavigate?: (screen: string) => void }) {
  const [activeTab, setActiveTab] = useState<ViolationTab>("active")
  const [pending, setPending] = useState<Pending | null>(null)
  const [composing, setComposing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { data: violations, isLoading, error: violationsError, refetch } = useViolations()
  const { data: resolvedViolations, refetch: refetchResolved } = useResolvedViolations()
  const { data: buildings } = usePortfolioBuildings()
  const { data: subjects } = useViolationSubjects()
  // The strata overview's own query, reused rather than re-derived. It is the
  // only source on this screen that survives a case being closed.
  const { data: portfolioFines, refetch: refetchFines } = useOutstandingFines()

  const byTab = useCallback(
    (tab: ViolationTab) => violations.filter((v) => v.tab === tab),
    [violations],
  )

  const activeViolations = byTab("active")
  const warningViolations = byTab("warnings")
  const fineViolations = byTab("fines")
  const disputedViolations = byTab("disputed")

  // Every count is derived from the list beneath it, the way
  // `approvals-screen.tsx:57-65` already does. These were the literals
  // 5 / 3 / 2 / 8 over live queries, so the numbers were wrong on every
  // building including this one.
  const TABS: { id: ViolationTab; count: number }[] = [
    { id: "active", count: activeViolations.length },
    { id: "warnings", count: warningViolations.length },
    { id: "fines", count: fineViolations.length },
    { id: "disputed", count: disputedViolations.length },
    { id: "resolved", count: resolvedViolations.length },
  ]

  /*
   * The money.
   *
   * Two bugs lived here, and they pointed in opposite directions.
   *
   *  - `!v.paid` treated a fine as outstanding unless EVERY fine on the case
   *    read `paid`. `fine_status` has seven labels, so waiving a fine — a
   *    one-click control on the strata queue screen — left its amount in the
   *    Outstanding figure and left the card badged "Unpaid". Measured before
   *    this fix: waive 45…0001 and this screen said $600 where the strata
   *    overview said $350. `v.outstanding` now comes from `summariseFines`,
   *    which is the same table `useOutstandingFines` filters on, so the two
   *    surfaces agree by construction rather than by nobody having waived
   *    anything yet.
   *
   *  - `violations` is `useViolations`, which filters `.is("resolved_at", null)`.
   *    Resolving a fined case therefore took its unpaid fine off this screen
   *    entirely — $600 on the strata overview against $350 here. Closing a case
   *    does not cancel the fine, so the money is followed to where it went:
   *    `closedCaseOutstanding` below reads the fines table directly, through the
   *    very hook the overview uses, and the card states the remainder instead of
   *    losing it.
   */
  const finedCases = violations.filter((v) => v.amount > 0)
  const totalFines = finedCases.reduce((sum, v) => sum + v.amount, 0)
  const unpaidFines = finedCases.reduce((sum, v) => sum + v.outstanding, 0)
  const disputedFines = finedCases.reduce((sum, v) => sum + v.disputed, 0)

  // Money still owed on cases this screen does not list, because they are
  // closed (or because the fine was issued without a case at all). The ids of
  // every live case are known, so this is an exact partition, not a subtraction
  // of two floating-point totals.
  //
  // Gated on the case query having SUCCEEDED. `useViolationsLive` reports an
  // error by setting `data: []`, and an empty live-case set makes every fine in
  // the portfolio look off-screen -- so a failed case query with a healthy
  // fines query would render "a further $600.00 is owed on 3 fines whose case
  // is already closed" while all three cases are open. A screen that invents
  // closed cases out of its own network error is the exact failure this phase
  // exists to remove, so the partition is not attempted unless it is knowable.
  const liveCaseIds = new Set(violations.map((v) => v.id))
  const offScreenFines = violationsError
    ? []
    : portfolioFines.filter((f) => !f.violationId || !liveCaseIds.has(f.violationId))
  const closedCaseOutstanding = offScreenFines.reduce((sum, f) => sum + f.amount, 0)
  // A fine with no `violation_id` is off-screen too, but it is not a closed
  // case -- so the sentence below only claims closure when every fine in the
  // set actually has a case behind it.
  const offScreenAllHaveCases = offScreenFines.every((f) => f.violationId)

  const currentList = useMemo(() => {
    switch (activeTab) {
      case "active":
        return activeViolations
      case "warnings":
        return warningViolations
      case "fines":
        return fineViolations
      case "disputed":
        return disputedViolations
      case "resolved":
        return []
    }
  }, [activeTab, activeViolations, warningViolations, fineViolations, disputedViolations])

  const listIsEmpty = activeTab === "resolved" ? resolvedViolations.length === 0 : currentList.length === 0

  const EMPTY_COPY: Record<ViolationTab, { title: string; subtext: string }> = {
    active: {
      title: "No open cases",
      subtext: "Nothing is awaiting a first decision. Cases you log, and incidents you escalate, land here at the open stage.",
    },
    warnings: {
      title: "No warnings outstanding",
      subtext: "No case is sitting at the warning stage. A warning is the rung between opening a case and fining it.",
    },
    fines: {
      title: "No fines issued",
      subtext: "No live case carries a fine. Anything issued and still outstanding is tracked here.",
    },
    disputed: {
      title: "Nothing under dispute",
      subtext: "No resident has appealed a fine. Appeals appear here so they are not buried under the fine they contest.",
    },
    resolved: {
      title: "Nothing closed yet",
      subtext: "Cases you resolve or dismiss are archived here. Neither can be reopened — reopening means logging a new case.",
    },
  }

  const refetchAll = useCallback(() => {
    void refetch()
    void refetchResolved()
    // Issuing a fine, or closing a case that carries one, changes what is owed
    // off-screen too. Leaving this out would put the Outstanding figure a
    // refresh behind the act that changed it.
    void refetchFines()
  }, [refetch, refetchResolved, refetchFines])

  /** The building's fine schedule, or null when the case's building is unknown. */
  const scheduleFor = useCallback(
    (v: Violation): FineSchedule | null => {
      const b = buildings.find((x) => x.id === v.buildingId)
      return b ? readFineSchedule(b.rules) : null
    },
    [buildings],
  )

  /* ---------------- exports ---------------- */

  function exportCurrentTab() {
    if (activeTab === "resolved") {
      if (resolvedViolations.length === 0) return toast("Nothing to export on this tab.")
      downloadCsv(
        "violations-resolved.csv",
        toCsv(
          resolvedViolations.map((v) => ({
            unit: v.unit,
            type: v.type,
            outcome: v.outcome,
            closed: v.resolved,
          })),
          [
            { key: "unit", label: "Unit" },
            { key: "type", label: "Type" },
            { key: "outcome", label: "Outcome" },
            { key: "closed", label: "Closed" },
          ],
        ),
      )
      toast.success(`Exported ${resolvedViolations.length} closed cases`)
      return
    }
    if (currentList.length === 0) return toast("Nothing to export on this tab.")
    downloadCsv(
      `violations-${activeTab}.csv`,
      toCsv(
        currentList.map((v) => ({
          unit: v.unit,
          resident: v.resident,
          pet: v.pet,
          type: v.type,
          stage: v.stageLabel,
          opened: v.date,
          fine: v.amount > 0 ? v.amount.toFixed(2) : "",
          // Three-way, matching the badge. "outstanding" for a waived fine was
          // wrong in an export a tribunal may be shown.
          settled:
            v.amount === 0
              ? ""
              : v.outstanding === 0
                ? v.paid
                  ? "paid"
                  : "settled"
                : v.disputed > 0
                  ? "disputed"
                  : "outstanding",
        })),
        [
          { key: "unit", label: "Unit" },
          { key: "resident", label: "Resident" },
          { key: "pet", label: "Pet" },
          { key: "type", label: "Type" },
          { key: "stage", label: "Stage" },
          { key: "opened", label: "Opened" },
          { key: "fine", label: "Fine ($)" },
          { key: "settled", label: "Fine status" },
        ],
      ),
    )
    toast.success(`Exported ${currentList.length} cases`)
  }

  async function exportLedger() {
    setExporting(true)
    const { error, rows } = await fetchCaseLedger()
    setExporting(false)
    if (error) return toast.error(error)
    if (rows.length === 0) return toast("There are no cases to export.")
    downloadCsv(
      "violation-evidence-ledger.csv",
      toCsv(rows, [
        { key: "case_id", label: "Case ID" },
        { key: "unit", label: "Unit" },
        { key: "resident", label: "Resident" },
        { key: "pet", label: "Pet" },
        { key: "type", label: "Type" },
        { key: "stage", label: "Current stage" },
        { key: "opened_on", label: "Opened" },
        { key: "closed_on", label: "Closed" },
        { key: "outcome", label: "Outcome" },
        { key: "fine_amount", label: "Fine ($)" },
        { key: "fine_status", label: "Fine status" },
        { key: "event_on", label: "Event date" },
        { key: "event_from", label: "From" },
        { key: "event_to", label: "To" },
        { key: "event_note", label: "Note" },
      ]),
    )
    toast.success(`Exported ${rows.length} ledger rows`)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Violations"
        largeTitle={false}
        leftAction={<NavBackButton onClick={() => onNavigate?.("dashboard")} />}
        rightAction={
          <div className="flex items-center gap-1">
            <button onClick={exportCurrentTab} className="p-2" aria-label="Export this tab as CSV">
              <Download className="h-5 w-5 text-foreground" />
            </button>
            <button onClick={() => setComposing(true)} className="p-2" aria-label="Log a violation">
              <Plus className="h-5 w-5 text-primary" />
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="sticky top-16 z-30 bg-background px-4 pb-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {TAB_LABEL[tab.id]}
              <span className="ml-1 opacity-70">({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      <main className="ios-scroll flex-1 px-4 pb-24">
        {(activeTab === "fines" || activeTab === "disputed") &&
          (finedCases.length > 0 || closedCaseOutstanding > 0) && (
          <div className="mb-4 rounded-xl card-raised p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Issued on live cases</p>
                <p className="text-[22px] font-bold text-foreground">${totalFines.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium text-muted-foreground">Outstanding on live cases</p>
                <p className="text-[22px] font-bold text-destructive">${unpaidFines.toFixed(2)}</p>
              </div>
            </div>
            {disputedFines > 0 && (
              <p className="mt-2 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
                Includes <span className="font-semibold text-foreground">${disputedFines.toFixed(2)}</span> on{" "}
                {disputedViolations.length} case{disputedViolations.length === 1 ? "" : "s"} under dispute. Still owed
                unless the appeal succeeds, so it is counted here and listed on the Disputed tab.
              </p>
            )}
            {/*
              Closing a case does not cancel its fine. This screen only lists
              live cases, so without this line the money would simply disappear
              from it the moment a fined case was resolved — while the strata
              overview went on reporting it. Both figures come from the same
              query now, and $X + $Y is what that overview shows.
            */}
            {closedCaseOutstanding > 0 && (
              <p className="mt-2 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
                {/*
                  One string expression rather than JSX prose, because JSX ate
                  the space after `fine{plural}` and this rendered as
                  "1 finewhose case is already closed" in the browser. It is the
                  second time this phase that a missing space after a JSX
                  expression passed tsc, the build and the suite and was caught
                  only by opening the page.
                */}
                A further <span className="font-semibold text-foreground">${closedCaseOutstanding.toFixed(2)}</span>
                {` is owed on ${offScreenFines.length} fine${offScreenFines.length === 1 ? "" : "s"} ${
                  offScreenAllHaveCases
                    ? "whose case is already closed. Resolving a case does not cancel its fine, so it is"
                    : "this screen does not list. Resolving a case does not cancel its fine, and a fine can outlive its case entirely, so the amount is"
                } still counted in the strata portal’s portfolio-wide total of `}
                <span className="font-semibold text-foreground">${(unpaidFines + closedCaseOutstanding).toFixed(2)}</span>.
              </p>
            )}
          </div>
        )}

        {activeTab === "disputed" && (
          <div className="mb-4 rounded-xl border border-dashed border-border bg-card p-3">
            <div className="flex items-start gap-2">
              <Scale className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                A case appears here while a fine against it is marked disputed. <span className="font-semibold text-foreground">Upholding
                or cancelling an appeal is not built yet</span> — that arrives in Phase 5. Until then the ladder still
                applies: you can resolve or dismiss the case, and reminders are withheld while the money is contested.
              </p>
            </div>
          </div>
        )}

        {isLoading && violations.length === 0 && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && listIsEmpty && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mt-4 text-[15px] font-semibold text-foreground">{EMPTY_COPY[activeTab].title}</h3>
            <p className="mx-auto mt-1 max-w-[22rem] text-[13px] leading-relaxed text-muted-foreground">
              {EMPTY_COPY[activeTab].subtext}
            </p>
          </div>
        )}

        {activeTab !== "resolved" ? (
          <div className="grid gap-2.5 lg:grid-cols-2 lg:items-start">
            {currentList.map((violation) => (
              <CaseCard
                key={violation.id}
                violation={violation}
                onAct={(action) => setPending({ action, violation })}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2 lg:items-start">
            {resolvedViolations.map((v) => (
              <div key={v.id} className="flex items-center gap-3 rounded-xl card-raised p-3">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground">
                    Unit {v.unit} — {v.type}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{v.outcome}</p>
                </div>
                <span className="flex-shrink-0 text-[10px] text-muted-foreground">{v.resolved}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <button
            onClick={exportLedger}
            disabled={exporting}
            className="flex w-full items-center justify-center gap-2 rounded-xl card-interactive py-3 transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Download className="h-4 w-4 text-primary" />
            )}
            <span className="text-[13px] font-semibold text-primary">Export evidence package</span>
          </button>
          <p className="mt-1.5 px-2 text-center text-[11px] leading-relaxed text-muted-foreground">
            Every case in your buildings and each recorded stage change, as CSV — the paper trail a tribunal filing is
            built from. Filing itself happens outside Pet10x.
          </p>
        </div>
      </main>

      {pending && (
        <ActionSheet
          pending={pending}
          schedule={pending.action.kind === "fine" ? scheduleFor(pending.violation) : null}
          onClose={() => setPending(null)}
          onDone={() => {
            setPending(null)
            refetchAll()
          }}
        />
      )}

      {composing && (
        <ComposerSheet
          buildings={buildings.map((b) => ({ id: b.id, name: b.name }))}
          subjects={subjects}
          onClose={() => setComposing(false)}
          onDone={() => {
            setComposing(false)
            setActiveTab("active")
            refetchAll()
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* One case                                                            */
/* ------------------------------------------------------------------ */

function CaseCard({ violation, onAct }: { violation: Violation; onAct: (a: Action) => void }) {
  const stageInfo = STAGE_CONFIG[violation.stage]
  const reached = LADDER.indexOf(violation.stage)
  const actions = actionsFor(violation)

  return (
    <div className="overflow-hidden rounded-xl card-raised">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-[12px] font-bold text-foreground">
                {violation.unit}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-foreground">{violation.type}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {violation.resident} &middot; {violation.pet}
                </p>
              </div>
            </div>
          </div>
          <Badge className={`flex-shrink-0 border-0 text-[9px] ${stageInfo.color}`}>{violation.stageLabel}</Badge>
        </div>

        {/* The ladder. Rungs at or below the current stage are filled — a true
            statement, because the four rungs are strictly linear and the
            database refuses to skip one. */}
        <div className="mt-3 flex items-center gap-1">
          {LADDER.map((rung, i) => (
            <div key={rung} className="flex items-center gap-1">
              <div
                className={`rounded-full px-2 py-0.5 ${
                  i <= reached ? "bg-primary/10" : "bg-muted"
                }`}
              >
                <span
                  className={`text-[9px] font-medium ${
                    i <= reached ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {STAGE_LABEL[rung]}
                </span>
              </div>
              {i < LADDER.length - 1 && <ArrowRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {violation.amount > 0 && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-destructive/5 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-destructive" />
              <span className="text-[13px] font-bold text-destructive">${violation.amount.toFixed(2)}</span>
            </div>
            {/*
              Three states, not two. `paid` means every fine reads `paid`;
              `outstanding === 0` with `paid` false means the money went away
              some other way — waived, remitted or written off — and calling
              that "Unpaid", as this badge did, is the same error the totals
              had. The amount beside it is still what was ISSUED, which is why
              a settled case shows a figure and no debt.
            */}
            <Badge
              className={`border-0 text-[9px] ${
                violation.outstanding === 0
                  ? "bg-success/10 text-success"
                  : violation.disputed > 0
                    ? "bg-warning/10 text-warning-strong"
                    : "bg-destructive/10 text-destructive"
              }`}
            >
              {violation.outstanding === 0
                ? violation.paid
                  ? "Paid"
                  : "Settled"
                : violation.disputed > 0
                  ? "Disputed"
                  : "Unpaid"}
            </Badge>
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={`${a.kind}-${a.degree ?? ""}`}
              onClick={() => onAct(a)}
              className={`min-w-[7rem] flex-1 rounded-lg py-2 text-[12px] font-semibold transition-transform active:scale-[0.97] ${a.className}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sheets                                                              */
/* ------------------------------------------------------------------ */

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
        <div
          className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-5 sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[17px] font-semibold text-foreground">{title}</h3>
            <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground active:bg-muted">
              <X className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </Portal>
  )
}

function SheetButton({
  onClick,
  busy,
  label,
  disabled,
}: {
  onClick: () => void
  busy: boolean
  label: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  hint?: string
}) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-[12px] font-semibold text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] text-foreground focus:border-primary focus:outline-none"
      />
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-[12px] font-semibold text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] text-foreground focus:border-primary focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

const SHEET_TITLE: Record<ActionKind, string> = {
  warning: "Issue a warning",
  fine: "Issue a fine",
  resolve: "Resolve this case",
  dismiss: "Dismiss this case",
  remind: "Send a reminder",
}

/**
 * One sheet for all five acts.
 *
 * They differ only in which fields they collect and which mutation they call,
 * and splitting them into five components would have meant five copies of the
 * same busy-state / error-toast / refetch handling — which is where the
 * divergence would eventually live.
 */
function ActionSheet({
  pending,
  schedule,
  onClose,
  onDone,
}: {
  pending: Pending
  schedule: FineSchedule | null
  onClose: () => void
  onDone: () => void
}) {
  const { action, violation } = pending
  const degree = action.degree ?? "fine_1"

  /** What the bylaw says this degree costs, in cents, or null when unset. */
  const bylawCents = schedule ? (degree === "fine_1" ? schedule.fine_1 : schedule.fine_2) : null

  const [note, setNote] = useState("")
  const [amount, setAmount] = useState(bylawCents !== null ? (bylawCents / 100).toFixed(2) : "")
  const [dueOn, setDueOn] = useState("")
  const [busy, setBusy] = useState(false)

  const enteredCents = (() => {
    const n = Number(amount.replace(/[^0-9.]/g, ""))
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
  })()
  const deviates = action.kind === "fine" && bylawCents !== null && enteredCents !== null && enteredCents !== bylawCents
  const noSchedule = action.kind === "fine" && bylawCents === null
  // A fine the bylaws do not price, or one priced differently from them, is a
  // decision somebody made rather than a schedule being followed — so the
  // record has to say why. This is the only place a note is compulsory.
  const noteRequired = noSchedule || deviates
  const blocked = action.kind === "fine" && (enteredCents === null || (noteRequired && !note.trim()))

  async function submit() {
    setBusy(true)
    let error: string | null = null
    let success = ""

    if (action.kind === "warning") {
      const r = await advanceViolation(violation.id, "warning", { note: note.trim() || undefined })
      error = r.error
      success = r.notified
        ? "Warning issued and the resident notified."
        : "Warning issued. No resident is assigned, so nobody was notified."
    } else if (action.kind === "fine") {
      const r = await issueFine(violation.id, degree, {
        // Left off when the manager did not touch the bylaw figure, so the
        // DATABASE applies the schedule (AD-5) rather than the client echoing
        // a number back at it. With no schedule there is nothing to echo and
        // the entered amount is always sent.
        amountCents: enteredCents !== null && enteredCents !== bylawCents ? enteredCents : undefined,
        dueOn: dueOn || undefined,
        note: note.trim() || undefined,
      })
      error = r.error
      const money = r.amountCents !== undefined ? `$${(r.amountCents / 100).toFixed(2)} ` : ""
      success = r.notified
        ? `${money}fine issued and the resident notified.`
        : `${money}fine issued. No resident is assigned, so nobody was notified.`
    } else if (action.kind === "resolve") {
      const r = await resolveViolation(violation.id, note.trim() || "Resolved")
      error = r.error
      success = r.notified
        ? "Case resolved and the resident notified."
        : "Case resolved. No resident is assigned, so nobody was notified."
    } else if (action.kind === "dismiss") {
      const r = await dismissViolation(violation.id, note.trim() || "Dismissed")
      error = r.error
      success = r.notified
        ? "Case dismissed and the resident notified."
        : "Case dismissed. No resident is assigned, so nobody was notified."
    } else {
      const r = await remindAboutFine(violation.id, note.trim() || undefined)
      error = r.error
      success =
        r.amountCents !== undefined
          ? `Reminder sent — $${(r.amountCents / 100).toFixed(2)} outstanding.`
          : "Reminder sent."
    }

    setBusy(false)
    if (error) return toast.error(error)
    toast.success(success)
    onDone()
  }

  return (
    <Sheet title={SHEET_TITLE[action.kind]} onClose={onClose}>
      <div className="mb-4 rounded-xl bg-muted p-3">
        <p className="text-[13px] font-semibold text-foreground">
          Unit {violation.unit} — {violation.type}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {violation.resident} &middot; {violation.pet} &middot; currently {violation.stageLabel.toLowerCase()}
        </p>
        {/* Composed from the mirrored ladder, not written out here — the same
            sentence `advanceError` shows if the database refuses a move. */}
        {action.kind !== "remind" && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {describeLegalMoves(violation.stage)}
          </p>
        )}
      </div>

      {action.kind === "fine" && (
        <>
          {noSchedule ? (
            <div className="mb-3 rounded-xl border border-warning/40 bg-warning/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning-strong" />
                <p className="text-[11px] leading-relaxed text-foreground">
                  <span className="font-semibold">This building has no fine schedule.</span> Nothing in its bylaws says
                  what a {degree === "fine_1" ? "first fine " : "second fine "}should cost, so the amount below is yours, not
                  the building&apos;s. Say what it is based on — the note is kept with the case and is what a tribunal
                  would read.
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-3 rounded-xl bg-primary/5 p-3">
              <p className="text-[11px] leading-relaxed text-foreground">
                <span className="font-semibold">
                  Bylaw schedule: ${((bylawCents as number) / 100).toFixed(2)} {schedule?.currency}
                </span>{" "}
                for a {degree === "fine_1" ? "first fine" : "second fine"}. Leave the amount as it is and the schedule is
                applied; change it and you are recording a deliberate deviation.
              </p>
            </div>
          )}

          <TextField
            label="Amount ($)"
            value={amount}
            onChange={setAmount}
            placeholder="0.00"
            hint={deviates ? "This differs from the bylaw schedule. Explain why below." : undefined}
          />
          <TextField
            label="Due date (optional)"
            value={dueOn}
            onChange={setDueOn}
            type="date"
            hint="Left blank, the fine is issued with no due date and reminders will not name one."
          />
        </>
      )}

      <div className="mb-3">
        <label className="mb-1 block text-[12px] font-semibold text-muted-foreground">
          {action.kind === "resolve"
            ? "Outcome"
            : action.kind === "dismiss"
              ? "Reason for dismissal"
              : action.kind === "remind"
                ? "Message to the resident (optional)"
                : noteRequired
                  ? "Why this amount (required)"
                  : "Note (optional)"}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={
            action.kind === "resolve"
              ? "Remedied — pet now registered"
              : action.kind === "dismiss"
                ? "Reported in error; no bylaw breach"
                : action.kind === "remind"
                  ? "Added to the end of the reminder the resident receives."
                  : "Kept with the case and shown to the resident."
          }
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] text-foreground focus:border-primary focus:outline-none"
        />
        {(action.kind === "resolve" || action.kind === "dismiss") && (
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            This becomes the case&apos;s outcome on the Resolved tab, and the resident is told. Closing a case is final
            — reopening means logging a new one.
          </p>
        )}
      </div>

      <SheetButton
        onClick={submit}
        busy={busy}
        disabled={blocked}
        label={
          action.kind === "warning"
            ? "Issue warning"
            : action.kind === "fine"
              ? `Issue ${degree === "fine_1" ? "first" : "second"} fine`
              : action.kind === "resolve"
                ? "Resolve case"
                : action.kind === "dismiss"
                  ? "Dismiss case"
                  : "Send reminder"
        }
      />
      {blocked && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {enteredCents === null ? "Enter an amount above $0." : "A note is required for this amount."}
        </p>
      )}
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* Log a violation                                                     */
/* ------------------------------------------------------------------ */

function ComposerSheet({
  buildings,
  subjects,
  onClose,
  onDone,
}: {
  buildings: { id: string; name: string }[]
  subjects: { petId: string; petName: string; buildingId: string; residentId: string | null; residentName: string; unitId: string | null; unitNumber: string }[]
  onClose: () => void
  onDone: () => void
}) {
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? "")
  const [petId, setPetId] = useState("")
  const [type, setType] = useState(VIOLATION_TYPES[0].value)
  const [busy, setBusy] = useState(false)

  const inBuilding = subjects.filter((s) => s.buildingId === buildingId)
  const subject = inBuilding.find((s) => s.petId === petId) ?? null

  async function submit() {
    if (!buildingId) return toast.error("Pick a building.")
    setBusy(true)
    const { error } = await openViolation({
      buildingId,
      type,
      petId: subject?.petId ?? null,
      residentId: subject?.residentId ?? null,
      unitId: subject?.unitId ?? null,
    })
    setBusy(false)
    if (error) return toast.error(error)
    toast.success(
      subject
        ? `Case opened against ${subject.petName} at unit ${subject.unitNumber}.`
        : "Case opened with no pet identified yet.",
    )
    onDone()
  }

  return (
    <Sheet title="Log a violation" onClose={onClose}>
      {buildings.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          You do not manage any buildings, so there is nowhere to file a case.
        </p>
      ) : (
        <>
          <SelectField
            label="Building"
            value={buildingId}
            onChange={(v) => {
              setBuildingId(v)
              setPetId("")
            }}
            options={buildings.map((b) => ({ value: b.id, label: b.name }))}
          />

          <SelectField
            label="Pet and resident"
            value={petId}
            onChange={setPetId}
            options={[
              { value: "", label: "No pet identified yet" },
              ...inBuilding.map((s) => ({
                value: s.petId,
                label: `Unit ${s.unitNumber} — ${s.petName} (${s.residentName})`,
              })),
            ]}
          />

          <SelectField label="Type of breach" value={type} onChange={setType} options={VIOLATION_TYPES} />

          <div className="mb-3 rounded-xl bg-muted p-3">
            <div className="flex items-start gap-2">
              <Bell className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The case opens at <span className="font-semibold text-foreground">open</span> — the database permits no
                other starting stage. The resident is not notified yet: the first message they receive is the warning,
                which goes through the ladder and leaves a record.
                {!subject && " With no pet named, the case has no resident attached and nobody to notify until you assign one."}
              </p>
            </div>
          </div>

          <SheetButton onClick={submit} busy={busy} label="Open case" />
        </>
      )}
    </Sheet>
  )
}
