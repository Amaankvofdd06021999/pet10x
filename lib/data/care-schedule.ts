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
  /**
   * 'daily'    — scheduledAt + daysOfWeek (meals, walks)
   * 'interval' — every `intervalDays` from `nextDueOn` (flea = 30, heartworm
   *              = 182). A weekday pattern cannot express either.
   */
  recurrence: "daily" | "interval"
  intervalDays: number | null
  nextDueOn: string | null
  startsOn: string | null
  /** Last day of a finite course; the sweep stops past it. */
  endsOn: string | null
  /** As written on the packet — "1 tablet", "0.5 ml". */
  dose: string | null
  /**
   * Which care target this task feeds — the specific food, treat or medicine.
   * Without it a scheduled "Breakfast" is a word that satisfies nothing.
   */
  targetId: string | null
  /** Amount logged against that target when ticked. Null = tick only. */
  logAmount: number | null
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

  // A finite course does not run before it starts or after it ends. Without
  // this a six-month medicine would keep asking to be given in year two.
  const key = localDateKey(date)
  if (task.startsOn && key < task.startsOn) return false
  if (task.endsOn && key > task.endsOn) return false

  // Interval tasks run on their due date only — a weekday pattern cannot say
  // "every 30 days", so days_of_week is meaningless for them.
  if (task.recurrence === "interval") return task.nextDueOn === key

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
  recurrence: string | null
  interval_days: number | null
  next_due_on: string | null
  starts_on: string | null
  ends_on: string | null
  dose: string | null
  target_id: string | null
  log_amount: number | null
}

/**
 * Tasks for one or more pets, with completion resolved for `dateKey`.
 *
 * Completion is fetched for the one day being shown rather than joined across
 * all history — the log grows by one row per task per day, and Today's Care
 * only ever asks about today.
 *
 * The pet-side filter is `in (…)`, which the existing RLS policies already
 * admit: all four care tables carry a single row-evaluated `FOR ALL` policy
 * shaped `exists (select 1 from pets p where p.id = <tbl>.pet_id and
 * p.owner_id = auth.uid() …)`, so a list of the owner's own pets is no
 * different to one of them. Verified by impersonation on the live database
 * before this was written.
 *
 * An empty list short-circuits and never reaches the network: PostgREST
 * renders `.in("pet_id", [])` as `in.()`, which is a syntax error rather than
 * an empty result.
 */
export function useHouseholdCareTasks(petIds: string[], dateKey = localDateKey()): ScheduledCareTaskResult {
  const [data, setData] = useState<ScheduledCareTask[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* Key on the joined string, NOT on the array.
   *
   * Callers build this list inline — `pets.map(p => p.id)` — so the array has
   * a new identity on every render. Put that array in the dependency list and
   * `refetch` is new each render, so the effect below fires, so setState runs,
   * so it renders again: an unbounded refetch loop that tsc, `pnpm build` and
   * every test in this repo are blind to, because none of them render a
   * component. A string compares by value and ends it. */
  const key = petIds.join(",")

  const refetch = useCallback(async () => {
    const ids = key ? key.split(",") : []
    const supabase = getSupabaseBrowserClient()
    if (!supabase || ids.length === 0) {
      setData([])
      setLoading(false)
      return
    }
    setLoading(true)

    const { data: tasks, error: taskErr } = await supabase
      .from("pet_care_tasks")
      .select(
        "id, pet_id, label, detail, kind, scheduled_at, days_of_week, is_active, remind_minutes_before, sort_order, recurrence, interval_days, next_due_on, starts_on, ends_on, dose, target_id, log_amount",
      )
      .in("pet_id", ids)
      .order("sort_order", { ascending: true })
      .order("scheduled_at", { ascending: true, nullsFirst: false })

    if (taskErr) {
      setError(taskErr.message)
      setLoading(false)
      return
    }

    const rows = (tasks ?? []) as TaskRow[]
    const taskIds = rows.map((r) => r.id)

    let doneIds = new Set<string>()
    if (taskIds.length > 0) {
      const { data: log } = await supabase
        .from("pet_care_log")
        .select("task_id, completed")
        .in("task_id", taskIds)
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
        recurrence: (r.recurrence === "interval" ? "interval" : "daily") as "daily" | "interval",
        intervalDays: r.interval_days,
        nextDueOn: r.next_due_on,
        startsOn: r.starts_on,
        endsOn: r.ends_on,
        dose: r.dose,
        targetId: r.target_id,
        logAmount: r.log_amount,
      })),
    )
    setError(null)
    setLoading(false)
  }, [key, dateKey])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

