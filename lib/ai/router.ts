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
 *
 * Whether answers are GROUNDED is therefore a property of configuration, not of
 * code: only the compound family carries built-in web search, so pointing
 * `AI_MODEL_VET_QA` at anything else turns citations off. `isGroundingAvailable`
 * is the single place that decides, and the prompt and the route both follow it
 * rather than assuming. See `docs/AI_GROUNDING.md` for why it is currently off.
 */

export type AiJob =
  | "vet_qa" //        the owner-facing answer — grounded only on a compound model
  | "photo_triage" //  describes an attached image so the grounded hop can use it
  | "red_flag" //      runs on every message, before the answer does
  | "suggestion_copy" // writes a sentence about an already-decided fact
  | "thread_title"

const MODELS: Record<AiJob, string> = {
  /**
   * The owner-facing answer.
   *
   * This was `groq/compound-mini` for the domain-pinned web search that produced
   * our citations. On the free tier that no longer answers at all: compound
   * feeds every page it fetches back through its own model, and Groq returns 413
   * `request_too_large` when a SINGLE request exceeds the tier's per-minute
   * token ceiling. Measured 2026-09-19 over eight ordinary questions: 1 answered,
   * 0 grounded. Not flaky — unusable. Narrowing `include_domains` to one domain
   * does not help, removing `search_settings` does not help, and `max_results`
   * is silently ignored, because the payload is compound's own, not ours.
   *
   * gpt-oss-120b has no web search, so answers are ungrounded and carry no
   * citations — `vetQaSystemPrompt` says so plainly rather than letting a model
   * with no sources be told it must cite them. In exchange it answers every
   * time, at 1000 req/day against compound's 250, and on a senior-cat weight-loss
   * case it named the differentials an owner needs to raise with their vet
   * (thyroid, kidney, diabetes, dental) where the smaller models hedged.
   *
   * To restore grounding, set AI_MODEL_VET_QA back to `groq/compound-mini` on a
   * paid tier: the prompt, the citation list and the status copy all switch
   * themselves back on via `isGroundingAvailable`.
   */
  vet_qa: process.env.AI_MODEL_VET_QA ?? "openai/gpt-oss-120b",

  // Groq's only vision model, and it is PREVIEW — see `isVisionAvailable`.
  // Was qwen3.6-27b until Groq retired it (404 model_not_found on 2026-09-18);
  // qwen3.8-27b is its successor and the only text+image model Groq now lists.
  photo_triage: process.env.AI_MODEL_VISION ?? "qwen/qwen3.8-27b",

  /**
   * Runs in front of every single message, so it must be fast and must not be
   * a reasoning model: gpt-oss-20b spends its budget on reasoning tokens before
   * emitting content, and under a tight `max_completion_tokens` it returned
   * truncated JSON — HTTP 400 on every call.
   *
   * Was llama-3.1-8b-instant until Groq retired it (404 model_not_found on
   * 2026-09-18). qwen3.8-27b replaces it on the same terms that mattered:
   * measured against this classifier's own prompt it returned
   * `{"level":"emergency"}` in 6 completion tokens and ~150ms with no
   * `reasoning` field at all, where gpt-oss-20b spent 74 tokens and ~520ms
   * reaching the same verdict. It is also the vision model, so one retirement
   * now moves one ID rather than four.
   */
  red_flag: process.env.AI_MODEL_TRIAGE ?? "qwen/qwen3.8-27b",

  // Writes the sentence only. Never decides whether something is due.
  suggestion_copy: process.env.AI_MODEL_COPY ?? "qwen/qwen3.8-27b",
  thread_title: process.env.AI_MODEL_TITLE ?? "qwen/qwen3.8-27b",
}

export function modelFor(job: AiJob): string {
  return MODELS[job]
}

/**
 * Whether the answer model can actually read the grounding domains.
 *
 * Only Groq's compound family carries built-in web search. Every other model
 * accepts `search_settings` and silently ignores it — verified against
 * gpt-oss-120b, which returns 200 and no `executed_tools` — so asking the model
 * is useless and the ID is the only honest signal. Anything that is not compound
 * answers from its own weights, which the owner is told.
 */
export function isGroundingAvailable(): boolean {
  return MODELS.vet_qa.startsWith("groq/compound")
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
