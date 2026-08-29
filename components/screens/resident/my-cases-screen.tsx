"use client"

/**
 * Pet10x — the case against you, as its subject sees it.
 *
 * Phase 2 built the whole enforcement ladder and every screen for it faced the
 * MANAGER. `violations_select`, `vevents_select` and `fines_select` have all
 * admitted `resident_id = auth.uid()` since the beginning and nothing had ever
 * queried them: a resident received a notification saying a fine had been
 * issued and had nowhere in the app to see it, let alone contest it.
 *
 * WHAT THIS SCREEN SHOWS: the violation type, the rung it sits on, when it was
 * opened, the pet named on it, the dated `violation_events` ledger INCLUDING
 * THE MANAGER'S NOTES, every fine with its amount, due date and status, and the
 * resident's own appeal with its outcome.
 *
 * WHAT IT DOES NOT SHOW, and no policy is written to make it visible: the
 * reporter's identity, the incident's description, any evidence file, the
 * reporting unit, the audit log, and the name of the manager who decided. A
 * strata notice tells you what you are alleged to have done and what it costs.
 * It does not hand you your neighbour's name and their photographs — that is a
 * retaliation vector, and it is the reason complaints go to the strata rather
 * than to the neighbour. `useMyCases` embeds nothing that would leak any of it
 * and says so at the query.
 *
 * The manager's note IS shown, because it is the reason the resident is being
 * asked to accept or contest a finding, and a dispute against an unstated
 * reason is not a dispute.
 *
 * NO PAYMENT SURFACE ANYWHERE (AD-8). The scoping instruction was "fine
 * payments later, for now just see dispute or appeal". A resident sees what
 * they owe and can contest it; they do not pay in the app. The screen says how
 * a fine is actually paid, so the absence reads as a fact rather than as a
 * feature somebody forgot.
 */

import { useEffect, useMemo, useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { Portal } from "@/components/ui/portal"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useMyCases, fileDispute } from "@/lib/data/live"
import { useMyNotices } from "@/lib/data/clinic/notices"
import { stampOf } from "@/lib/data/case-timeline"
import { longDate } from "@/lib/dates"
import { STAGE_LABEL, isTerminal } from "@/lib/data/violations"
import { DISPUTE_WINDOW_DAYS, canDispute, describeWhyNot, disputeDeadline } from "@/lib/data/disputes"
import type { ResidentCase, ViolationStage } from "@/lib/data/types"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  Gavel,
  Loader2,
  Scale,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react"

const MAX_REASON = 2000

/** Keyed on the stage enum, never on `string`. A seventh rung is a type error
 *  here rather than a silently missing badge — the `Record<string, X>` defect
 *  Phase 2 found on the manager's dashboard. */
const STAGE_STYLE: Record<ViolationStage, { color: string; icon: typeof AlertTriangle }> = {
  open: { color: "bg-muted text-muted-foreground", icon: ShieldCheck },
  warning: { color: "bg-warning/10 text-warning-strong", icon: Gavel },
  fine_1: { color: "bg-destructive/10 text-destructive", icon: DollarSign },
  fine_2: { color: "bg-destructive/10 text-destructive", icon: DollarSign },
  resolved: { color: "bg-success/10 text-success", icon: CheckCircle2 },
  dismissed: { color: "bg-muted text-muted-foreground", icon: XCircle },
}

/**
 * Where the case stands, in plain words rather than a progress bar.
 *
 * The four rungs are strictly linear and `manager_advance_violation` enforces
 * that, so "the next step is a fine" is a TRUE statement about what can happen
 * next, not decoration. Keyed on the enum for the same reason as above.
 */
