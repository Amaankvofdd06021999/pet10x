import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"

/**
 * PKCE code-exchange endpoint. Email confirmations, magic links, OAuth, invites
 * and password-recovery links all land here with a `?code=`. We exchange it for
 * a session (cookies) and redirect to `next` (defaults to /app).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/app"

  if (code) {
    const supabase = await getSupabaseServerClient()
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/app"}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/app?auth_error=callback`)
}
