import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from "./client"
import { findRouteRule, canAccessRoute, getHomeRouteForRole } from "@/lib/rbac"
import type { UserRole } from "@/lib/data/types"

const DB_ROLE_TO_APP: Record<string, UserRole> = {
  pet_owner: "pet-owner",
  building_manager: "building-manager",
  super_admin: "super-admin",
  business: "business",
}

/**
 * Refreshes the Supabase auth session on every request and keeps the auth
 * cookies in sync (the @supabase/ssr pattern), then enforces role-gated
 * routes server-side per lib/rbac.ts before the page ever renders. No-op
 * when Supabase isn't configured — the app falls back to its client-side
 * mock-mode Gate components.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  if (!isSupabaseConfigured()) return response

  const supabase = createServerClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const rule = findRouteRule(pathname)
  if (!rule) return response // public route — no lookup needed

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_super_admin, is_suspended")
    .eq("id", user.id)
    .maybeSingle()

  const subject = {
    role: profile ? (DB_ROLE_TO_APP[profile.role] ?? null) : null,
    isSuperAdmin: profile?.is_super_admin ?? false,
    isSuspended: profile?.is_suspended ?? false,
  }

  if (subject.isSuspended) {
    await supabase.auth.signOut()
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("suspended", "1")
    return NextResponse.redirect(url)
  }

  if (!canAccessRoute(pathname, subject)) {
    const url = request.nextUrl.clone()
    url.pathname = getHomeRouteForRole(subject)
    return NextResponse.redirect(url)
  }

  return response
}
