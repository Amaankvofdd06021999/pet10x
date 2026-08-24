"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { ReportablePet } from "./incidents"

/**
 * Upload evidence for a report that does not exist yet.
 *
 * The report gets its id at submit time, so uploads are keyed by a
 * client-generated draft id and claimed by the RPC afterwards. Anything never
 * claimed is swept by `app/api/incidents/evidence/purge/route.ts`, which runs
 * daily as a cron (see vercel.json) and deletes only objects that are both
 * unclaimed and older than 24 hours — so an upload from a report still being
 * written is left alone, and an abandoned one does not accumulate.
 *
 * Returns rather than throws. A caller holding a written report needs a
 * sentence to show and a state to leave the form in, not an exception: the one
 * thing that must never happen here is losing what the reporter typed.
 */
export async function uploadEvidence(
  buildingCode: string,
  draftId: string,
  files: File[],
): Promise<{ paths: string[]; error: string | null }> {
  if (files.length === 0) return { paths: [], error: null }

  type SignResponse = { ok: boolean; uploads?: { path: string; token: string }[]; error?: string }
  let json: SignResponse | null = null
  try {
    const res = await fetch("/api/incidents/evidence/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buildingCode,
        draftId,
        files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      }),
    })
    json = (await res.json().catch(() => null)) as SignResponse | null
  } catch {
    // `fetch` REJECTS on offline, DNS failure and CORS — it does not resolve
    // with a bad status. The .catch above guards parsing the response, which
    // is a different thing entirely, and a reporter filing from a lobby with
    // one bar is the likeliest caller there is.
    return { paths: [], error: "Couldn't reach the server — check your connection." }
  }
  if (!json?.ok || !json.uploads) return { paths: [], error: json?.error ?? "Couldn't prepare the upload." }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { paths: [], error: "Storage is not configured." }

  const paths: string[] = []
  for (let i = 0; i < files.length; i++) {
    const { path, token } = json.uploads[i]
    // contentType is not optional. `uploadToSignedUrl` otherwise PUTs
    // `text/plain;charset=UTF-8`, and the signed token binds path, upsert,
    // scope and expiry — never the Content-Type — so the bucket's image
    // allow-list is what sees the header, and rejects every upload.
    const { error } = await supabase.storage
      .from("guest-evidence")
      .uploadToSignedUrl(path, token, files[i], { contentType: files[i].type })
      // The storage client can reject too, on the same flaky connection. Same
      // rule as a returned error: this photo is lost, the others are not.
      .catch(() => ({ error: new Error("upload threw") }))
    // One failure must not lose the others, nor the written report.
    if (!error) paths.push(path)
  }
  if (paths.length === 0) return { paths: [], error: "The photos didn't upload." }
  // `paths.length < files.length` is a partial send. It is deliberately not an
  // error — the report should still go — but the caller MUST tell the reporter,
  // or the summary they saw becomes a false statement about what was sent.
  return { paths, error: null }
}

export interface ReportablePetsResult {
  pets: ReportablePet[]
  /** Non-null when the list could not be loaded — which is not the same as "there are none". */
  error: string | null
}

/**
 * Pets to point at, with photos signed server-side (a guest cannot sign).
 *
 * The failure is reported rather than flattened to an empty list. The route
 * answers 502 when signing fails wholesale, and a caller that renders that as
 * "no registered pets to choose from" tells someone who could have identified
 * the dog that there was nothing to identify.
 */
export async function reportablePetsSigned(code: string): Promise<ReportablePetsResult> {
  try {
    const res = await fetch(`/api/report/pets?code=${encodeURIComponent(code)}`)
    const json = (await res.json().catch(() => null)) as { ok: boolean; pets?: ReportablePet[] } | null
    if (!json?.ok) return { pets: [], error: "Couldn't load the pets for this building." }
    return { pets: json.pets ?? [], error: null }
  } catch {
    return { pets: [], error: "Couldn't load the pets for this building." }
  }
}
