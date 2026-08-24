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
  PAGE_ROWS,
  readAllRows,
  redactPath,
  reasonHistogram,
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
 * And a FOURTH thing that is not an object at all: a `draft` REQUEST ROW with no
 * documents, older than 24h. The resident's screen inserts the row on the first
 * tap of a request type, before any file is chosen, so the commonest abandoned
 * draft has nothing in storage to find it by. That sweep reads the table
 * directly (`abandonedDraftIds`) and runs whether or not the object sweep
 * selected anything.
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

/**
 * Storage `list()` caps a page at LEAST(coalesce(limit,100),1500), so 1000 is
 * honoured today — but the walk below does not rely on that, for the same reason
 * the table reads no longer rely on `db_max_rows`. It advances by rows returned
 * and stops on an EMPTY page, so a smaller cap costs round trips and nothing
 * else. An object this walk never reaches is a file that lives forever; an
 * object it reaches TWICE is deduplicated by path downstream. Only the first is
 * a defect, and only a short-page terminator could cause it.
 */
const PAGE = PAGE_ROWS
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

/**
 * The summary as it may be LOGGED, which is not the summary as it is RETURNED.
 * The response body goes to a caller holding CRON_SECRET and is the only
 * account of what was irreversibly destroyed, so it keeps its paths. The log
 * goes wherever logs go.
 */
function logView(summary: Summary) {
  const { select, removed, ...rest } = summary
  return {
    ...rest,
    selected: select.length,
    selectedByReason: reasonHistogram(select),
    removedCount: removed.length,
  }
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
          console.warn(`[accommodations] purge skipped unexpected folder depth at ${redactPath(path)}`)
          continue
        }
        await listObjects(admin, path, depth + 1, out)
        continue
      }
      out.push({ path, createdAt: entry.created_at })
    }

    if (page.length === 0) return
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
 *
 * "ENTIRE" NOW MEANS ENTIRE, AND IT NO LONGER MEANS "UNLESS SOMEBODY SETS A
 * GUC". Both reads were single unpaginated queries, which is the exact failure
 * the paragraph above forbids: PostgREST caps a response at `db_max_rows` when
 * that is set, and it answers a truncated set with 200 and no error, so page one
 * of the letters would arrive looking like ALL of the letters and every object
 * past it would classify as an orphan and be deleted.
 *
 * Paging alone did not fix that, and the first attempt at this comment claimed
 * it had. `.range(from, from + 999)`, advancing by a hardcoded 1000 and stopping
 * on a page shorter than 1000, only moved the dependency from `db_max_rows` to
 * `min(db_max_rows, 1000)`: set it to 500 and page one is 500 rows, 200, no
 * error, "shorter than 1000, so that was all of them" — the identical deletion,
 * reached the identical way.
 *
 * `readAllRows` removes the dependency instead of relocating it: it advances by
 * the number of rows that ACTUALLY CAME BACK and stops only on an EMPTY page, so
 * no value of `db_max_rows` can end the loop early. `lib/data/accommodation-docs
 * -purge.test.ts` drives it against a server capped at 500 and at 1, and runs the
 * old loop against the same server to show it returning 500 of 1300. The
 * guarantee comes from this file and its test, not from a config nobody owns —
 * `pgrst.db_max_rows` is unset on this project today, and that is now a fact
 * about the project rather than the reason the sweep is safe.
 */

async function referenceSet(admin: Admin): Promise<{ documents: PurgeDocument[]; requests: PurgeRequest[] }> {
  const docRows = await readAllRows("the document rows", (from, to) =>
    admin
      .from("accommodation_documents")
      .select("id, request_id, storage_path")
      .not("storage_path", "is", null)
      .order("id", { ascending: true })
      .range(from, to),
  )
  const documents: PurgeDocument[] = []
  for (const d of docRows) {
    if (typeof d.storage_path !== "string") continue
    documents.push({ id: d.id, requestId: d.request_id, storagePath: d.storage_path })
  }

  const reqRows = await readAllRows("the requests", (from, to) =>
    admin
      .from("accommodation_requests")
      .select("id, status, decided_at, withdrawn_at")
      .order("id", { ascending: true })
      .range(from, to),
  )
  const requests: PurgeRequest[] = reqRows.map((r) => ({
    id: r.id,
    status: r.status,
    decidedAt: r.decided_at,
    withdrawnAt: r.withdrawn_at,
  }))

  return { documents, requests }
}

/**
 * A draft nobody filed, with nothing attached to it.
 *
 * THIS IS A SWEEP OVER THE TABLE, NOT A FOOTNOTE TO THE OBJECT SWEEP. The
 * previous version derived its candidate drafts from `abandoned_draft` OBJECT
 * verdicts, so the only drafts it could ever consider were drafts that had had a
 * file attached and had just had it deleted. The resident's screen inserts the
 * request row on the FIRST TAP of a request type, before any upload — so the
 * commonest abandoned draft of all, the one where somebody opened the form and
 * changed their mind, had no object, was never a candidate, and would have sat
 * on their Accommodations tab forever. Live count today is 0, which is why
 * nothing showed.
 *
 * The rule the plan actually asked for is a fact about the ROW: a draft with no
 * documents, older than the window, is gone. That is what this asks.
 */
