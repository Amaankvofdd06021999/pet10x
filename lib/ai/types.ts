/**
 * Pet10x — the assistant's wire protocol.
 *
 * Shared by the route handlers and the client screens, so this file must stay
 * free of `server-only` imports and of anything that touches the Groq key.
 */

export type TriageLevel = "emergency" | "urgent" | "routine"

export interface Citation {
  title: string
  url: string
  source: string
}

/** Rendered instead of an answer. Assembled in code — no model writes this. */
export interface EmergencyCard {
  /** What the red-flag matcher reacted to, so the owner can see we didn't guess. */
  reasons: string[]
  petName: string | null
  vetPhone: string | null
  vetClinic: string | null
  /** Set when the message named a pet, so the owner can warn a clinic they are coming. */
  petId: string | null
  clinics: {
    id: string
    name: string
    address: string | null
    city: string | null
    distanceKm: number | null
    phone: string | null
    /** Listed practices can be told you are on your way; unlisted ones cannot. */
    canNotify: boolean
  }[]
  poisonControl: { name: string; phone: string; note: string }[]
}

/** One SSE frame from POST /api/ai/chat, sent as `data: <json>`. */
export type ChatStreamEvent =
  | { type: "meta"; conversationId: string; triage: TriageLevel }
  /** Compound's latency is variable because it fetches live — say what's happening. */
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "emergency"; card: EmergencyCard }
  | { type: "done"; messageId: string | null; title?: string }
  | { type: "error"; message: string }

export interface AiConversation {
  id: string
  petId: string | null
  title: string | null
  updatedAt: string
}

export interface AiMessage {
  id: string
  role: "user" | "assistant"
  content: string
  imagePaths: string[]
  citations: Citation[]
  triageLevel: TriageLevel | null
  createdAt: string
}

export type SuggestionKind =
  | "vaccination_due"
  | "medication_due"
  | "care_adherence"
  | "document_missing"
  | "checkup_due"

export interface AiSuggestion {
  id: string
  petId: string
  petName: string
  kind: SuggestionKind
  severity: "info" | "warning" | "error" | "success"
  title: string
  body: string | null
  actionLabel: string | null
  actionTarget: string | null
  createdAt: string
}
