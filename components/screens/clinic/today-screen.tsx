"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Phone, Check, X, AlertTriangle, Clock, CircleCheck, Circle } from "lucide-react"
import type { ClinicMembership } from "@/lib/data/clinic/context"
import { useClinicLocations, useClinicStaff, capabilities } from "@/lib/data/clinic/context"
import {
  useOpenAppointments, setAppointmentStatus, openVisitForAppointment, STATUS_LABEL,
  useAppointmentTypes, useStaffHours,
  type Appointment, type AppointmentStatus,
} from "@/lib/data/clinic/schedule"
import { useLatestVerification } from "@/lib/data/clinic/verification"
import { verificationBanner } from "@/lib/data/business-tier"
import { clinicSetupChecklist, type SetupTarget } from "@/lib/data/clinic/setup-checklist"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PatientPanel, type BillOpened } from "./patient-panel"
import { checkoutCompletes } from "@/lib/data/clinic/billing"
import { useReminderQueue, useClinicTasks, completeTask, addTask } from "@/lib/data/clinic/reminders"
import { useEmergencyArrivals } from "@/lib/data/clinic/emergency"
import { formatTime, todayISO, dueLabel, daysUntil } from "@/lib/data/clinic/time"
import { SectionCard } from "@/components/ui/section-card"
import { StatTile } from "@/components/ui/stat-tile"
import { Spinner } from "@/components/ui/spinner"
import { LoadError } from "@/components/ui/load-error"
import { EmptyState } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SpeciesIcon } from "@/components/screens/shared/species-icon"
import { LinkedBadge } from "@/components/screens/clinic/linked-badge"
import { Modal } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Toolbar } from "@/components/ui/toolbar"

/**
 * The operations board. Answers, without anyone asking anyone: who is here,
 * who is waiting, what is unfinished, and who needs calling.
 */
