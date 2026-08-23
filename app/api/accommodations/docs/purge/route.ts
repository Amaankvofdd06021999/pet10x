import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import {
  classify,
  MIN_AGE_HOURS,
  RETENTION_DAYS,
  type EvidenceObject,
  type PurgeDocument,
  type PurgeRequest,
  type PurgeVerdict,
} from "@/lib/data/accommodation-docs-purge"

/**
 * Pet10x — let the doctor's letter go, and keep the record.
 *
 * Three things end up in `accommodation-docs` with nothing left to justify
 * keeping them, and this sweeps all three:
 *
 *   abandoned_draft    a request opened, a letter attached, never sent. 24h.
 *   retention_expired  a decided or withdrawn request, 400 days past its
 *                      terminal timestamp. THE ROW SURVIVES THE FILE:
 *                      storage_path goes null and purged_at is stamped, so the
 *                      fact that a letter was provided and verified stays
 *                      provable after the letter is gone.
 *   orphan             an object no `accommodation_documents` row names. A
 *                      deleted account's letter, a superseded re-upload, a
 *                      removal whose storage delete failed. 24h.
 *
 * THIS IS A SEPARATE ROUTE FROM THE INCIDENT EVIDENCE SWEEP, deliberately.
 * That one is hard-wired to one bucket and one claim table; folding a second
 * rule into it would make the deletion of a doctor's letter conditional inside
 * the sweep that deletes incident photos, where a bug in either destroys the
 * other's files.
 *
 * Every safety property of `app/api/incidents/evidence/purge/route.ts` is
 * carried across, and none of them is optional here:
 *
 *   * CRON_SECRET bearer guard, so this is not an open endpoint.
 *   * `?dry=1` where ANY value but 0/false means dry. The strict reading
 *     (`dry === "1"`) answers `?dry=true` with a real, irreversible delete
 *     from someone who plainly asked for a preview.
 *   * A depth-limited recursive listing, and a listing error ABORTS THE WHOLE
 *     RUN rather than becoming a delete list.
 *   * A query error is never read as "no rows". Not knowing which paths are
 *     referenced must never mean "none of them are".
 *   * Batched removal, with the reference set RE-CHECKED immediately before
 *     each batch.
 *   * A partial summary RETURNED rather than thrown, so an irreversible delete
 *     is never unaccounted for.
 *
 * The selection lives in `lib/data/accommodation-docs-purge.ts` and is covered
 * by its test file; this file is the I/O around it.
 */

export const runtime = "nodejs"
export const maxDuration = 60

const BUCKET = "accommodation-docs"

/** Storage `list()` caps a page at LEAST(coalesce(limit,100),1500); 1000 is honoured exactly. */
const PAGE = 1000
/** `remove()` takes up to 1000 paths; stay well inside. */
const BATCH = 500
/** `{buildingId}/{requestId}/{file}`: two folder levels and no more. */
const MAX_DEPTH = 2

interface StorageEntry {
  name: string
  /** Null for a synthesised folder — the API derives those from path segments. */
  id: string | null
  created_at: string | null
}

type Admin = ReturnType<typeof getSupabaseAdmin>

function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get("authorization") === `Bearer ${secret}`
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function listObjects(admin: Admin, prefix: string, depth: number, out: EvidenceObject[]): Promise<void> {
  let offset = 0
  for (;;) {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } })
    // A listing that half-worked must not become a delete list.
    if (error) throw new Error(`Couldn't list ${prefix || "/"}: ${error.message}`)

    const page = (data ?? []) as StorageEntry[]
    for (const entry of page) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === null) {
        if (depth >= MAX_DEPTH) {
          // An object this walk never sees lives forever, which is the leak
          // this route exists to close. Said out loud rather than skipped
          // silently.
          console.warn(`[accommodations] purge skipped unexpected folder depth at ${path}`)
          continue
        }
        await listObjects(admin, path, depth + 1, out)
        continue
      }
      out.push({ path, createdAt: entry.created_at })
    }

    if (page.length < PAGE) return
    offset += page.length
  }
}

