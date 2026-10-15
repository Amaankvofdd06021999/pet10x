import { NextResponse, type NextRequest } from "next/server"
import webpush from "web-push"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { isEmailEnabled, sendNotificationDigest, sendNotificationEmail, type NotificationEmailItem } from "@/lib/email"
import {
  EMAIL_KINDS,
  EMAIL_MAX_RECIPIENTS,
  PUSH_MAX_PER_RUN,
  digestTarget,
  groupByRecipient,
  isEmailEligible,
  isPushGone,
  pushPayload,
  type EmailCandidate,
} from "@/lib/notifications/dispatch"
import { dbErrorMessage } from "@/lib/data/db-error"

/**
 * Deliver notifications beyond the app: email, then web push.
 *
 * Runs every 5 minutes on the schedule in vercel.json. Nothing else in the
 * codebase sends a notification anywhere — every writer (the RPCs, the
 * triggers, the care reminder cron) only inserts a row, and this picks it up.
 * One sender means one place that knows about preferences, the two-minute
 * grace for an in-app read, and the per-run caps.
 *
 * SAFE TO OVERLAP. A run claims rows through `claim_notification_emails` /
 * `claim_notification_pushes`, each one locked `update … returning`
 * statement (20261011000002), so a slow run and the next tick never hold the
 * same row. `emailed_at` / `pushed_at` are written only after a send
 * succeeds; a row whose send failed keeps its lease, and the lease expiring
 * (15 minutes) is the retry — unless Resend refused the message itself (an
 * invalid recipient), which is stamped `email_failed_at` and never retried.
 * A row this run claimed but had no time left to send is released at the
 * end, so the next tick takes it.
 *
 * Each pass has its OWN time budget. With one shared clock a slow email
 * backlog could spend the whole run and starve push every tick.
 */

/** Per pass: stop starting new sends after this long; the rest are released. */
const PASS_BUDGET_MS = 25_000
const PUSH_CONCURRENCY = 10

export const maxDuration = 60

type Admin = ReturnType<typeof getSupabaseAdmin>

export async function GET(request: NextRequest) {
  // Vercel Cron sends the secret as a bearer token. Without it this endpoint
  // would let anyone trigger mail to every account with a pending notification.
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const email = await emailPass(supabase, Date.now())
  const push = await pushPass(supabase, Date.now())
  return NextResponse.json({ email, push })
}

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

function toItem(n: EmailCandidate): NotificationEmailItem {
  return { title: n.title, body: n.body, actionLabel: n.action_label, actionTarget: n.action_target }
}

async function emailPass(supabase: Admin, started: number) {
  /* Without a key (or outside production without EMAIL_DEV_SEND) every send
     would be suppressed. Claiming rows only to suppress them would re-lease
     the same backlog all day, so the pass does not run at all. */
  if (!isEmailEnabled()) return { skipped: "email is not enabled" }

  const { data, error } = await supabase.rpc("claim_notification_emails", {
    p_kinds: [...EMAIL_KINDS],
    p_max_recipients: EMAIL_MAX_RECIPIENTS,
  })
  if (error) return { error: dbErrorMessage(error, "Couldn't claim notification emails.") }

  const now = Date.now()
  const rows = (data ?? []).filter((n) => isEmailEligible(n, now))
  const groups = groupByRecipient(rows)

  let sent = 0
  let failed = 0
  const unsent: string[] = []
  const refused: string[] = []

  for (const g of groups) {
    const ids = g.items.map((i) => i.id)
    if (Date.now() - started > PASS_BUDGET_MS) {
      unsent.push(...ids)
      continue
    }
    const to = g.email!.trim()
    const res =
      g.items.length === 1
        ? await sendNotificationEmail({ to, item: toItem(g.items[0]) })
        : await sendNotificationDigest({ to, items: g.items.map(toItem), ctaTarget: digestTarget(g.items) })

    if (!res.ok) {
      failed += 1
      // Refused for good: stop. Anything else stays leased, and the lease
      // expiring is the retry.
      if ("permanent" in res && res.permanent) refused.push(...ids)
      continue
    }
    const { error: markErr } = await supabase
      .from("notifications")
      .update({ emailed_at: new Date().toISOString() })
      .in("id", ids)
    if (markErr) console.error(`[dispatch] sent but could not mark emailed_at for ${ids.join(",")}`, markErr)
    sent += 1
  }

  if (unsent.length) {
    await supabase.from("notifications").update({ email_claimed_at: null }).in("id", unsent)
  }
  if (refused.length) {
    await supabase.from("notifications").update({ email_failed_at: new Date().toISOString() }).in("id", refused)
  }

  return {
    claimed: data?.length ?? 0,
    recipients: groups.length,
    sent,
    failed,
    refused: refused.length,
    deferred: unsent.length,
  }
}

