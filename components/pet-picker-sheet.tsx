"use client"

import Image from "next/image"
import { Cat, ChevronRight, Dog } from "lucide-react"
import { Portal } from "@/components/ui/portal"
import type { Pet } from "@/lib/data"

/**
 * "Which pet?" — the one picker every multi-pet destination shares.
 *
 * Only ever opened when `pickPet` (lib/data/pet-picker.ts) answers `choose`;
 * with zero or one pet the caller routes straight through and this never
 * renders. Choosing a row is the whole interaction: there is no confirm step,
 * because picking the wrong pet costs one tap on Back.
 */
export function PetPickerSheet({
  title,
  pets,
  onPick,
  onClose,
}: {
  title: string
  pets: Pet[]
  onPick: (petId: string) => void
  onClose: () => void
}) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 sm:items-center" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="w-full max-w-md rounded-t-3xl bg-card p-5 shadow-float sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-[17px] font-semibold text-foreground">{title}</h3>
          <div className="mt-3 overflow-hidden rounded-2xl border border-border">
            {pets.map((pet, idx) => {
              const SpeciesIcon = pet.species === "dog" ? Dog : Cat
              return (
                <button
                  key={pet.id}
                  onClick={() => onPick(pet.id)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-muted ${
                    idx < pets.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
                    <Image src={pet.image} alt={pet.name} fill className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <SpeciesIcon className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate text-[14px] font-semibold text-foreground">{pet.name}</span>
                    </div>
                    <span className="block truncate text-[11px] text-muted-foreground">{pet.breed || "Pet"}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              )
            })}
          </div>
          <button onClick={onClose} className="mt-3 w-full rounded-xl bg-muted py-3 text-[15px] font-semibold text-foreground">
            Cancel
          </button>
        </div>
      </div>
    </Portal>
  )
}
