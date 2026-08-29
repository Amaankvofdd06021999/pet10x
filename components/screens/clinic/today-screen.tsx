"use client"

import { useMemo, useState } from "react"
import { Phone, Check, ArrowRight, AlertTriangle, Clock } from "lucide-react"
import type { ClinicMembership } from "@/lib/data/clinic/context"
import { useClinicLocations } from "@/lib/data/clinic/context"
import {
  useOpenAppointments, setAppointmentStatus, STATUS_LABEL,
  type Appointment, type AppointmentStatus,
} from "@/lib/data/clinic/schedule"
import { useReminderQueue, useClinicTasks, completeTask, addTask } from "@/lib/data/clinic/reminders"
import { useEmergencyArrivals } from "@/lib/data/clinic/emergency"
import { formatTime, todayISO, dueLabel, daysUntil } from "@/lib/data/clinic/time"
import {
  SectionCard, StatTile, Spinner, LoadError, EmptyState, Button, Pill,
  SpeciesIcon, LinkedBadge, Modal, Field, TextInput, Toolbar,
} from "@/components/screens/shared/ui"

/**
 * The operations board. Answers, without anyone asking anyone: who is here,
 * who is waiting, what is unfinished, and who needs calling.
 */
export function ClinicTodayScreen({
  clinic,
  onGo,
}: {
  clinic: ClinicMembership
  onGo: (tab: "calendar" | "customers" | "reminders" | "emergency") => void
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
    if (res.error) window.alert(res.error)
    else appts.refetch()
  }

  if (appts.isLoading) return <Spinner label="Opening the day" />
  if (appts.error) return <LoadError message={appts.error} onRetry={appts.refetch} />

  return (
    <div className="flex flex-col gap-4">
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
              <li key={a.id} className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
                  <span className="text-[13.5px] font-semibold text-foreground">{a.petName}</span>
                  <Pill tone="bad">{a.triageLevel}</Pill>
                  {a.etaMinutes !== null && <Pill tone="warn">ETA {a.etaMinutes} min</Pill>}
                </div>
                <p className="mt-1 text-[12.5px] text-muted-foreground">{a.problem}</p>
                {a.allergies && (
                  <p className="mt-0.5 text-[12px] font-semibold text-destructive">Allergies: {a.allergies}</p>
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
                    <Button size="sm" variant="ghost" onClick={() => void move(a, "cancelled")}>Decline</Button>
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
                  actions={<Button size="sm" onClick={() => void move(a, "completed")}>Check out</Button>} />
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
                    <p className="text-[13.5px] font-semibold text-foreground">
                      {r.patientName} · {r.label}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {r.customerName} · {dueLabel(r.dueOn)}
                    </p>
                  </div>
                  {r.customerPhone && (
                    <a
                      href={`tel:${r.customerPhone.replace(/[^\d+]/g, "")}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-secondary"
                    >
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call
                    </a>
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
                  <p className="text-[13.5px] font-medium text-foreground">{t.title}</p>
                  {t.detail && <p className="text-[12px] text-muted-foreground">{t.detail}</p>}
                  {t.dueOn && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{dueLabel(t.dueOn)}</p>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
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
                  window.alert(res.error)
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
            <TextInput
              {...p}
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Call Mrs Whitfield about the dental estimate"
            />
          )}
        </Field>
      </Modal>
    </div>
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
        <span className="mt-0.5 w-11 flex-shrink-0 text-[12.5px] font-semibold tabular-nums text-muted-foreground">
          {formatTime(a.startsAt, tz)}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
            <SpeciesIcon species={a.species} />
            {a.patientName}
            <LinkedBadge linked={a.isLinked} />
            {a.behaviouralAlert && (
              <Pill tone="warn" title={a.behaviouralAlert}>
                Handling note
              </Pill>
            )}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {a.customerName} · {a.typeName} · {STATUS_LABEL[a.status]}
            {showWait && waited !== null && (
              <span className={waited > 15 ? "font-semibold text-warning-strong" : ""}>
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
