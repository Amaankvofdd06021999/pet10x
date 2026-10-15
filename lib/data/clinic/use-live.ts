"use client"

import { useCallback, useEffect, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { dbErrorMessage } from "@/lib/data/db-error"
import { userError } from "@/lib/user-error"

const LOAD_FAILED = "Couldn't load this. Try again."

export type Db = SupabaseClient<Database>

export interface LiveResult<T> {
  data: T
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/**
 * One fetch hook for the whole clinic layer.
 *
 * The rest of `lib/data` hand-rolls this shape about forty times, and the
 * diligence review counted the drift that produced: two incompatible result
 * types under one barrel and a dozen screens that silently drop `error`.
 * Everything here returns the same object, so a screen can rely on it.
 *
 * `load` is expected to THROW on failure — use `must()` below.
 */
export function useLive<T>(
  initial: T,
  load: (db: Db) => Promise<T>,
  deps: readonly unknown[],
  enabled = true,
): LiveResult<T> {
  const [data, setData] = useState<T>(initial)
  const [isLoading, setLoading] = useState<boolean>(enabled)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    const db = getSupabaseBrowserClient()
    if (!db) {
      setLoading(false)
      setError("Supabase is not configured.")
      return
    }
    let cancelled = false
    setLoading(true)
    load(db)
      .then((value) => {
        if (cancelled) return
        setData(value)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // A loader throws either a sentence (sentenceFor, or a dbErrorMessage
        // it already logged) or something unexpected, which is logged here
        // and never shown as written.
        const sentence = err instanceof Error ? userError(err.message, "") : ""
        setError(sentence || dbErrorMessage(err, LOAD_FAILED))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled])

  return { data, isLoading, error, refetch }
}

/** Unwrap a PostgREST result, throwing a sentence `useLive` can show (never the raw message). */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(dbErrorMessage(res.error, LOAD_FAILED))
  return (res.data ?? []) as T
}

/** RPCs in this codebase answer `{ ok, error }` rather than throwing. */
export interface RpcOutcome {
  ok: boolean
  error?: string
  [key: string]: unknown
}

export function readOutcome(data: unknown): RpcOutcome {
  if (data && typeof data === "object") return data as RpcOutcome
  return { ok: false, error: "unexpected_response" }
}

export { sentenceFor } from "./sentences"