/**
 * Every document row that still names a file, and every request behind them.
 *
 * Read WHOLE, not filtered to the candidate paths. `classify` treats an
 * unreferenced object as an orphan, so a partial read would manufacture
 * orphans out of live letters. Both queries throw on error for the same reason.
 *
 * `accommodation_documents` holds one row per (request, kind) and this table
 * will stay small — one letter per request — so reading it entire is the
 * correct trade here, unlike the incident sweep's `evidence_paths` column.
 */
async function referenceSet(admin: Admin): Promise<{ documents: PurgeDocument[]; requests: PurgeRequest[] }> {
  const { data: docRows, error: docError } = await admin
    .from("accommodation_documents")
    .select("id, request_id, storage_path")
    .not("storage_path", "is", null)
  if (docError) throw new Error(`Couldn't read the document rows: ${docError.message}`)

  const documents: PurgeDocument[] = (docRows ?? [])
    .filter((d): d is typeof d & { storage_path: string } => typeof d.storage_path === "string")
    .map((d) => ({ id: d.id, requestId: d.request_id, storagePath: d.storage_path }))

  const { data: reqRows, error: reqError } = await admin
    .from("accommodation_requests")
    .select("id, status, decided_at, withdrawn_at")
  if (reqError) throw new Error(`Couldn't read the requests: ${reqError.message}`)

  const requests: PurgeRequest[] = (reqRows ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    decidedAt: r.decided_at,
    withdrawnAt: r.withdrawn_at,
  }))
  return { documents, requests }
}

interface Summary {
  dryRun: boolean
  retentionDays: number
  minAgeHours: number
  scanned: number
  tooYoung: number
  undated: number
  malformed: number
  kept: number
  deleted: number
  /** Selected for removal, with the reason each. On a dry run, what would have gone. */
  select: PurgeVerdict[]
  /** Confirmed gone, as storage reported it back. The only record that exists. */
  removed: string[]
  /** Rows amended to `storage_path = null, purged_at = now()`. */
  rowsPurged: number
  /** Rows deleted outright, and drafts deleted with them. */
  rowsDeleted: number
  draftsDeleted: number
  error?: string
}

