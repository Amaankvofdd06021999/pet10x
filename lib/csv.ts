/**
 * Pet10x — CSV export, shared.
 *
 * These two functions were defined in `lib/data/portfolio.ts` and imported by
 * the strata reports screen and the business earnings tab. The manager's
 * Violations screen needs them too, and importing an enforcement screen's CSV
 * writer out of the *strata portfolio* data layer would have made portfolio.ts
 * a dependency of a screen that reads none of its data.
 *
 * The bodies below are byte-identical to the ones they replace
 * (`git show 16a9721:lib/data/portfolio.ts`, lines 386-406) — this is a move,
 * not a rewrite. `lib/csv.test.ts` pins the output against the previous
 * implementation so that stays true.
 *
 * No `"use client"` directive: `toCsv` is pure and `downloadCsv` guards on
 * `typeof window`, so the module is importable from a server component too.
 */

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map((c) => escape(c.label)).join(",")
  const body = rows.map((row) => columns.map((c) => escape(row[c.key])).join(",")).join("\n")
  return `${header}\n${body}`
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
