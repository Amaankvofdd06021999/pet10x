"use client"

import { CalendarClock, ChevronRight, FileWarning, Pill, Stethoscope, Syringe, X } from "lucide-react"
import type { AiSuggestion, SuggestionKind } from "@/lib/ai/types"

const KIND_ICON: Record<SuggestionKind, typeof Syringe> = {
  vaccination_due: Syringe,
  medication_due: Pill,
  care_adherence: CalendarClock,
  document_missing: FileWarning,
  checkup_due: Stethoscope,
}

const SEVERITY_STYLE = {
  error: { bg: "bg-destructive/10", icon: "text-destructive" },
  warning: { bg: "bg-warning/15", icon: "text-warning-foreground" },
  info: { bg: "bg-info/10", icon: "text-info" },
  success: { bg: "bg-success/10", icon: "text-success" },
} as const

interface SuggestionCardProps {
  suggestion: AiSuggestion
  onAction: (target: string | null) => void
  onDismiss: (id: string) => void
}

/**
 * A nudge on Home.
 *
 * The title comes from a deterministic rule and the body is that same fact
 * rephrased — the model never decided anything here, only how it reads.
 */
export function SuggestionCard({ suggestion, onAction, onDismiss }: SuggestionCardProps) {
  const Icon = KIND_ICON[suggestion.kind] ?? CalendarClock
  const style = SEVERITY_STYLE[suggestion.severity] ?? SEVERITY_STYLE.info

  return (
    <div className="flex gap-3 rounded-2xl border border-border bg-card p-3.5">
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${style.bg}`}>
        <Icon className={`h-4.5 w-4.5 ${style.icon}`} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[14px] font-semibold leading-snug text-foreground">{suggestion.title}</p>
          <button
            onClick={() => onDismiss(suggestion.id)}
            aria-label="Dismiss suggestion"
            className="-mr-1 -mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {suggestion.body && suggestion.body !== suggestion.title && (
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{suggestion.body}</p>
        )}

        {suggestion.actionLabel && (
          <button
            onClick={() => onAction(suggestion.actionTarget)}
            className="mt-1.5 flex items-center gap-0.5 text-[12px] font-semibold text-primary"
          >
            {suggestion.actionLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
