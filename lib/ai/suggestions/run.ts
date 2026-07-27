import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/lib/supabase/database.types"
import { groqComplete } from "../provider"
import { isGroqConfigured } from "../provider"
import { SUGGESTION_SYSTEM_PROMPT } from "../prompts"
import { modelFor } from "../router"
import { evaluateRules, type RuleHit } from "./rules"

/**
 * Pet10x — the suggestion runner.
 *
 * Evaluates the deterministic rules, has a small model rewrite each verified
 * fact as one warm sentence, then writes through to `ai_suggestions` and to
 * `notifications` so the cards appear in the existing Alerts screen with no new
 * plumbing.
 *
 * Idempotent by `dedupe_key` — running twice produces one card, which is the
 * property the whole design rests on.
 */

type Client = SupabaseClient<Database>

export interface RunResult {
  evaluated: number
  created: number
  skipped: number
  /** Cards mirrored into `notifications`. Reported so a denied write can't hide. */
  notified: number
}

/** Copy generation is best-effort; a failure leaves the rule's own wording. */
async function writeCopy(hit: RuleHit): Promise<string> {
  if (!isGroqConfigured()) return hit.title
  try {
    const { content } = await groqComplete({
      model: modelFor("suggestion_copy"),
      messages: [
        { role: "system", content: SUGGESTION_SYSTEM_PROMPT },
        { role: "user", content: hit.facts },
      ],
      temperature: 0.4,
      max_completion_tokens: 60,
    })
    const line = content.trim().replace(/^["']|["']$/g, "")
    // Guard against a model that ignores the length rule or returns nothing.
    if (!line || line.length > 200) return hit.title
    return line
  } catch (err) {
    console.error("[ai] suggestion copy failed, using rule wording", err)
    return hit.title
  }
}

export async function runSuggestions(supabase: Client, ownerId: string): Promise<RunResult> {
  const { data: pets } = await supabase
    .from("pets")
    .select("id, name")
    .eq("owner_id", ownerId)
    .is("deleted_at", null)

  const hits = await evaluateRules(supabase, pets ?? [])
  if (hits.length === 0) return { evaluated: 0, created: 0, skipped: 0, notified: 0 }

  // Which dedupe keys already exist — including dismissed ones, so a nudge the
  // owner has waved away does not come back on the next run.
  const { data: existing } = await supabase
    .from("ai_suggestions")
    .select("dedupe_key")
    .eq("profile_id", ownerId)
    .in("dedupe_key", hits.map((h) => h.dedupeKey))

  const seen = new Set((existing ?? []).map((r) => r.dedupe_key))
  const fresh = hits.filter((h) => !seen.has(h.dedupeKey))
  if (fresh.length === 0) return { evaluated: hits.length, created: 0, skipped: hits.length, notified: 0 }

  const bodies = await Promise.all(fresh.map(writeCopy))

  const rows = fresh.map((hit, i) => ({
    profile_id: ownerId,
    pet_id: hit.petId,
    kind: hit.kind,
    severity: hit.severity,
    title: hit.title,
    body: bodies[i],
    action_label: hit.actionLabel,
    action_target: hit.actionTarget,
    evidence: hit.evidence as unknown as Json,
    dedupe_key: hit.dedupeKey,
    valid_until: hit.validUntil,
  }))

  // `ignoreDuplicates` makes a concurrent second run a no-op rather than a
  // unique-violation error — the index on (profile_id, dedupe_key) is the guard.
  const { data: inserted, error } = await supabase
    .from("ai_suggestions")
    .upsert(rows, { onConflict: "profile_id,dedupe_key", ignoreDuplicates: true })
    .select("id, title, body, action_label, action_target, severity")

  if (error) {
    console.error("[ai] suggestion insert failed", error)
    return { evaluated: hits.length, created: 0, skipped: hits.length, notified: 0 }
  }

  const created = inserted ?? []
  let notified = 0
  if (created.length > 0) {
    // Write-through so suggestions land in the existing Alerts screen. Needs
    // the notifs_insert_own_assistant policy from 20260727000000 — without it
    // RLS denies this insert.
    const { data: notifs, error: notifErr } = await supabase
      .from("notifications")
      .insert(
        created.map((s) => ({
          profile_id: ownerId,
          kind: "assistant" as const,
          severity: s.severity,
          title: s.title,
          body: s.body,
          action_label: s.action_label,
          action_target: s.action_target,
        })),
      )
      .select("id")
    // The ai_suggestions row is the source of truth, so a failed mirror is
    // logged and reported rather than fatal — but it must not pass unnoticed.
    if (notifErr) console.error("[ai] notification write-through failed", notifErr)
    notified = notifs?.length ?? 0
  }

  return { evaluated: hits.length, created: created.length, skipped: hits.length - created.length, notified }
}
