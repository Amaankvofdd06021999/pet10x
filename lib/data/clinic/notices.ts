"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { useLive, must, readOutcome, sentenceFor, type LiveResult } from "./use-live"

/**
 * What a manager issues on a bylaw case.
 *
 * The ladder still decides what a case IS. A notice is the document the
 * resident receives — a warning, a fine, a strata fine, a letter or a note —
 * and the kinds are a lookup table so the list can grow without a deploy.
 */

export type NoticeKindRow = Database["public"]["Tables"]["violation_notice_kinds"]["Row"]

export interface NoticeKind {
  code: string
  label: string
  description: string | null
  movesCase: boolean
  createsFine: boolean
  requiresAmount: boolean
  requiresBody: boolean
  defaultVisible: boolean
  tone: string
}

export function useNoticeKinds(): LiveResult<NoticeKind[]> {
  return useLive<NoticeKind[]>(
    [],
    async (db) => {
      const rows = must(
        await db.from("violation_notice_kinds").select("*").eq("is_active", true).order("sort_order"),
      ) as NoticeKindRow[]
      return rows.map((r) => ({
        code: r.code,
        label: r.label,
        description: r.description,
        movesCase: r.stage_target !== null,
        createsFine: r.creates_fine,
        requiresAmount: r.requires_amount,
        requiresBody: r.requires_body,
        defaultVisible: r.default_visible,
        tone: r.tone,
      }))
    },
    [],
  )
}

export interface ViolationNotice {
  id: string
  kind: string
  kindLabel: string
  title: string | null
  body: string | null
  amountCents: number | null
  dueOn: string | null
  stageAfter: string | null
  visibleToResident: boolean
  issuedAt: string
}

export function useViolationNotices(violationId: string | null): LiveResult<ViolationNotice[]> {
  return useLive<ViolationNotice[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("violation_notices")
          .select("*, violation_notice_kinds(label)")
          .eq("violation_id", violationId as string)
          .order("issued_at", { ascending: false }),
      ) as Array<
        Database["public"]["Tables"]["violation_notices"]["Row"] & {
          violation_notice_kinds: { label: string } | null
        }
      >
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        kindLabel: r.violation_notice_kinds?.label ?? r.kind,
        title: r.title,
        body: r.body,
        amountCents: r.amount_cents,
        dueOn: r.due_on,
        stageAfter: r.stage_after,
        visibleToResident: r.visible_to_resident,
        issuedAt: r.issued_at,
      }))
    },
    [violationId],
    Boolean(violationId),
  )
}

/**
 * Every notice addressed to ME, across my cases.
 *
 * THE FILTER IS THE POINT. `violation_notices` carries two SELECT policies that
 * OR together — one for the notices on your own case, one for a manager of the
 * building — so RLS alone is NOT a resident-scoped filter. A manager or admin
 * opening the resident surface saw every notice in their building above an
 * empty "no cases against you", because this query asked for "whatever I am
 * allowed to read" instead of "what was sent to me".
 *
 * The inner join on `violations.resident_id` is what makes the question the
 * right one. This is the failure `lib/rbac.ts` warns about in the persona
 * comment, and it is worth the extra clause everywhere the resident surface
 * reads a table a manager can also see.
 */
export function useMyNotices(): LiveResult<Array<ViolationNotice & { violationId: string }>> {
  return useLive<Array<ViolationNotice & { violationId: string }>>(
    [],
    async (db) => {
      const { data: auth } = await db.auth.getUser()
      const uid = auth.user?.id
      if (!uid) return []
      const rows = must(
        await db
          .from("violation_notices")
          .select("*, violation_notice_kinds(label), violations!inner(resident_id)")
          .eq("visible_to_resident", true)
          .eq("violations.resident_id", uid)
          .order("issued_at", { ascending: false })
          .limit(100),
      ) as Array<
        Database["public"]["Tables"]["violation_notices"]["Row"] & {
          violation_notice_kinds: { label: string } | null
        }
      >
      return rows.map((r) => ({
        id: r.id,
        violationId: r.violation_id,
        kind: r.kind,
        kindLabel: r.violation_notice_kinds?.label ?? r.kind,
        title: r.title,
        body: r.body,
        amountCents: r.amount_cents,
        dueOn: r.due_on,
        stageAfter: r.stage_after,
        visibleToResident: r.visible_to_resident,
        issuedAt: r.issued_at,
      }))
    },
    [],
  )
}

export interface IssueNoticeInput {
  violationId: string
  kind: string
  title?: string
  body?: string
  amountCents?: number | null
  dueOn?: string | null
  visibleToResident?: boolean
  notify?: boolean
}

export async function issueNotice(
  input: IssueNoticeInput,
): Promise<{ error: string | null; stage?: string }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("manager_issue_notice", {
    p_violation: input.violationId,
    p_kind: input.kind,
    p_title: input.title ?? undefined,
    p_body: input.body ?? undefined,
    p_amount_cents: input.amountCents ?? undefined,
    p_due_on: input.dueOn ?? undefined,
    p_visible: input.visibleToResident ?? undefined,
    p_notify: input.notify ?? true,
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  if (!out.ok) return { error: noticeSentence(out.error) }
  return { error: null, stage: out.stage as string }
}

function noticeSentence(code: string | undefined): string {
  switch (code) {
    case "amount_required":
      return "This kind of notice needs an amount."
    case "body_required":
      return "Write what the notice says."
    case "warning_first":
      return "A case has to carry a warning before it can carry a fine."
    case "no_further_fine":
      return "This case is already at the last fine step."
    case "unknown_kind":
      return "That notice type is not available."
    case "dispute_open":
      return "An appeal is open on this case. Decide it before issuing anything further."
    default:
      return sentenceFor(code)
  }
}
