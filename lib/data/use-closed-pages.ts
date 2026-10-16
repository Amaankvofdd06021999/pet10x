"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CLOSED_PAGE_SIZE, closedCutoff, nextClosedCursor, type ClosedCursor } from "./approvals-filter"

/**
 * A Closed list: the last 90 days first, then older pages on request.
 *
 * `fetchPage` gets `cursor: null` for the first page (read from `cutoff` on) and
 * the previous page's cursor after that (read strictly older, with no lower
 * bound). Which rows land on which side of that line is decided in
 * approvals-filter.ts; this only holds the pages.
 *
 * Nothing is fetched while `enabled` is false. A change of `scopeKey` or a
 * `refetch` starts again from the first page (acting on a card after "Show older"
 * therefore returns to the top), and a response that arrives after
 * that is dropped rather than appended to the wrong list.
 */
export function useClosedPages<T>({
  enabled,
  scopeKey,
  keyOf,
  fetchPage,
}: {
  enabled: boolean
  scopeKey: string | null
  /** A row's place in the `ts desc, id desc` order. */
  keyOf: (row: T) => { ts: string; id: string }
  fetchPage: (a: { cutoff: string; cursor: ClosedCursor | null; limit: number }) => Promise<{ rows: T[]; error: string | null }>
}) {
  const [data, setData] = useState<T[]>([])
  const [isLoading, setLoading] = useState(enabled)
  const [isLoadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<ClosedCursor | null>(null)
  const run = useRef(0)
  // The latest callbacks, without making them effect dependencies: the caller's
  // closures change identity every render.
  const fetchRef = useRef(fetchPage)
  const keyRef = useRef(keyOf)
  // Set once a load starts; a load more never runs before one has.
  const cutoffRef = useRef("")
  // Declared before the effect that loads, so the load sees this render's callbacks.
  useEffect(() => {
    fetchRef.current = fetchPage
    keyRef.current = keyOf
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
    setCursor(r.error ? null : nextClosedCursor(r.rows.map(keyRef.current), { cutoff: cutoffRef.current, firstPage: true }))
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
    setCursor(nextClosedCursor(r.rows.map(keyRef.current), { cutoff: cutoffRef.current, firstPage: false }))
  }, [cursor])

  return { data, isLoading, isLoadingMore, error, hasMore: cursor !== null, loadMore, refetch }
}