const LADDER_SENTENCE: Record<ViolationStage, string> = {
  open: "Your building has opened a case and is looking into it. Nothing has been decided, and no warning or fine has been issued.",
  warning: "This is a warning — the first formal step. If the matter is not resolved, the next step your building can take is a fine.",
  fine_1: "A first fine has been issued. If the matter continues, the next step your building can take is a second fine.",
  fine_2: "A second fine has been issued. This is the last step on the enforcement ladder; from here the case can only be closed.",
  resolved: "This case is closed. It was resolved, and it cannot be reopened — a further breach would be a new case.",
  dismissed: "This case was dismissed. It is closed and cannot be reopened.",
}

function money(cents: number, currency: string): string {
  return `$${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
}

/*
 * DATES ON THIS SCREEN COME FROM `@/lib/dates`, and that import is the fix.
 *
 * A BARE `YYYY-MM-DD` IS A CALENDAR DATE, NOT AN INSTANT. `new Date("2026-06-27")`
 * is specified to parse a date-only string as UTC MIDNIGHT; `toLocaleDateString`
 * then renders it in the viewer's zone, so everyone west of UTC saw the previous
 * day. MEASURED IN THE BROWSER before the fix, at UTC-7 against live data:
 *
 *   violation_events.occurred_on  2026-06-27  rendered  "June 26, 2026"
 *   violation_events.occurred_on  2026-08-23  rendered  "August 22, 2026"
 *   fines.due_on                  2026-07-25  rendered  "Due July 24, 2026"
 *
 * The last one is a resident-facing payment deadline shown a day early, on the
 * screen whose whole job is to state what they owe and by when. `tsc`, the
 * build and 177 tests were all green on it.
 *
 * The rule lived here as a private helper for one round. It is a MODULE now,
 * because the review that read this fix found the same rule spelled four ways
 * across the repo and two of the other spellings wrong in ways this one was
 * not — one driving a compliance badge, one writing "1 day ago" about something
 * that expires today into an LLM prompt. `longDate` is that rule, once.
 */

/**
 * What each fine status means to the person who owes it.
 *
 * Deliberately NOT `Record<string, string>` with a `?? fallback` — that is an
 * opt-out of the type system at the seam where the schema meets the app, and it
 * is how a waived fine went on reading "Unpaid" for a whole phase. The keys are
 * the seven `fine_status` labels; an eighth is a compile error.
 *
 * `status` arrives as `string` from the row rather than as the enum, so the
 * lookup is guarded — but the TABLE is exhaustive, which is the half that
 * matters.
 */
const FINE_STATUS_WORDS: Record<string, { label: string; tone: string; owed: boolean }> = {
  issued: { label: "Unpaid", tone: "bg-destructive/10 text-destructive", owed: true },
  partially_paid: { label: "Part paid", tone: "bg-warning/10 text-warning-strong", owed: true },
  disputed: { label: "Under appeal", tone: "bg-warning/10 text-warning-strong", owed: true },
  paid: { label: "Paid", tone: "bg-success/10 text-success", owed: false },
  waived: { label: "Waived", tone: "bg-success/10 text-success", owed: false },
  remitted: { label: "Remitted", tone: "bg-success/10 text-success", owed: false },
  written_off: { label: "Written off", tone: "bg-muted text-muted-foreground", owed: false },
}

export function MyCasesScreen({
  onBack,
  focusCaseId,
}: {
  onBack: () => void
  /** From a `my-cases:<id>` notification target — opens that case expanded. */
  focusCaseId?: string
}) {
  const { data: cases, isLoading, error, refetch } = useMyCases()
  const [expanded, setExpanded] = useState<string | null>(focusCaseId ?? null)
  const [disputing, setDisputing] = useState<ResidentCase | null>(null)

  // A notification can arrive for a case that is already on screen, so the
  // focus is applied whenever it changes rather than only on mount.
  useEffect(() => {
    if (focusCaseId) setExpanded(focusCaseId)
  }, [focusCaseId])

  /*
   * `resolved_at` is the honest live/closed split, not the stage.
   * `manager_advance_violation` stamps it for BOTH terminal stages
   * (`20260823000002:249-250`), and the manager's own queues count open cases
   * with `.is("resolved_at", null)` — so this screen and that one agree about
   * which cases are live by reading the same column.
   */
  const live = useMemo(() => cases.filter((c) => c.resolvedAt === null), [cases])
  const closed = useMemo(() => cases.filter((c) => c.resolvedAt !== null), [cases])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Violations & Fines"
        largeTitle={false}
        leftAction={<NavBackButton onClick={onBack} />}
      />

      <main className="ios-scroll flex-1 px-4 pb-24">
        {isLoading && cases.length === 0 && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-[12px] leading-relaxed text-destructive">
              {`We could not load your cases: ${error}`}
            </p>
          </div>
        )}

        <NoticesReceived />

        {!isLoading && !error && cases.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <ShieldCheck className="h-6 w-6 text-success" />
            </div>
            <h3 className="mt-4 text-[15px] font-semibold text-foreground">No cases against you</h3>
            <p className="mx-auto mt-1 max-w-[24rem] text-[13px] leading-relaxed text-muted-foreground">
              Your building has not opened a pet bylaw case involving your unit. If one is ever opened, it appears
              here with everything your strata has recorded about it.
            </p>
          </div>
        )}

        {live.length > 0 && (
          <>
            <SectionHeading>{`Open cases (${live.length})`}</SectionHeading>
            <div className="grid gap-2.5">
              {live.map((c) => (
                <CaseCard
                  key={c.id}
                  c={c}
                  open={expanded === c.id}
                  onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                  onDispute={() => setDisputing(c)}
                />
              ))}
            </div>
          </>
        )}

        {closed.length > 0 && (
          <>
            <SectionHeading>{`Closed cases (${closed.length})`}</SectionHeading>
            <div className="grid gap-2.5">
              {closed.map((c) => (
                <CaseCard
                  key={c.id}
                  c={c}
                  open={expanded === c.id}
                  onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                  onDispute={() => setDisputing(c)}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {disputing && (
        <DisputeSheet
          c={disputing}
          onClose={() => setDisputing(null)}
          onDone={() => {
            setDisputing(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-4 px-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  )
}

/* ------------------------------------------------------------------ */
/* One case                                                            */
/* ------------------------------------------------------------------ */

function CaseCard({
  c,
  open,
  onToggle,
  onDispute,
}: {
  c: ResidentCase
  open: boolean
  onToggle: () => void
  onDispute: () => void
}) {
  const style = STAGE_STYLE[c.stage]
  const StageIcon = style.icon
  const openDispute = c.disputes.find((d) => d.outcome === null) ?? null
  const disputeThisStage = c.disputes.find((d) => d.stage === c.stage) ?? null

  const verdict = canDispute({
    stage: c.stage,
    anchorIso: c.anchorIso,
    hasOpenDispute: openDispute !== null,
    alreadyDisputedThisStage: disputeThisStage !== null,
  })

  return (
    <div className="overflow-hidden rounded-xl card-raised">
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-3 text-left">
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${style.color}`}>
          <StageIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold capitalize text-foreground">{c.type}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {`Opened ${longDate(c.openedAt)}`}
            {c.petName ? ` · ${c.petName}` : ""}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {openDispute && (
            <Badge className="border-0 bg-warning/10 text-[9px] text-warning-strong">Under appeal</Badge>
          )}
          <Badge className={`border-0 text-[9px] ${style.color}`}>{STAGE_LABEL[c.stage]}</Badge>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-3 pb-3 pt-3">
          {/* Where it stands, in words. */}
          <p className="text-[12px] leading-relaxed text-muted-foreground">{LADDER_SENTENCE[c.stage]}</p>
          {c.resolutionOutcome && isTerminal(c.stage) && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-foreground">
              {`Outcome recorded: ${c.resolutionOutcome}`}
            </p>
          )}

          <History c={c} />
          <Money c={c} />
          <DisputePanel c={c} verdict={verdict} onDispute={onDispute} />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The history                                                         */
