"use client"

/**
 * Pet10x — the care schedule.
 *
 * A task is a recurring intention ("Walk, 17:00, weekdays"); a log row is the
 * fact that it happened on a given day. The two are deliberately separate:
 * editing tomorrow's plan must not rewrite what was true yesterday.
 *
 * Distinct from `care_entries`, which records a MEASURED event — 30 minutes,
 * 1.5 cups. A task answers "was this done today?"; an entry answers "how
 * much?". A walk can have both: ticked off here, and its duration logged in
 * the tracker.
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

/** The vocabulary of `public.care_kind` — older and narrower than care_entry_kind. */
export type CareTaskKind = "meal" | "medication" | "water" | "walk" | "grooming" | "other"

export interface ScheduledCareTask {
  id: string
  petId: string
  label: string
  detail: string | null
  kind: CareTaskKind
  /** "HH:MM" local to the owner's timezone. Null = all-day. */
  scheduledAt: string | null
  /** 0 = Sunday … 6 = Saturday. Empty means every day. */
  daysOfWeek: number[]
  isActive: boolean
  remindMinutesBefore: number
  sortOrder: number
  /** Whether it has been ticked off for the day currently being viewed. */
  doneToday: boolean
}

export interface ScheduledCareTaskResult {
  data: ScheduledCareTask[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/** `YYYY-MM-DD` for a Date, in local time — never toISOString, which is UTC. */
export function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Postgres `time` comes back as "17:00:00"; the UI wants "17:00". */
function trimTime(t: string | null): string | null {
  return t ? t.slice(0, 5) : null
}

/** Does this task recur on the given weekday? */
export function taskRunsOn(task: ScheduledCareTask, date: Date): boolean {
  if (!task.isActive) return false
  if (task.daysOfWeek.length === 0) return true
  return task.daysOfWeek.includes(date.getDay())
}

/** Minutes past midnight, for ordering and overdue comparisons. */
export function minutesOfDay(hhmm: string | null): number | null {
  if (!hhmm) return null
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

interface TaskRow {
  id: string
  pet_id: string
  label: string
  detail: string | null
  kind: CareTaskKind
  scheduled_at: string | null
  days_of_week: number[] | null
  is_active: boolean
  remind_minutes_before: number
  sort_order: number | null
}

/**
 * Tasks for a pet, with completion resolved for `dateKey`.
 *
 * Completion is fetched for the one day being shown rather than joined across
 * all history — the log grows by one row per task per day, and Today's Care
 * only ever asks about today.
 */
export function useCareTasks(petId: string | undefined, dateKey = localDateKey()): ScheduledCareTaskResult {
  const [data, setData] = useState<ScheduledCareTask[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !petId) {
      setData([])
      setLoading(false)
      return
    }
    setLoading(true)

    const { data: tasks, error: taskErr } = await supabase
      .from("pet_care_tasks")
      .select("id, pet_id, label, detail, kind, scheduled_at, days_of_week, is_active, remind_minutes_before, sort_order")
      .eq("pet_id", petId)
      .order("sort_order", { ascending: true })
      .order("scheduled_at", { ascending: true, nullsFirst: false })

    if (taskErr) {
      setError(taskErr.message)
      setLoading(false)
      return
    }

    const rows = (tasks ?? []) as TaskRow[]
    const ids = rows.map((r) => r.id)

    let doneIds = new Set<string>()
    if (ids.length > 0) {
      const { data: log } = await supabase
        .from("pet_care_log")
        .select("task_id, completed")
        .in("task_id", ids)
        .eq("on_date", dateKey)
      doneIds = new Set((log ?? []).filter((l) => l.completed).map((l) => l.task_id as string))
    }

    setData(
      rows.map((r) => ({
        id: r.id,
        petId: r.pet_id,
        label: r.label,
        detail: r.detail,
        kind: r.kind,
        scheduledAt: trimTime(r.scheduled_at),
        daysOfWeek: r.days_of_week ?? [],
        isActive: r.is_active,
        remindMinutesBefore: r.remind_minutes_before,
        sortOrder: r.sort_order ?? 0,
        doneToday: doneIds.has(r.id),
      })),
    )
    setError(null)
    setLoading(false)
  }, [petId, dateKey])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

export async function addCareTask(input: {
  petId: string
  label: string
  detail?: string | null
  kind: CareTaskKind
  scheduledAt?: string | null
  daysOfWeek?: number[]
  remindMinutesBefore?: number
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not saved — backend not configured." }

  const { error } = await supabase.from("pet_care_tasks").insert({
    pet_id: input.petId,
    label: input.label,
    detail: input.detail || null,
    kind: input.kind,
    scheduled_at: input.scheduledAt || null,
    // Every day is stored as NULL rather than [0..6] so "no restriction" has
    // one representation the query can rely on.
    days_of_week: input.daysOfWeek && input.daysOfWeek.length > 0 && input.daysOfWeek.length < 7 ? input.daysOfWeek : null,
    remind_minutes_before: input.remindMinutesBefore ?? 0,
    // Keep the legacy display column consistent for anything still reading it.
    time_label: input.scheduledAt ? formatTime(input.scheduledAt) : "All day",
  })
  return { error: error?.message ?? null }
}

export async function updateCareTask(
  id: string,
  patch: Partial<{
    label: string
    detail: string | null
    kind: CareTaskKind
    scheduledAt: string | null
    daysOfWeek: number[]
    isActive: boolean
    remindMinutesBefore: number
  }>,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not saved — backend not configured." }

  // The generated Update type, not Record<string, unknown> — otherwise a
  // typo in a column name compiles and fails silently at runtime.
  const row: Database["public"]["Tables"]["pet_care_tasks"]["Update"] = {}
  if (patch.label !== undefined) row.label = patch.label
  if (patch.detail !== undefined) row.detail = patch.detail
  if (patch.kind !== undefined) row.kind = patch.kind
  if (patch.isActive !== undefined) row.is_active = patch.isActive
  if (patch.remindMinutesBefore !== undefined) row.remind_minutes_before = patch.remindMinutesBefore
  if (patch.scheduledAt !== undefined) {
    row.scheduled_at = patch.scheduledAt
    row.time_label = patch.scheduledAt ? formatTime(patch.scheduledAt) : "All day"
  }
  if (patch.daysOfWeek !== undefined) {
    row.days_of_week = patch.daysOfWeek.length > 0 && patch.daysOfWeek.length < 7 ? patch.daysOfWeek : null
  }

  const { error } = await supabase.from("pet_care_tasks").update(row).eq("id", id)
  return { error: error?.message ?? null }
}

export async function deleteCareTask(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not removed — backend not configured." }
  const { error } = await supabase.from("pet_care_tasks").delete().eq("id", id)
  return { error: error?.message ?? null }
}

/**
 * Tick a task off (or un-tick it) for a day.
 *
 * Upsert on (task_id, on_date) — the table's unique key — so double-tapping
 * can't create a second row, and un-ticking flips `completed` rather than
 * deleting, which keeps "was considered and skipped" distinguishable from
 * "was never looked at".
 */
export async function setCareTaskDone(
  taskId: string,
  done: boolean,
  dateKey = localDateKey(),
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not saved — backend not configured." }

  const { error } = await supabase
    .from("pet_care_log")
    .upsert(
      { task_id: taskId, on_date: dateKey, completed: done, completed_at: new Date().toISOString() },
      { onConflict: "task_id,on_date" },
    )
  return { error: error?.message ?? null }
}

/** "17:00" → "5:00 PM". */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, "0")} ${period}`
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

/** "Every day" / "Weekdays" / "Mon, Wed, Fri" */
export function describeDays(days: number[]): string {
  if (days.length === 0 || days.length === 7) return "Every day"
  const sorted = [...days].sort()
  if (sorted.join() === "1,2,3,4,5") return "Weekdays"
  if (sorted.join() === "0,6") return "Weekends"
  return sorted.map((d) => DAY_LABELS[d]).join(", ")
}
