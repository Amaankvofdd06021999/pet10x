import { userError } from "@/lib/user-error"
import { RAISED_SENTENCES, SQLSTATE_SENTENCES, rememberFallback } from "./db-sentences"

/**
 * What a screen may show when a Supabase / Postgres / fetch call fails.
 *
 * The data layer used to hand `error.message` straight back, so a manager
 * could read 'duplicate key value violates unique constraint "…_key"' or
 * "new row violates row-level security policy". That text is a diagnostic,
 * not a sentence. This is the one door it goes through:
 *
 *   1. A sentence we wrote passes: lib/user-error.ts's allow-list as is, and
 *      a sentence one of our functions raises (db-sentences.ts) with a full
 *      stop — an RPC that raises 22023 with our own English keeps it.
 *   2. A SQLSTATE in a short allow-list (db-sentences.ts) becomes its plain
 *      sentence.
 *   3. Anything else is the caller's fallback, which names the action
 *      ("Couldn't save the service. Try again."). It is remembered, so a
 *      screen that runs the returned text through userError keeps it.
 *
 * Positive grammar: what may be shown is listed, so text the database learns
 * to say later can never leak by default. The original is logged once, here,
 * with the fallback as context — callers do not log it again.
 */
export function dbErrorMessage(error: unknown, fallback: string): string {
  console.error(`[db] ${fallback}`, error)
  const { code, message } = fields(error)
  if (message !== null) {
    const known = userError(message, "")
    if (known) return known
    const raised = message.trim().replace(/\.$/, "")
    if (RAISED_SENTENCES.has(raised)) return `${raised}.`
  }
  if (code !== null && Object.prototype.hasOwnProperty.call(SQLSTATE_SENTENCES, code)) {
    return SQLSTATE_SENTENCES[code]
  }
  rememberFallback(fallback)
  return fallback
}

/** The two fields this reads, from whatever was thrown or returned. */
function fields(error: unknown): { code: string | null; message: string | null } {
  if (typeof error === "string") return { code: null, message: error }
  if (!error || typeof error !== "object") return { code: null, message: null }
  const e = error as { code?: unknown; message?: unknown }
  return {
    code: typeof e.code === "string" ? e.code : null,
    message: typeof e.message === "string" ? e.message : null,
  }
}
