"use client"

/**
 * Pet10x — web push on this device.
 *
 * THREE RULES:
 *
 *   1. Permission is asked for only from the "Push on this device" switch —
 *      `enablePush` is the only caller of `Notification.requestPermission`,
 *      and nothing calls it on load. A permission prompt nobody asked for is
 *      the one most people block forever.
 *   2. No VAPID public key, no push. `isPushConfigured()` is false and the
 *      switch is not rendered at all, rather than shown and failing.
 *   3. A subscription belongs to whoever is signed in on this browser.
 *      Turning the switch off and signing out both delete the row and
 *      unsubscribe; `register_web_push_subscription` takes the endpoint over
 *      if a previous account's session simply expired.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""
const SW_PATH = "/sw.js"

/** Whether this deployment can send web push at all. */
export function isPushConfigured(): boolean {
  return VAPID_PUBLIC_KEY.length > 0
}

/** Whether this browser can receive it (feature detection, no prompts). */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

export type PushState = "unsupported" | "denied" | "on" | "off"

/** Where this device stands, without asking for anything. */
export async function getPushState(): Promise<PushState> {
  if (!isPushConfigured() || !isPushSupported()) return "unsupported"
  if (Notification.permission === "denied") return "denied"
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH).catch(() => undefined)
  const sub = await reg?.pushManager.getSubscription().catch(() => null)
  return sub ? "on" : "off"
}

/**
 * The VAPID key as the bytes `pushManager.subscribe` wants. The key is
 * base64url without padding, which `atob` does not read as-is.
 */
export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

const REGISTER_ERRORS: Record<string, string> = {
  not_authenticated: "Sign in again to turn on push notifications.",
  invalid_subscription: "This browser returned a push subscription Pet10x can't use.",
}

/**
 * Turn push on for this device. MUST be called from the switch's own click
 * handler: browsers only show the permission prompt in response to a gesture.
 */
export async function enablePush(): Promise<{ error: string | null }> {
  if (!isPushConfigured() || !isPushSupported()) return { error: "This browser can't receive push notifications." }
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    return {
      error:
        permission === "denied"
          ? "Notifications are blocked for Pet10x in this browser's settings. Allow them there, then try again."
          : "Push stays off until you allow notifications.",
    }
  }

  let sub: PushSubscription
  try {
    const reg = await navigator.serviceWorker.register(SW_PATH)
    await navigator.serviceWorker.ready
    sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }))
  } catch {
    return { error: "This browser couldn't set up push notifications. Try again, or use another browser." }
  }

  const json = sub.toJSON()
  const { data, error } = await db.rpc("register_web_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? "",
    p_auth: json.keys?.auth ?? "",
    p_user_agent: navigator.userAgent,
  })
  const result = data as { ok?: boolean; error?: string } | null
  if (error || !result?.ok) {
    // Leave no browser subscription the server does not know about.
    await sub.unsubscribe().catch(() => {})
    if (error) return { error: "Couldn't save push for this device. Check your connection and try again." }
    return { error: REGISTER_ERRORS[result?.error ?? ""] ?? "Couldn't turn on push notifications." }
  }
  return { error: null }
}

/**
 * Turn push off for this device: delete the server's row (RLS: own rows only)
 * and unsubscribe the browser. The row goes first, while the session that owns
 * it is still signed in; the browser is unsubscribed even if that fails.
 */
export async function disablePush(): Promise<{ error: string | null }> {
  if (!isPushSupported()) return { error: null }
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH).catch(() => undefined)
  const sub = await reg?.pushManager.getSubscription().catch(() => null)
  if (!sub) return { error: null }
  const db = getSupabaseBrowserClient()
  const { error } = db
    ? await db.from("web_push_subscriptions").delete().eq("endpoint", sub.endpoint)
    : { error: null }
  /* Unsubscribed whether or not the row went: a row left behind points at an
     endpoint that now answers 410, and the dispatcher deletes it on its next
     send. A browser left subscribed after "off" would keep showing pushes. */
  await sub.unsubscribe().catch(() => {})
  if (error) return { error: "Push is off on this device, but Pet10x couldn't confirm it. It will tidy up on its own." }
  return { error: null }
}

/**
 * Sign-out's half. Bounded, and never throws: signing out must not wait on a
 * push service or fail because one is unreachable. Registers nothing — a
 * browser that never turned push on has nothing to undo.
 */
export async function unsubscribePushOnSignOut(): Promise<void> {
  if (!isPushSupported()) return
  await Promise.race([
    disablePush().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ])
}
