import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Pet10x — sweep for incident evidence nobody ever filed.
 *
 * Evidence is uploaded before the report exists: the browser PUTs to
 * `guest-evidence` under `{buildingId}/{draftId}/…` and the paths are only
 * claimed later, when `submit_incident_report` writes them into
 * `incident_reports.evidence_paths`. A reporter who attaches photos and then
 * closes the tab therefore leaves objects that nothing will ever point at.
 *
 * Runs on a schedule (see vercel.json) and needs the service role, because it
 * sweeps across every building. Guarded by CRON_SECRET so it is not an open
 * endpoint — Vercel Cron sends it as a bearer token automatically.
 *
 * Two guards decide what may be removed, and an object has to clear BOTH:
 *
 *   1. Claimed paths are never touched. They are attached to a filed report
 *      and a manager is reading them in the incident queue; deleting one
 *      destroys evidence in a live case.
 *   2. Anything younger than 24 hours is left alone regardless of claim.
 *      An unclaimed upload is not the same thing as an abandoned one — it is
 *      also what an in-progress report looks like, from here. Someone who
 *      attaches photos, is interrupted, and comes back twenty minutes later
 *      must not find them gone.
 *
 * Only one of those checks passing is not enough, and a sweep missing either
 * one still looks correct on the day it ships. So `?dry=1` runs the whole
 * selection and deletes nothing, answering with the exact paths it would have
 * removed — that is how to inspect this before trusting it, and there is no
 * undo in storage to fall back on if it is wrong.
 */

export const runtime = "nodejs"
export const maxDuration = 60

const BUCKET = "guest-evidence"

/**
 * How long an unclaimed object is presumed to be a report still being written.
 *
 * Deliberately a constant and not an env var, unlike the AI media retention
 * next door. That one expresses a retention policy someone may reasonably want
 * to tune; this one is the window in which a half-finished report is still
 * alive, and the only interesting misconfiguration of it — a value near zero —
 * deletes the photos of everyone currently composing.
 */
const MIN_AGE_HOURS = 24

/** Storage `list()` caps a page; loop on the offset until a page comes back short. */
const PAGE = 1000
/** Storage `remove()` takes up to 1000 paths; stay well inside that. */
const BATCH = 500
/**
 * Paths are `{buildingId}/{draftId}/{file}` — the array of candidates goes into
 * a query string, so keep a chunk small enough that the URL stays sane.
 */
const CLAIM_CHUNK = 50
/** `{buildingId}/{draftId}/{file}`: two folder levels and no more. */
const MAX_DEPTH = 2

interface StorageEntry {
  name: string
  /** Null for a synthesised folder — the API derives those from path segments. */
  id: string | null
  created_at: string | null
}

interface Candidate {
  path: string
  createdAt: string | null
}

type Admin = ReturnType<typeof getSupabaseAdmin>

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
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

