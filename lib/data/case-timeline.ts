"use client"

import type { Database } from "@/lib/supabase/database.types"
import { useLive, must, type LiveResult } from "./clinic/use-live"

/**
 * One case, in the order it actually happened.
 *
 * The story of a bylaw case is currently spread across four tables — the stage
 * ledger, the notices issued, the appeal, and the fines — and each screen showed
 * one of them. Nobody could answer "was the fine issued before or after they
 * appealed?", which is the first question anyone asks when a case is contested.
 *
 * Everything here carries a real timestamp, not a date, because "the same day"
 * is not an order.
 */

export type CaseEventKind =
  | "opened"
  | "stage"
  | "notice"
  | "fine"
  | "dispute_filed"
  | "dispute_decided"

export interface CaseEvent {
  id: string
  kind: CaseEventKind
  at: string
  title: string
  detail: string | null
  /** Money in CENTS, or null. */
  amountCents: number | null
  tone: "neutral" | "warn" | "bad" | "good" | "info"
}

const STAGE_WORD: Record<string, string> = {
  open: "Case opened",
  warning: "Moved to Warning",
  fine_1: "Moved to First fine",
  fine_2: "Moved to Second fine",
  resolved: "Case resolved",
  dismissed: "Case dismissed",
}

export function useCaseTimeline(violationId: string | null): LiveResult<CaseEvent[]> {
  return useLive<CaseEvent[]>(
    [],
    async (db) => {
      const [violation, events, notices, disputes, fines] = await Promise.all([
        db.from("violations").select("id, created_at, type").eq("id", violationId as string).limit(1),
        db
          .from("violation_events")
          .select("id, from_stage, to_stage, note, created_at")
          .eq("violation_id", violationId as string),
        db
          .from("violation_notices")
          .select("id, kind, title, body, amount_cents, issued_at, visible_to_resident")
          .eq("violation_id", violationId as string),
        db
          .from("violation_disputes")
          .select("id, stage, reason, outcome, decided_note, filed_at, decided_at")
          .eq("violation_id", violationId as string),
        db
          .from("fines")
          .select("id, amount_cents, status, created_at, due_on")
          .eq("violation_id", violationId as string),
      ])

      const out: CaseEvent[] = []

      const v = (must(violation) as Array<{ id: string; created_at: string; type: string }>)[0]
      if (v) {
        out.push({
          id: `open-${v.id}`,
          kind: "opened",
          at: v.created_at,
          title: "Case opened",
          detail: v.type,
          amountCents: null,
          tone: "neutral",
        })
      }

      for (const e of must(events) as Array<
        Database["public"]["Tables"]["violation_events"]["Row"]
      >) {
        // The opening event duplicates the row above; one origin story is enough.
        if (e.from_stage === null) continue
        out.push({
          id: `stage-${e.id}`,
          kind: "stage",
          at: e.created_at,
          title: STAGE_WORD[e.to_stage] ?? `Moved to ${e.to_stage}`,
          detail: e.note,
          amountCents: null,
          tone:
            e.to_stage === "resolved"
              ? "good"
              : e.to_stage === "dismissed"
                ? "neutral"
                : e.to_stage === "warning"
                  ? "warn"
                  : "bad",
        })
      }

      for (const n of must(notices) as Array<
        Database["public"]["Tables"]["violation_notices"]["Row"]
      >) {
        out.push({
          id: `notice-${n.id}`,
          kind: "notice",
          at: n.issued_at,
          title: `${n.title ?? "Notice"} issued${n.visible_to_resident ? "" : " (internal)"}`,
          detail: n.body,
          amountCents: n.amount_cents,
          tone: n.kind.includes("fine") ? "bad" : n.kind === "warning" ? "warn" : "info",
        })
      }

      for (const d of must(disputes) as Array<
        Database["public"]["Tables"]["violation_disputes"]["Row"]
      >) {
        out.push({
          id: `dispute-${d.id}`,
          kind: "dispute_filed",
          at: d.filed_at,
          title: "Resident appealed",
          detail: d.reason,
          amountCents: null,
          tone: "info",
        })
        if (d.decided_at) {
          out.push({
            id: `verdict-${d.id}`,
            kind: "dispute_decided",
            at: d.decided_at,
            title: d.outcome === "upheld" ? "Appeal upheld" : "Appeal overturned",
            detail: d.decided_note,
            amountCents: null,
            tone: d.outcome === "upheld" ? "warn" : "good",
          })
        }
      }

      for (const f of must(fines) as Array<Database["public"]["Tables"]["fines"]["Row"]>) {
        out.push({
          id: `fine-${f.id}`,
          kind: "fine",
          at: f.created_at,
          title: `Fine levied${f.status !== "issued" ? ` — now ${f.status.replace(/_/g, " ")}` : ""}`,
          detail: f.due_on ? `Due ${f.due_on}` : null,
          amountCents: f.amount_cents,
          tone: f.status === "paid" || f.status === "waived" ? "good" : "bad",
        })
      }

      // Oldest first: a history reads forwards, the same order the resident's
      // own case view already uses.
      return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    },
    [violationId],
    Boolean(violationId),
  )
}

export function stampOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d)
}
