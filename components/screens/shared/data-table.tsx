"use client"

import { useMemo, useState, type ReactNode } from "react"
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react"

/**
 * A sortable table with a real <table>, real <th scope>, and a sort control
 * that announces itself.
 *
 * The manager's queues were card grids: fine for three cases, unreadable at
 * eighty, and impossible to sort by "who owes the most". A table is the right
 * shape for a record list, so this is the shared one — the strata screens
 * hand-roll their own <table> twice and should move onto it next.
 */

export interface Column<T> {
  key: string
  header: string
  /** Omit to make the column unsortable. */
  sortValue?: (row: T) => string | number | null
  render: (row: T) => ReactNode
  align?: "left" | "right"
  /** Tailwind width class, e.g. "w-28". */
  width?: string
  /** Hidden below `md` so the table still reads on a phone. */
  secondary?: boolean
}

export type SortDir = "asc" | "desc"

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  onRowClick,
  initialSort,
  empty,
  caption,
}: {
  rows: T[]
  columns: Column<T>[]
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
  initialSort?: { key: string; dir: SortDir }
  empty: ReactNode
  caption: string
}) {
  const [sortKey, setSortKey] = useState<string | null>(initialSort?.key ?? null)
  const [dir, setDir] = useState<SortDir>(initialSort?.dir ?? "asc")

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey)
    if (!col?.sortValue) return rows
    const factor = dir === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = col.sortValue?.(a)
      const bv = col.sortValue?.(b)
      if (av === bv) return 0
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor
    })
  }, [rows, columns, sortKey, dir])

  function toggle(key: string) {
    if (sortKey === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setDir("asc")
    }
  }

  if (rows.length === 0) return <>{empty}</>

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sortKey === c.key
              const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
                  className={`border-b border-border bg-secondary/60 px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground ${
                    c.align === "right" ? "text-right" : "text-left"
                  } ${c.width ?? ""} ${c.secondary ? "hidden md:table-cell" : ""}`}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={`inline-flex items-center gap-1 hover:text-foreground ${
                        active ? "text-foreground" : ""
                      }`}
                    >
                      {c.header}
                      <Icon className="h-3 w-3" aria-hidden="true" />
                      <span className="sr-only">
                        {active ? `sorted ${dir === "asc" ? "ascending" : "descending"}` : "sort by this column"}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter") onRowClick(row)
                    }
                  : undefined
              }
              className={`border-b border-border last:border-b-0 ${
                onRowClick ? "cursor-pointer transition-colors hover:bg-secondary/50 focus-visible:bg-secondary" : ""
              }`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-2.5 align-middle ${c.align === "right" ? "text-right tabular-nums" : ""} ${
                    c.secondary ? "hidden md:table-cell" : ""
                  }`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
