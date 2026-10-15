/**
 * The snooze sheet's choices, worked out in the person's own timezone.
 *
 * `profiles.timezone`, not the device: a manager who set their zone and opens
 * the app on a borrowed laptop still means 6 PM where they live. The caller
 * falls back to the device zone only when the profile has none.
 *
 * "This evening" goes at 17:00 local — an hour's snooze already covers the
 * time before six, and offering six o'clock at ten to six is offering nothing.
 * "Tomorrow morning" is 08:00 on the next calendar day as the wall clock reads
 * it, so the night the clocks change it is still eight, not seven or nine.
 *
 * Every `until` is within the database's 7-day cap (snooze_notification).
 */

export type SnoozeKey = "hour" | "evening" | "morning"

export interface SnoozeOption {
  key: SnoozeKey
  label: string
  until: Date
}

const HOUR_MS = 3600_000
/** From this local hour on, "This evening (6 PM)" is not offered. */
const EVENING_CUTOFF_HOUR = 17

/** The wall-clock fields `at` reads in `tz`. */
function wallClock(at: Date, tz: string) {
  const parts: Record<string, number> = {}
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  for (const p of fmt.formatToParts(at)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value)
  }
  // Some engines still say 24 for midnight.
  if (parts.hour === 24) parts.hour = 0
  return parts as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}

/** How far `tz` is ahead of UTC at the instant `at`, in ms. */
function offsetMs(at: Date, tz: string): number {
  const w = wallClock(at, tz)
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(at.getTime() / 1000) * 1000
}

/**
 * The instant the wall clock in `tz` reads `hour`:00 on the given calendar
 * day (`day` may overflow; Date.UTC carries it into the month). Two passes,
 * so a first guess on the other side of a clock change corrects itself.
 */
function zonedInstant(year: number, month: number, day: number, hour: number, tz: string): Date {
  const naive = Date.UTC(year, month - 1, day, hour, 0, 0)
  let ts = naive
  for (let i = 0; i < 2; i += 1) ts = naive - offsetMs(new Date(ts), tz)
  return new Date(ts)
}

export function snoozeOptions(now: Date, tz: string): SnoozeOption[] {
  const w = wallClock(now, tz)
  const options: SnoozeOption[] = [{ key: "hour", label: "In 1 hour", until: new Date(now.getTime() + HOUR_MS) }]
  if (w.hour < EVENING_CUTOFF_HOUR) {
    options.push({ key: "evening", label: "This evening (6 PM)", until: zonedInstant(w.year, w.month, w.day, 18, tz) })
  }
  options.push({
    key: "morning",
    label: "Tomorrow morning (8 AM)",
    until: zonedInstant(w.year, w.month, w.day + 1, 8, tz),
  })
  return options
}

/**
 * The zone to use: the stored one if Intl accepts it, else `deviceFallback`.
 *
 * `profiles.timezone` is free text. Postgres knows zone names ICU does not,
 * and support can type anything; a zone Intl rejects throws a RangeError from
 * every formatter, which would leave the snooze sheet with no times at all.
 * So the stored value is used only once a formatter has been built with it.
 */
export function safeTimeZone(stored: string | null | undefined, deviceFallback: string): string {
  if (typeof stored !== "string" || stored.trim() === "") return deviceFallback
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: stored })
    return stored
  } catch {
    return deviceFallback
  }
}

/** The device's zone, for an account whose profile has none recorded. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}
