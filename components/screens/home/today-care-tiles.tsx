"use client"

import { Croissant, Footprints, Pill } from "lucide-react"
import { useCareEntries, type CareEntryKind } from "@/lib/data"

/**
 * The three-up care strip from the design reference.
 *
 * The reference shows "Done / In 1h / Evening", but there is no schedule in
 * the data model to produce those from — CareTarget carries an amount and a
 * unit, never a time. So the layout is taken from the reference and the
 * content is bound to what actually exists: whether that kind of care has
 * been logged today. Inventing "In 1h" would put a reminder on screen that
 * nothing is behind.
 */

const TILES: { kind: CareEntryKind; label: string; icon: typeof Croissant }[] = [
  { kind: "food", label: "Food", icon: Croissant },
  { kind: "walk", label: "Walk", icon: Footprints },
  { kind: "medicine", label: "Meds", icon: Pill },
]

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function CareTile({
  petId,
  kind,
  label,
  icon: Icon,
  onOpen,
}: { petId?: string; onOpen?: (kind: CareEntryKind) => void } & (typeof TILES)[number]) {
  const { data: entries } = useCareEntries(petId, kind)
  const today = entries.filter((e) => new Date(e.loggedAt).getTime() >= startOfToday())
  const done = today.length > 0

  return (
    <button
      onClick={() => onOpen?.(kind)}
      aria-label={`${label} — ${done ? "logged today" : "not logged today"}. Open tracker.`}
      className="flex flex-col items-center gap-0.5 rounded-xl bg-muted/60 p-3 transition-transform active:scale-[0.97]"
    >
      <Icon className={`mb-0.5 h-5 w-5 ${done ? "text-success" : "text-muted-foreground"}`} />
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <span className={`text-[12px] font-semibold ${done ? "text-success" : "text-muted-foreground"}`}>
        {done ? (today.length > 1 ? `${today.length} logged` : "Done") : "Not yet"}
      </span>
    </button>
  )
}

export function TodayCareTiles({
  petId,
  onOpen,
}: {
  petId?: string
  onOpen?: (kind: CareEntryKind) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {TILES.map((t) => (
        <CareTile key={t.kind} petId={petId} onOpen={onOpen} {...t} />
      ))}
    </div>
  )
}
