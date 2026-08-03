"use client"

import { useState } from "react"
import type { Species } from "@/lib/data"
import { COURSE_PRESETS, DURATION_PRESETS } from "@/lib/data/care-catalog"
import { toast } from "sonner"
import { Clock, Plus, Trash2, Check, Pencil, CalendarDays, Loader2 } from "lucide-react"
import {
  useCareTasks,
  addCareTask,
  updateCareTask,
  deleteCareTask,
  setCareTaskDone,
  describeDays,
  formatTime,
  taskRunsOn,
  minutesOfDay,
  DAY_LABELS,
  type CareTaskKind,
  type ScheduledCareTask,
} from "@/lib/data"

const KINDS: { value: CareTaskKind; label: string }[] = [
  { value: "meal", label: "Meal" },
  { value: "medication", label: "Medication" },
  { value: "walk", label: "Walk" },
  { value: "water", label: "Water" },
  { value: "grooming", label: "Grooming" },
  { value: "other", label: "Other" },
]

interface Draft {
  id?: string
  label: string
  kind: CareTaskKind
  scheduledAt: string
  days: number[]
  remind: number
  /** 'daily' = time of day + weekdays. 'interval' = every N days. */
  recurrence: "daily" | "interval"
  intervalDays: number
  /** ISO date the interval counts from. */
  nextDueOn: string
  /** Days the course runs; null = ongoing. */
  durationDays: number | null
  dose: string
}

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const EMPTY: Draft = {
  label: "",
  kind: "walk",
  scheduledAt: "17:00",
  days: [],
  remind: 0,
  recurrence: "daily",
  intervalDays: 30,
  nextDueOn: "",
  durationDays: null,
  dose: "",
}

/**
 * The daily plan for a pet.
 *
 * A task is an intention that recurs; ticking it writes one row per day, so
 * editing tomorrow's plan never rewrites what was true yesterday. Overdue is
 * computed against the device clock — the same judgement the server sweep
 * makes in the owner's timezone, so the two agree.
 */
