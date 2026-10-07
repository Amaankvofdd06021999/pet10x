/**
 * Pet10x — the manager's area summary of city reports, the pure half.
 *
 * A manager is shown counts, not reports: in a small building a description
 * and a location identify whoever wrote them, so `manager_municipal_reports`
 * (20261008000005) returns only type, status and the day. This turns those
 * rows into "how many of each, and when", which is all the screen shows.
 */

export interface MunicipalSummary {
  total: number
  byType: { type: string; count: number }[]
  byMonth: { month: string; label: string; total: number; counts: Record<string, number> }[]
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/** `reportedOn` is a bare YYYY-MM-DD day; the month is read off the string. */
export function summariseMunicipalReports(rows: readonly { type: string; reportedOn: string }[]): MunicipalSummary {
  const types = new Map<string, number>()
  const months = new Map<string, Record<string, number>>()
  for (const row of rows) {
    types.set(row.type, (types.get(row.type) ?? 0) + 1)
    const month = row.reportedOn.slice(0, 7)
    const counts = months.get(month) ?? {}
    counts[row.type] = (counts[row.type] ?? 0) + 1
    months.set(month, counts)
  }
  return {
    total: rows.length,
    byType: [...types.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    byMonth: [...months.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, counts]) => ({
        month,
        label: `${MONTHS[Number(month.slice(5, 7)) - 1] ?? month} ${month.slice(0, 4)}`,
        total: Object.values(counts).reduce((s, n) => s + n, 0),
        counts,
      })),
  }
}
