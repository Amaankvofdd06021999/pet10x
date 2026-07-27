import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { runSuggestions } from "@/lib/ai/suggestions/run"
import type { AiSuggestion, SuggestionKind } from "@/lib/ai/types"

export const runtime = "nodejs"
export const maxDuration = 60

/** The owner's active suggestion cards. */
export async function GET() {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("ai_suggestions")
    .select("id, pet_id, kind, severity, title, body, action_label, action_target, created_at, pets(name)")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const suggestions: AiSuggestion[] = (data ?? []).map((row) => ({
    id: row.id,
    petId: row.pet_id,
    petName: (row.pets as { name: string } | null)?.name ?? "Your pet",
    kind: row.kind as SuggestionKind,
    severity: row.severity as AiSuggestion["severity"],
    title: row.title,
    body: row.body,
    actionLabel: row.action_label,
    actionTarget: row.action_target,
    createdAt: row.created_at,
  }))
  return NextResponse.json({ suggestions })
}

/** Re-evaluates the rules for the caller. Idempotent by dedupe_key. */
export async function POST() {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const result = await runSuggestions(supabase, user.id)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error("[ai] suggestion run failed", err)
    return NextResponse.json({ error: "Couldn't refresh suggestions." }, { status: 500 })
  }
}
