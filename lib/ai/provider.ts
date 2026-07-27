import "server-only"

/**
 * Pet10x — Groq transport.
 *
 * Groq is OpenAI-compatible, so this is a thin fetch wrapper rather than an SDK
 * dependency. That is deliberate: the grounding design depends on Groq's
 * non-standard `search_settings` field reaching the wire untouched, and a
 * provider SDK that doesn't know the field would drop it silently. Raw fetch
 * removes the question.
 *
 * The API key is read from GROQ_API_KEY and never leaves the server — nothing
 * here may be imported from a client component (`server-only` enforces it).
 */

const GROQ_BASE_URL = process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1"

/** Wall-clock ceiling per upstream call. Compound makes live web requests mid-answer. */
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 60_000)

export function isGroqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY
}

/* --------------------------------- types --------------------------------- */

export type ChatRole = "system" | "user" | "assistant"

/** A user turn may carry images; Groq uses the OpenAI multimodal content array. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export interface ChatMessage {
  role: ChatRole
  content: string | ContentPart[]
}

/** Groq's built-in web search knob. Only `groq/compound*` and gpt-oss honour it. */
export interface SearchSettings {
  include_domains?: string[]
  exclude_domains?: string[]
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  temperature?: number
  max_completion_tokens?: number
  response_format?: { type: "json_object" }
  search_settings?: SearchSettings
  stream?: boolean
}

/** One tool Compound actually ran while answering — the raw material for citations. */
export interface ExecutedTool {
  index?: number
  type?: string
  arguments?: string
  output?: string
  search_results?: { results?: { title?: string; url?: string; content?: string; score?: number }[] }
}

export interface ChatUsage {
  prompt_tokens?: number
  completion_tokens?: number
}

export interface ChatCompletion {
  content: string
  executedTools: ExecutedTool[]
  usage: ChatUsage | null
  model: string
}

export class GroqError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "GroqError"
  }
}

/* -------------------------------- transport ------------------------------- */

async function groqFetch(body: ChatRequest, signal?: AbortSignal): Promise<Response> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new GroqError("The assistant isn't configured (GROQ_API_KEY is missing).", 503)

  // Caller-supplied cancellation (client disconnect) races our own timeout.
  const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: combined,
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new GroqError(groqErrorMessage(res.status, detail), res.status)
  }
  return res
}

/** Upstream errors become owner-readable sentences; the raw body stays in the log. */
function groqErrorMessage(status: number, detail: string): string {
  if (detail) console.error(`[ai] Groq ${status}: ${detail.slice(0, 500)}`)
  if (status === 429 || /rate limit/i.test(detail)) {
    // The dominant failure on Groq's free tier: Compound feeds whole fetched
    // pages back through its own model, so one grounded answer can exhaust a
    // minute's token budget by itself.
    return "The assistant hit its rate limit. Wait a moment and ask again."
  }
  if (status === 413) return "That answer grew too large to finish. Try a narrower question."
  if (status === 401 || status === 403) return "The assistant isn't configured correctly."
  if (status === 404) return "That assistant model is unavailable."
  return "The assistant couldn't answer just now."
}

/** One-shot completion. Used for triage, vision description, titles and copy. */
export async function groqComplete(req: Omit<ChatRequest, "stream">, signal?: AbortSignal): Promise<ChatCompletion> {
  const res = await groqFetch({ ...req, stream: false }, signal)
  const json = (await res.json()) as {
    model?: string
    choices?: { message?: { content?: string; executed_tools?: ExecutedTool[] } }[]
    usage?: ChatUsage
  }
  const choice = json.choices?.[0]
  return {
    content: choice?.message?.content ?? "",
    executedTools: choice?.message?.executed_tools ?? [],
    usage: json.usage ?? null,
    model: json.model ?? req.model,
  }
}

/** A streamed delta: prose as it arrives, plus the trailing metadata Groq sends. */
export interface StreamEvent {
  text?: string
  executedTools?: ExecutedTool[]
  usage?: ChatUsage
  model?: string
  /**
   * Groq can fail *after* returning 200 — a rate limit hit partway through
   * Compound's tool loop arrives as an SSE error frame, not an HTTP status.
   * Surfaced here so a failed answer never renders as a blank one.
   */
  error?: string
  /**
   * Whether an immediate second attempt is worth making. True for an oversized
   * search payload (413) — the search is non-deterministic, so a retry usually
   * fetches a smaller set and succeeds. False for a rate limit, where retrying
   * without waiting only burns another request.
   */
  retryable?: boolean
}

/**
 * Streaming completion as an async iterable of deltas.
 *
 * Compound reports what it read in `executed_tools`, which arrives attached to
 * a chunk rather than at the end, so we surface it as it appears and let the
 * caller keep the last non-empty set.
 */
export async function* groqStream(
  req: Omit<ChatRequest, "stream">,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const res = await groqFetch({ ...req, stream: true }, signal)
  if (!res.body) return

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += value

      // SSE frames are separated by a blank line; keep the trailing partial.
      let split: number
      while ((split = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, split)
        buffer = buffer.slice(split + 2)

        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue
          const data = line.slice(5).trim()
          if (!data || data === "[DONE]") continue

          let parsed: {
            model?: string
            usage?: ChatUsage
            choices?: { delta?: { content?: string; reasoning?: string; executed_tools?: ExecutedTool[] } }[]
            x_groq?: { usage?: ChatUsage }
            error?: { message?: string; code?: string; status_code?: number }
          }
          try {
            parsed = JSON.parse(data)
          } catch {
            continue // a partial frame we'll never complete; skip rather than abort the answer
          }

          // An in-band failure. Compound's tool loop re-submits the pages it
          // fetched, so a long answer can trip the rate or size ceiling
          // mid-flight and Groq reports it here rather than as an HTTP error.
          if (parsed.error) {
            const detail = parsed.error.message ?? ""
            const status =
              parsed.error.status_code ??
              (parsed.error.code === "rate_limit_exceeded" || /rate limit/i.test(detail) ? 429 : 502)
            yield { error: groqErrorMessage(status, detail), retryable: status === 413 }
            return
          }

          const delta = parsed.choices?.[0]?.delta
          const event: StreamEvent = {}
          // Only `content` is the answer. Compound also streams `reasoning` —
          // its private working, often 10x the length of the reply — which is
          // deliberately dropped rather than shown to the owner.
          if (delta?.content) event.text = delta.content
          if (delta?.executed_tools?.length) event.executedTools = delta.executed_tools
          const usage = parsed.usage ?? parsed.x_groq?.usage
          if (usage) event.usage = usage
          if (parsed.model) event.model = parsed.model
          if (event.text || event.executedTools || event.usage) yield event
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}
