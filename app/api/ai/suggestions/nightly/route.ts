import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { runSuggestions } from "@/lib/ai/suggestions/run"
import { advanceCursor, nextBatch } from "@/lib/ai/suggestions/nightly"

/**
 * Pet10x — the nightly suggestions sweep.
 *
 * Home used to rebuild every resident's suggestions on every visit. They are
 * now built here, once a night (see vercel.json), and once more on a
 * resident's very first visit (the POST in ./run).
 *
 * Runs with the service role, so RLS does not scope it: `runSuggestions` is
 * what keeps each owner's run to that owner's own pets. Guarded by CRON_SECRET
 * like the other sweeps — Vercel Cron sends it as a bearer token.
 *
 * The sweep walks profiles in id order and remembers where it stopped in
 * `cron_cursors`, so a run that hits its time budget resumes after the last
 * profile it finished instead of starting over. A finished sweep resets the
 * cursor, and the next night starts from the top.
 */

export const runtime = "nodejs"
export const maxDuration = 300

const CURSOR_NAME = "suggestions_nightly"
/** Pet rows read per page; at most this many owners per page. */
const PAGE = 200
/** Stop starting new profiles after this long, leaving room inside maxDuration. */
const BUDGET_MS = 240_000

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const startedAt = Date.now()
  const admin = getSupabaseAdmin()

  const { data: cursorRow, error: cursorErr } = await admin
    .from("cron_cursors")
    .select("cursor")
    .eq("name", CURSOR_NAME)
    .maybeSingle()
  if (cursorErr) {
    console.error("[ai] nightly suggestions: couldn't read the cursor", cursorErr)
    return NextResponse.json({ error: "Couldn't start the nightly run." }, { status: 500 })
  }

  let cursor: string | null = cursorRow?.cursor ?? null
  let processed = 0
  let failed = 0
  let done = false
  let timedOut = false
  /** Last profile that finished, or null if none did this run. */
  let lastCompleted: string | null = null

  while (!done && !timedOut) {
    // Owners of at least one live pet, in id order, above the cursor. A pet row
    // per owner, so the list is de-duplicated below.
    let query = admin.from("pets").select("owner_id").is("deleted_at", null).order("owner_id").limit(PAGE)
    if (cursor !== null) query = query.gt("owner_id", cursor)
    const { data: rows, error } = await query
    if (error) {
      console.error("[ai] nightly suggestions: couldn't list owners", error)
      break
    }

    const owners = [...new Set((rows ?? []).map((r) => r.owner_id))]
    const pageExhausted = (rows ?? []).length < PAGE
    const { batch } = nextBatch(owners, cursor, PAGE)

    for (const id of batch) {
      if (Date.now() - startedAt >= BUDGET_MS) {
        timedOut = true
        break
      }
      try {
        await runSuggestions(admin, id)
        processed += 1
      } catch (err) {
        console.error("[ai] nightly suggestions failed for a profile", id, err)
        failed += 1
      }
      // A profile that threw has still been attempted; resuming past it keeps
      // one broken account from being retried first every night.
      lastCompleted = id
      cursor = id
    }

    if (!timedOut && pageExhausted) done = true
    // A full page whose last owner was processed carries on from there.
    if (!timedOut && !pageExhausted && batch.length === 0) break
  }

  const nextCursor = advanceCursor(lastCompleted ? [lastCompleted] : [], done)
  // Nothing finished and the sweep isn't over: leave the stored cursor alone.
  if (done || lastCompleted !== null) {
    const { error } = await admin
      .from("cron_cursors")
      .upsert({ name: CURSOR_NAME, cursor: nextCursor, updated_at: new Date().toISOString() })
    if (error) console.error("[ai] nightly suggestions: couldn't save the cursor", error)
  }

  return NextResponse.json({ ok: true, processed, failed, done })
}
