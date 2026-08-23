"use client"

import { PetAvatar } from "@/components/screens/home/pet-avatar"
import type { Pet } from "@/lib/data"

/**
 * "Whose goals am I looking at?" — asked explicitly, in one control.
 *
 * A goal is only ever about one animal: "2 / 4 cans" across two cats is true
 * when one ate everything and the other ate nothing. So the tiles below need a
 * pet, and the owner has to be able to see and change which.
 *
 * Rejected: deriving this from the pet rail's scroll position. That rail is
 * `md:grid md:grid-cols-2 md:overflow-visible` and its dots are `md:hidden`,
 * so a scroll handler never fires on desktop and the selection would be frozen
 * at pets[0] at every width above `md` — the same defect being fixed here, at
 * a breakpoint. It is also invisible (the dots say "card 2 of 3", not "these
 * numbers are Mimo's") and a scroll offset is not a value that can be stored.
 *
 * Nothing below two pets. With one pet the answer is already about them, and a
 * picker with one option is noise — the precedent PetContextSwitcher and the
 * pet rail both set.
 *
 * One component, used by Home and by the Trackers screen. Two implementations
 * of one control is how the two surfaces would come to disagree about the
 * selection they are supposed to share.
 */
export function PetChips({
  pets,
  selectedId,
  onSelect,
  className = "",
}: {
  pets: Pet[]
  selectedId?: string
  onSelect: (petId: string) => void
  /* Spacing belongs to the row, not to a wrapper. A caller that wrapped this
     in a `mb-4` div would leave 16px of dead space on every single-pet screen,
     where this renders nothing. */
  className?: string
}) {
  if (pets.length < 2) return null

  return (
    // Scrolls rather than wraps or truncates. Two and three fit on one line at
    // phone width, which is the whole live range; nothing here assumes that.
    <div className={`no-scrollbar flex gap-2 overflow-x-auto ${className}`} role="group" aria-label="Show goals for">
      {pets.map((pet) => {
        const active = pet.id === selectedId
        return (
          <button
            key={pet.id}
            onClick={() => onSelect(pet.id)}
            aria-pressed={active}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
              active ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground"
            }`}
          >
            <PetAvatar pet={pet} size={18} />
            {pet.name}
          </button>
        )
      })}
    </div>
  )
}
