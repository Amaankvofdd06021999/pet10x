// The project's PUBLIC storage is the only remote source next/image may fetch.
// Private buckets are served by signed URLs that change on every load, so
// optimising them would miss the cache every time (see lib/image-src.ts).
// Read from the same variable the browser client uses, at build time, so a
// staging project needs no config change.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabase = supabaseUrl ? new URL(supabaseUrl) : null

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Type errors now fail the build (the data layer typechecks clean). Phase 1
    // keeps this honest as the Supabase types land.
    ignoreBuildErrors: false,
  },
  images: {
    // Images are resized and compressed per screen (each <Image> names its
    // `sizes`). Only this site's own files and the project's public storage are
    // optimised; a src anywhere else, or a blob:/data: preview, opts out with
    // `unoptimized` on that instance (see lib/image-src.ts).
    localPatterns: [{ pathname: "/**" }],
    remotePatterns: supabase
      ? [
          {
            protocol: supabase.protocol.replace(":", ""),
            hostname: supabase.hostname,
            port: supabase.port,
            // Public objects only; not signed URLs, the REST or the auth APIs.
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
}

export default nextConfig