/**
 * Tasks for a single pet — the household query with a list of one.
 *
 * A wrapper rather than a second implementation: two queries reading the same
 * two tables are two things that can come to disagree about what "done today"
 * means. The inline array is safe precisely because the hook keys on the
 * joined string and not on the array's identity.
 */
export function useCareTasks(petId: string | undefined, dateKey = localDateKey()): ScheduledCareTaskResult {
  return useHouseholdCareTasks(petId ? [petId] : [], dateKey)
}

/**
 * One line of the household's day: a label, a time, and every pet it is due
 * for.
 *
 * `tasks` is in `petIds` order, so the rows under a header read in the same
 * order as the pet rail above them.
 */
export interface HouseholdTaskGroup {
  /** Stable across renders — the normalised label and the time. */
  key: string
  /** As the owner typed it on the first member. */
  label: string
  scheduledAt: string | null
  /** A property of the GROUP: every member shares one time. */
  overdue: boolean
  tasks: ScheduledCareTask[]
}

/**
 * Group a household's day by (label, time).
 *
 * The obvious fix for three indistinguishable "Breakfast" rows is to prefix
 * each with its pet — "Buddy · Breakfast", "Lola · Breakfast". That repeats
 * the part which is the SAME and buries the part which differs. Inverting it
 * writes the label once as a header and gives each pet its own row, so the
 * whole content of a row is the new information: which animal.
 *
 * A task no other pet shares is a group of one, and the strip renders it
 * inline on a single line — so a household with entirely different routines
 * never sees a header at all, and a single-pet household is unchanged.
 *
 * Pure, and it carries every rule that could be wrong, because a `node`
 * vitest with no jsdom cannot test any of this from the component.
 */
export function groupHouseholdTasks(
  tasks: ScheduledCareTask[],
  petIds: string[],
  nowMinutes: number,
): HouseholdTaskGroup[] {
  // Passing the pet order in is what keeps this pure and testable; it is
  // `usePets` order, which is `created_at`.
  const rank = new Map(petIds.map((id, i) => [id, i]))
  const groups = new Map<string, HouseholdTaskGroup>()

  for (const t of tasks) {
    // Trimmed and case-insensitive: these labels are typed by hand, once per
    // pet, and "Breakfast" and "breakfast" are the same meal.
    const key = `${t.label.trim().toLowerCase()}@${t.scheduledAt ?? "allday"}`
    let group = groups.get(key)
    if (!group) {
      const due = minutesOfDay(t.scheduledAt)
      group = {
        key,
        label: t.label.trim(),
        scheduledAt: t.scheduledAt,
        // Strictly past, so a task due exactly now is not yet late. An all-day
        // task has no time to be past.
        overdue: due != null && nowMinutes > due,
        tasks: [],
      }
      groups.set(key, group)
    }
    group.tasks.push(t)
  }

  const out = [...groups.values()]
  for (const g of out) g.tasks.sort((a, b) => (rank.get(a.petId) ?? 1e4) - (rank.get(b.petId) ?? 1e4))
  out.sort((a, b) => {
    // All-day sinks to the bottom, matching the strip's own ordering.
    const byTime = (minutesOfDay(a.scheduledAt) ?? 1e4) - (minutesOfDay(b.scheduledAt) ?? 1e4)
    // Ties break on label so the order is stable across renders rather than
    // depending on which pet's row happened to arrive first.
    return byTime !== 0 ? byTime : a.label.localeCompare(b.label)
  })
  return out
}

