"use client"

import { Croissant, Footprints, Pill } from "lucide-react"
import { useCareEntries, useCareTargets, type CareEntryKind, type Species } from "@/lib/data"
import { careKindsFor, unitById } from "@/lib/data/care-catalog"

/**
 * The three-up care strip from the design reference.
 *
 * Now reports PROGRESS AGAINST THE TARGET where one is set — "1 / 2 bowls"
 * rather than "Done". "Done" after a single meal was actively misleading for
 * a dog on two: the strip said the day was handled when half of it was.
 * Without a target it falls back to whether anything was logged, which is the
 * most that can honestly be said.
 *
 * The activity tile follows the species: a cat has playtime, not walks.
 */

const ACTIVITY_BY_SPECIES: Partial<Record<Species, CareEntryKind>> = {
  dog: "walk",
  cat: "play",
  bird: "play",
  small_mammal: "play",
  other: "play",
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function CareTile({
  petId,
  species,
  kind,
  label,
  icon: Icon,
  onOpen,
}: {
  petId?: string
  species?: Species
  kind: CareEntryKind
  label: string
  icon: typeof Croissant
  onOpen?: (kind: CareEntryKind) => void
}) {
  const { data: entries } = useCareEntries(petId, kind)
  const { data: allTargets } = useCareTargets(petId)

  const today = entries.filter((e) => new Date(e.loggedAt).getTime() >= startOfToday())
  const loggedTotal = today.reduce((sum, e) => sum + (e.amount ?? 0), 0)

  // Only daily targets. A weekly outing goal says nothing about whether today
  // is complete, and folding it in would make the tile wrong every other day.
  const daily = allTargets.filter((t) => t.kind === kind && t.isActive && t.period === "day")
  const goal = daily.reduce((sum, t) => sum + (t.targetAmount ?? 0), 0)
  const hasTarget = daily.length > 0 && goal > 0

  const met = hasTarget ? loggedTotal >= goal : today.length > 0
  const unit = hasTarget ? unitById(species, kind, daily[0].unit ?? null).label : ""

  const detail = hasTarget
    ? `${+loggedTotal.toFixed(2)} / ${goal}${unit ? ` ${unit}` : ""}`
    : today.length > 1
      ? `${today.length} logged`
      : today.length === 1
        ? "Done"
        : "Not yet"

  return (
    <button
      onClick={() => onOpen?.(kind)}
      aria-label={
        hasTarget
          ? `${label} — ${detail}, target ${met ? "met" : "not met"}. Open tracker.`
          : `${label} — ${met ? "logged today" : "not logged today"}. Open tracker.`
      }
      className="flex flex-col items-center gap-0.5 rounded-xl bg-muted/60 p-3 transition-transform active:scale-[0.97]"
    >
      <Icon className={`mb-0.5 h-5 w-5 ${met ? "text-success" : "text-muted-foreground"}`} />
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <span className={`text-[12px] font-semibold ${met ? "text-success" : "text-muted-foreground"}`}>{detail}</span>
    </button>
  )
}

export function TodayCareTiles({
  petId,
  species,
  onOpen,
}: {
  petId?: string
  species?: Species
  onOpen?: (kind: CareEntryKind) => void
}) {
  // Only kinds this species actually has — a fish tile for Walk was the same
  // class of mistake as offering a goldfish owner a Walk tab.
  const available: string[] = careKindsFor(species).map((k) => k.kind)
  const activity = ACTIVITY_BY_SPECIES[species ?? "other"]

  // CareEntryKind is wider than the catalogue's CareKindId ("other" exists in
  // the enum but is never a tile); compare as strings rather than widen either.
  type Tile = { kind: CareEntryKind; label: string; icon: typeof Croissant }
  const tiles: Tile[] = (
    [
      { kind: "food", label: "Food", icon: Croissant },
      ...(activity && available.includes(activity)
        ? [{ kind: activity, label: activity === "walk" ? "Walk" : "Play", icon: Footprints } as Tile]
        : []),
      { kind: "medicine", label: "Meds", icon: Pill },
    ] as Tile[]
  ).filter((t) => available.includes(t.kind))

  if (tiles.length === 0) return null

  return (
    <div className={`grid gap-3 ${tiles.length === 3 ? "grid-cols-3" : tiles.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
      {tiles.map((t) => (
        <CareTile key={t.kind} petId={petId} species={species} onOpen={onOpen} {...t} />
      ))}
    </div>
  )
}
