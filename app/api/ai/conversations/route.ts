import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import type { AiConversation } from "@/lib/ai/types"

/** The owner's threads, newest first. RLS scopes the read; the filter documents it. */
export async function GET() {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id, pet_id, title, updated_at")
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const conversations: AiConversation[] = (data ?? []).map((row) => ({
    id: row.id,
    petId: row.pet_id,
    title: row.title,
    updatedAt: row.updated_at,
  }))
  return NextResponse.json({ conversations })
}