export function ScheduleTab({
  petId,
  petName,
  species,
}: {
  petId?: string
  petName?: string
  /** Decides which task kinds are offered — a fish has no walks. */
  species?: Species | null
}) {
  const { data: tasks, isLoading, refetch } = useCareTasks(petId)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const today = new Date()
  const nowMinutes = today.getHours() * 60 + today.getMinutes()
  const todays = tasks.filter((t) => taskRunsOn(t, today))
  const doneCount = todays.filter((t) => t.doneToday).length

  const isOverdue = (t: ScheduledCareTask) => {
    if (t.doneToday || !t.scheduledAt) return false
    const due = minutesOfDay(t.scheduledAt)
    return due != null && nowMinutes > due
  }

  async function save() {
    if (!draft || !petId) return
    if (!draft.label.trim()) return toast.error("Give the task a name.")
    setSaving(true)
    const interval = draft.recurrence === "interval"
    const start = draft.nextDueOn || todayIso()
    // ends_on is derived from the duration the owner picked, because "six
    // months" is what they say and a date arithmetic is what the sweep needs.
    const ends =
      interval && draft.durationDays != null
        ? (() => {
            const d = new Date(`${start}T00:00:00Z`)
            d.setUTCDate(d.getUTCDate() + draft.durationDays!)
            return d.toISOString().slice(0, 10)
          })()
        : null

    const payload = {
      label: draft.label.trim(),
      kind: draft.kind,
      // An interval task is due on a date, not at a time; keeping a time here
      // would make the sweep treat it as a daily task too.
      scheduledAt: interval ? null : draft.scheduledAt || null,
      daysOfWeek: interval ? [] : draft.days,
      remindMinutesBefore: draft.remind,
      recurrence: draft.recurrence,
      intervalDays: interval ? draft.intervalDays : null,
      nextDueOn: interval ? start : null,
      startsOn: interval ? start : null,
      endsOn: ends,
      dose: draft.dose.trim() || null,
    }
    const { error } = draft.id
      ? await updateCareTask(draft.id, payload)
      : await addCareTask({ petId, ...payload })
    setSaving(false)
    if (error) return toast.error("Couldn't save", { description: error })
    toast.success(draft.id ? "Task updated" : "Added to the schedule")
    setDraft(null)
    refetch()
  }

  async function toggle(t: ScheduledCareTask) {
    setBusyId(t.id)
    const { error } = await setCareTaskDone(t.id, !t.doneToday)
    setBusyId(null)
    if (error) return toast.error("Couldn't update", { description: error })
    refetch()
  }

  async function remove(t: ScheduledCareTask) {
    const { error } = await deleteCareTask(t.id)
    if (error) return toast.error("Couldn't remove", { description: error })
    toast("Task removed")
    refetch()
  }

  if (!petId) {
    return <p className="py-10 text-center text-[13px] text-muted-foreground">Add a pet to build a schedule.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Today's progress */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span className="text-[14px] font-semibold text-foreground">Today&apos;s plan</span>
          </div>
          <span className="text-[13px] font-semibold text-muted-foreground">
            {doneCount}/{todays.length} done
          </span>
        </div>
        {todays.length > 0 && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${todays.length ? (doneCount / todays.length) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>

      {/* The plan */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Clock className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-[14px] font-semibold text-foreground">No routine yet</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Add a walk, a meal or a medication with a time, and {petName ?? "your pet"}&apos;s plan will show on Home —
            with a reminder when it&apos;s due.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((t) => {
            const overdue = isOverdue(t)
            const runsToday = taskRunsOn(t, today)
            return (
              <div
                key={t.id}
                className={`flex items-center gap-3 rounded-2xl border bg-card p-3 ${
                  overdue ? "border-destructive/30" : "border-border"
                } ${!t.isActive ? "opacity-50" : ""}`}
              >
                <button
                  onClick={() => toggle(t)}
                  disabled={busyId === t.id || !runsToday}
                  aria-label={t.doneToday ? `Mark ${t.label} not done` : `Mark ${t.label} done`}
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    t.doneToday
                      ? "border-success bg-success text-primary-foreground"
                      : "border-border text-transparent"
                  } ${!runsToday ? "cursor-not-allowed" : ""}`}
                >
                  {busyId === t.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-[14px] font-semibold ${
                      t.doneToday ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {t.label}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {t.scheduledAt ? formatTime(t.scheduledAt) : "All day"} · {describeDays(t.daysOfWeek)}
                    {t.remindMinutesBefore > 0 ? ` · ${t.remindMinutesBefore}m before` : ""}
                    {overdue ? " · overdue" : ""}
                  </p>
                </div>

                <button
                  onClick={() =>
                    setDraft({
                      id: t.id,
                      label: t.label,
                      kind: t.kind,
                      scheduledAt: t.scheduledAt ?? "",
                      days: t.daysOfWeek,
                      remind: t.remindMinutesBefore,
                      recurrence: t.recurrence,
                      intervalDays: t.intervalDays ?? 30,
                      nextDueOn: t.nextDueOn ?? "",
                      // Recovered from the stored bounds rather than kept
                      // separately, so editing shows the course as saved.
                      durationDays:
                        t.startsOn && t.endsOn
                          ? Math.round(
                              (new Date(`${t.endsOn}T00:00:00Z`).getTime() -
                                new Date(`${t.startsOn}T00:00:00Z`).getTime()) /
                                86_400_000,
                            )
                          : null,
                      dose: t.dose ?? "",
                    })
                  }
                  className="p-2 text-muted-foreground"
                  aria-label={`Edit ${t.label}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => remove(t)} className="p-2 text-destructive" aria-label={`Remove ${t.label}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <button
        onClick={() => setDraft({ ...EMPTY })}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[14px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" /> Add to schedule
      </button>

      {/* Editor */}
      {draft && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[14px] font-semibold text-foreground">{draft.id ? "Edit task" : "New task"}</p>

          <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">Name</label>
          <input
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="Evening walk"
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] outline-none focus:border-primary"
          />

          <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">Type</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.value}
                onClick={() => setDraft({ ...draft, kind: k.value })}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  draft.kind === k.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* How it repeats. A weekday pattern cannot say "every 6 months",
              which is exactly the shape a heartworm or flea course takes, so
              the two modes are chosen explicitly rather than inferred. */}
          <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">Schedule</label>
          <div className="mt-1 flex rounded-xl bg-muted p-1">
            {([
              { id: "daily", label: "Time of day" },
              { id: "interval", label: "Every N days" },
            ] as const).map((m) => (
              <button
                key={m.id}
                onClick={() => setDraft({ ...draft, recurrence: m.id })}
                className={`flex-1 rounded-lg py-2 text-[12.5px] font-semibold transition-colors ${
                  draft.recurrence === m.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {draft.recurrence === "interval" && (
            <>
              <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">How often</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {COURSE_PRESETS.map((c) => (
                  <button
                    key={c.intervalDays}
                    onClick={() => setDraft({ ...draft, intervalDays: c.intervalDays })}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      draft.intervalDays === c.intervalDays
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">First dose</label>
              <input
                type="date"
                value={draft.nextDueOn || todayIso()}
                onChange={(e) => setDraft({ ...draft, nextDueOn: e.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] outline-none focus:border-primary"
              />

              <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">
                For how long <span className="font-normal">(the course retires itself)</span>
              </label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d.label}
                    onClick={() => setDraft({ ...draft, durationDays: d.days })}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      draft.durationDays === d.days
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">
                Dose <span className="font-normal">(optional)</span>
              </label>
              <input
                value={draft.dose}
                onChange={(e) => setDraft({ ...draft, dose: e.target.value })}
                placeholder="1 tablet, 0.5 ml…"
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] outline-none focus:border-primary"
              />
            </>
          )}

          {draft.recurrence === "daily" && (
            <>
          <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">
            Time <span className="font-normal">(leave empty for all day)</span>
          </label>
          <input
            type="time"
            value={draft.scheduledAt}
            onChange={(e) => setDraft({ ...draft, scheduledAt: e.target.value })}
            className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[15px] outline-none focus:border-primary"
          />

          <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">
            Repeats <span className="font-normal">(none selected = every day)</span>
          </label>
          <div className="mt-1 flex gap-1.5">
            {DAY_LABELS.map((d, i) => {
              const on = draft.days.includes(i)
              return (
                <button
                  key={d}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      days: on ? draft.days.filter((x) => x !== i) : [...draft.days, i],
                    })
                  }
                  aria-pressed={on}
                  className={`h-9 flex-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {d[0]}
                </button>
              )
            })}
          </div>
            </>
          )}

          <label className="mt-3 block text-[12px] font-semibold text-muted-foreground">Remind me</label>
          <div className="mt-1 flex gap-1.5">
            {[0, 15, 30, 60].map((m) => (
              <button
                key={m}
                onClick={() => setDraft({ ...draft, remind: m })}
                className={`flex-1 rounded-lg py-2 text-[12px] font-semibold transition-colors ${
                  draft.remind === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {m === 0 ? "On time" : `${m}m early`}
              </button>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setDraft(null)}
              disabled={saving}
              className="flex-1 rounded-xl border border-border py-2.5 text-[14px] font-semibold text-foreground disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
