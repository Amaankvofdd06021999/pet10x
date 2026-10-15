"use client"

import { useEffect, useState } from "react"
import { AlertCircle, ChevronRight } from "lucide-react"
import { useMyCompleteness } from "@/lib/data"
import { useAuth } from "@/lib/auth-context"

/**
 * The banner on Home asking for what is still outstanding.
 *
 * It used to tell an owner with no building "Your building needs these to
 * register you", file their home address under building requirements, and fold
 * everything past the first two items into one row that opened only the first
 * gap. Now the heading comes from computeGaps (which knows whether there is a
 * building at all) and every gap is its own row opening the exact place that
 * fixes it — the pet's contacts, vaccinations or documents tab, or the profile.
 */

const DISMISS_KEY = (profileId: string) => `pet10x.missinginfo.dismissed.${profileId}`

export function MissingInfoCard({
  onNavigate,
}: {
  onNavigate?: (screen: string, id?: string, petId?: string, tab?: string) => void
}) {
  const { heading, gaps, isLoading } = useMyCompleteness()
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(false)

  /* Dismissal persists per profile.
   *
   * Previously it was session-only and reappeared on every load, which is what
   * made it feel like an alert. "Hide for now" means hide it — the manager's
   * chase email is the escalation path, not a banner that ignores being
   * closed. Keyed by profile so two accounts on one device do not inherit each
   * other's choice, and re-armed below when the ask changes. */
  const signature = gaps.map((g) => g.key).sort().join("|")

  useEffect(() => {
    if (!user?.id) return
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY(user.id)) === signature)
    } catch {
      setDismissed(false)
    }
  }, [user?.id, signature])

  function dismiss() {
    setDismissed(true)
    if (!user?.id) return
    try {
      // Stores WHAT was dismissed, not just that something was. A new
      // requirement from the building produces a different signature and the
      // banner returns — dismissing today cannot silence tomorrow's ask.
      window.localStorage.setItem(DISMISS_KEY(user.id), signature)
    } catch {
      /* private mode — dismissal is then session-only, which is acceptable */
    }
  }

  if (isLoading || gaps.length === 0 || dismissed) return null

  return (
    <section className="rounded-2xl border border-border bg-warning-soft p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-warning-soft">
          <AlertCircle className="h-5 w-5 text-foreground" />
        </span>
        <p className="min-w-0 flex-1 text-body font-semibold text-foreground">{heading}</p>
        <button
          onClick={dismiss}
          className="-mr-2 flex min-h-[44px] flex-shrink-0 items-center px-2 text-meta font-medium text-muted-foreground"
        >
          Hide for now
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-1.5">
        {gaps.map((gap) => (
          <button
            key={gap.key}
            onClick={() => onNavigate?.(gap.target.screen, gap.target.id, undefined, gap.target.tab)}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-card px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1 text-meta font-semibold text-foreground">{gap.label}</span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </section>
  )
}
