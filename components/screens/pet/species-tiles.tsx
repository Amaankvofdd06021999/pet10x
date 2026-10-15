"use client"

import { Cat, Dog, PawPrint } from "lucide-react"
import type { Species } from "@/lib/data"

/** Three tiles for the common case; "Other" opens the full pet_species list. */
const SPECIES: { id: "dog" | "cat" | "other"; label: string; icon: typeof Dog }[] = [
  { id: "dog", label: "Dog", icon: Dog },
  { id: "cat", label: "Cat", icon: Cat },
  { id: "other", label: "Other", icon: PawPrint },
]

/**
 * Dog, Cat, Other — shared by Add pet and onboarding's pet step, so the two
 * ask the question the same way.
 *
 * "Other" stays pressed once a specific kind (bird, reptile…) is chosen from
 * the list it reveals, since that kind is still an "other".
 */
export function SpeciesTiles({
  value,
  onChange,
}: {
  value: Species | null
  onChange: (species: Species) => void
}) {
  const tile = value === null ? null : value === "dog" || value === "cat" ? value : "other"
  return (
    <div role="group" aria-label="Species" className="mb-5 grid grid-cols-3 gap-2.5">
      {SPECIES.map((s) => {
        const Icon = s.icon
        const active = tile === s.id
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(s.id)}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all active:scale-[0.97] ${
              active ? "border-primary bg-primary-soft" : "border-border bg-card"
            }`}
          >
            <Icon className={`h-6 w-6 ${active ? "text-primary" : "text-muted-foreground"}`} />
            <span className={`text-meta font-semibold ${active ? "text-foreground" : "text-foreground"}`}>{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}
