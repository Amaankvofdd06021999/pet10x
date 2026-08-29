/**
 * Clock arithmetic for a practice that may not be in the viewer's timezone.
 *
 * A calendar is the one screen where "close enough" is wrong: an appointment
 * shown an hour out is a missed appointment. Everything here works from the
 * practice's IANA zone rather than the browser's.
 */

function zoneOffsetMs(at: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const parts: Record<string, number> = {}
  for (const p of fmt.formatToParts(at)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value)
  }
  // `hour` comes back as 24 at midnight in some engines.
  const hour = parts.hour === 24 ? 0 : parts.hour
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second)
  return asUtc - at.getTime()
}

/** The instant at which the given local calendar day begins in `tz`. */
export function zonedDayStart(dateISO: string, tz: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number)
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0)
  let ts = naive
  // Two passes settle the case where the guess lands on the other side of a
  // daylight-saving boundary.
  for (let i = 0; i < 2; i += 1) {
    ts = naive - zoneOffsetMs(new Date(ts), tz)
  }
  return new Date(ts)
}

export function dayBounds(dateISO: string, tz: string): { from: string; to: string } {
  const start = zonedDayStart(dateISO, tz)
  const next = new Date(start.getTime() + 26 * 3600_000)
  const nextISO = todayISO(next, tz)
  const end = zonedDayStart(nextISO, tz)
  return { from: start.toISOString(), to: end.toISOString() }
}

/** The calendar date in `tz` for an instant, as YYYY-MM-DD. */
export function todayISO(at: Date = new Date(), tz = "America/Vancouver"): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  return fmt.format(at)
}

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))
}

export function formatDayLabel(dateISO: string, tz: string): string {
  const start = zonedDayStart(dateISO, tz)
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(start)
}

export function formatDateShort(value: string | null): string {
  if (!value) return "—"
  const dt = value.length <= 10 ? new Date(`${value}T12:00:00Z`) : new Date(value)
  if (Number.isNaN(dt.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(dt)
}

/** Minutes since local midnight, used to place a card on the day grid. */
export function minutesInto(iso: string, dateISO: string, tz: string): number {
  const start = zonedDayStart(dateISO, tz).getTime()
  return Math.round((new Date(iso).getTime() - start) / 60000)
}

export function ageFrom(dob: string | null): string {
  if (!dob) return "Age unknown"
  const born = new Date(`${dob}T12:00:00Z`)
  if (Number.isNaN(born.getTime())) return "Age unknown"
  const months = Math.max(
    0,
    Math.floor((Date.now() - born.getTime()) / (30.44 * 24 * 3600_000)),
  )
  if (months < 12) return `${months} mo`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return rem === 0 ? `${years} yr` : `${years} yr ${rem} mo`
}

export function daysUntil(dateISO: string | null): number | null {
  if (!dateISO) return null
  const target = new Date(`${dateISO}T12:00:00Z`).getTime()
  if (Number.isNaN(target)) return null
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12)
  return Math.round((target - today) / 86_400_000)
}

export function dueLabel(dateISO: string | null): string {
  const d = daysUntil(dateISO)
  if (d === null) return "—"
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`
  if (d === 0) return "Due today"
  if (d === 1) return "Due tomorrow"
  return `Due in ${d} days`
}

export function formatMoney(cents: number, currency = "cad"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100)
}
