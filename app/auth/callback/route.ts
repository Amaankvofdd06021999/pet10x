import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/safe-next"

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
        // Same-origin only: an email link's `next` is attacker-editable.
        return NextResponse.redirect(`${origin}${safeNextPath(next, origin) ?? "/app"}`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/app?auth_error=callback`)
}
