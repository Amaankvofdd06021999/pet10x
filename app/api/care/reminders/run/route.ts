import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { addCalendarDays, calendarDaysBetween } from "@/lib/dates"

/**
 * Raise reminders for care tasks that are due and not yet done.
 *
 * Runs on the schedule in vercel.json. Every run asks the same question of
 * every active, timed task: in the owner's own timezone, is it now past
 * (scheduled_at − remind_minutes_before), does it recur today, and has it
 * been ticked off? If it is due and undone, a notification is raised.
 *
 * Timezone is per-owner, not per-server. Vercel runs in UTC, so resolving
 * "17:00" against the server clock would fire at 9am in Vancouver. Each pet's
 * owner carries an IANA zone; the fallback is the region this project was
 * created in rather than UTC, because being wrong by a whole continent is
 * worse than being wrong for the minority who have moved away.
 *
 * Delivery is in-app: a row in `notifications`, which surfaces on the Alerts
 * screen and in the header bell's unread count. It is deliberately NOT push —
 * `push_tokens` is shaped for Expo (a native client that does not exist yet),
 * and web push would need VAPID keys and a service worker. Adding either
 * changes only this function.
 */

const DEFAULT_TZ = "America/Vancouver"

/** How long after expiry a vaccination reminder is still worth raising. */
const MAX_OVERDUE_DAYS = 60