export function ClinicTodayScreen({
  clinic,
  onGo,
  onOpenServices,
  onOpenInvoice,
}: {
  clinic: ClinicMembership
  onGo: (tab: "calendar" | "customers" | "reminders" | "emergency" | "team") => void
  /** Shop → Services and prices. */
  onOpenServices: () => void
  /** Billing, with this bill open. */
  onOpenInvoice: (invoiceId: string) => void
}) {
  const { data: locations } = useClinicLocations(clinic.businessId)
  const tz = locations.find((l) => l.isPrimary)?.timezone ?? "America/Vancouver"
  const appts = useOpenAppointments(clinic.businessId, tz)
  const reminders = useReminderQueue(clinic.businessId)
  const tasks = useClinicTasks(clinic.businessId)
  const arrivals = useEmergencyArrivals(clinic.businessId)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskTitle, setTaskTitle] = useState("")
  const [checkout, setCheckout] = useState<{ appt: Appointment; visitId: string } | null>(null)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [declining, setDeclining] = useState<Appointment | null>(null)
  const caps = capabilities(clinic.role, clinic.tier, clinic.isOwner)

  const today = todayISO(new Date(), tz)
  const groups = useMemo(() => {
    const rows = appts.data
    const isToday = (a: Appointment) => todayISO(new Date(a.startsAt), tz) === today
    return {
      waiting: rows.filter((a) => a.status === "arrived"),
      inRoom: rows.filter((a) => a.status === "in_progress"),
      ready: rows.filter((a) => a.status === "ready"),
      upcoming: rows.filter((a) => a.status === "booked" && isToday(a)),
      requested: rows.filter((a) => a.status === "requested"),
    }
  }, [appts.data, today, tz])

  const overdueReminders = reminders.data.filter((r) => (daysUntil(r.dueOn) ?? 0) <= 0)

  async function move(a: Appointment, status: AppointmentStatus) {
    setBusyId(a.id)
    const res = await setAppointmentStatus(a.id, status)
    setBusyId(null)
    if (res.error) toast.error(res.error)
    else appts.refetch()
  }

  /**
   * "Check out" opens the appointment's visit (creating it if this is the
   * first time — clinic_open_visit) on the patient's chart, where its services
   * are added and "Create invoice" bills them. The appointment completes when
   * an invoice is created for this visit (checkoutCompletes), or when
   * reception checks out without one; anything else just opens Billing.
   */
  async function startCheckout(a: Appointment) {
    setBusyId(a.id)
    const res = await openVisitForAppointment(a.id)
    setBusyId(null)
    if (res.error || !res.visitId) return toast.error(res.error ?? "Couldn't open the visit. Try again.")
    setCheckout({ appt: a, visitId: res.visitId })
  }

  /** A visit card in the check-out chart created or opened a bill. */
  function billFromCheckout(invoiceId: string, info: BillOpened) {
    const c = checkout
    if (c && checkoutCompletes({ checkoutVisitId: c.visitId, ...info })) return void finishCheckout(invoiceId)
    setCheckout(null)
    onOpenInvoice(invoiceId)
  }

  async function finishCheckout(invoiceId: string | null) {
    const c = checkout
    if (!c) return
    setCheckoutBusy(true)
    const res = await setAppointmentStatus(c.appt.id, "completed")
    setCheckoutBusy(false)
    if (res.error) {
      // The invoice (if any) exists either way; say what didn't happen.
      toast.error(`${c.appt.patientName} is still on the board: ${res.error}`)
    } else {
      toast.success(`${c.appt.patientName} checked out`)
    }
    setCheckout(null)
    appts.refetch()
    if (invoiceId) onOpenInvoice(invoiceId)
  }

  if (appts.isLoading) return <Spinner label="Opening the day" />
  if (appts.error) return <LoadError message={appts.error} onRetry={appts.refetch} />

  return (
    <div className="flex flex-col gap-4">
      {caps.manageSchedule && (
        <SetupChecklist clinic={clinic} onGo={onGo} onOpenServices={onOpenServices} />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Waiting" value={groups.waiting.length} tone={groups.waiting.length ? "warn" : "default"} />
        <StatTile label="In room" value={groups.inRoom.length} tone="info" />
        <StatTile label="To check out" value={groups.ready.length} tone={groups.ready.length ? "warn" : "default"} />
        <StatTile
          label="Still to come"
          value={groups.upcoming.length}
          hint="today"
          onClick={() => onGo("calendar")}
        />
        <StatTile
          label="Calls due"
          value={overdueReminders.length}
          tone={overdueReminders.length ? "bad" : "good"}
          onClick={() => onGo("reminders")}
        />
      </div>

      {arrivals.data.length > 0 && (
        <SectionCard
          title="Someone is on their way"
          subtitle="Sent from the owner's app before they arrive"
          actions={
            <Button size="sm" variant="secondary" onClick={() => onGo("emergency")}>
              Emergency board
            </Button>
          }
        >
          <ul className="flex flex-col gap-2">
            {arrivals.data.slice(0, 3).map((a) => (
              <li key={a.id} className="rounded-xl border border-destructive bg-destructive-soft p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
                  <span className="text-meta font-semibold text-foreground">{a.petName}</span>
                  <Badge variant="danger">{a.triageLevel}</Badge>
                  {a.etaMinutes !== null && <Badge variant="warning">ETA {a.etaMinutes} min</Badge>}
                </div>
                <p className="mt-1 text-caption text-muted-foreground">{a.problem}</p>
                {a.allergies && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-caption font-semibold text-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-destructive" aria-hidden="true" />
                    Allergies: {a.allergies}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {groups.requested.length > 0 && (
        <SectionCard title="Requests to confirm" subtitle="Booked online, waiting on you">
          <ul className="flex flex-col gap-2">
            {groups.requested.map((a) => (
              <ApptRow key={a.id} a={a} tz={tz} busy={busyId === a.id}
                actions={
                  <>
                    <Button size="sm" onClick={() => void move(a, "booked")}>Confirm</Button>
                    <Button size="sm" variant="secondary" onClick={() => setDeclining(a)}>
                      <X className="h-3.5 w-3.5 text-destructive" aria-hidden="true" /> Decline request
                    </Button>
                  </>
                } />
            ))}
          </ul>
        </SectionCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Waiting room" subtitle="Checked in, not yet seen">
          {groups.waiting.length === 0 ? (
            <EmptyState title="Nobody waiting" detail="Arrivals show up here the moment reception checks them in." />
          ) : (
            <ul className="flex flex-col gap-2">
              {groups.waiting.map((a) => (
                <ApptRow key={a.id} a={a} tz={tz} busy={busyId === a.id} showWait
                  actions={<Button size="sm" onClick={() => void move(a, "in_progress")}>Take through</Button>} />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="In room" subtitle="Being seen now">
          {groups.inRoom.length === 0 ? (
            <EmptyState title="No one in a room" />
          ) : (
            <ul className="flex flex-col gap-2">
              {groups.inRoom.map((a) => (
                <ApptRow key={a.id} a={a} tz={tz} busy={busyId === a.id}
                  actions={<Button size="sm" onClick={() => void move(a, "ready")}>Ready to check out</Button>} />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Ready to check out" subtitle="Treatment done, not yet billed">
          {groups.ready.length === 0 ? (
            <EmptyState title="Nothing waiting to be billed" detail="This is where unbilled visits pile up if nobody closes them." />
          ) : (
            <ul className="flex flex-col gap-2">
              {groups.ready.map((a) => (
                <ApptRow key={a.id} a={a} tz={tz} busy={busyId === a.id}
                  actions={<Button size="sm" onClick={() => void startCheckout(a)}>Check out</Button>} />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Call list"
          subtitle="Most overdue first"
          actions={<Button size="sm" variant="secondary" onClick={() => onGo("reminders")}>Work the queue</Button>}
        >
          {reminders.isLoading ? (
            <Spinner />
          ) : reminders.data.length === 0 ? (
            <EmptyState title="Nobody to chase" detail="Reminders appear here as vaccinations and follow-ups come due." />
          ) : (
            <ul className="flex flex-col gap-2">
              {reminders.data.slice(0, 5).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-meta font-semibold text-foreground">
                      {r.patientName} · {r.label}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {r.customerName} · {dueLabel(r.dueOn)}
                    </p>
                  </div>
                  {r.customerPhone && (
                    <Button asChild variant="secondary" size="sm">
                      <a href={`tel:${r.customerPhone.replace(/[^\d+]/g, "")}`}>
                        <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call
                      </a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Tasks"
        actions={<Button size="sm" variant="secondary" onClick={() => setTaskOpen(true)}>Add task</Button>}
      >
        {tasks.data.length === 0 ? (
          <EmptyState title="Nothing outstanding" />
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.data.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
                <div className="min-w-0">
                  <p className="text-meta font-medium text-foreground">{t.title}</p>
                  {t.detail && <p className="text-caption text-muted-foreground">{t.detail}</p>}
                  {t.dueOn && <p className="mt-0.5 text-caption text-muted-foreground">{dueLabel(t.dueOn)}</p>}
                </div>
                <Button
                  size="sm"
                  variant="quiet"
                  aria-label={`Mark "${t.title}" done`}
                  onClick={async () => {
                    await completeTask(t.id)
                    tasks.refetch()
                  }}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <ConfirmDialog
        open={declining !== null}
        onOpenChange={(o) => {
          if (!o) setDeclining(null)
        }}
        title={`Decline ${declining?.patientName ?? "this"} request?`}
        description="The owner is told the request was declined, with your reason."
        confirmLabel="Decline request"
        cancelLabel="Keep it"
        tone="danger"
        reason={{ label: "Reason (the owner sees this)", required: true, placeholder: "We're fully booked that day" }}
        onConfirm={async (reason) => {
          if (!declining) return { error: null }
          const res = await setAppointmentStatus(declining.id, "cancelled", reason ?? undefined)
          if (res.error) return res
          toast.success("Request declined")
          appts.refetch()
          return { error: null }
        }}
      />

      <Modal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        title="Add a task"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTaskOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                const res = await addTask(clinic.businessId, taskTitle, todayISO(new Date(), tz))
                if (res.error) {
                  // The only message a person can act on is the empty title.
                  toast.error(taskTitle.trim() ? "Couldn't add the task. Try again." : "Say what needs doing.")
                  return
                }
                setTaskTitle("")
                setTaskOpen(false)
                tasks.refetch()
              }}
            >
              Add
            </Button>
          </>
        }
      >
        <Field label="What needs doing?" required>
          {(p) => (
            <Input
              {...p}
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Call Mrs Whitfield about the dental estimate"
            />
          )}
        </Field>
      </Modal>

      <Modal
        open={checkout !== null}
        onClose={() => setCheckout(null)}
        title={checkout ? `Check out ${checkout.appt.patientName}` : "Check out"}
        description="Add what you did to the visit, then create the invoice."
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setCheckout(null)}>Not yet</Button>
            <Button variant="quiet" loading={checkoutBusy} onClick={() => void finishCheckout(null)}>
              Check out without an invoice
            </Button>
          </>
        }
      >
        {checkout &&
          (checkout.appt.patientId ? (
            <PatientPanel
              patientId={checkout.appt.patientId}
              clinic={clinic}
              staffId={clinic.staffId}
              initialTab="visits"
              focusVisitId={checkout.visitId}
              onOpenInvoice={caps.takePayment ? billFromCheckout : undefined}
            />
          ) : (
            <p className="text-meta text-muted-foreground">
              This appointment has no patient on it, so there is no chart to bill from.
            </p>
          ))}
      </Modal>
    </div>
  )
}

/**
 * What a new practice still has to do. Shown to administrators until every
 * row is done; each row opens the screen that fixes it.
 */
function SetupChecklist({
  clinic, onGo, onOpenServices,
}: {
  clinic: ClinicMembership
  onGo: (tab: "team") => void
  onOpenServices: () => void
}) {
  const types = useAppointmentTypes(clinic.businessId)
  const staff = useClinicStaff(clinic.businessId)
  const hours = useStaffHours(clinic.businessId)
  const latest = useLatestVerification(clinic.businessId)
  if (types.isLoading || staff.isLoading || hours.isLoading || latest.isLoading) return null
  // A failed read would show a false "to do"; better to show nothing.
  if (types.error || staff.error || hours.error || latest.error) return null

  const banner = verificationBanner(clinic.tier, latest.data)
  const list = clinicSetupChecklist({
    types: types.data,
    staff: staff.data,
    staffWithHours: Object.keys(hours.data).filter((id) => (hours.data[id] ?? []).length > 0),
    verification: banner ? banner.state : "verified",
  })
  if (list.complete) return null

  function go(target: SetupTarget) {
    if (target.tab === "shop") return onOpenServices()
    if (target.tab === "team") return onGo("team")
    // Verification lives in its banner: the sidebar on desktop, above Today on
    // a phone. Bring whichever is showing into view.
    const el = Array.from(document.querySelectorAll<HTMLElement>("[data-verification-banner]")).find(
      (n) => n.offsetParent !== null,
    )
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
    el?.querySelector<HTMLButtonElement>("button")?.focus()
  }

  return (
    <SectionCard title="Finish setting up" subtitle={`${list.doneCount} of ${list.items.length} done`}>
      <ul className="flex flex-col gap-2">
        {list.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
            <div className="flex min-w-0 items-start gap-2.5">
              {item.done ? (
                <CircleCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" aria-hidden="true" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="text-meta font-semibold text-foreground">
                  {item.label}
                  <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
                </p>
                <p className="text-caption text-muted-foreground">{item.detail}</p>
              </div>
            </div>
            {!item.done && item.actionLabel && (
              <Button size="sm" variant="secondary" onClick={() => go(item.target)}>
                {item.actionLabel}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

function ApptRow({
  a,
  tz,
  actions,
  busy,
  showWait,
}: {
  a: Appointment
  tz: string
  actions?: React.ReactNode
  busy?: boolean
  showWait?: boolean
}) {
  const waited = a.arrivedAt ? Math.round((Date.now() - new Date(a.arrivedAt).getTime()) / 60000) : null
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 w-11 flex-shrink-0 text-caption font-semibold tabular-nums text-muted-foreground">
          {formatTime(a.startsAt, tz)}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-meta font-semibold text-foreground">
            <SpeciesIcon species={a.species} />
            {a.patientName}
            <LinkedBadge linked={a.isLinked} />
            {a.behaviouralAlert && (
              <Badge variant="warning" title={a.behaviouralAlert}>
                Handling note
              </Badge>
            )}
          </p>
          <p className="text-caption text-muted-foreground">
            {a.customerName} · {a.typeName} · {STATUS_LABEL[a.status]}
            {showWait && waited !== null && (
              <span className={waited > 15 ? "font-semibold text-foreground" : ""}>
                {" "}· waiting {waited} min
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">{busy ? <Clock className="h-4 w-4 animate-pulse" /> : actions}</div>
    </li>
  )
}