/* ------------------------------------------------------------------ */
/* Web push                                                            */
/* ------------------------------------------------------------------ */

/** True once VAPID is configured for this run; false (and why) otherwise. */
function configurePush(): { ok: true } | { ok: false; why: string } {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) return { ok: false, why: "VAPID keys are not configured" }
  try {
    webpush.setVapidDetails(subject, pub, priv)
    return { ok: true }
  } catch (e) {
    console.error("[dispatch] VAPID configuration rejected", e)
    return { ok: false, why: "invalid VAPID configuration" }
  }
}

async function pushPass(supabase: Admin, started: number) {
  const configured = configurePush()
  if (!configured.ok) return { skipped: configured.why }

  const { data: claimed, error } = await supabase.rpc("claim_notification_pushes", { p_limit: PUSH_MAX_PER_RUN })
  if (error) return { error: dbErrorMessage(error, "Couldn't claim notification pushes.") }
  const notes = claimed ?? []
  if (notes.length === 0) return { claimed: 0, pushed: 0 }

  const profileIds = [...new Set(notes.map((n) => n.profile_id))]
  const { data: subs, error: subsErr } = await supabase
    .from("web_push_subscriptions")
    .select("id, profile_id, endpoint, p256dh, auth")
    .in("profile_id", profileIds)
  if (subsErr) {
    await supabase.from("notifications").update({ push_claimed_at: null }).in("id", notes.map((n) => n.id))
    return { error: dbErrorMessage(subsErr, "Couldn't read push subscriptions; the pushes were released for the next run.") }
  }

  const byProfile = new Map<string, NonNullable<typeof subs>>()
  for (const s of subs ?? []) {
    const list = byProfile.get(s.profile_id) ?? []
    list.push(s)
    byProfile.set(s.profile_id, list)
  }

  const gone = new Set<string>()
  const used = new Set<string>()
  const done: string[] = []
  const unsent: string[] = []
  let failed = 0

  async function deliver(n: (typeof notes)[number]) {
    if (Date.now() - started > PASS_BUDGET_MS) {
      unsent.push(n.id)
      return
    }
    const targets = (byProfile.get(n.profile_id) ?? []).filter((s) => !gone.has(s.id))
    const payload = pushPayload(n)
    let delivered = false
    let retryable = false
    await Promise.all(
      targets.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            TTL: 24 * 60 * 60,
            urgency: n.severity === "warning" || n.severity === "error" ? "high" : "normal",
          })
          delivered = true
          used.add(s.id)
        } catch (err) {
          if (isPushGone(err)) gone.add(s.id)
          else retryable = true
        }
      }),
    )
    /* Stamped when it reached at least one device, and also when every
       device turned out to be gone — there is nobody left to retry for. Only
       a transient failure with no delivery leaves it leased for a retry. */
    if (delivered || !retryable) done.push(n.id)
    else failed += 1
  }

  for (let i = 0; i < notes.length; i += PUSH_CONCURRENCY) {
    await Promise.all(notes.slice(i, i + PUSH_CONCURRENCY).map(deliver))
  }

  const stamp = new Date().toISOString()
  if (done.length) await supabase.from("notifications").update({ pushed_at: stamp }).in("id", done)
  if (unsent.length) await supabase.from("notifications").update({ push_claimed_at: null }).in("id", unsent)
  if (gone.size) await supabase.from("web_push_subscriptions").delete().in("id", [...gone])
  if (used.size) await supabase.from("web_push_subscriptions").update({ last_used_at: stamp }).in("id", [...used])

  return {
    claimed: notes.length,
    pushed: done.length,
    failed,
    deferred: unsent.length,
    subscriptionsRemoved: gone.size,
  }
}
