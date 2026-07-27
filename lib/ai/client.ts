"use client"

/**
 * Pet10x — the assistant's client seam.
 *
 * Everything the screens need to talk to /api/ai. Deliberately hook-shaped to
 * match `lib/data` so the assistant screens read like the rest of the app.
 */

import { useCallback, useEffect, useState } from "react"
import { uploadPetFile } from "@/lib/supabase/storage"
import type { AiConversation, AiMessage, AiSuggestion, ChatStreamEvent, Citation, EmergencyCard, TriageLevel } from "./types"

/** A message as the screen holds it — assistant turns may still be streaming. */
export interface ChatTurn {
  id: string
  role: "user" | "assistant"
  content: string
  imagePaths: string[]
  citations: Citation[]
  triageLevel: TriageLevel | null
  emergency?: EmergencyCard
  /** Transient "checking veterinary references…" line, cleared once prose arrives. */
  status?: string
  streaming?: boolean
  error?: string
}

/* -------------------------------- consent -------------------------------- */

export function useAiConsent() {
  const [consentedAt, setConsentedAt] = useState<string | null>(null)
  const [isLoading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/ai/consent")
      .then((r) => (r.ok ? r.json() : { consentedAt: null }))
      .then((d: { consentedAt: string | null }) => {
        if (!cancelled) {
          setConsentedAt(d.consentedAt)
          setLoading(false)
        }
      })
      .catch(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const accept = useCallback(async () => {
    const res = await fetch("/api/ai/consent", { method: "POST" })
    if (!res.ok) return false
    const { consentedAt: at } = (await res.json()) as { consentedAt: string }
    setConsentedAt(at)
    return true
  }, [])

  return { consentedAt, hasConsented: !!consentedAt, isLoading, accept }
}

/* ------------------------------ conversations ----------------------------- */

export function useAiConversations() {
  const [data, setData] = useState<AiConversation[]>([])
  const [isLoading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/conversations")
      const json = (await res.json()) as { conversations?: AiConversation[] }
      setData(json.conversations ?? [])
    } catch {
      setData([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, refetch }
}

export async function loadConversation(id: string): Promise<{ conversation: AiConversation; messages: AiMessage[] } | null> {
  const res = await fetch(`/api/ai/conversations/${id}`)
  if (!res.ok) return null
  return (await res.json()) as { conversation: AiConversation; messages: AiMessage[] }
}

export async function deleteConversation(id: string): Promise<boolean> {
  const res = await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" })
  return res.ok
}

/* -------------------------------- sending -------------------------------- */

export interface SendOptions {
  message: string
  petId?: string | null
  conversationId?: string | null
  imagePaths?: string[]
  signal?: AbortSignal
  onEvent: (event: ChatStreamEvent) => void
}

/**
 * Posts a turn and drives the SSE response.
 *
 * A 403 with `consent_required` is surfaced as its own event so the screen can
 * re-open the consent dialog rather than showing a generic failure.
 */
export async function sendChatMessage(opts: SendOptions): Promise<void> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: opts.message,
      petId: opts.petId ?? null,
      conversationId: opts.conversationId ?? null,
      imagePaths: opts.imagePaths ?? [],
    }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string }
    opts.onEvent({
      type: "error",
      message: detail.error === "consent_required" ? "consent_required" : detail.error ?? "The assistant couldn't answer just now.",
    })
    return
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += value

      let split: number
      while ((split = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, split)
        buffer = buffer.slice(split + 2)
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue
          const payload = line.slice(5).trim()
          if (!payload) continue
          try {
            opts.onEvent(JSON.parse(payload) as ChatStreamEvent)
          } catch {
            // A frame we can't parse is one lost delta, not a failed answer.
          }
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}

/**
 * Uploads attachments to the private `pet-media` bucket and returns their
 * paths. The route signs them for Groq; nothing here is ever made public.
 */
export async function uploadChatImages(petId: string, files: File[]): Promise<{ paths: string[]; error: string | null }> {
  const paths: string[] = []
  for (const file of files) {
    const { path, error } = await uploadPetFile({ petId, file, prefix: "ai" })
    if (error || !path) return { paths, error: error ?? "Upload failed." }
    paths.push(path)
  }
  return { paths, error: null }
}

/* ------------------------------- suggestions ------------------------------ */

export function useAiSuggestions() {
  const [data, setData] = useState<AiSuggestion[]>([])
  const [isLoading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/suggestions/run")
      const json = (await res.json()) as { suggestions?: AiSuggestion[] }
      setData(json.suggestions ?? [])
    } catch {
      setData([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const dismiss = useCallback(async (id: string) => {
    setData((prev) => prev.filter((s) => s.id !== id)) // optimistic
    await fetch(`/api/ai/suggestions/${id}/dismiss`, { method: "POST" }).catch(() => {})
  }, [])

  const run = useCallback(async () => {
    await fetch("/api/ai/suggestions/run", { method: "POST" }).catch(() => {})
    await refetch()
  }, [refetch])

  return { data, isLoading, refetch, dismiss, run }
}
