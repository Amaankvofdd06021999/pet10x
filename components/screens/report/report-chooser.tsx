"use client"

import { Building2, ChevronRight, Landmark, PawPrint } from "lucide-react"

/**
 * Who is this report for?
 *
 * The two destinations are genuinely different systems with different powers,
 * and picking the wrong one means nothing happens. A strata can fine a
 * resident over barking; it cannot do anything about a stray that bit someone
 * in the park. A city can seize a dangerous animal; it will not act on a
 * neighbour's litter tray. Saying which is which up front is the whole job of
 * this screen.
 */
export function ReportChooser({
  onBuilding,
  onMunicipal,
  buildingName,
}: {
  onBuilding: () => void
  onMunicipal: () => void
  /** Present when the reporter is a linked resident — they skip the code step. */
  buildingName?: string | null
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-5 py-8">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <PawPrint className="h-7 w-7 text-primary" />
      </div>
      <h1 className="mt-5 text-center text-[24px] font-semibold leading-tight text-foreground">
        Report an incident
      </h1>
      <p className="mx-auto mt-2 max-w-md text-center text-[14.5px] leading-relaxed text-muted-foreground">
        Two places can act, and they can act on different things. Pick whichever fits.
      </p>

      <div className="mt-7 flex flex-col gap-3">
        <button
          onClick={onBuilding}
          className="flex items-start gap-3.5 rounded-2xl border border-border bg-card p-4 text-left transition-colors active:bg-muted"
        >
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-semibold text-foreground">
              {buildingName ? `My building — ${buildingName}` : "A building manager"}
            </span>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
              Noise, waste, off-leash in common areas, damage, an unregistered pet. Goes to the strata, who
              can warn or fine.
            </span>
            <span className="mt-1.5 block text-[12px] text-muted-foreground">
              {buildingName ? "You're already linked — no code needed." : "You'll need the building code."}
            </span>
          </span>
          <ChevronRight className="mt-3 h-5 w-5 flex-shrink-0 text-muted-foreground" />
        </button>

        <button
          onClick={onMunicipal}
          className="flex items-start gap-3.5 rounded-2xl border border-border bg-card p-4 text-left transition-colors active:bg-muted"
        >
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-destructive/10">
            <Landmark className="h-5 w-5 text-destructive" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-semibold text-foreground">Local municipality</span>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
              An animal attacked a pet or a person, is behaving dangerously, or is running loose — anywhere,
              not just in a building.
            </span>
            <span className="mt-1.5 block text-[12px] text-muted-foreground">
              You&apos;ll need a postal code or your location.
            </span>
          </span>
          <ChevronRight className="mt-3 h-5 w-5 flex-shrink-0 text-muted-foreground" />
        </button>
      </div>

      <p className="mt-6 text-center text-[12px] leading-relaxed text-muted-foreground">
        If an animal or a person is in immediate danger, call <span className="font-semibold">911</span>.
        Pet10x is not an emergency service.
      </p>
    </div>
  )
}
