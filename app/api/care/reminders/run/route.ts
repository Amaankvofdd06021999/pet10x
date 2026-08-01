import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

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
      "id, label, detail, kind, scheduled_at, days_of_week, remind_minutes_before, pet_id, pets!inner(id, name, owner_id, profiles:owner_id(timezone))",
    )
    .eq("is_active", true)
    .not("scheduled_at", "is", null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due: { taskId: string; ownerId: string; petName: string; label: string; dateKey: string }[] = []

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

    const days = task.days_of_week
    if (days && days.length > 0 && !days.includes(clock.weekday)) continue

    const dueAt = minutesOfDay(task.scheduled_at as string) - (task.remind_minutes_before ?? 0)
    if (clock.minutes < dueAt) continue

    due.push({
      taskId: task.id,
      ownerId: pet.owner_id,
      petName: pet.name ?? "your pet",
      label: task.label,
      dateKey: clock.dateKey,
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
  }

  return NextResponse.json({ checked: tasks?.length ?? 0, due: due.length, raised })
}
