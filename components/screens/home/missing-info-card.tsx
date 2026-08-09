"use client"

import { useEffect, useState } from "react"
import { AlertCircle, ChevronRight, X } from "lucide-react"
import { useMyCompleteness, type Gap, type GapId } from "@/lib/data"
import { useAuth } from "@/lib/auth-context"

/**
 * The banner on Home asking for what is still outstanding.
 *
 * Rewritten from listing every gap to asking for the two that actually block
 * registration — the pet and the unit number. The old version opened with
 * "6 things still needed" and a wall of items on first load, which read as an
 * alert rather than a prompt, and was the thing that felt like it fired at
 * you the moment the app opened.
 *
 * Building-imposed requirements (rabies, licence, insurance) still surface,
 * but as a single secondary line rather than as six separate rows — those come
 * from the building's bylaws and are a different kind of ask to "tell us your
 * unit number".
 */

/** The two identity gaps this banner leads with. Everything else is secondary. */
const CORE: GapId[] = ["pet", "unit"]

const DISMISS_KEY = (profileId: string) => `pet10x.missinginfo.dismissed.${profileId}`

export function MissingInfoCard({ onNavigate }: { onNavigate?: (screen: string, id?: string) => void }) {
  const { gaps, isLoading } = useMyCompleteness()
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(false)

  /* Dismissal persists per profile.
   *
   * Previously it was session-only and reappeared on every load, which is what
   * made it feel like an alert. "Remove it from reminders" means remove it —
   * the manager's chase email is the escalation path, not a banner that
   * ignores being closed. Keyed by profile so two accounts on one device do
   * not inherit each other's choice, and re-armed below when the ask changes. */
  const signature = gaps.map((g) => `${g.id}:${g.petId ?? ""}`).sort().join("|")

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

  const core = gaps.filter((g) => CORE.includes(g.id))
  const building = gaps.filter((g) => !CORE.includes(g.id))
  const open = (gap: Gap) => onNavigate?.(gap.target, gap.petId)

  return (
    <section className="rounded-2xl border border-[#B8860B]/25 bg-[#FFF6E0] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#B8860B]/10">
          <AlertCircle className="h-5 w-5 text-[#B8860B]" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground">
            {core.length > 0 ? "Finish setting up" : "Your building needs a few documents"}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {core.length > 0
              ? "Your building needs these to register you."
              : "Add these so your registration can be approved."}
          </p>
        </div>

        {/* Always dismissible now. An item nobody can close is a nag, and the
            resident already gets an email from their manager if it matters. */}
        <button onClick={dismiss} aria-label="Dismiss" className="-mr-1 -mt-1 p-1 text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {core.map((gap) => (
          <button
            key={`${gap.id}:${gap.petId ?? "self"}`}
            onClick={() => open(gap)}
            className="flex items-center gap-2 rounded-xl bg-card px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
              {gap.id === "pet" ? "Add your pet" : "Unit number"}
              {gap.petName && <span className="font-normal text-muted-foreground"> · {gap.petName}</span>}
            </span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          </button>
        ))}

        {/* One row for everything the bylaws require, rather than six. Opens
            the first so there is somewhere to go, and names the rest. */}
        {building.length > 0 && (
          <button
            onClick={() => open(building[0])}
            className="flex items-center gap-2 rounded-xl bg-card px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-foreground">
                {building.length} building requirement{building.length === 1 ? "" : "s"}
              </span>
              <span className="block truncate text-[11.5px] text-muted-foreground">
                {building.map((g) => g.label).join(" · ")}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          </button>
        )}
      </div>
    </section>
  )
}