/** Wall-clock minutes past midnight, and the weekday, in a given zone. */
function nowIn(timezone: string): { minutes: number; weekday: number; dateKey: string } {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]))
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday as string)
  return {
    // "24" is a legitimate hour in en-CA at midnight; normalise it to 0.
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
    weekday: weekdayIndex,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

export async function GET(request: NextRequest) {
  // Vercel Cron sends the secret as a bearer token. Without it this endpoint
  // would let anyone spam every owner's notification feed.
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const { data: tasks, error } = await supabase
    .from("pet_care_tasks")
    .select(
      "id, label, detail, kind, scheduled_at, days_of_week, remind_minutes_before, pet_id, recurrence, interval_days, next_due_on, starts_on, ends_on, pets!inner(id, name, owner_id, profiles:owner_id(timezone))",
    )
    .eq("is_active", true)
    // No `scheduled_at is not null` filter any more: an interval task (monthly
    // flea, six-month heartworm) is due on a DATE, not at a time of day, and
    // that filter excluded every one of them.

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due: {
    taskId: string
    ownerId: string
    petName: string
    label: string
    dateKey: string
    recurrence: string | null
    intervalDays: number | null
    endsOn: string | null
  }[] = []

  for (const task of tasks ?? []) {
    // The embed is typed as an object or array depending on the relationship;
    // normalise rather than trusting one shape.
    const pet = Array.isArray(task.pets) ? task.pets[0] : task.pets
    if (!pet?.owner_id) continue
    const profile = Array.isArray(pet.profiles) ? pet.profiles[0] : pet.profiles
    const tz = profile?.timezone || DEFAULT_TZ

    let clock
    try {
      clock = nowIn(tz)
    } catch {
      // An invalid zone in the database must not take the whole sweep down.
      clock = nowIn(DEFAULT_TZ)
    }

    // A finite course is not due before it starts or after it ends. Without
    // this a six-month medicine keeps asking to be given forever.
    if (task.starts_on && clock.dateKey < task.starts_on) continue
    if (task.ends_on && clock.dateKey > task.ends_on) continue

    if (task.recurrence === "interval") {
      // Due on its anchor date only. Not "on or after": the ledger already
      // dedupes per day, but firing every day after a missed dose would turn
      // one reminder into a daily nag.
      if (task.next_due_on !== clock.dateKey) continue
    } else {
      const days = task.days_of_week
      if (days && days.length > 0 && !days.includes(clock.weekday)) continue

      // A daily task with no time is all-day: due from midnight.
      const at = task.scheduled_at ? minutesOfDay(task.scheduled_at as string) : 0
      const dueAt = at - (task.remind_minutes_before ?? 0)
      if (clock.minutes < dueAt) continue
    }

    due.push({
      taskId: task.id,
      ownerId: pet.owner_id,
      petName: pet.name ?? "your pet",
      label: task.label,
      dateKey: clock.dateKey,
      recurrence: task.recurrence,
      intervalDays: task.interval_days,
      endsOn: task.ends_on,
    })
  }

  if (due.length === 0) return NextResponse.json({ checked: tasks?.length ?? 0, raised: 0 })

  // Already done today, or already reminded today — either way, skip.
  const ids = due.map((d) => d.taskId)
  const [{ data: doneRows }, { data: sentRows }] = await Promise.all([
    supabase.from("pet_care_log").select("task_id, on_date, completed").in("task_id", ids),
    supabase.from("pet_care_reminders").select("task_id, on_date").in("task_id", ids),
  ])

  type LogKey = { task_id: string; on_date: string; completed?: boolean }
  const done = new Set(
    ((doneRows ?? []) as LogKey[]).filter((r) => r.completed).map((r) => `${r.task_id}|${r.on_date}`),
  )
  const sent = new Set(((sentRows ?? []) as LogKey[]).map((r) => `${r.task_id}|${r.on_date}`))

  const pending = due.filter((d) => {
    const key = `${d.taskId}|${d.dateKey}`
    return !done.has(key) && !sent.has(key)
  })

  let raised = 0
  /** Interval tasks whose anchor could not be advanced — see the block below. */
  const stalled: string[] = []
  for (const item of pending) {
    const { data: note, error: noteErr } = await supabase
      .from("notifications")
      .insert({
        profile_id: item.ownerId,
        kind: "care",
        severity: "info",
        title: `${item.label} for ${item.petName}`,
        body: "This is due today. Open the tracker to log it or tick it off.",
        action_label: "Open tracker",
        action_target: "pet-care",
      })
      .select("id")
      .single()

    if (noteErr) continue

    // The ledger's unique (task_id, on_date) is what actually guarantees one
    // reminder per day — a conflict here means a concurrent run beat us, and
    // is not an error worth reporting.
    const { error: ledgerErr } = await supabase
      .from("pet_care_reminders")
      .insert({ task_id: item.taskId, on_date: item.dateKey, notification_id: note.id })

    if (ledgerErr) {
      // Roll the notification back so a lost race can't leave a duplicate.
      await supabase.from("notifications").delete().eq("id", note.id)
      continue
    }
    raised += 1

    /* An interval task has to move its own anchor forward, or it fires once
     * and is silent forever. Done only after the ledger row is safely in, so
     * a failure above leaves the task due rather than silently skipping a
     * dose. */
    if (item.recurrence === "interval" && item.intervalDays) {
      const nextKey = addCalendarDays(item.dateKey, item.intervalDays)
      /* A NULL ANCHOR IS THE "SILENT FOREVER" ABOVE, ARRIVING QUIETLY.
       *
       * This was `if (!nextKey) continue`, replacing a throw. What that skips is
       * the only write that moves `next_due_on`, and the interval branch of the
       * due test is `task.next_due_on !== clock.dateKey` — an exact match on
       * TODAY. So an anchor that fails to advance is not a task that nags; the
       * ledger's unique (task_id, on_date) already stops a second reminder
       * today, and tomorrow the date no longer matches, so the task goes silent
       * for the rest of its life with `is_active` still true and nothing
       * anywhere recording that it stopped. A six-month heartworm course that
       * reminds once and never again is exactly the failure the comment above
       * this block names.
       *
       * Not thrown, because one malformed row must not take down a sweep that
       * reminds every other owner — the same call this file already makes for an
       * invalid IANA zone. Logged with the task id, and COUNTED INTO THE
       * RESPONSE, so the cron's own output says a task stalled and which one.
       * `addCalendarDays` returns null only for a `dateKey` that is not a bare
       * YYYY-MM-DD or an `intervalDays` large enough to overflow the date, and
       * `dateKey` is built here by Intl with 2-digit parts, so nothing on
       * today's data can reach this. It is the accounting that matters, not the
       * frequency: a reminder loop that can stop reminding must say so. */
      if (!nextKey) {
        console.error(
          `[care-reminders] task ${item.taskId}: could not advance the anchor from ` +
            `"${item.dateKey}" by ${item.intervalDays} days. It will not fire again ` +
            `until next_due_on is corrected.`,
        )
        stalled.push(item.taskId)
        continue
      }
      // Past the end of the course, the task retires itself rather than
      // sitting active with a due date nobody will ever reach.
      const finished = item.endsOn != null && nextKey > item.endsOn
      await supabase
        .from("pet_care_tasks")
        .update(finished ? { is_active: false } : { next_due_on: nextKey })
        .eq("id", item.taskId)
    }
  }

  /* ---- Vaccinations, boosters and injections ----
   *
   * 49 rows carried `expires_on` and nothing had ever looked at it. A booster
   * that lapses is the one nobody was told about, and for a building that
   * enforces rabies it is also a compliance failure the resident never saw
   * coming. */
  const { data: vaccines } = await supabase
    .from("pet_vaccinations")
    .select("id, name, kind, expires_on, remind_days_before, reminded_for, pets!inner(id, name, owner_id)")
    .not("expires_on", "is", null)

  let vaccineReminders = 0
  const todayKey = new Date().toISOString().slice(0, 10)

  for (const v of vaccines ?? []) {
    const pet = Array.isArray(v.pets) ? v.pets[0] : v.pets
    if (!pet?.owner_id || !v.expires_on) continue

    // Already told them about THIS expiry date. Storing the date rather than a
    // boolean means renewing the vaccination re-arms the reminder by itself.
    if (v.reminded_for === v.expires_on) continue

    /* Both sides keyed to the same midnight, through the one module that
     * states the rule. Byte-for-byte the arithmetic this replaced — a cron has
     * no viewer, so `todayKey` stays the SERVER's UTC calendar day rather than
     * becoming a local one. That is deliberate: the only defensible "today" for
     * a job that reminds residents in every zone is the one the job runs in. */
    const daysLeft = calendarDaysBetween(todayKey, v.expires_on)
    if (daysLeft === null) continue
    if (daysLeft > (v.remind_days_before ?? 30)) continue

    /* A reminder is for the transition, not the standing state.
     *
     * On production today, 9 of the 10 rows inside the window lapsed 46–207
     * days ago — history, not news, and shipping this without a floor would
     * have fired all of them at once. A long-lapsed vaccination is already
     * surfaced continuously: it fails computeCompliance, shows on the
     * manager's Incomplete filter, and sits on the resident's missing-info
     * card. It does not also need a notification about a date last spring. */
    if (daysLeft < -MAX_OVERDUE_DAYS) continue

    const overdue = daysLeft < 0
    const noun = v.kind === "vaccine" ? "vaccination" : (v.kind ?? "vaccination")

    const { data: note, error: noteErr } = await supabase
      .from("notifications")
      .insert({
        profile_id: pet.owner_id,
        kind: "compliance",
        severity: overdue ? "warning" : "info",
        title: `${v.name} ${overdue ? "has expired" : "is due"} for ${pet.name}`,
        body: overdue
          ? `This ${noun} expired on ${v.expires_on}. Book a renewal and upload the new record.`
          : `This ${noun} expires on ${v.expires_on}${daysLeft > 0 ? ` — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : " — today"}.`,
        action_label: "Open pet",
        /* The id is not optional here. The title NAMES the pet, and
         * `usePet(undefined)` falls back to the first pet in the household
         * (`lib/data/live.ts:335`), so a bare `pet-detail` target opened
         * "Rabies has expired for Sadie" onto a different animal's
         * vaccination record. Six of the seven such rows already written to
         * production belong to owners with two or three pets. */
        action_target: `pet-detail:${pet.id}`,
      })
      .select("id")
      .single()

    if (noteErr) continue

    // Stamp AFTER the notification exists, so a failure retries next sweep.
    const { error: stampErr } = await supabase
      .from("pet_vaccinations")
      .update({ reminded_for: v.expires_on })
      .eq("id", v.id)

    if (stampErr) {
      await supabase.from("notifications").delete().eq("id", note.id)
      continue
    }
    vaccineReminders += 1
  }

  return NextResponse.json({
    checked: tasks?.length ?? 0,
    due: due.length,
    raised,
    vaccinesChecked: vaccines?.length ?? 0,
    vaccineReminders,
    /* Task ids, not a count, and present even when empty. A stalled interval
     * task will never appear in a later run's output — that is what stalled
     * means — so the one run that stalls it is the only chance to name it. */
    stalled,
  })
}
