"use client"

import { Button } from "@/components/ui/button"
import Image from "next/image"
import { canOptimize } from "@/lib/image-src"
import { Cat, ChevronRight, Dog } from "lucide-react"
import { DialogLayer, DialogTitle } from "@/components/ui/dialog"
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
    // Mounted only while open, so Radix's open is always true; Escape, a tap
    // outside and Cancel all route to onClose.
    <DialogLayer
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      overlayClassName="flex items-end justify-center bg-black/40 sm:items-center"
      className="w-full max-w-md rounded-t-3xl bg-card p-5 shadow-float sm:rounded-3xl"
    >
          <DialogTitle className="text-title font-semibold leading-normal text-foreground">{title}</DialogTitle>
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
                    <Image src={pet.image} alt={pet.name} fill sizes="40px" className="object-cover" unoptimized={!canOptimize(pet.image)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <SpeciesIcon className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate text-body font-semibold text-foreground">{pet.name}</span>
                    </div>
                    <span className="block truncate text-caption text-muted-foreground">{pet.breed || "Pet"}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              )
            })}
          </div>
          <Button variant="secondary" onClick={onClose} className="mt-3 w-full">
            Cancel
          </Button>
    </DialogLayer>
  )
}