async function abandonedDraftIds(admin: Admin, now: number): Promise<string[]> {
  const cutoff = new Date(now - MIN_AGE_HOURS * 60 * 60 * 1000).toISOString()

  const draftRows = await readAllRows("the abandoned drafts", (from, to) =>
    admin
      .from("accommodation_requests")
      .select("id")
      .eq("status", "draft")
      .lt("created_at", cutoff)
      .order("id", { ascending: true })
      .range(from, to),
  )
  const drafts = draftRows.map((r) => r.id)
  if (drafts.length === 0) return []

  // Any document row at all, whether or not it still names a file. A row whose
  // `storage_path` has been purged is still a record that a letter was provided,
  // and deleting the request would delete it.
  //
  // PAGED FOR THE SAME REASON THE READS ABOVE ARE, and it was the third read
  // with this defect. A truncated answer here does not under-report drafts, it
  // OVER-reports them: a request whose document row fell off the end of a capped
  // response reads as a draft with no documents, and this function returns it to
  // be DELETED — taking the row that proved a letter was provided with it. 200
  // ids per chunk is not 200 rows back, because the table holds one row per
  // (request, kind).
  const claimed = new Set<string>()
  for (const group of chunk(drafts, 200)) {
    const rows = await readAllRows("the drafts' documents", (from, to) =>
      admin
        .from("accommodation_documents")
        .select("id, request_id")
        .in("request_id", group)
        .order("id", { ascending: true })
        .range(from, to),
    )
    for (const row of rows) claimed.add(row.request_id)
  }
  return drafts.filter((id) => !claimed.has(id))
}

/** Deletes them, re-asserting `status` and the age in the DELETE itself. */
async function deleteAbandonedDrafts(admin: Admin, ids: string[], now: number): Promise<number> {
  const cutoff = new Date(now - MIN_AGE_HOURS * 60 * 60 * 1000).toISOString()
  let deleted = 0
  for (const group of chunk(ids, 200)) {
    // `status` and `created_at` are re-stated here on purpose. The read above is
    // several round-trips ago, and a resident who submitted their draft in that
    // window must not have the request deleted out from under them.
    const { count, error } = await admin
      .from("accommodation_requests")
      .delete({ count: "exact" })
      .in("id", group)
      .eq("status", "draft")
      .lt("created_at", cutoff)
    if (error) throw new Error(error.message)
    deleted += count ?? 0
  }
  return deleted
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
  /**
   * Drafts with no documents at all, older than the window. Independent of the
   * object sweep: a draft that never had a file attached is the commonest kind,
   * and it has no object to be found by.
   */
  draftsSelected: number
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
    console.warn("[accommodations] purge left unclaimable paths alone", {
      count: result.malformed.length,
      paths: result.malformed.map(redactPath),
    })
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
    draftsSelected: 0,
    draftsDeleted: 0,
  }

  // Asked and acted on regardless of what the object sweep found, because a
  // draft with no documents has no object to be found by.
  const staleDrafts = await abandonedDraftIds(admin, now)
  summary.draftsSelected = staleDrafts.length

  if (dryRun) return summary

  if (staleDrafts.length > 0) {
    try {
      summary.draftsDeleted = await deleteAbandonedDrafts(admin, staleDrafts, now)
    } catch (err) {
      // Nothing irreversible has happened to a FILE yet, so this is reportable
      // rather than fatal: carry on and sweep the objects.
      summary.error = `Abandoned drafts could not be deleted: ${(err as Error).message}`
      console.error("[accommodations] purge left abandoned drafts alone", logView(summary))
    }
  }

  if (result.remove.length === 0) return summary

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
      console.error("[accommodations] purge stopped mid-sweep", logView(summary))
      return summary
    }
    const batch = group.filter((p) => live.has(p))
    const spared = group.filter((p) => !live.has(p))
    if (spared.length > 0) {
      console.warn("[accommodations] purge spared paths reclaimed mid-sweep", {
        count: spared.length,
        paths: spared.map(redactPath),
      })
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
      console.error("[accommodations] purge stopped mid-sweep", logView(summary))
      return summary
    }
    const gone = (data ?? []).map((object) => object.name)
    summary.deleted += gone.length
    summary.removed.push(...gone)
    for (const path of gone) {
      const verdict = byPath.get(path)
      if (verdict) done.push(verdict)
    }
    console.info("[accommodations] purge removed", {
      count: gone.length,
      byReason: reasonHistogram(gone.map((p) => byPath.get(p)).filter((v): v is PurgeVerdict => v !== undefined)),
      paths: gone.map(redactPath),
    })
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

    // A draft that has JUST had its last document deleted above is now a draft
    // with no documents, and the sweep at the top of this run asked before that
    // was true. Ask again for exactly those requests, so a draft emptied by this
    // run goes in this run rather than tomorrow's.
    const emptied = [...new Set(abandoned.map((v) => v.requestId as string))].filter(
      (id) => !staleDrafts.includes(id),
    )
    if (emptied.length > 0) {
      const stillEmpty = await abandonedDraftIds(admin, now)
      const nowGone = emptied.filter((id) => stillEmpty.includes(id))
      if (nowGone.length > 0) {
        summary.draftsSelected += nowGone.length
        summary.draftsDeleted += await deleteAbandonedDrafts(admin, nowGone, now)
      }
    }
  } catch (err) {
    // The files are gone either way. Report the bookkeeping failure rather
    // than discarding the account of what was destroyed.
    summary.error = `Files removed, but the rows could not be updated: ${(err as Error).message}`
    console.error("[accommodations] purge left rows out of step", logView(summary))
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
