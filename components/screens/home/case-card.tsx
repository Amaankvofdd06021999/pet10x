"use client"

import { Gavel, ChevronRight, ShieldCheck } from "lucide-react"
import { useMyCases } from "@/lib/data/live"
import { useMyBuildingLink } from "@/lib/data"
import { isTerminal, STAGE_LABEL } from "@/lib/data/violations"

/**
 * The resident's bylaw standing, on their own front page.
 *
 * A warning or a fine is the most consequential thing a building sends a
 * resident, and it used to live two taps deep behind Profile. It is now always
 * present for anyone with an approved building link — INCLUDING when there is
 * nothing wrong, because "you have no violations" is itself the answer someone
 * opens this looking for, and a card that only appears when you are in trouble
 * cannot be checked.
 *
 * It is absent only for a resident with no approved link, who cannot have a
 * case at all.
 */
export function CaseCard({ onNavigate }: { onNavigate?: (screen: string, id?: string) => void }) {
  const { data: link } = useMyBuildingLink()
  const { data: cases, isLoading } = useMyCases()

  if (link?.status !== "approved") return null

  if (isLoading) {
    return <div className="mb-4 h-[86px] animate-pulse rounded-2xl bg-secondary" aria-hidden="true" />
  }

  const live = cases.filter((c) => !isTerminal(c.stage))
  const closed = cases.length - live.length

  /* ------------------------------ all clear ------------------------------ */
  if (live.length === 0) {
    return (
      <button
        type="button"
        onClick={() => onNavigate?.("my-cases")}
        className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors active:bg-muted"
      >
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-success/12">
          <ShieldCheck className="h-5 w-5 text-success" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-foreground">No bylaw violations</span>
          <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
            {closed > 0
              ? `Nothing open with ${link.buildingName}. ${closed} closed ${closed === 1 ? "case" : "cases"} on file.`
              : `Nothing open with ${link.buildingName}.`}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    )
  }

  /* ------------------------- something to address ------------------------ */
  const owed = live.reduce(
    (sum, c) =>
      sum +
      c.fines
        .filter((f) => f.status === "issued" || f.status === "partially_paid" || f.status === "disputed")
        .reduce((s, f) => s + f.amountCents, 0),
    0,
  )
  // An appeal is open while a dispute on the case has no outcome yet — the same
  // predicate dispute_violation refuses a second filing on.
  const appealed = live.filter((c) => c.disputes.some((d) => !d.outcome)).length
  const headline = live[0]

  return (
    <button
      type="button"
      onClick={() => onNavigate?.("my-cases", live.length === 1 ? headline.id : undefined)}
      className="mb-4 flex w-full items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-left transition-colors active:bg-warning/15"
    >
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-warning/20">
        <Gavel className="h-5 w-5 text-warning-strong" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-foreground">
          {live.length === 1
            ? `A bylaw case about ${headline.petName ?? "your pet"}`
            : `${live.length} open bylaw cases`}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted-foreground">
          {live.length === 1
            ? `${headline.type} · ${STAGE_LABEL[headline.stage]}`
            : "Your building has open cases involving your unit."}
          {owed > 0 && (
            <>
              {" · "}
              <span className="font-semibold text-destructive">
                {new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(owed / 100)} owed
              </span>
            </>
          )}
        </span>
        <span className="mt-1 block text-[11.5px] font-medium text-warning-strong">
          {appealed > 0 ? "Your appeal is with the managers" : "Read it, and appeal if you disagree"}
        </span>
      </span>
      <ChevronRight className="mt-1 h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}
