import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

/**
 * Pets a reporter may point at, with photos that actually resolve.
 *
 * The RPC is the privacy guarantee — it returns name, species, breed and a
 * photo path, and never a unit, an owner or a contact. This route adds only
 * the signing, because a guest holds no session and `createSignedUrl` needs
 * one. Signing cannot be done in SQL.
 */
export async function GET(request: Request) {
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ ok: false, error: "Not configured." }, { status: 503 })

  const code = new URL(request.url).searchParams.get("code")
  if (!code) return NextResponse.json({ ok: false, error: "code is required." }, { status: 400 })

  const { data, error } = await admin.rpc("building_pets_for_report", { p_code: code })
  if (error) return NextResponse.json({ ok: false, error: "Couldn't load pets." }, { status: 502 })

  const r = data as unknown as {
    valid?: boolean
    pets?: { id: string; name: string; species: string; breed: string | null; photo: string | null }[]
  } | null
  // An unknown code is not an error here. The picker asks for pets before the
  // reporter has necessarily got the code right, and an empty list says the
  // same thing to it as a 404 would, without a console full of failures.
  if (!r?.valid) return NextResponse.json({ ok: true, pets: [] })

  const pets = r.pets ?? []
  // `photo` is either a pet-media path or a legacy absolute URL. Only the
  // paths need signing; an absolute URL is passed through, and anything else
  // becomes null rather than an href the browser would fetch and fail on.
  const paths = pets.map((p) => p.photo).filter((p): p is string => !!p && !p.startsWith("/") && !p.startsWith("http"))
  const signed: Record<string, string> = {}
  if (paths.length > 0) {
    const { data: urls, error: signError } = await admin.storage.from("pet-media").createSignedUrls(paths, 3600)
    for (const u of urls ?? []) if (u.signedUrl && u.path) signed[u.path] = u.signedUrl

    // Signing is the only thing this route adds to the RPC, so a signing
    // failure that still answers 200 is the original bug wearing a hat: every
    // photoUrl null reads to the caller exactly like a building whose pets
    // have no photos. Fail instead, the same way the RPC's own error is
    // handled above — one half of a file reporting failures while the other
    // half hides them is how this kind of silence survives review.
    //
    // Both conditions are load-bearing, and that was measured rather than
    // assumed: createSignedUrls does NOT surface a wholesale failure at the
    // top level. A missing or unreachable bucket comes back as `error: null`
    // with a per-entry error on every path, so keying off `signError` alone
    // would miss precisely the outage this guard is for.
    //
    // Partial failure is deliberately not an error. One stale path should not
    // cost the reporter the other nine pets, so those still degrade to null.
    // Reaching here at all means there was at least one photo to sign; a
    // building whose pets simply have none never enters this branch.
    if (signError || Object.keys(signed).length === 0) {
      return NextResponse.json({ ok: false, error: "Couldn't load pet photos." }, { status: 502 })
    }
  }

  return NextResponse.json({
    ok: true,
    pets: pets.map((p) => ({
      id: p.id,
      name: p.name,
      species: p.species,
      breed: p.breed,
      photoUrl: p.photo ? (signed[p.photo] ?? (p.photo.startsWith("http") ? p.photo : null)) : null,
    })),
  })
}
