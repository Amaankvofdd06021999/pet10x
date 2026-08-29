"use client"

import { useCallback, useEffect, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

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
        setError(err instanceof Error ? err.message : String(err))
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

/** Unwrap a PostgREST result, throwing the message so `useLive` can show it. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
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

/** Turn an RPC error code into something a receptionist can act on. */
export function sentenceFor(code: string | undefined): string {
  switch (code) {
    case "forbidden":
      return "You do not have permission to do that."
    case "not_found":
      return "That record no longer exists."
    case "not_verified":
      return "This practice needs to be verified before it can do that."
    case "role_not_permitted":
      return "Your role does not allow reading shared records."
    case "not_linked":
      return "This patient is not linked to a Pet10x account yet."
    case "illegal_transition":
      return "That is not a move this appointment can make from where it is."
    case "slot_taken":
      return "Someone just took that slot. Pick another."
    case "in_the_past":
      return "That time has already passed."
    case "clinic_not_verified":
      return "That practice is not verified, so it cannot receive records."
    case "not_your_pet":
      return "That pet is not on your account."
    case "already_linked":
      return "That pet is already linked to another chart here."
    case "bad_code":
      return "That code was not recognised."
    case "already_used":
      return "That code has already been used."
    case "expired":
      return "That code has expired. Ask for a fresh one."
    case "reason_required":
      return "A reason is required before emergency access."
    case "rate_limited":
      return "Too many emergency lookups today. Contact support."
    case "type_unavailable":
      return "That appointment type is not bookable online."
    case undefined:
      return "Something went wrong."
    default:
      return code.replace(/_/g, " ")
  }
}
