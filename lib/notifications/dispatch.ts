/**
 * Pet10x — the rules `/api/notifications/dispatch` sends by, as pure functions.
 *
 * The claim RPCs (20261011000002) are the filter: they lease only rows that
 * pass these same tests, inside one locked statement. This module is the
 * second look the route takes at each claimed row before it mails anybody —
 * and the one place the rules are written in a form vitest can hold to them.
 * The kind list is passed INTO the email claim from here, so that half cannot
 * drift; the ages are repeated in the SQL and named in its comments.
 */

import type { Database } from "@/lib/supabase/database.types"
import { targetHref } from "@/lib/navigation"

export type NotificationKind = Database["public"]["Enums"]["notification_kind"]
export type EmailCandidate =
  Database["public"]["Functions"]["claim_notification_emails"]["Returns"][number]

/**
 * Kinds worth an email. `assistant`, `care` and `community` are push-only:
 * a daily walk reminder or a neighbour's lost-dog post in the inbox would
 * teach people to ignore the emails that matter. `system` is not listed by
 * the spec either way and stays in-app.
 */
export const EMAIL_KINDS: readonly NotificationKind[] = [
  "incident",
  "appointment",
  "clinic",
  "reminder",
  "compliance",
  "building",
  "billing",
]

/** An in-app read inside this window means the email is never sent. */
export const EMAIL_MIN_AGE_MS = 2 * 60 * 1000
/** Older than this is history, not news — neither channel sends it. */
export const DISPATCH_WINDOW_MS = 24 * 60 * 60 * 1000

/** Recipients per run; a backlog drains over several runs. */
export const EMAIL_MAX_RECIPIENTS = 200
/** Notifications pushed per run. */
export const PUSH_MAX_PER_RUN = 500

export function isEmailEligible(n: EmailCandidate, now: number): boolean {
  if (!EMAIL_KINDS.includes(n.kind)) return false
  if (n.read_at) return false
  if (!n.notify_email) return false
  if (!n.email?.trim()) return false
  const created = Date.parse(n.created_at)
  if (Number.isNaN(created)) return false
  const age = now - created
  return age >= EMAIL_MIN_AGE_MS && age <= DISPATCH_WINDOW_MS
}

export interface RecipientGroup {
  profileId: string
  email: string | null
  items: EmailCandidate[]
}

/** One group per person, in the order people first appear, oldest item first. */
export function groupByRecipient(rows: EmailCandidate[]): RecipientGroup[] {
  const groups = new Map<string, RecipientGroup>()
  for (const r of rows) {
    const g = groups.get(r.profile_id)
    if (g) g.items.push(r)
    else groups.set(r.profile_id, { profileId: r.profile_id, email: r.email, items: [r] })
  }
  for (const g of groups.values()) {
    g.items.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  }
  return [...groups.values()]
}

/**
 * Where a digest's button goes: the one screen every item names, if they
 * agree, otherwise Alerts, which lists them all.
 */
export function digestTarget(items: Pick<EmailCandidate, "action_target">[]): string {
  const first = items[0]?.action_target ?? null
  return first && items.every((i) => i.action_target === first) ? first : "alerts"
}

const PUSH_BODY_MAX = 300
const PUSH_TITLE_MAX = 120

/**
 * The JSON `public/sw.js` reads. Short on purpose: web push caps a payload at
 * about 4 KB after encryption, and a lock screen shows two lines anyway.
 * `url` is a same-origin path; the worker resolves it against its own origin.
 */
export function pushPayload(n: { id: string; title: string; body: string | null; action_target: string | null }): string {
  const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)
  return JSON.stringify({
    title: clip(n.title, PUSH_TITLE_MAX),
    body: clip(n.body ?? "", PUSH_BODY_MAX),
    tag: n.id,
    url: targetHref(n.action_target),
  })
}

/**
 * The push service's way of saying the subscription is dead: the browser
 * unsubscribed, the app was removed, or the endpoint expired. Those rows are
 * deleted; every other failure is retried on a later run.
 */
export function isPushGone(err: unknown): boolean {
  const code = (err as { statusCode?: unknown } | null)?.statusCode
  return code === 404 || code === 410
}