/** Walk the bucket depth-first, collecting real objects and skipping folders. */
async function listObjects(admin: Admin, prefix: string, depth: number, out: Candidate[]): Promise<void> {
  let offset = 0
  for (;;) {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } })
    // A listing that half-worked must not become a delete list. Throwing here
    // means the run fails and nothing is removed, which is the safe direction:
    // an object missing from a truncated listing is merely swept tomorrow,
    // whereas acting on a partial view of *claims* would delete live evidence.
    if (error) throw new Error(`Couldn't list ${prefix || "/"}: ${error.message}`)

    const page = (data ?? []) as StorageEntry[]
    for (const entry of page) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === null) {
        // Deeper than the sign route can create. Not swept, and said out loud:
        // an object this walk never sees is one that lives forever, which is
        // the failure this route exists to stop.
        if (depth >= MAX_DEPTH) {
          console.warn(`[incidents] evidence purge skipped unexpected folder depth at ${path}`)
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
 * When the object was uploaded, in epoch ms, or NaN if that cannot be read.
 *
 * `created_at` and not `updated_at`, deliberately. `updated_at` looks like the
 * safer, more conservative choice — "leave it alone if anything touched it" —
 * but storage carries an `update_objects_updated_at` trigger that stamps it on
 * ANY write to the row, by anyone, for any reason. One platform-side update
 * across the table would push every abandoned object's apparent age back to
 * zero and quietly turn this sweep into a no-op, which is the exact bug it was
 * written to fix. Nothing in this flow rewrites an object anyway: every signed
 * upload mints a fresh `{i}-{Date.now()}` path and upsert is off, so a
 * re-attached photo is a new object, not a touched one.
 */
function uploadedAt(candidate: Candidate): number {
  return candidate.createdAt ? Date.parse(candidate.createdAt) : Number.NaN
}

/**
 * Which of these paths are attached to a filed report.
 *
 * `evidence_paths` is a `text[]` per row, so "is this path claimed" is a
 * membership question against the union of every row's array. The obvious
 * implementation — select every `evidence_paths` and build a Set in the route
 * — transfers the whole column on every run and grows with the table forever,
 * to answer a question about a handful of paths. This asks Postgres instead,
 * with the `&&` overlap operator (`.overlaps`), and gets back only the rows
 * that actually intersect the candidates. Today that is still a sequential
 * scan, because `evidence_paths` carries no index; the difference is that `&&`
 * is exactly what a `gin (evidence_paths)` index accelerates when the table
 * gets big enough to need one, and the in-memory version could never use it.
 */
async function claimedAmong(admin: Admin, paths: string[]): Promise<Set<string>> {
  const claimed = new Set<string>()
  for (const group of chunk(paths, CLAIM_CHUNK)) {
    const { data, error } = await admin.from("incident_reports").select("evidence_paths").overlaps("evidence_paths", group)
    // Same rule as the listing, and it matters more here: not knowing which
    // paths are claimed must never be read as "none of them are".
    if (error) throw new Error(`Couldn't check which paths are claimed: ${error.message}`)
    for (const row of data ?? []) {
      for (const path of row.evidence_paths ?? []) claimed.add(path)
    }
  }
  return claimed
}

async function purge(request: Request) {
  const admin = getSupabaseAdmin()
  const params = new URL(request.url).searchParams
  // Any `dry` at all means dry, and only an explicit "0"/"false" turns it off.
  // The strict reading — `dry === "1"` — answers `?dry=true` and `?dry` with a
  // real, irreversible delete from someone who plainly asked for a preview.
  const dry = params.get("dry")
  const dryRun = dry !== null && dry !== "0" && dry.toLowerCase() !== "false"

  // An age override exists so the guard can be demonstrated without waiting a
  // day — and is honoured ONLY under `dry`, where it deletes nothing. A real
  // run always uses MIN_AGE_HOURS, so nobody holding the cron secret can
  // shorten the window and sweep away drafts people are still writing.
  const raw = dryRun ? params.get("olderThanHours") : null
  const asked = raw === null || raw.trim() === "" ? Number.NaN : Number(raw)
  const olderThanHours = Number.isFinite(asked) && asked >= 0 ? asked : MIN_AGE_HOURS

  const objects: Candidate[] = []
  await listObjects(admin, "", 0, objects)

  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000
  const old = objects.filter((o) => {
    const uploaded = uploadedAt(o)
    // A missing or unreadable timestamp is not evidence of age. If we cannot
    // show the object is old, it stays.
    return Number.isFinite(uploaded) && uploaded <= cutoff
  })

  const claimed = old.length > 0 ? await claimedAmong(admin, old.map((o) => o.path)) : new Set<string>()
  const doomed = old.filter((o) => !claimed.has(o.path)).map((o) => o.path)

  const summary = {
    dryRun,
    olderThanHours,
    scanned: objects.length,
    tooYoung: objects.length - old.length,
    claimed: old.filter((o) => claimed.has(o.path)).length,
    deleted: 0,
    paths: doomed,
  }
  if (dryRun || doomed.length === 0) return summary

  for (const group of chunk(doomed, BATCH)) {
    const { data, error } = await admin.storage.from(BUCKET).remove(group)
    // Deleting rows from storage.objects directly would orphan the underlying
    // files, so this has to go through the Storage API.
    if (error) throw new Error(`Couldn't remove evidence: ${error.message}`)
    // What storage says it removed, not what was asked for — a path that had
    // already gone is silently absent from the result rather than an error.
    summary.deleted += data?.length ?? group.length
  }
  return summary
}

export async function POST(request: Request) {
  if (!isAuthorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ...(await purge(request)) })
  } catch (err) {
    console.error("[incidents] evidence purge failed", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/** Vercel Cron issues GET; same work, same guard. */
export async function GET(request: Request) {
  return POST(request)
}
