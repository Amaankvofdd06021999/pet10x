import "server-only"

/**
 * Pet10x — model router.
 *
 * Groq splits the capabilities this feature needs across models that cannot be
 * combined: `groq/compound` grounds answers with domain-pinned web search but
 * refuses images, and the only vision model is preview-tier. So each job names
 * the model it needs, and photo questions run two hops.
 *
 * Every ID is an env var. Groq retires preview models with little notice, and
 * changing one must not mean changing code.
 */

export type AiJob =
  | "vet_qa" //        the grounded answer — domain-pinned web search
  | "photo_triage" //  describes an attached image so the grounded hop can use it
  | "red_flag" //      runs on every message, before the answer does
  | "suggestion_copy" // writes a sentence about an already-decided fact
  | "thread_title"

const MODELS: Record<AiJob, string> = {
  /**
   * Domain-pinned web search; reports what it read in `executed_tools`, which
   * becomes our citation list.
   *
   * `compound-mini`, not `compound`, and the difference is not cosmetic.
   * Compound makes MULTIPLE tool calls per request and feeds every fetched page
   * back through its own model, so on the free tier the requests that actually
   * searched died with HTTP 413 — measured 1/3 success, and the one success had
   * cited nothing. Mini is capped at a single tool call, which keeps the
   * request under the size ceiling: 3/3 success, one of them grounded with 8
   * on-domain citations, and ~3x lower latency. Same 250 req/day, same 70K TPM,
   * same `include_domains` and `executed_tools` shapes.
   */
  vet_qa: process.env.AI_MODEL_VET_QA ?? "groq/compound-mini",

  // Groq's only vision model, and it is PREVIEW — see `isVisionAvailable`.
  photo_triage: process.env.AI_MODEL_VISION ?? "qwen/qwen3.6-27b",

  /**
   * Runs in front of every single message, so it must be fast and must not be
   * a reasoning model: gpt-oss-20b spends its budget on reasoning tokens before
   * emitting content, and under a tight `max_completion_tokens` it returned
   * truncated JSON — HTTP 400 on every call. This one answers in ~8 completion
   * tokens and ~120ms, with 14.4K requests/day against gpt-oss-20b's 1K.
   */
  red_flag: process.env.AI_MODEL_TRIAGE ?? "llama-3.1-8b-instant",

  // Writes the sentence only. Never decides whether something is due.
  suggestion_copy: process.env.AI_MODEL_COPY ?? "llama-3.1-8b-instant",
  thread_title: process.env.AI_MODEL_TITLE ?? "llama-3.1-8b-instant",
}

export function modelFor(job: AiJob): string {
  return MODELS[job]
}

/**
 * Vision runs on a preview model Groq has not committed to keeping. Setting
 * AI_MODEL_VISION empty turns photo questions off deliberately; a model that
 * breaks in production degrades the same way at the call site, to a text-only
 * answer rather than a 500.
 */
export function isVisionAvailable(): boolean {
  return !!MODELS.photo_triage
}

/**
 * The domains grounded answers may cite. Nothing is ingested from either site —
 * they are live retrieval targets read at answer time, which is what keeps this
 * clear of both publishers' terms.
 */
export function groundingDomains(): string[] {
  const raw = process.env.AI_GROUNDING_DOMAINS ?? "veterinarypartner.vin.com,merckvetmanual.com"
  return raw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
}
