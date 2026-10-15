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

  /* Straight to /login, which says the link expired and points to a new one.
     It went to /app, where nothing read it: a signed-out reader was bounced
     on to a plain sign-in form with the reason buried inside `next`. */
  return NextResponse.redirect(`${origin}/login?auth_error=callback`)
}