async function purge(request: Request): Promise<Summary> {
  const admin = getSupabaseAdmin()
  const params = new URL(request.url).searchParams
  const dry = params.get("dry")
  const dryRun = dry !== null && dry !== "0" && dry.toLowerCase() !== "false"

  const objects: EvidenceObject[] = []
  await listObjects(admin, "", 0, objects)
  const { documents, requests } = await referenceSet(admin)

  const now = Date.now()
  const result = classify(objects, requests, documents, now)
  if (result.malformed.length > 0) {
    // Never deleted, so this is a leak rather than a loss — but a silent one.
    console.warn("[accommodations] purge left unclaimable paths alone", result.malformed)
  }

  const summary: Summary = {
    dryRun,
    retentionDays: RETENTION_DAYS,
    minAgeHours: MIN_AGE_HOURS,
    scanned: objects.length,
    tooYoung: result.tooYoung,
    undated: result.undated,
    malformed: result.malformed.length,
    kept: result.kept.length,
    deleted: 0,
    select: result.remove,
    removed: [],
    rowsPurged: 0,
    rowsDeleted: 0,
    draftsDeleted: 0,
  }
  if (dryRun || result.remove.length === 0) return summary

  const byPath = new Map(result.remove.map((v) => [v.path, v]))
  const done: PurgeVerdict[] = []

  for (const group of chunk(result.remove.map((v) => v.path), BATCH)) {
    // Ask again, immediately before deleting. On a large sweep the first read
    // is many round-trips ago, and a resident who re-attached a letter in that
    // window would otherwise have it deleted out from under the row that has
    // just claimed it. This narrows the exposure from the length of the run to
    // the length of one query.
    let live: Set<string>
    try {
      const fresh = await referenceSet(admin)
      const stillClassified = classify(
        group.map((path) => ({ path, createdAt: new Date(0).toISOString() })),
        fresh.requests,
        fresh.documents,
        Date.now(),
      )
      live = new Set(stillClassified.remove.map((v) => v.path))
    } catch (err) {
      summary.error = (err as Error).message
      console.error("[accommodations] purge stopped mid-sweep", summary)
      return summary
    }
    const batch = group.filter((p) => live.has(p))
    const spared = group.filter((p) => !live.has(p))
    if (spared.length > 0) {
      console.warn("[accommodations] purge spared paths reclaimed mid-sweep", spared)
      summary.kept += spared.length
      summary.select = summary.select.filter((v) => !spared.includes(v.path))
    }
    if (batch.length === 0) continue

    const { data, error } = await admin.storage.from(BUCKET).remove(batch)
    // Through the Storage API, never by deleting storage.objects rows — that
    // orphans the underlying files instead of removing them.
    if (error) {
      // Stop, but keep the account. Vercel Cron records the status and not the
      // body, and the deletion cannot be undone, so what already went is only
      // knowable from the log and this summary.
      summary.error = `Couldn't remove documents: ${error.message}`
      console.error("[accommodations] purge stopped mid-sweep", summary)
      return summary
    }
    const gone = (data ?? []).map((object) => object.name)
    summary.deleted += gone.length
    summary.removed.push(...gone)
    for (const path of gone) {
      const verdict = byPath.get(path)
      if (verdict) done.push(verdict)
    }
    console.info("[accommodations] purge removed", gone)
  }

  // The rows, AFTER the files, and only for files storage confirmed gone.
  // Amending a row for a file that is still there would make `purged_at` a lie.
  try {
    const expired = done.filter((v) => v.reason === "retention_expired" && v.documentId)
    if (expired.length > 0) {
      const { error } = await admin
        .from("accommodation_documents")
        .update({ storage_path: null, purged_at: new Date().toISOString() })
        .in("id", expired.map((v) => v.documentId as string))
      if (error) throw new Error(error.message)
      summary.rowsPurged = expired.length
    }

    const abandoned = done.filter((v) => v.reason === "abandoned_draft" && v.documentId)
    if (abandoned.length > 0) {
      const { error } = await admin
        .from("accommodation_documents")
        .delete()
        .in("id", abandoned.map((v) => v.documentId as string))
      if (error) throw new Error(error.message)
      summary.rowsDeleted = abandoned.length
    }

    // A draft with nothing left attached, older than the window, is a request
    // nobody filed. The row is deleted; there is no record worth keeping of a
    // request that was never made, and leaving it makes the resident's own
    // screen list a request they abandoned a year ago.
    const draftIds = [...new Set(abandoned.map((v) => v.requestId as string))]
    for (const id of draftIds) {
      const { count } = await admin
        .from("accommodation_documents")
        .select("id", { count: "exact", head: true })
        .eq("request_id", id)
      if (count && count > 0) continue
      const cutoff = new Date(Date.now() - MIN_AGE_HOURS * 60 * 60 * 1000).toISOString()
      const { count: deleted } = await admin
        .from("accommodation_requests")
        .delete({ count: "exact" })
        .eq("id", id)
        .eq("status", "draft")
        .lt("created_at", cutoff)
      summary.draftsDeleted += deleted ?? 0
    }
  } catch (err) {
    // The files are gone either way. Report the bookkeeping failure rather
    // than discarding the account of what was destroyed.
    summary.error = `Files removed, but the rows could not be updated: ${(err as Error).message}`
    console.error("[accommodations] purge left rows out of step", summary)
    return summary
  }

  return summary
}

export async function POST(request: Request) {
  if (!isAuthorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const summary = await purge(request)
    return NextResponse.json({ ok: !summary.error, ...summary }, { status: summary.error ? 500 : 200 })
  } catch (err) {
    // Reached only when the run failed BEFORE its first removal — the listing
    // and the pre-loop reference read throw. Once the removal loop is running,
    // every failure inside it returns a partial summary instead of throwing.
    console.error("[accommodations] purge failed", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/** Vercel Cron issues GET; same work, same guard. */
export async function GET(request: Request) {
  return POST(request)
}
