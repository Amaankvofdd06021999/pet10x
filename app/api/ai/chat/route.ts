import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase/server"
import { buildPetDossier, findEmergencyClinics, resolveOrigin, type PetDossier } from "@/lib/ai/context"
import { extractCitations } from "@/lib/ai/citations"
import { groqComplete, groqStream, isGroqConfigured, GroqError, type ChatMessage, type ExecutedTool } from "@/lib/ai/provider"
import { TITLE_SYSTEM_PROMPT, VISION_SYSTEM_PROMPT, vetQaSystemPrompt, visionHandoff } from "@/lib/ai/prompts"
import { groundingDomains, isVisionAvailable, modelFor } from "@/lib/ai/router"
import { triage } from "@/lib/ai/triage"
import type { Json } from "@/lib/supabase/database.types"
import type { ChatStreamEvent, Citation, EmergencyCard } from "@/lib/ai/types"

/**
 * Pet10x — the assistant's answer endpoint.
 *
 * Request flow:
 *   auth → assert the pet belongs to the caller → build the dossier →
 *   triage → (emergency? short-circuit) → (image? vision hop) →
 *   grounded answer → stream → persist
 *
 * The response is Server-Sent Events. Streaming matters here beyond polish:
 * Compound fetches the pinned domains live mid-answer, so latency is variable
 * and the owner needs to see something happening.
 */

export const runtime = "nodejs"
export const maxDuration = 60

/** Canadian and US lines. Static because an emergency card must not depend on a lookup. */
const POISON_CONTROL = [
  { name: "Pet Poison Helpline", phone: "1-855-764-7661", note: "24/7 · fee applies" },
  { name: "ASPCA Animal Poison Control", phone: "1-888-426-4435", note: "24/7 · fee applies" },
]

const MAX_HISTORY_TURNS = 12
const MAX_IMAGES = 5 // Groq's per-request ceiling on the vision model.

