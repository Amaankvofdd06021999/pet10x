import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { randomBytes } from "crypto"

/**
 * Mint one upload URL for a community image — a feed post or a lost-pet notice.
 *
 * WHY A SIGNED URL AND NOT A CLIENT UPLOAD. Phase 1 signed its uploads because a
 * guest reporter has no JWT. That rationale does NOT carry here — a resident has
 * a session. The reasons that do:
 *
 *   1. A Vercel serverless request body caps near 4.5 MB, which a phone photo
 *      clears easily. The browser must PUT straight to storage either way.
 *   2. THE PATH BECOMES A FACT RATHER THAN A CONVENTION. Before this route,
 *      `createCommunityPost` composed `{building}/{uid}/{Date.now()}.{ext}` in
 *      the browser from the RESIDENT'S OWN FILENAME's extension. Every segment
 *      here comes from the database or from a closed set.
 *
 * THE PATH IS `{buildingId}/{auth.uid()}/{post|lf}-{32 hex}.{ext}`, and
 * 20260826000004 pins exactly that shape as an anchored regex over the whole
 * object name, in the INSERT, SELECT and DELETE policies. The two must change
 * together. THE RESIDENT'S OWN FILENAME NEVER REACHES STORAGE — it is
 * attacker-shaped input, and 128 bits of randomness already make the name
 * unique.
 *
 * NO `buildingId` IN THE BODY. It is derived from the caller's own approved
 * resident_links row, falling back to building_managers — the same argument as
 * `report_lost_found`: a parameter the caller controls is a parameter the caller
 * can point at another building, and removing it is stronger than validating it.
 */

// MAX_BYTES and ALLOWED MIRROR THE BUCKET SETTINGS in
// 20260826000004_community_media_hardening.sql and must be changed together
// with them. A signed upload token binds path, upsert, scope and expiry — never
// Content-Type and never length — so a caller declaring 1 KB of image/jpeg can
// still PUT 500 MB of anything through the URL handed back here. THE BUCKET IS
// THE ENFORCEMENT POINT; these two constants exist to fail early with a
// sentence a person can act on. Drift either way and the browser accepts a
// photo storage then rejects, or refuses one it would have kept.
const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])

/** The two prefixes the storage grammar admits, as a literal closed set. */
const KINDS = new Set(["post", "lf"])

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  // Possession of a building code authorises nothing here, unlike the incident
  // route. This is a post in a private building feed; the caller must be signed
  // in, and it is their uid that becomes path segment 2.
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    kind?: string
    contentType?: string
    size?: number
  } | null

  if (!body?.kind || !body.contentType) {
    return NextResponse.json({ ok: false, error: "kind and contentType are required." }, { status: 400 })
  }
  if (!KINDS.has(body.kind)) {
    return NextResponse.json({ ok: false, error: "kind must be \"post\" or \"lf\"." }, { status: 400 })
  }
  if (!ALLOWED.has(body.contentType)) {
    return NextResponse.json({ ok: false, error: "Photos only (JPEG, PNG, WebP or HEIC)." }, { status: 400 })
  }
  if (typeof body.size !== "number" || body.size <= 0 || body.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Each photo must be under 15 MB." }, { status: 400 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 })
  }

  // The building, derived. A resident link first, then a managed building —
  // the same two-step `currentBuildingId` does in lib/data/live.ts, because a
  // manager has no resident link and must still be able to attach an image to
  // the announcement they are writing.
  const { data: link, error: linkError } = await admin
    .from("resident_links")
    .select("building_id")
    .eq("profile_id", user.id)
    .eq("status", "approved")
    .is("left_at", null)

  // "We couldn't check" is not "you have no building". Answering a transient
  // outage with a permanent, actionable and false instruction — go and link your
  // building — is the correction Phase 1 made to the incident sign route.
  if (linkError) {
    return NextResponse.json({ ok: false, error: "Couldn't check your building." }, { status: 502 })
  }

  let buildingId: string | null = link && link.length === 1 ? link[0].building_id : null

  if (!buildingId && (!link || link.length === 0)) {
    const { data: managed, error: managedError } = await admin
      .from("building_managers")
      .select("building_id")
      .eq("profile_id", user.id)
    if (managedError) {
      return NextResponse.json({ ok: false, error: "Couldn't check your building." }, { status: 502 })
    }
    // A manager of exactly one building can attach an image without saying
    // which. A manager of five cannot, and guessing would put a Cedar Grove
    // photo under Harbour View. Dana Whitlock holds five on this database, so
    // this is not a hypothetical branch.
    buildingId = managed && managed.length === 1 ? managed[0].building_id : null
    if (managed && managed.length > 1) {
      return NextResponse.json(
        { ok: false, error: "You manage more than one building — images aren't supported there yet." },
        { status: 409 },
      )
    }
  }

  if (!buildingId) {
    return NextResponse.json({ ok: false, error: "Link your building first." }, { status: 409 })
  }

  // Lower-case hex, both halves, because the storage grammar admits only
  // lower-case: accepting [A-F] as well would give two distinct object names
  // for the same logical file.
  const name = `${body.kind}-${randomBytes(16).toString("hex")}.${extFor(body.contentType)}`
  const path = `${buildingId}/${user.id}/${name}`

  const { data, error } = await admin.storage.from("community-media").createSignedUploadUrl(path)
  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Couldn't prepare the upload." }, { status: 502 })
  }

  // THE CALLER MUST PASS `{ contentType: file.type }` TO `uploadToSignedUrl`.
  // It otherwise PUTs `text/plain;charset=UTF-8`, and what sees that header is
  // the bucket's allowed_mime_types list, which answers `415 invalid_mime_type`
  // three layers from the symptom. This cost real time in Phase 1 and again in
  // Phase 7. `uploadCommunityImage` in lib/data/community-media.ts passes it.
  return NextResponse.json({ ok: true, upload: { path: data.path, token: data.token } })
}

function extFor(mime: string): string {
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/heic" || mime === "image/heif") return "heic"
  return "jpg"
}
