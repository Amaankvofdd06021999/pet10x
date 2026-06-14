/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Type errors now fail the build (the data layer typechecks clean). Phase 1
    // keeps this honest as the Supabase types land. `images.unoptimized` stays on
    // until real media/CDN is wired (the prototype uses placeholder image paths).
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
