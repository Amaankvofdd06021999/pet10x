"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { DocKind } from "./accommodations"

export interface UploadResult {
  documentId: string | null
  error: string | null
}

/**
 * Upload one supporting document for an accommodation request.
 *
 * Three steps, in this order, and none of them is optional:
 *
 *   1. ask the server for a signed upload URL (it composes the path);
 *   2. PUT the bytes straight to storage;
 *   3. ask the server to record the row, which is where the row and the object
 *      are checked against each other.
 *
 * Returns rather than throws, for the same reason `uploadEvidence` does: the
 * caller is holding a half-written request and needs a sentence to show.
 */
export async function uploadAccommodationDoc(
  requestId: string,
  kind: DocKind,
  file: File,
): Promise<UploadResult> {
  type SignResponse = { ok: boolean; upload?: { path: string; token: string }; error?: string }
  let signed: SignResponse | null = null
  try {
    const res = await fetch("/api/accommodations/docs/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, kind, file: { type: file.type, size: file.size } }),
    })
    signed = (await res.json().catch(() => null)) as SignResponse | null
  } catch {
    // `fetch` REJECTS on offline, DNS failure and CORS — it does not resolve
    // with a bad status. The .catch above guards parsing the response, which
    // is a different thing entirely.
    return { documentId: null, error: "Couldn't reach the server — check your connection." }
  }
  if (!signed?.ok || !signed.upload) {
    return { documentId: null, error: signed?.error ?? "Couldn't prepare the upload." }
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { documentId: null, error: "Storage is not configured." }

  // `{ contentType: file.type }` IS NOT OPTIONAL. `uploadToSignedUrl`
  // otherwise PUTs `text/plain;charset=UTF-8`, and the signed token binds path,
  // upsert, scope and expiry — never Content-Type — so what sees the header is
  // the bucket's allow-list, which rejects every upload with
  // `415 invalid_mime_type` three layers from the symptom. Measured in Phase 1.
  const { error: putError } = await supabase.storage
    .from("accommodation-docs")
    .uploadToSignedUrl(signed.upload.path, signed.upload.token, file, { contentType: file.type })
    .catch(() => ({ error: new Error("upload threw") }))
  if (putError) return { documentId: null, error: "That file didn't upload. Try again." }

  type RecordResponse = { ok: boolean; documentId?: string; error?: string }
  let recorded: RecordResponse | null = null
  try {
    const res = await fetch("/api/accommodations/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId,
        kind,
        path: signed.upload.path,
        // The resident's own filename is kept as a LABEL, where it is only ever
        // rendered as text. It never reached storage — see the sign route.
        label: file.name,
        mime: file.type,
        size: file.size,
      }),
    })
    recorded = (await res.json().catch(() => null)) as RecordResponse | null
  } catch {
    return { documentId: null, error: "Couldn't reach the server — check your connection." }
  }
  if (!recorded?.ok || !recorded.documentId) {
    return { documentId: null, error: "The file uploaded but couldn't be attached. Try again." }
  }
  return { documentId: recorded.documentId, error: null }
}

/** Remove an attached document — the row and the file together. */
export async function removeAccommodationDoc(documentId: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch("/api/accommodations/docs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    })
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    if (!json?.ok) return { error: json?.error ?? "Couldn't remove that document." }
    return { error: null }
  } catch {
    return { error: "Couldn't reach the server — check your connection." }
  }
}

/**
 * A 60-second signed URL for one document.
 *
 * Minted IN THE BROWSER: the caller holds a session and
 * `accommodation-docs read` leaves them SELECT, so no second route is needed.
 * Never `getPublicUrl` — the bucket is private and that call returns a URL
 * which silently 400s, which is worse than an error.
 */
export async function signAccommodationDoc(storagePath: string): Promise<string | null> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return null
  const { data, error } = await supabase.storage.from("accommodation-docs").createSignedUrl(storagePath, 60)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
