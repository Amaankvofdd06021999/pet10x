"use client"

/**
 * Pet10x — the signed-in account's notification preferences.
 *
 * Two columns on `profiles` (20261011000002): `notify_email` and
 * `notify_push`. `/api/notifications/dispatch` reads both; nothing else does.
 * The account writes its own row under `profiles_update_self`, and
 * `guard_profile_privilege` does not touch these columns.
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export interface NotificationPrefs {
  email: boolean
  push: boolean
}

async function myId(): Promise<string | null> {
  const db = getSupabaseBrowserClient()
  if (!db) return null
  const {
    data: { user },
  } = await db.auth.getUser()
  return user?.id ?? null
}

export function useNotificationPrefs() {
  const [data, setData] = useState<NotificationPrefs | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const db = getSupabaseBrowserClient()
    const id = await myId()
    if (!db || !id) {
      setData(null)
      setError("Sign in to change notification settings.")
      setLoading(false)
      return
    }
    const { data: row, error: err } = await db
      .from("profiles")
      .select("notify_email, notify_push")
      .eq("id", id)
      .maybeSingle()
    if (err || !row) {
      setError("Couldn't load your notification settings.")
      setData(null)
    } else {
      setError(null)
      setData({ email: row.notify_email, push: row.notify_push })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch, setData }
}

/** Write one preference for the signed-in account. */
export async function setNotificationPref(
  which: keyof NotificationPrefs,
  value: boolean,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  const id = await myId()
  if (!db || !id) return { error: "Sign in to change notification settings." }
  const { error } = await db
    .from("profiles")
    .update(which === "email" ? { notify_email: value } : { notify_push: value })
    .eq("id", id)
  return { error: error ? "Couldn't save that setting. Check your connection and try again." : null }
}

/** Whether this account still has push turned on on any other device. */
export async function hasOtherPushDevices(): Promise<boolean> {
  const db = getSupabaseBrowserClient()
  const id = await myId()
  if (!db || !id) return false
  const { data } = await db.from("web_push_subscriptions").select("id").eq("profile_id", id).limit(1)
  return (data?.length ?? 0) > 0
}