export async function addCareTask(input: {
  petId: string
  label: string
  detail?: string | null
  kind: CareTaskKind
  scheduledAt?: string | null
  daysOfWeek?: number[]
  remindMinutesBefore?: number
  recurrence?: "daily" | "interval"
  intervalDays?: number | null
  nextDueOn?: string | null
  startsOn?: string | null
  endsOn?: string | null
  dose?: string | null
  targetId?: string | null
  logAmount?: number | null
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
    recurrence: input.recurrence ?? "daily",
    // The DB check constraint rejects an interval task without both, and a
    // daily one carrying an interval — send exactly the shape it expects.
    interval_days: input.recurrence === "interval" ? (input.intervalDays ?? null) : null,
    next_due_on: input.recurrence === "interval" ? (input.nextDueOn ?? null) : (input.nextDueOn ?? null),
    starts_on: input.startsOn ?? null,
    ends_on: input.endsOn ?? null,
    dose: input.dose || null,
    target_id: input.targetId ?? null,
    log_amount: input.logAmount ?? null,
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
    recurrence: "daily" | "interval"
    intervalDays: number | null
    nextDueOn: string | null
    startsOn: string | null
    endsOn: string | null
    dose: string | null
    targetId: string | null
    logAmount: number | null
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
  if (patch.recurrence !== undefined) row.recurrence = patch.recurrence
  if (patch.intervalDays !== undefined) row.interval_days = patch.intervalDays
  if (patch.nextDueOn !== undefined) row.next_due_on = patch.nextDueOn
  if (patch.startsOn !== undefined) row.starts_on = patch.startsOn
  if (patch.endsOn !== undefined) row.ends_on = patch.endsOn
  if (patch.dose !== undefined) row.dose = patch.dose
  if (patch.targetId !== undefined) row.target_id = patch.targetId
  if (patch.logAmount !== undefined) row.log_amount = patch.logAmount
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
  if (error) return { error: error.message }

  /* Ticking a linked task logs against its target.
   *
   * This is what makes several foods or treats per day mean anything: two
   * meals of different food each advance their own goal, rather than both
   * being ticks against a single undifferentiated "food". Only on completion —
   * un-ticking deletes the entry below rather than logging a negative. */
  const { data: task } = await supabase
    .from("pet_care_tasks")
    .select("pet_id, label, target_id, log_amount, care_targets(kind, label, unit)")
    .eq("id", taskId)
    .maybeSingle()

  if (!task?.target_id || task.log_amount == null) return { error: null }
  const target = Array.isArray(task.care_targets) ? task.care_targets[0] : task.care_targets
  if (!target) return { error: null }

  // Idempotent by (task, day): ticking, un-ticking and re-ticking must not
  // stack three portions onto the same meal.
  const dayStart = `${dateKey}T00:00:00`
  const dayEnd = `${dateKey}T23:59:59`
  const { data: existing } = await supabase
    .from("care_entries")
    .select("id")
    .eq("pet_id", task.pet_id)
    .eq("kind", target.kind)
    .eq("label", target.label)
    .gte("logged_at", dayStart)
    .lte("logged_at", dayEnd)
    .eq("source_task_id", taskId)

  if (done) {
    if ((existing ?? []).length > 0) return { error: null }
    await supabase.from("care_entries").insert({
      pet_id: task.pet_id,
      kind: target.kind,
      label: target.label,
      amount: task.log_amount,
      unit: target.unit,
      source_task_id: taskId,
    })
  } else if ((existing ?? []).length > 0) {
    await supabase.from("care_entries").delete().in("id", (existing ?? []).map((e) => e.id))
  }

  return { error: null }
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
