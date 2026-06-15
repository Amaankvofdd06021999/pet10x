import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from "./client"

/**
 * Refreshes the Supabase auth session on every request and keeps the auth
 * cookies in sync (the @supabase/ssr pattern). No-op when Supabase isn't
 * configured. Does not hard-redirect — the app shows its sign-in UI client-side.
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
  await supabase.auth.getUser()

  return response
}
