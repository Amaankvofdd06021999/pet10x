"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CLOSED_PAGE_SIZE, closedCutoff, nextClosedCursor } from "./approvals-filter"

/**
 * A Closed list: the last 90 days first, then older pages on request.
 *
 * `fetchPage` gets `cursor: null` for the first page (read from `cutoff` on) and
 * the previous page's cursor after that (read strictly older, with no lower
 * bound). Which rows land on which side of that line is decided in
 * approvals-filter.ts; this only holds the pages.
 *
 * Nothing is fetched while `enabled` is false. A change of `scopeKey` or a
 * `refetch` starts again from the first page, and a response that arrives after
 * that is dropped rather than appended to the wrong list.
 */
export function useClosedPages<T>({
  enabled,
  scopeKey,
  tsOf,
  fetchPage,
}: {
  enabled: boolean
  scopeKey: string | null
  tsOf: (row: T) => string
  fetchPage: (a: { cutoff: string; cursor: string | null; limit: number }) => Promise<{ rows: T[]; error: string | null }>
}) {
  const [data, setData] = useState<T[]>([])
  const [isLoading, setLoading] = useState(enabled)
  const [isLoadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const run = useRef(0)
  // The latest callbacks, without making them effect dependencies: the caller's
  // closures change identity every render.
  const fetchRef = useRef(fetchPage)
  const tsRef = useRef(tsOf)
  // Set once a load starts; a load more never runs before one has.
  const cutoffRef = useRef("")
  // Declared before the effect that loads, so the load sees this render's callbacks.
  useEffect(() => {
    fetchRef.current = fetchPage
    tsRef.current = tsOf
  })

  const refetch = useCallback(async () => {
    const mine = ++run.current
    cutoffRef.current = closedCutoff(new Date())
    setLoadingMore(false)
    setLoading(true)
    const r = await fetchRef.current({ cutoff: cutoffRef.current, cursor: null, limit: CLOSED_PAGE_SIZE })
    if (mine !== run.current) return
    setData(r.rows)
    setError(r.error)
    setCursor(r.error ? null : nextClosedCursor(r.rows.map(tsRef.current), { cutoff: cutoffRef.current, firstPage: true }))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!enabled) {
      run.current++
      return
    }
    void refetch()
  }, [enabled, scopeKey, refetch])

  const loadMore = useCallback(async () => {
    if (!cursor) return
    const mine = ++run.current
    setLoadingMore(true)
    const r = await fetchRef.current({ cutoff: cutoffRef.current, cursor, limit: CLOSED_PAGE_SIZE })
    if (mine !== run.current) return
    setLoadingMore(false)
    if (r.error) {
      setError(r.error)
      return
    }
    setError(null)
    setData((d) => [...d, ...r.rows])
    setCursor(nextClosedCursor(r.rows.map(tsRef.current), { cutoff: cutoffRef.current, firstPage: false }))
  }, [cursor])

  return { data, isLoading, isLoadingMore, error, hasMore: cursor !== null, loadMore, refetch }
}