interface ChatBody {
  message?: string
  petId?: string | null
  conversationId?: string | null
  /** pet-media storage paths, already uploaded by the client. */
  imagePaths?: string[]
}

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!isGroqConfigured()) {
    return NextResponse.json({ error: "The assistant isn't configured yet (GROQ_API_KEY is missing)." }, { status: 503 })
  }

  const body = (await request.json().catch(() => ({}))) as ChatBody
  const message = (body.message ?? "").trim()
  const imagePaths = (body.imagePaths ?? []).slice(0, MAX_IMAGES)
  if (!message && imagePaths.length === 0) {
    return NextResponse.json({ error: "Ask a question or attach a photo." }, { status: 400 })
  }

  // Consent gate — the assistant answers nothing before it is accepted.
  const { data: profile } = await supabase
    .from("profiles")
    .select("ai_consent_at, latitude, longitude")
    .eq("id", user.id)
    .maybeSingle()
  if (!profile?.ai_consent_at) {
    return NextResponse.json({ error: "consent_required" }, { status: 403 })
  }

  // Pet scoping. An id the caller doesn't own reads as absent under RLS, and we
  // answer generally rather than leaking that the pet exists at all.
  let dossier: PetDossier | null = null
  if (body.petId) dossier = await buildPetDossier(supabase, body.petId, user.id)
  const petId = dossier?.petId ?? null

  // Resume or open a thread. A conversationId the caller doesn't own fails the
  // ownership filter and we start a fresh thread instead.
  let conversationId: string | null = null
  let isNewConversation = false
  if (body.conversationId) {
    const { data: existing } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", body.conversationId)
      .eq("profile_id", user.id)
      .is("deleted_at", null)
      .maybeSingle()
    conversationId = existing?.id ?? null
  }
  if (!conversationId) {
    const { data: created, error } = await supabase
      .from("ai_conversations")
      .insert({ profile_id: user.id, pet_id: petId })
      .select("id")
      .single()
    if (error || !created) {
      return NextResponse.json({ error: "Couldn't start a conversation." }, { status: 500 })
    }
    conversationId = created.id
    isNewConversation = true
  } else if (petId) {
    // The owner may switch pets mid-thread; the thread follows the active pet.
    await supabase.from("ai_conversations").update({ pet_id: petId }).eq("id", conversationId)
  }

  await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: message || "(photo)",
    image_paths: imagePaths,
  })

  const history = await loadHistory(supabase, conversationId)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        /* --------------------------- triage first --------------------------- */
        const verdict = await triage(message, request.signal)
        send({ type: "meta", conversationId: conversationId!, triage: verdict.level })

        if (verdict.level === "emergency") {
          const card = await buildEmergencyCard(supabase, verdict.flags.map((f) => f.label), dossier, profile)
          send({ type: "emergency", card })

          // Persisted so the thread reads back correctly and the triage
          // decision is auditable.
          const { data: saved } = await supabase
            .from("ai_messages")
            .insert({
              conversation_id: conversationId!,
              role: "assistant",
              content: emergencyTranscript(card),
              triage_level: "emergency",
              model: verdict.deterministic ? "red-flag-rules" : modelFor("red_flag"),
            })
            .select("id")
            .single()

          const title = isNewConversation ? await titleFor(supabase, conversationId!, message, request.signal) : undefined
          send({ type: "done", messageId: saved?.id ?? null, title })
          controller.close()
          return
        }

        /* ---------------------------- vision hop ---------------------------- */
        let visionContext: string | null = null
        if (imagePaths.length > 0) {
          if (!isVisionAvailable()) {
            send({ type: "status", text: "Photo reading is unavailable — answering from your question alone." })
          } else {
            send({ type: "status", text: "Looking at your photo…" })
            visionContext = await describeImages(supabase, imagePaths, message, request.signal)
            if (!visionContext) {
              // Preview-tier model; a failure degrades to text-only, never a 500.
              send({ type: "status", text: "Couldn't read the photo — answering from your question alone." })
            }
          }
        }

        /* -------------------------- grounded answer ------------------------- */
        send({ type: "status", text: "Checking veterinary references…" })

        const messages: ChatMessage[] = [
          { role: "system", content: vetQaSystemPrompt(dossier?.text) },
          ...history,
        ]
        if (visionContext) messages.push({ role: "system", content: visionHandoff(visionContext) })
        messages.push({ role: "user", content: message || "What can you tell me about the attached photo?" })

        let answer = ""
        let executedTools: ExecutedTool[] = []
        let usageIn: number | undefined
        let usageOut: number | undefined
        let answeredWith = modelFor("vet_qa")
        let streamError: string | null = null

        // Up to two attempts. The grounded model sometimes pulls a search set
        // too large to send back through itself and dies with a 413; because
        // the search is non-deterministic, a second attempt usually fetches
        // less and succeeds. Retrying is only safe while nothing has reached
        // the owner yet — once a delta is sent, restarting would duplicate it.
        for (let attempt = 0; attempt < 2; attempt++) {
          streamError = null
          let sentText = false
          let canRetry = false

          for await (const event of groqStream(
            {
              model: modelFor("vet_qa"),
              messages,
              temperature: 0.3,
              max_completion_tokens: 1200,
              search_settings: { include_domains: groundingDomains() },
            },
            request.signal,
          )) {
            if (event.error) {
              streamError = event.error
              // Only a clean failure — nothing streamed, retry allowed, and an
              // attempt left — earns another go. A rate limit is not retryable:
              // Groq wants a wait, and an instant retry just burns a request.
              canRetry = !!event.retryable && !sentText && attempt === 0
              if (canRetry) {
                executedTools = []
                send({ type: "status", text: "That search came back too large — trying a narrower one…" })
              }
              break
            }
            if (event.text) {
              answer += event.text
              sentText = true
              send({ type: "delta", text: event.text })
            }
            if (event.executedTools?.length) executedTools = event.executedTools
            if (event.usage) {
              usageIn = event.usage.prompt_tokens
              usageOut = event.usage.completion_tokens
            }
            if (event.model) answeredWith = event.model
          }

          if (!canRetry) break
        }

        // A stream that failed before producing prose must say so. Citations
        // without an answer read as a broken page, and silently persisting an
        // empty assistant turn would corrupt the thread on reload.
        if (streamError && !answer.trim()) {
          send({ type: "error", message: streamError })
          send({ type: "done", messageId: null })
          controller.close()
          return
        }

        const citations: Citation[] = extractCitations(executedTools)
        if (citations.length > 0) send({ type: "citations", citations })

        // Failed partway through: keep what arrived, but be honest that it stopped.
        if (streamError) {
          const note = `\n\n_(${streamError})_`
          answer += note
          send({ type: "delta", text: note })
        }

        const { data: saved } = await supabase
          .from("ai_messages")
          .insert({
            conversation_id: conversationId!,
            role: "assistant",
            content: answer,
            citations: citations as unknown as Json,
            triage_level: verdict.level,
            model: answeredWith,
            tokens_in: usageIn ?? null,
            tokens_out: usageOut ?? null,
          })
          .select("id")
          .single()

        const title = isNewConversation ? await titleFor(supabase, conversationId!, message, request.signal) : undefined
        send({ type: "done", messageId: saved?.id ?? null, title })
        controller.close()
      } catch (err) {
        const message = err instanceof GroqError ? err.message : "The assistant couldn't answer just now."
        if (!(err instanceof GroqError)) console.error("[ai] chat route failed", err)
        send({ type: "error", message })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Streaming through a proxy that buffers defeats the point.
      "X-Accel-Buffering": "no",
    },
  })
}

