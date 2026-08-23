import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { ageEligible, unclaimed, type EvidenceObject } from "@/lib/data/evidence-purge"

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
 *
 * The selection itself lives in `lib/data/evidence-purge.ts` and is covered by
 * `lib/data/evidence-purge.test.ts`; this file is the I/O around it.
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

/**
 * Storage `list()` caps a page at `LEAST(coalesce(limit, 100), 1500)`, so 1000
 * is honoured exactly and a short page really does mean the end of the folder.
 * Raising this past 1500 would silently truncate every folder to one page.
 */
const PAGE = 1000
/** Storage `remove()` takes up to 1000 paths; stay well inside that. */
const BATCH = 500
/**
 * Candidates go into the `&&` operand, which PostgREST carries in the query
 * string, and paths run ~80 characters. 50 keeps the URL around 4 KB.
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
async function listObjects(admin: Admin, prefix: string, depth: number, out: EvidenceObject[]): Promise<void> {
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
 *
 * Every path of a matched row is added, not just the intersecting ones. That
 * over-inclusiveness is deliberate: it costs nothing and it means a mistake
 * here spares a file rather than destroying one.
 *
 * `incident_reports` is the only claim record for this bucket, and that is an
 * assumption rather than a law. `municipal_reports` has an `evidence_paths`
 * column too; it is empty, and nothing reads or writes it, and no code path
 * puts municipal evidence in `guest-evidence`. If that ever changes, this
 * query has to change with it, or municipal evidence is deleted a day later.
 *
 * Callers must have filtered paths through `CLAIMABLE_PATH` first — see the
 * note there on why an unescaped path in the `&&` operand is a delete bug.
 */
async function claimedAmong(admin: Admin, paths: readonly string[]): Promise<Set<string>> {
  const claimed = new Set<string>()
  for (const group of chunk([...paths], CLAIM_CHUNK)) {
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

interface Summary {
  dryRun: boolean
  olderThanHours: number
  scanned: number
  tooYoung: number
  undated: number
  malformed: number
  claimed: number
  deleted: number
  /** Selected for removal. On a dry run, what would have gone. */
  paths: string[]
  /** Confirmed gone, as storage reported it back. The only record that exists. */
  removed: string[]
  error?: string
}

async function purge(request: Request): Promise<Summary> {
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

  const objects: EvidenceObject[] = []
  await listObjects(admin, "", 0, objects)

  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000
  const { candidates, tooYoung, undated, malformed } = ageEligible(objects, cutoff)
  if (malformed.length > 0) {
    // Never deleted, so this is a leak rather than a loss — but a silent one.
    console.warn("[incidents] evidence purge left unclaimable paths alone", malformed)
  }

  const claimed = candidates.length > 0 ? await claimedAmong(admin, candidates) : new Set<string>()
  const { remove, spared } = unclaimed(candidates, claimed)

  const summary: Summary = {
    dryRun,
    olderThanHours,
    scanned: objects.length,
    tooYoung,
    undated,
    malformed: malformed.length,
    claimed: spared.length,
    deleted: 0,
    paths: remove,
    removed: [],
  }
  if (dryRun || remove.length === 0) return summary

  for (const group of chunk(remove, BATCH)) {
    // Ask again, immediately before deleting. The first claim check ran before
    // the first batch, which on a large sweep is many round-trips ago; a draft
    // submitted in that window would otherwise have its photos deleted out from
    // under the report that had just claimed them. This narrows the exposure
    // from the length of the whole run to the length of one query.
    const stillClaimed = await claimedAmong(admin, group)
    const { remove: batch, spared: lateClaims } = unclaimed(group, stillClaimed)
    if (lateClaims.length > 0) {
      console.warn("[incidents] evidence purge spared paths claimed mid-sweep", lateClaims)
      summary.claimed += lateClaims.length
      summary.paths = summary.paths.filter((p) => !lateClaims.includes(p))
    }
    if (batch.length === 0) continue

    const { data, error } = await admin.storage.from(BUCKET).remove(batch)
    // Deleting rows from storage.objects directly would orphan the underlying
    // files, so this has to go through the Storage API.
    if (error) {
      // Stop, but keep the account. Vercel Cron records the response status and
      // not its body, and the deletion cannot be undone, so what already went
      // is only knowable from the log and the returned summary. Throwing here
      // would discard both and leave an operator investigating a missing photo
      // with nothing at all to read.
      summary.error = `Couldn't remove evidence: ${error.message}`
      console.error("[incidents] evidence purge stopped mid-sweep", summary)
      return summary
    }
    // What storage says it removed, not what was asked for — a path that had
    // already gone is silently absent from the result rather than an error.
    const gone = (data ?? []).map((object) => object.name)
    summary.deleted += gone.length
    summary.removed.push(...gone)
    console.info("[incidents] evidence purge removed", gone)
  }
  return summary
}

export async function POST(request: Request) {
  if (!isAuthorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const summary = await purge(request)
    // A sweep that stopped part-way still answers with what it destroyed.
    return NextResponse.json({ ok: !summary.error, ...summary }, { status: summary.error ? 500 : 200 })
  } catch (err) {
    // Only reachable before anything was deleted: listing and the first claim
    // check throw, the removal loop does not.
    console.error("[incidents] evidence purge failed", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

/** Vercel Cron issues GET; same work, same guard. */
export async function GET(request: Request) {
  return POST(request)
}
