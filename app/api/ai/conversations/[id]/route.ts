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

/**
 * Delete a conversation and what was said in it (20261012000003).
 *
 * The messages are deleted, not hidden, and the title — written from the first
 * message — is cleared. What remains is a content-free row (who, which pet,
 * when, deleted_at) so the admin Overview can still count that a conversation
 * was started. Nothing rate-limits on messages, so no counter goes with them.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Confirm ownership before touching anything — RLS would stop a foreign
  // delete, but the storage removal below needs the paths first.
  const { data: owned } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", id)
    .eq("profile_id", user.id)
    .maybeSingle()
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Delete the attached photos now rather than leaving them for the retention
  // sweep. A chat the owner deleted should not keep their pet's photos sitting
  // in storage for another week.
  const { data: withImages } = await supabase
    .from("ai_messages")
    .select("image_paths")
    .eq("conversation_id", id)
    .not("image_paths", "eq", "{}")

  const paths = [...new Set((withImages ?? []).flatMap((m) => m.image_paths ?? []))]
  if (paths.length > 0) {
    // Owner-scoped delete policy covers this; a failure is logged and the
    // sweep will catch the leftovers rather than blocking the delete.
    const { error: mediaError } = await supabase.storage.from("pet-media").remove(paths)
    if (mediaError) console.error("[ai] couldn't remove chat media on delete", mediaError)
  }

  // Content first. If this fails the thread is still listed and the owner can
  // try again; the other order would hide a thread whose text survived.
  const { error: messagesError } = await supabase.from("ai_messages").delete().eq("conversation_id", id)
  if (messagesError) {
    console.error("[ai] couldn't delete conversation messages", messagesError)
    return NextResponse.json({ error: "Couldn't delete the conversation. Try again." }, { status: 500 })
  }

  const { error } = await supabase
    .from("ai_conversations")
    .update({ deleted_at: new Date().toISOString(), title: null })
    .eq("id", id)
    .eq("profile_id", user.id)
  if (error) {
    console.error("[ai] couldn't close the deleted conversation", error)
    return NextResponse.json({ error: "Couldn't delete the conversation. Try again." }, { status: 500 })
  }

  return NextResponse.json({ ok: true, mediaRemoved: paths.length })
}
