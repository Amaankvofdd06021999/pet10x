import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { runSuggestions } from "@/lib/ai/suggestions/run"
import type { AiSuggestion, SuggestionKind } from "@/lib/ai/types"
import { dbErrorMessage } from "@/lib/data/db-error"

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
    .select("id, pet_id, kind, severity, title, body, action_label, action_target, created_at, pets!inner(name)")
    .eq("profile_id", user.id)
    // A nudge about a removed pet points at a pet-detail that no longer opens.
    .is("pets.deleted_at", null)
    .eq("status", "active")
    .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: dbErrorMessage(error, "Couldn't load your suggestions. Try again.") }, { status: 500 })

  // Home builds suggestions itself only on a resident's first visit; the
  // nightly sweep does the rest. Null means no run has ever stamped this
  // profile. If the read fails, say "not first" — the nightly run will catch up.
  const { data: profile, error: profileErr } = await supabase.from("profiles").select("suggestions_last_run_at").eq("id", user.id).maybeSingle()
  if (profileErr) console.error("[ai] couldn't read suggestions_last_run_at", profileErr)
  const firstRun = profile ? profile.suggestions_last_run_at === null : false

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
  return NextResponse.json({ suggestions, firstRun })
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
