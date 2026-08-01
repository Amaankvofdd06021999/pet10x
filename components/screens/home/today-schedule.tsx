"use client"

import { useState } from "react"
import { Check, Clock, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  useCareTasks,
  setCareTaskDone,
  taskRunsOn,
  minutesOfDay,
  formatTime,
  type ScheduledCareTask,
} from "@/lib/data"

/**
 * Today's scheduled tasks, on the home screen.
 *
 * Shows only what is still outstanding — a plan you have already completed is
 * not information, and a list that never shrinks stops being read. Once
 * everything is ticked the strip collapses to a single line.
 *
 * Overdue is judged against the device clock. The server sweep makes the same
 * judgement in the owner's stored timezone, so a task that reads "overdue"
 * here is the one that raised the notification.
 */
export function TodayScheduleStrip({ petId }: { petId?: string }) {
  const { data: tasks, isLoading, refetch } = useCareTasks(petId)
  const [busyId, setBusyId] = useState<string | null>(null)

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const todays = tasks.filter((t) => taskRunsOn(t, now))

  if (isLoading || todays.length === 0) return null

  const outstanding = todays.filter((t) => !t.doneToday)

  const isOverdue = (t: ScheduledCareTask) => {
    if (!t.scheduledAt) return false
    const due = minutesOfDay(t.scheduledAt)
    return due != null && nowMinutes > due
  }

  async function toggle(t: ScheduledCareTask) {
    setBusyId(t.id)
    const { error } = await setCareTaskDone(t.id, true)
    setBusyId(null)
    if (error) return toast.error("Couldn't update", { description: error })
    toast.success(`${t.label} done`)
    refetch()
  }

  if (outstanding.length === 0) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2.5">
        <Check className="h-4 w-4 flex-shrink-0 text-success" strokeWidth={3} />
        <span className="text-[12px] font-semibold text-success">
          All {todays.length} scheduled {todays.length === 1 ? "task" : "tasks"} done today
        </span>
      </div>
    )
  }

  // Soonest first; all-day tasks sink to the bottom.
  const sorted = [...outstanding].sort(
    (a, b) => (minutesOfDay(a.scheduledAt) ?? 1e4) - (minutesOfDay(b.scheduledAt) ?? 1e4),
  )

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {sorted.slice(0, 3).map((t) => {
        const overdue = isOverdue(t)
        return (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${
              overdue ? "bg-destructive/10" : "bg-muted/60"
            }`}
          >
            <Clock
              className={`h-3.5 w-3.5 flex-shrink-0 ${overdue ? "text-destructive" : "text-muted-foreground"}`}
            />
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">{t.label}</span>
            <span
              className={`flex-shrink-0 text-[11px] font-semibold ${
                overdue ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {t.scheduledAt ? formatTime(t.scheduledAt) : "All day"}
            </span>
            <button
              onClick={() => toggle(t)}
              disabled={busyId === t.id}
              aria-label={`Mark ${t.label} done`}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-border text-transparent transition-colors active:border-success active:bg-success active:text-primary-foreground"
            >
              {busyId === t.id ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : (
                <Check className="h-3 w-3" strokeWidth={3} />
              )}
            </button>
          </div>
        )
      })}
      {sorted.length > 3 && (
        <p className="px-1 text-[11px] text-muted-foreground">+{sorted.length - 3} more in the schedule</p>
      )}
    </div>
  )
}
