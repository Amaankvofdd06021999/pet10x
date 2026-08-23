"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

export interface CommunityUploadResult {
  /** The storage PATH, never a URL. Stored in the row; signed at read time. */
  path: string | null
  error: string | null
}

/**
 * Upload one community image — a feed post's photo or a lost-pet notice's.
 *
 * Two steps, in this order:
 *
 *   1. ask the server for a signed upload URL. IT composes the path, from the
 *      caller's building and uid and 128 bits of randomness. The browser never
 *      chooses a path and the resident's own filename never reaches storage.
 *   2. PUT the bytes straight to storage.
 *
 * Returns rather than throws, matching `uploadAccommodationDoc` and
 * `uploadEvidence`: the caller is holding a half-written post and needs a
 * sentence to show.
 */
export async function uploadCommunityImage(
  kind: "post" | "lf",
  file: File,
): Promise<CommunityUploadResult> {
  type SignResponse = { ok: boolean; upload?: { path: string; token: string }; error?: string }
  let signed: SignResponse | null = null
  try {
    const res = await fetch("/api/community/media/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, contentType: file.type, size: file.size }),
    })
    signed = (await res.json().catch(() => null)) as SignResponse | null
  } catch {
    // `fetch` REJECTS on offline, DNS failure and CORS — it does not resolve
    // with a bad status. The .catch above guards parsing the response, which is
    // a different thing entirely.
    return { path: null, error: "Couldn't reach the server — check your connection." }
  }
  if (!signed?.ok || !signed.upload) {
    return { path: null, error: signed?.error ?? "Couldn't prepare the upload." }
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { path: null, error: "Storage is not configured." }

  // `{ contentType: file.type }` IS NOT OPTIONAL. `uploadToSignedUrl` otherwise
  // PUTs `text/plain;charset=UTF-8`, and a signed upload token binds path,
  // upsert, scope and expiry — NEVER Content-Type — so what sees that header is
  // `community-media`'s allowed_mime_types list (20260826000004), which answers
  // `415 invalid_mime_type` three layers from the symptom. Measured in Phase 1,
  // measured again in Phase 7, and measured a third time in Phase 8 before this
  // line was written.
  const { error: putError } = await supabase.storage
    .from("community-media")
    .uploadToSignedUrl(signed.upload.path, signed.upload.token, file, { contentType: file.type })
    .catch(() => ({ error: new Error("upload threw") }))
  if (putError) return { path: null, error: "That photo didn't upload. Try again." }

  return { path: signed.upload.path, error: null }
}
