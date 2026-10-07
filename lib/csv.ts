/**
 * Pet10x — CSV export, shared.
 *
 * These two functions were defined in `lib/data/portfolio.ts` and imported by
 * the strata reports screen and the business earnings tab. The manager's
 * Violations screen needs them too, and importing an enforcement screen's CSV
 * writer out of the *strata portfolio* data layer would have made portfolio.ts
 * a dependency of a screen that reads none of its data.
 *
 * The bodies were moved byte-identical from `lib/data/portfolio.ts`
 * (`git show 16a9721`, lines 386-406). Part F changed one thing: cells that
 * would start a spreadsheet formula are prefixed with a quote.
 *
 * No `"use client"` directive: `toCsv` is pure and `downloadCsv` guards on
 * `typeof window`, so the module is importable from a server component too.
 */

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const escape = (v: unknown): string => {
    let s = v === null || v === undefined ? "" : String(v)
    // A cell a spreadsheet would read as a formula — `=HYPERLINK(...)` typed
    // into a pet's name, say — is defused with a leading quote (OWASP CSV
    // injection). Tab and carriage return start formulas in some importers.
    // A plain number ("-5 pts vs median") is left alone: it is not a formula,
    // and a quote would turn it into text.
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
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
