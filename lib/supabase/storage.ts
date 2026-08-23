"use client"

/**
 * Pet10x — Storage helpers for the private `pet-media` bucket.
 *
 * Files live under `{auth.uid()}/{petId}/...` (owner-scoped RLS). The bucket is
 * private, so photos + documents are read via short-lived signed URLs.
 */

import { getSupabaseBrowserClient } from "./client"

const BUCKET = "pet-media"

function extOf(name: string): string {
  const i = name.lastIndexOf(".")
  return i > 0 ? name.slice(i + 1).toLowerCase() : "bin"
}

/** A stored value is a pet-media path (not a public asset `/…` or an absolute URL). */
export function isStoragePath(value: string | null | undefined): value is string {
  return !!value && !value.startsWith("/") && !value.startsWith("http")
}

export async function uploadPetFile(opts: {
  petId: string
  file: File
  prefix?: string
}): Promise<{ path: string | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { path: null, error: "Storage is not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { path: null, error: "You must be signed in." }
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `${user.id}/${opts.petId}/${opts.prefix ?? "file"}-${Date.now()}-${rand}.${extOf(opts.file.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, opts.file, { upsert: true, cacheControl: "3600" })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

export async function petFileSignedUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return null
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  return data?.signedUrl ?? null
}

/**
 * Batch-sign paths in ANY private bucket, path -> signed URL.
 *
 * Parameterised by bucket rather than copied per bucket: Phase 8 needed exactly
 * this for `community-media`, and a second hard-coded copy is how one bucket's
 * fix stops being the other's. Paths that do not resolve are simply absent from
 * the map, so a caller reads `map[path] ?? null` and gets a placeholder rather
 * than a broken <img>.
 */
export async function signedUrlsIn(
  bucket: string,
  paths: string[],
  expiresIn = 3600,
): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase || paths.length === 0) return {}
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, expiresIn)
  const map: Record<string, string> = {}
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl
  }
  return map
}

export async function petFileSignedUrls(paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  return signedUrlsIn(BUCKET, paths, expiresIn)
}

export async function deletePetFile(path: string): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return
  await supabase.storage.from(BUCKET).remove([path])
}
