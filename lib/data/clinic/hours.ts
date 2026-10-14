/**
 * A clinician's weekly hours — the rules, pure, so the Team screen's editor
 * and its tests agree.
 *
 * `staff_availability` holds one row per session: a Postgres dow weekday
 * (0 Sunday … 6 Saturday — what clinic_available_slots compares against) and
 * a start and end time. Slots are cut from these rows, so a malformed or
 * overlapping row is a double-booked clinician, not a cosmetic glitch.
 */

export type HoursRow = { weekday: number; start: string; end: string }

/** The only shape a time may take: two-digit hour 00–23, colon, two-digit minute. */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export const WEEKDAY_LABEL: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
}

/** The editor lists the working week first, as a practice reads it. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

const WEEKDAYS = new Set([0, 1, 2, 3, 4, 5, 6])

export function validateHours(rows: HoursRow[]): { ok: true } | { ok: false; error: string } {
  for (const r of rows) {
    if (!WEEKDAYS.has(r.weekday)) return { ok: false, error: "Choose a day of the week." }
    const day = WEEKDAY_LABEL[r.weekday]
    if (!HHMM.test(r.start) || !HHMM.test(r.end)) {
      return { ok: false, error: `${day}: enter times as HH:MM on a 24-hour clock, like 09:00 or 17:30.` }
    }
    // Zero-padded HH:MM compares correctly as text.
    if (r.end <= r.start) return { ok: false, error: `${day}: the end time must be after the start time.` }
  }
  for (const weekday of WEEKDAY_ORDER) {
    const day = rows.filter((r) => r.weekday === weekday).sort((a, b) => a.start.localeCompare(b.start))
    for (let i = 1; i < day.length; i += 1) {
      // Touching is fine (12:00–12:00 is a lunch break of zero); crossing is not.
      if (day[i].start < day[i - 1].end) {
        return {
          ok: false,
          error: `${WEEKDAY_LABEL[weekday]}: two sessions overlap. Make one end before the next starts.`,
        }
      }
    }
  }
  return { ok: true }
}

/** Postgres returns a `time` as "09:00:00"; the editor works in HH:MM. */
export function fromDbTime(value: string): string {
  return value.slice(0, 5)
}

/**
 * The rows as the editor shows them. seed_business_defaults wrote one row per
 * session with location_id null, but older data can repeat a session per
 * location; the editor shows each session once, and saving writes it once
 * with location_id null (every location).
 */
export function collapseHours(rows: HoursRow[]): HoursRow[] {
  const seen = new Set<string>()
  const out: HoursRow[] = []
  for (const r of rows) {
    const key = `${r.weekday}|${r.start}|${r.end}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ weekday: r.weekday, start: r.start, end: r.end })
  }
  const order = (w: number) => WEEKDAY_ORDER.indexOf(w as (typeof WEEKDAY_ORDER)[number])
  return out.sort((a, b) => order(a.weekday) - order(b.weekday) || a.start.localeCompare(b.start))
}
