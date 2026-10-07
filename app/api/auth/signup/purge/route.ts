import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Pet10x — daily sweep of unverified signups whose code has expired.
 *
 * `/signup/start` already clears an expired row for an address when that
 * address tries again, but an attempt nobody returns to was never cleared:
 * its email, name and (for a business) business details sat in
 * `pending_signups` indefinitely. The Privacy Policy says they are deleted;
 * this is what makes that true.
 *
 * `purge_expired_pending_signups()` (20260802000000) deletes from
 * `pending_signups` only and cannot reach a real account. It is executable by
 * the service role alone, hence the admin client. Guarded by CRON_SECRET —
 * Vercel Cron sends it as a bearer token (see vercel.json).
 */

export const runtime = "nodejs"

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function POST(request: Request) {
  if (!isAuthorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data, error } = await getSupabaseAdmin().rpc("purge_expired_pending_signups")
  if (error) {
    console.error("[signup] pending-signup purge failed", error)
    return NextResponse.json({ error: "Purge failed." }, { status: 500 })
  }
  return NextResponse.json({ ok: true, deleted: data ?? 0 })
}

/** Vercel Cron issues GET; same work, same guard. */
export async function GET(request: Request) {
  return POST(request)
}
