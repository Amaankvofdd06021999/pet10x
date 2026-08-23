"use client"

/**
 * Pet10x — house rules and the fine schedule, against the live database.
 *
 * The impure half of `building-rules.ts` / `fine-schedule.ts`: React hooks and
 * three RPC wrappers. Nothing here is unit-testable (vitest runs
 * `environment: "node"`, no DOM, no session), so nothing here holds a rule —
 * every decision lives in one of the two pure modules and is tested there.
 *
 * RLS IS THE FLOOR, THE QUERY IS THE FILTER. Every read below names its
 * building explicitly with `.eq("building_id", …)`, and the resident's read
 * also names `.eq("is_published", true)`. Task 1's policies already enforce
 * both — a resident's SELECT cannot return another building's rows or an
 * unpublished one — but a screen that relies on a policy to scope its query is
 * a screen that shows the wrong thing the day the policy is widened.
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { LiveResult } from "./live"
import type { BuildingRule, BuildingRuleCategory } from "./building-rules"

type Row = {
  id: string
  building_id: string
  category: BuildingRuleCategory
  title: string
  body: string
  is_published: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

const SELECT = "id, building_id, category, title, body, is_published, sort_order, created_at, updated_at"

function mapRule(r: Row): BuildingRule {
  return {
    id: r.id,
    buildingId: r.building_id,
    category: r.category,
    title: r.title,
    // VERBATIM. No trim, no normalise, no replace. This is the one value the
    // whole phase exists to carry unchanged from the manager's textarea to the
    // resident's screen.
    body: r.body,
    isPublished: r.is_published,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/**
 * The published rules of one building, for a resident.
 *
 * REFETCHES ON `visibilitychange`, and on nothing else — no interval, no
 * realtime channel (Decision 7). A legal document rewriting itself under a
 * reader's eyes mid-sentence is worse than being a minute stale, and a resident
 * who has the tab open is told to look again by the notification `publish_
 * building_rule` sends, not by the text moving.
 *
 * `buildingId` is undefined until `useMyBuildingLink` resolves, and while it is
 * undefined this queries NOTHING. Fetching unscoped and filtering in memory
 * would mean the first render of a resident with no approved link asks for
 * every rule row the policies would give them.
 */
export function useMyBuildingRules(buildingId: string | undefined): LiveResult<BuildingRule[]> {
  const [data, setData] = useState<BuildingRule[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !buildingId) {
      setData([])
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("building_rules")
      .select(SELECT)
      .eq("building_id", buildingId)
      .eq("is_published", true)
      .order("sort_order")
      .order("created_at")

    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(((rows ?? []) as Row[]).map(mapRule))
      setError(null)
    }
    setLoading(false)
  }, [buildingId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() => {
    if (typeof document === "undefined") return
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [refetch])

  return { data, isLoading, error, refetch }
}

/**
 * Every rule of one building, drafts included, for its manager.
 *
 * No `visibilitychange` listener: the manager is the one writing, so the
 * freshest copy is the one they just saved, and a refetch on focus would
 * discard an in-progress edit for a value they already know.
 */
export function useManagerBuildingRules(buildingId: string | undefined): LiveResult<BuildingRule[]> {
  const [data, setData] = useState<BuildingRule[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !buildingId) {
      setData([])
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("building_rules")
      .select(SELECT)
      .eq("building_id", buildingId)
      .order("sort_order")
      .order("created_at")

    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(((rows ?? []) as Row[]).map(mapRule))
      setError(null)
    }
    setLoading(false)
  }, [buildingId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { data, isLoading, error, refetch }
}

/* ------------------------------------------------------------------------ */
/* Mutations — thin wrappers over the three RPCs                             */
/* ------------------------------------------------------------------------ */

function transportError(e: { message: string; hint?: string | null } | null): string | null {
  if (!e) return null
  const hint = e.hint?.trim()
  return hint ? `${e.message} ${hint}` : e.message
}

