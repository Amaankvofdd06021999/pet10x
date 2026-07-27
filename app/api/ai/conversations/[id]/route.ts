import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import type { AiMessage, Citation, TriageLevel } from "@/lib/ai/types"

/** One thread with its messages, for resuming a conversation. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id, pet_id, title, updated_at")
    .eq("id", id)
    .eq("profile_id", user.id)
    .is("deleted_at", null)
    .maybeSingle()
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: rows, error } = await supabase
    .from("ai_messages")
    .select("id, role, content, image_paths, citations, triage_level, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const messages: AiMessage[] = (rows ?? [])
    .filter((r) => r.role !== "system")
    .map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content,
      imagePaths: r.image_paths ?? [],
      citations: Array.isArray(r.citations) ? (r.citations as unknown as Citation[]) : [],
      triageLevel: (r.triage_level as TriageLevel | null) ?? null,
      createdAt: r.created_at,
    }))

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      petId: conversation.pet_id,
      title: conversation.title,
      updatedAt: conversation.updated_at,
    },
    messages,
  })
}

/** Soft delete — the thread disappears from the owner's list. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { error } = await supabase
    .from("ai_conversations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