/* ------------------------------------------------------------------ */

function History({ c }: { c: ResidentCase }) {
  if (c.events.length === 0) {
    return (
      <div className="mt-3">
        <SubHeading>What has happened</SubHeading>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Nothing has been recorded on this case yet.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-3">
      <SubHeading>What has happened</SubHeading>
      <ol className="space-y-2.5">
        {c.events.map((e) => {
          /*
           * A self-transition must not render as "Warning → Warning". A
           * dispute writes one (`from_stage = to_stage`), and so does the
           * manager's decision on it, and so does one pre-existing row left by
           * Phase 2's verbal/written collapse. What happened is in the NOTE, so
           * the note is what leads.
           */
          const isSelf = e.fromStage === e.toStage
          /*
           * A NULL `from_stage` means one of TWO different things, and calling
           * both of them "Case opened" is a lie about ten live rows.
           *
           *   - `trg_violations_opening_event` writes one when a case is
           *     opened. That IS an opening.
           *   - Phase 2's ladder migration wrote ten, one per remapped case,
           *     all carrying `Migrated from <old label>` — record-keeping from
           *     the day the stage vocabulary changed. Nothing happened to the
           *     case, and 10 of the 10 live null-from rows are these.
           *
           * The note is what distinguishes them, so the note is what is read.
           * Neither is hidden: a resident is entitled to see every row on their
           * own case. But "Migrated from written_warning" is internal jargon,
           * so it is translated rather than shown raw.
           */
          const migrated = e.fromStage === null && (e.note ?? "").startsWith("Migrated from ")
          const opened = e.fromStage === null && !migrated
          return (
            <li key={e.id} className="border-l-2 border-border pl-3">
              <p className="text-[11px] font-medium text-muted-foreground">
                {longDate(e.occurredOn ?? e.createdAt)}
              </p>
              {migrated ? (
                <>
                  <p className="text-[12px] font-semibold text-muted-foreground">Record-keeping entry</p>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    {`Your building's system renamed its case stages on this date. This case became "${STAGE_LABEL[
                      e.toStage
                    ].toLowerCase()}". Nothing about the case itself changed.`}
                  </p>
                </>
              ) : (
                <>
                  {!isSelf && (
                    <p className="text-[12px] font-semibold text-foreground">
                      {opened
                        ? `Case opened at ${STAGE_LABEL[e.toStage].toLowerCase()}`
                        : `${STAGE_LABEL[e.fromStage!]} → ${STAGE_LABEL[e.toStage]}`}
                    </p>
                  )}
                  {e.note && <p className="text-[12px] leading-relaxed text-foreground">{e.note}</p>}
                  {!e.note && isSelf && (
                    <p className="text-[12px] italic leading-relaxed text-muted-foreground">
                      {`A note was recorded on this case at the ${STAGE_LABEL[e.toStage].toLowerCase()} stage.`}
                    </p>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
}

/* ------------------------------------------------------------------ */
/* The money — and no way to pay it (AD-8)                             */
/* ------------------------------------------------------------------ */

function Money({ c }: { c: ResidentCase }) {
  if (c.fines.length === 0) return null
  const anyOwed = c.fines.some((f) => FINE_STATUS_WORDS[f.status]?.owed ?? true)

  return (
    <div className="mt-3">
      <SubHeading>Fines</SubHeading>
      <div className="space-y-1.5">
        {c.fines.map((f) => {
          const words = FINE_STATUS_WORDS[f.status]
          return (
            <div key={f.id} className="flex items-center justify-between rounded-lg bg-muted px-2.5 py-2">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-foreground">{money(f.amountCents, f.currency)}</p>
                {f.dueOn && (
                  <p className="text-[11px] text-muted-foreground">{`Due ${longDate(f.dueOn)}`}</p>
                )}
              </div>
              <Badge className={`flex-shrink-0 border-0 text-[9px] ${words?.tone ?? "bg-muted text-muted-foreground"}`}>
                {words?.label ?? f.status.replace(/_/g, " ")}
              </Badge>
            </div>
          )
        })}
      </div>
      {anyOwed && (
        /*
         * AD-8: there is no payment surface in Pet10x, and there is no plan for
         * one in this phase. Stating HOW a fine is paid is what turns the
         * absence of a Pay button into a fact rather than a missing feature —
         * a resident who finds no way to pay and no explanation concludes the
         * app is broken, and then does nothing.
         */
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Fines are paid to your strata directly, the same way as any other levy — Pet10x does not take payments.
          Contact your strata or property manager to arrange it.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The appeal, in exactly one of four states                           */
/* ------------------------------------------------------------------ */

function DisputePanel({
  c,
  verdict,
  onDispute,
}: {
  c: ResidentCase
  verdict: ReturnType<typeof canDispute>
  onDispute: () => void
}) {
  const openDispute = c.disputes.find((d) => d.outcome === null) ?? null
  const decided = c.disputes.filter((d) => d.outcome !== null)

  return (
    <div className="mt-3 border-t border-border pt-3">
      <SubHeading>Your appeal</SubHeading>

      {/* State 3: one is open. */}
      {openDispute && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-2.5">
          <p className="text-[12px] font-semibold text-warning-strong">
            {`Waiting on your strata — filed ${longDate(openDispute.filedAt)}`}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {`You disputed the ${STAGE_LABEL[openDispute.stage].toLowerCase()} stage. You said:`}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
            {openDispute.reason}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            While this is open your building cannot move the case forward, and no reminder will be sent about a fine
            it covers.
          </p>
        </div>
      )}

      {/* State 4: decided ones, kept as history. */}
      {decided.map((d) => (
        <div
          key={`${d.stage}-${d.decidedAt}`}
          className={`mt-1.5 rounded-lg p-2.5 ${
            d.outcome === "overturned" ? "bg-success/5 border border-success/30" : "bg-muted"
          }`}
        >
          <p className="text-[12px] font-semibold text-foreground">
            {d.outcome === "overturned"
              ? `Appeal succeeded — decided ${longDate(d.decidedAt)}`
              : `Appeal not successful — decided ${longDate(d.decidedAt)}`}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {`You disputed the ${STAGE_LABEL[d.stage].toLowerCase()} stage on ${longDate(d.filedAt)}. You said:`}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">{d.reason}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">Your strata replied:</p>
          <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-foreground">
            {d.decidedNote ?? "No reason was given."}
          </p>
        </div>
      ))}

      {/* State 1: nothing filed and one may be. */}
      {!openDispute && verdict.ok && (
        <>
          <button
            onClick={onDispute}
            className="w-full rounded-lg bg-primary/10 py-2.5 text-[13px] font-semibold text-primary transition-transform active:scale-[0.98]"
          >
            Dispute this
          </button>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {`You have until ${longDate(disputeDeadline(c.anchorIso))} to contest the ${STAGE_LABEL[
              c.stage
            ].toLowerCase()} stage — ${DISPUTE_WINDOW_DAYS} days from the date it was issued.`}
          </p>
        </>
      )}

      {/*
        State 2: nothing open and none may be filed. The control is REPLACED,
        never hidden. A control that vanishes lies about ever having existed —
        a resident who missed the window and finds no button anywhere concludes
        the app has no appeal process, not that theirs expired.

        `already` is skipped here only when the decided panel above is already
        saying the same thing in more detail.
      */}
      {!openDispute && !verdict.ok && !(verdict.reason === "already" && decided.length > 0) && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {describeWhyNot(verdict.reason, disputeDeadline(c.anchorIso))}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The dispute sheet                                                   */
/* ------------------------------------------------------------------ */

function DisputeSheet({
  c,
  onClose,
  onDone,
}: {
  c: ResidentCase
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  const trimmed = reason.trim()
  // The client check is a COURTESY, not the enforcement — `dispute_violation`
  // refuses an empty reason on its own and `fileDispute` maps that code. A
  // client-side check treated as the guarantee is how a guard gets deleted in a
  // refactor and nobody notices.
  const blocked = trimmed.length === 0 || reason.length > MAX_REASON

  /* The stage being contested, named explicitly. "Dispute this" on a card
     showing three fines is ambiguous about which finding is being appealed;
     the sheet is where that has to be unambiguous, because the answer becomes
     `violation_disputes.stage` and cannot be changed afterwards. */
  const anchorEvent = c.events.filter((e) => e.toStage === c.stage).at(-1)
  const stageDate = longDate(anchorEvent?.occurredOn ?? anchorEvent?.createdAt ?? c.openedAt)

  async function submit() {
    setBusy(true)
    const { error } = await fileDispute(c.id, trimmed)
    setBusy(false)
    if (error) return toast.error(error)
    toast.success("Your appeal was filed", {
      description: "Your building's managers have been notified and will decide it.",
    })
    onDone()
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
        <div
          className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-5 sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[17px] font-semibold text-foreground">Dispute this finding</h3>
            <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground active:bg-muted">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-4 rounded-xl bg-muted p-3">
            <p className="text-[13px] font-semibold capitalize text-foreground">{c.type}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {`You are disputing the ${STAGE_LABEL[c.stage].toLowerCase()} of ${stageDate}.`}
            </p>
            {c.fines.length > 0 && (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {`While your appeal is open, any unpaid fine on this case is marked as under appeal and your building will not chase it.`}
              </p>
            )}
          </div>

          <label className="mb-1 block text-[12px] font-semibold text-muted-foreground" htmlFor="dispute-reason">
            Why do you disagree?
          </label>
          <textarea
            id="dispute-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={6}
            placeholder="Describe what actually happened, and anything your strata should take into account."
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] text-foreground focus:border-primary focus:outline-none"
          />
          <div className="mt-1 flex items-center justify-between">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Your building&rsquo;s managers read this exactly as you write it.
            </p>
            <span
              className={`flex-shrink-0 text-[11px] tabular-nums ${
                reason.length > MAX_REASON ? "font-semibold text-destructive" : "text-muted-foreground"
              }`}
            >
              {`${reason.length} / ${MAX_REASON}`}
            </span>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Scale className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>
              You can dispute each stage of a case once. If the case later escalates, you can dispute that stage
              separately.
            </span>
          </p>

          <button
            onClick={submit}
            disabled={busy || blocked}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit appeal
          </button>
        </div>
      </div>
    </Portal>
  )
}

/**
 * What the building actually sent — warnings, fines, strata fines, letters.
 *
 * The case list explains where a case STANDS. This is the paperwork behind it,
 * in the resident's own words rather than a stage name, because "fine_1" is not
 * what arrived through their door.
 */
function NoticesReceived() {
  const { data: notices, isLoading } = useMyNotices()
  if (isLoading || notices.length === 0) return null

  const tone = (kind: string) =>
    kind.includes("fine")
      ? "border-destructive/30 bg-destructive/5"
      : kind === "warning"
        ? "border-warning/40 bg-warning/10"
        : "border-border bg-card"

  return (
    <section className="mb-4">
      <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Notices you have received
      </h3>
      <ul className="flex flex-col gap-2">
        {notices.map((n) => (
          <li key={n.id} className={`rounded-2xl border p-3.5 ${tone(n.kind)}`}>
            <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-foreground">
              {n.title ?? n.kindLabel}
              <Badge variant="secondary" className="text-[10px]">{n.kindLabel}</Badge>
              {n.amountCents ? (
                <span className="text-[13px] font-semibold tabular-nums text-destructive">
                  {new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
                    n.amountCents / 100,
                  )}
                </span>
              ) : null}
            </p>
            {n.body && (
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{n.body}</p>
            )}
            <p className="mt-1.5 text-[11.5px] tabular-nums text-muted-foreground">
              {/* Time, not just date: two notices on one day still have an order. */}
              {stampOf(n.issuedAt)}
              {n.dueOn ? ` · due ${longDate(n.dueOn)}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
