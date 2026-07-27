import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"

/**
 * The consent gate, recorded on profiles.ai_consent_at.
 *
 * GET reports whether the owner has accepted; POST records acceptance. The chat
 * route re-checks this server-side on every message, so the dialog is a
 * courtesy rather than the enforcement point.
 */
export async function GET() {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await supabase.from("profiles").select("ai_consent_at").eq("id", user.id).maybeSingle()
  return NextResponse.json({ consentedAt: data?.ai_consent_at ?? null })
}

export async function POST() {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const consentedAt = new Date().toISOString()
  const { error } = await supabase.from("profiles").update({ ai_consent_at: consentedAt }).eq("id", user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ consentedAt })
}