/* -------------------------------- helpers -------------------------------- */

type Client = NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>

async function loadHistory(supabase: Client, conversationId: string): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_TURNS + 1)

  const rows = (data ?? []).reverse()
  // Drop the turn we just inserted; it is appended by the caller with the
  // photo context attached.
  rows.pop()
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }))
}

/**
 * Vision hop. Images live in the private `pet-media` bucket, so they are handed
 * to Groq as short-lived signed URLs — never as public links.
 */
async function describeImages(
  supabase: Client,
  paths: string[],
  question: string,
  signal: AbortSignal,
): Promise<string | null> {
  const { data: signed } = await supabase.storage.from("pet-media").createSignedUrls(paths, 600)
  const urls = (signed ?? []).map((s) => s.signedUrl).filter((u): u is string => !!u)
  if (urls.length === 0) return null

  try {
    const { content } = await groqComplete(
      {
        model: modelFor("photo_triage"),
        messages: [
          { role: "system", content: VISION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text" as const, text: question ? `The owner asks: ${question}` : "Describe this photograph." },
              ...urls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
            ],
          },
        ],
        temperature: 0.2,
        max_completion_tokens: 500,
      },
      signal,
    )
    return content.trim() || null
  } catch (err) {
    console.error("[ai] vision hop failed, degrading to text-only", err)
    return null
  }
}

/** Off the critical path — a failed title just leaves the thread untitled. */
async function titleFor(
  supabase: Client,
  conversationId: string,
  message: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  if (!message) return undefined
  try {
    const { content } = await groqComplete(
      {
        model: modelFor("thread_title"),
        messages: [
          { role: "system", content: TITLE_SYSTEM_PROMPT },
          { role: "user", content: message.slice(0, 500) },
        ],
        temperature: 0.3,
        max_completion_tokens: 24,
      },
      signal,
    )
    const title = content.trim().replace(/^["']|["']$/g, "").slice(0, 80)
    if (!title) return undefined
    await supabase.from("ai_conversations").update({ title }).eq("id", conversationId)
    return title
  } catch {
    return undefined
  }
}

async function buildEmergencyCard(
  supabase: Client,
  reasons: string[],
  dossier: PetDossier | null,
  profile: { latitude: number | null; longitude: number | null } | null,
): Promise<EmergencyCard> {
  const origin = await resolveOrigin(supabase, profile).catch(() => ({
    latitude: null,
    longitude: null,
    city: null,
  }))
  const clinics = await findEmergencyClinics(supabase, origin).catch(() => [])

  return {
    reasons: reasons.length > 0 ? reasons : ["This sounds like it could be an emergency"],
    petName: dossier?.petName ?? null,
    petId: dossier?.petId ?? null,
    vetPhone: dossier?.vetPhone ?? null,
    vetClinic: dossier?.vetClinic ?? null,
    clinics,
    poisonControl: POISON_CONTROL,
  }
}

/** Plain-text form of the card, so a resumed thread reads back sensibly. */
function emergencyTranscript(card: EmergencyCard): string {
  const who = card.petName ? `${card.petName} needs` : "This needs"
  const lines = [
    `${who} a veterinarian now — ${card.reasons.join("; ").toLowerCase()}.`,
    card.vetPhone ? `Your vet: ${card.vetClinic ?? "on file"} — ${card.vetPhone}` : null,
    ...card.clinics.map((c) => `Nearby: ${c.name}${c.city ? ` (${c.city})` : ""}`),
    ...card.poisonControl.map((p) => `${p.name}: ${p.phone}`),
  ]
  return lines.filter(Boolean).join("\n")
}
