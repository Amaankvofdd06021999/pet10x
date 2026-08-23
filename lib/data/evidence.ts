"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { ReportablePet } from "./incidents"

/**
 * Upload evidence for a report that does not exist yet.
 *
 * The report gets its id at submit time, so uploads are keyed by a
 * client-generated draft id and claimed by the RPC afterwards. Anything never
 * claimed is swept by the purge route.
 */
export async function uploadEvidence(
  buildingCode: string,
  draftId: string,
  files: File[],
): Promise<{ paths: string[]; error: string | null }> {
  if (files.length === 0) return { paths: [], error: null }

  const res = await fetch("/api/incidents/evidence/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buildingCode,
      draftId,
      files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
    }),
  })
  const json = (await res.json().catch(() => null)) as
    | { ok: boolean; uploads?: { path: string; token: string }[]; error?: string }
    | null
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
    // One failure must not lose the others, nor the written report.
    if (!error) paths.push(path)
  }
  if (paths.length === 0) return { paths: [], error: "The photos didn't upload." }
  return { paths, error: null }
}

/** Pets to point at, with photos signed server-side (a guest cannot sign). */
export async function reportablePetsSigned(code: string): Promise<ReportablePet[]> {
  const res = await fetch(`/api/report/pets?code=${encodeURIComponent(code)}`)
  const json = (await res.json().catch(() => null)) as { ok: boolean; pets?: ReportablePet[] } | null
  return json?.ok ? (json.pets ?? []) : []
}
