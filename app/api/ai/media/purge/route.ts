import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { CronStageError, cronFailure, cronFailureOf } from "@/lib/cron-failure"

/**
 * Pet10x — retention sweep for assistant photo attachments.
 *
 * Chat attachments are the most sensitive thing the app stores: a rash, a
 * stool, a wound, a vet document. They earn their keep for as long as the
 * owner might reopen the thread, and not a day longer.
 *
 * Runs on a schedule (see vercel.json) and needs the service role, because it
 * sweeps across every owner. Guarded by CRON_SECRET so it is not an open
 * endpoint — Vercel Cron sends it as a bearer token automatically.
 *
 * Only files matching the `ai-` prefix are touched. Pet profile photos and
 * uploaded documents live in the same bucket and must survive this.
 */

const TAG = "[ai-media-purge]"

export const runtime = "nodejs"
export const maxDuration = 60

const DEFAULT_RETENTION_DAYS = 7
/** Storage `remove()` takes up to 1000 paths; stay well inside that. */
const BATCH = 500

function retentionDays(): number {
  const raw = Number(process.env.AI_MEDIA_RETENTION_DAYS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_RETENTION_DAYS
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

async function purge() {
  const admin = getSupabaseAdmin()
  const days = retentionDays()

  const { data: expired, error } = await admin.rpc("ai_expired_chat_media", {
    p_days: days,
    p_limit: BATCH,
  })
  if (error) throw new CronStageError("list_expired", error)

  const paths = (expired ?? []).map((row: { path: string }) => row.path)
  if (paths.length === 0) return { retentionDays: days, deleted: 0, messagesUpdated: 0 }

  // Storage first. Deleting the rows in storage.objects directly would orphan
  // the underlying files, so this has to go through the Storage API.
  const { error: removeError } = await admin.storage.from("pet-media").remove(paths)
  if (removeError) throw new CronStageError("remove_files", removeError)

  // Then drop the dead paths from the messages that referenced them, so the
  // thread renders as text instead of trying to sign a file that is gone.
  const { data: touched, error: forgetError } = await admin.rpc("ai_forget_chat_media", { p_paths: paths })
  // The files are already gone, so a failure here keeps the account of what
  // was removed and answers 500: threads still point at files that no longer exist.
  if (forgetError) {
    return {
      retentionDays: days,
      deleted: paths.length,
      messagesUpdated: 0,
      ...cronFailure("forget_paths", forgetError, TAG),
    }
  }

  return { retentionDays: days, deleted: paths.length, messagesUpdated: touched ?? 0 }
}

export async function POST(request: Request) {
  if (!isAuthorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const result = await purge()
    return NextResponse.json({ ok: !("error" in result), ...result }, { status: "error" in result ? 500 : 200 })
  } catch (err) {
    return NextResponse.json(cronFailureOf(err, TAG), { status: 500 })
  }
}

/** Vercel Cron issues GET; same work, same guard. */
export async function GET(request: Request) {
  return POST(request)
}
