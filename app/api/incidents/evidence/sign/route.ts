import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Mint upload URLs for incident evidence.
 *
 * A guest reporter has no Supabase session — `signInGuest` is client state and
 * the project has no anonymous auth users — so `auth.uid()` is null for them
 * and no owner-scoped storage policy could ever admit their upload. And a
 * serverless request body caps at ~4.5 MB, which a phone photo clears easily.
 * So the server mints a short-lived signed upload URL and the browser PUTs
 * straight to storage. `guest-evidence` therefore carries no client INSERT
 * policy at all: an upload can only happen through a URL minted here.
 *
 * Possession of the building code is the authorisation, exactly as it is for
 * filing the report itself.
 */
const MAX_FILES = 5
// MAX_BYTES and ALLOWED are the reporter-facing half of a rule the bucket is
// the real enforcement point for. A signed upload token binds path, upsert,
// scope and expiry — never Content-Type, never length — so a caller declaring
// `image/jpeg` at 1 KB can still PUT arbitrary bytes to the URL handed back
// here. What actually stops that is `guest-evidence`'s own file_size_limit and
// allowed_mime_types, set in 20260822000001_evidence_path_hardening.sql. These
// two constants exist to fail early with a sentence a person can act on. They
// must be changed together with the bucket: drift either way and the browser
// accepts a photo that storage then rejects, or refuses one it would have kept.
const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 })

  const body = (await request.json().catch(() => null)) as {
    buildingCode?: string
    draftId?: string
    files?: { name?: string; type?: string; size?: number }[]
  } | null

  if (!body?.buildingCode || !body.draftId || !Array.isArray(body.files)) {
    return NextResponse.json({ ok: false, error: "buildingCode, draftId and files are required." }, { status: 400 })
  }
  // The RPC's guard bounds evidence to one building; within a building it is
  // the unguessability of the draft id that stops one reporter claiming
  // another's uploads. So the id has to be a uuid and nothing else — this also
  // keeps a traversal segment out of the storage path.
  if (!UUID.test(body.draftId)) {
    return NextResponse.json({ ok: false, error: "draftId must be a uuid." }, { status: 400 })
  }
  if (body.files.length === 0 || body.files.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: `Between 1 and ${MAX_FILES} files.` }, { status: 400 })
  }
  for (const f of body.files) {
    // `f` is typed as an object but arrives as whatever JSON was posted. A null
    // member would throw on the property read and answer with a 500, where
    // every other malformed body here gets a 400.
    if (!f || !f.type || !ALLOWED.has(f.type)) {
      return NextResponse.json({ ok: false, error: "Photos only (JPEG, PNG, WebP or HEIC)." }, { status: 400 })
    }
    if (typeof f.size !== "number" || f.size <= 0 || f.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "Each photo must be under 15 MB." }, { status: 400 })
    }
  }

  // The code is the authorisation. Resolve it the same way intake does.
  const { data: resolved, error: resolveError } = await admin.rpc("resolve_building_code", {
    p_code: body.buildingCode,
  })
  // "We couldn't check" is not "that code is wrong". Swallowing this error
  // would answer a transient outage with a permanent, actionable and false
  // instruction — go and find a different code — when the code was fine.
  if (resolveError) {
    return NextResponse.json({ ok: false, error: "Couldn't check that building code." }, { status: 502 })
  }
  const r = resolved as unknown as { valid?: boolean; building_id?: string } | null
  if (!r?.valid || !r.building_id) {
    return NextResponse.json({ ok: false, error: "That building code isn't recognised." }, { status: 404 })
  }

  const uploads: { path: string; token: string }[] = []
  for (let i = 0; i < body.files.length; i++) {
    const ext = extFor(body.files[i].type!)
    // The reporter's own filename never reaches storage: it is attacker-shaped
    // input, and the index plus the clock already make the name unique.
    const path = `${r.building_id}/${body.draftId}/${i}-${Date.now()}.${ext}`
    const { data, error } = await admin.storage.from("guest-evidence").createSignedUploadUrl(path)
    // All or nothing. A partial `uploads` array would have the browser upload
    // some photos and silently drop the rest.
    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Couldn't prepare the upload." }, { status: 502 })
    }
    uploads.push({ path: data.path, token: data.token })
  }

  return NextResponse.json({ ok: true, uploads })
}

function extFor(mime: string): string {
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/heic" || mime === "image/heif") return "heic"
  return "jpg"
}
