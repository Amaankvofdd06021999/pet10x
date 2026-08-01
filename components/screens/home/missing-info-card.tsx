"use client"

import { useState } from "react"
import { AlertCircle, ChevronRight, X } from "lucide-react"
import { useMyCompleteness, type Gap } from "@/lib/data"

/**
 * What this resident still owes their building, on Home.
 *
 * The counterpart to the manager's Incomplete filter — same derivation, so
 * the two views cannot disagree about what is outstanding.
 *
 * Dismissible for the session only, deliberately not persisted. This is not
 * marketing; it is the reason a manager will be chasing them, and it should
 * come back tomorrow if it is still true. Blocking items (phone, unit, no pet)
 * cannot be dismissed at all — without those nothing else can be acted on.
 */
export function MissingInfoCard({ onNavigate }: { onNavigate?: (screen: string, id?: string) => void }) {
  const { gaps, isLoading } = useMyCompleteness()
  const [dismissed, setDismissed] = useState(false)

  if (isLoading || gaps.length === 0) return null

  const blocking = gaps.filter((g) => g.severity === "blocking")
  if (dismissed && blocking.length === 0) return null

  const open = (gap: Gap) => onNavigate?.(gap.target, gap.petId)

  return (
    <section className="rounded-2xl border border-[#B8860B]/25 bg-[#FFF6E0] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#B8860B]/10">
          <AlertCircle className="h-5 w-5 text-[#B8860B]" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground">
            {gaps.length} {gaps.length === 1 ? "thing" : "things"} still needed
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            Your building manager needs these to register you. Each one takes a moment.
          </p>
        </div>

        {blocking.length === 0 && (
          <button
            onClick={() => setDismissed(true)}
            aria-label="Hide until next time"
            className="-mr-1 -mt-1 p-1 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {gaps.slice(0, 4).map((gap) => (
          <button
            key={`${gap.id}:${gap.petId ?? "self"}`}
            onClick={() => open(gap)}
            className="flex items-center gap-2 rounded-xl bg-card px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
              {gap.label}
              {gap.petName && <span className="font-normal text-muted-foreground"> · {gap.petName}</span>}
            </span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          </button>
        ))}
        {gaps.length > 4 && (
          <p className="px-1 text-[11px] text-muted-foreground">+{gaps.length - 4} more</p>
        )}
      </div>
    </section>
  )
}
