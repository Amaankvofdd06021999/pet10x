/**
 * Whether next/image may resize this src.
 *
 * next.config.mjs allows exactly two sources: this site's own files and the
 * project's PUBLIC Supabase storage (`/storage/v1/object/public/`). next/image THROWS for any other host
 * ("hostname not configured"), and a blob: or data: URL is never fetchable by
 * the optimiser, so a screen whose src can be anything — a profile photo, a
 * community post — passes `unoptimized={!canOptimize(src)}` and gets the
 * original bytes for those instead of an error.
 *
 * Signed URLs (`/object/sign/`, the private buckets) are deliberately not
 * optimised. They are re-signed on every fetch, so each load is a new URL and a
 * cache miss — a server fetch and resize per view, slower than the direct link
 * for the LCP photo — and a resized copy of a private photo would outlive the
 * link's expiry in the optimiser's cache.
 *
 * Keep this in step with `images` in next.config.mjs.
 */
export function canOptimize(
  src: string | null | undefined,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): boolean {
  if (!src) return false
  // Same-origin path; `//host/x` is protocol-relative, not local.
  if (src.startsWith("/")) return !src.startsWith("//")
  if (!supabaseUrl) return false
  try {
    const u = new URL(src)
    const s = new URL(supabaseUrl)
    return u.protocol === s.protocol && u.host === s.host && u.pathname.startsWith("/storage/v1/object/public/")
  } catch {
    return false
  }
}
