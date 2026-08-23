import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Mint an upload URL for one accommodation supporting document.
 *
 * WHY A SIGNED URL AND NOT A CLIENT INSERT. Phase 1 signed its uploads because
 * a guest reporter has no JWT. That rationale does NOT carry here — a resident
 * has a session. The reasons that do:
 *
 *   1. A Vercel serverless request body caps near 4.5 MB, which a phone photo
 *      or a scanned letter clears easily. The browser must PUT straight to
 *      storage either way.
 *   2. `accommodation-docs` has NO INSERT POLICY at all after
 *      20260827000004. The only thing that can create an object in that bucket
 *      is a URL minted here, which makes the path shape a FACT rather than a
 *      convention. Before that migration the resident chose path segment 1 and
 *      the whole filename, and an object at
 *      `anything-at-all/{requestId}/../x.pdf` was measured as admitted.
 *
 * THE PATH IS `{request.building_id}/{request.id}/{kind}-{Date.now()}.{ext}`.
 * Every segment comes from the database or from a closed set. THE RESIDENT'S
 * OWN FILENAME NEVER REACHES STORAGE — it is attacker-shaped input, and the
 * kind plus the clock already make the name unique.
 *
 * PDFs ARE NOT DOWNSCALED. `prepareChatImage` (lib/ai/image.ts:56) renders
 * through a canvas and emits JPEG; a PDF put through it is destroyed. Images
 * may be downscaled by the caller, PDFs go up as-is under the cap.
 */

// MAX_BYTES and ALLOWED MIRROR THE BUCKET SETTINGS in
// 20260827000004_accommodation_docs_storage.sql and must be changed together
// with them. A signed upload token binds path, upsert, scope and expiry —
// never Content-Type and never length — so a caller declaring 1 KB of
// application/pdf can still PUT 500 MB of anything through the URL handed back
// here. The BUCKET is the enforcement point; these two constants exist to fail
// early with a sentence a person can act on. Drift either way and the browser
// accepts a file storage then rejects, or refuses one it would have kept.
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])

/**
 * The `doc_kind` labels this phase uses, as a literal closed set.
 *
 * Validated here rather than left to the enum cast, so an unknown label is a
 * 400 with a sentence instead of a 22P02 three layers down. Mirrors
 * `accommodation_required_kinds` (20260827000003) and REQUIRED_KINDS /
 * OPTIONAL_KINDS in lib/data/accommodations.ts.
 */
const KINDS = new Set(["esa_letter", "provider_license", "vaccination", "other"])

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  // Possession of a building code authorises nothing here, unlike the incident
  // route. This is disability information; the caller must be signed in.
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    requestId?: string
    kind?: string
    file?: { type?: string; size?: number }
  } | null

  if (!body?.requestId || !body.kind || !body.file) {
    return NextResponse.json({ ok: false, error: "requestId, kind and file are required." }, { status: 400 })
  }
  if (!UUID.test(body.requestId)) {
    return NextResponse.json({ ok: false, error: "requestId must be a uuid." }, { status: 400 })
  }
  if (!KINDS.has(body.kind)) {
    return NextResponse.json({ ok: false, error: "That document kind isn't one we accept." }, { status: 400 })
  }
  if (!body.file.type || !ALLOWED.has(body.file.type)) {
    return NextResponse.json({ ok: false, error: "PDF or a photo (JPEG, PNG, WebP or HEIC)." }, { status: 400 })
  }
  if (typeof body.file.size !== "number" || body.file.size <= 0 || body.file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Each file must be under 10 MB." }, { status: 400 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 })
  }

  const { data: req, error: reqError } = await admin
    .from("accommodation_requests")
    .select("id, building_id, resident_id, status")
    .eq("id", body.requestId)
    .maybeSingle()

  // "We couldn't check" is not "that request is not yours". Answering a
  // transient outage with 403 tells the resident something false and
  // actionable — the correction Phase 1 made to the incident sign route.
  if (reqError) {
    return NextResponse.json({ ok: false, error: "Couldn't check that request." }, { status: 502 })
  }

  // NOTHING ABOUT THE REQUEST IN THE BODY. Not its type, not its resident, not
  // whether it exists. A caller who does not own it learns only that they may
  // not upload to it — the same answer for a stranger's request and for one
  // that was never created.
  if (!req || req.resident_id !== user.id) {
    return NextResponse.json({ ok: false, error: "You can't add documents to that request." }, { status: 403 })
  }
  if (req.status !== "draft" && req.status !== "pending" && req.status !== "info_requested") {
    return NextResponse.json(
      { ok: false, error: "That request has already been decided." },
      { status: 409 },
    )
  }

  const path = `${req.building_id}/${req.id}/${body.kind}-${Date.now()}.${extFor(body.file.type)}`
  const { data, error } = await admin.storage.from("accommodation-docs").createSignedUploadUrl(path)
  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Couldn't prepare the upload." }, { status: 502 })
  }

  return NextResponse.json({ ok: true, upload: { path: data.path, token: data.token } })
}

function extFor(mime: string): string {
  if (mime === "application/pdf") return "pdf"
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/heic" || mime === "image/heif") return "heic"
  return "jpg"
}