/**
 * Every structured `error` code the three RPCs return, mapped to a sentence.
 *
 * A `Record` and not a switch with a default, so a code added to any of the
 * three functions later is a compile error here rather than a silent fall
 * through to "Something went wrong" — which is the message that tells a manager
 * nothing and costs a support ticket.
 */
const ERROR_SENTENCE: Record<string, string> = {
  forbidden: "You don't manage this building.",
  not_found: "That rule no longer exists.",
  building_mismatch: "A rule can't be moved to a different building.",
  empty: "A rule needs both a title and some text.",
  too_long: "That's longer than a rule can be. Shorten it and try again.",
  bad_amount: "A fine has to be between $0.01 and $10,000.00.",
  bad_currency: "Use a three-letter currency code, like CAD.",
}

function sentenceFor(code: string | undefined): string {
  return (code && ERROR_SENTENCE[code]) || "That didn't save. Try again."
}

export interface SaveRuleInput {
  /** `null` creates. An id amends the existing rule and never publishes it. */
  id: string | null
  buildingId: string
  category: BuildingRuleCategory
  title: string
  /** Sent VERBATIM. `manager_save_building_rule` trims only the outermost whitespace. */
  body: string
  sortOrder?: number
}

export async function saveBuildingRule(
  input: SaveRuleInput,
): Promise<{ id: string | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { id: null, error: "Not configured." }

  const { data, error } = await supabase.rpc("manager_save_building_rule", {
    /* The generated `Args` type cannot express a NULLABLE argument — Supabase's
     * codegen renders every parameter without a SQL default as required and
     * non-null, and `p_rule uuid` has no default because it is the first
     * parameter. `null` IS the documented value for "create a new rule", so the
     * cast is asserting what the function signature actually permits, not
     * working around a check. Same for `p_sort_order`, which is genuinely
     * optional and is therefore passed as `undefined` so the SQL default
     * applies. */
    p_rule: (input.id ?? null) as unknown as string,
    p_building: input.buildingId,
    p_category: input.category,
    p_title: input.title,
    p_body: input.body,
    p_sort_order: input.sortOrder ?? undefined,
  })
  if (error) return { id: null, error: transportError(error) }

  const r = data as unknown as { ok: boolean; error?: string; id?: string }
  if (!r.ok) return { id: null, error: sentenceFor(r.error) }
  return { id: r.id ?? null, error: null }
}

export async function publishBuildingRule(
  id: string,
  published: boolean,
  notify: boolean,
): Promise<{ error: string | null; notified: number }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured.", notified: 0 }

  const { data, error } = await supabase.rpc("publish_building_rule", {
    p_rule: id,
    p_published: published,
    p_notify: notify,
  })
  if (error) return { error: transportError(error), notified: 0 }

  const r = data as unknown as { ok: boolean; error?: string; notified?: number }
  if (!r.ok) return { error: sentenceFor(r.error), notified: 0 }
  return { error: null, notified: r.notified ?? 0 }
}

export interface FineScheduleInput {
  /** Integer cents, or `null` to REMOVE this degree from the schedule. */
  fine1Cents: number | null
  fine2Cents: number | null
  currency: string
}

export async function setFineSchedule(
  buildingId: string,
  input: FineScheduleInput,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }

  const { data, error } = await supabase.rpc("manager_set_fine_schedule", {
    p_building: buildingId,
    /* Both amounts are nullable in SQL — `null` means "no schedule for this
     * degree", written by REMOVING the key — and the generated Args type says
     * `number`. Cast for the same reason as `p_rule` above. Note `?? null` and
     * NOT `?? undefined`: undefined would let the parameter fall back to its
     * SQL default, and these two have none, so a missing amount would be a
     * different error rather than the removal it means. */
    p_fine_1_cents: (input.fine1Cents ?? null) as unknown as number,
    p_fine_2_cents: (input.fine2Cents ?? null) as unknown as number,
    p_currency: input.currency,
  })
  if (error) return { error: transportError(error) }

  const r = data as unknown as { ok: boolean; error?: string }
  if (!r.ok) return { error: sentenceFor(r.error) }
  return { error: null }
}
