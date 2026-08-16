"use client"

import { Cat, Check, ChevronDown, Dog, PawPrint } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { Pet } from "@/lib/data"

interface PetContextSwitcherProps {
  pets: Pet[]
  selectedPetId: string | null
  onSelect: (petId: string | null) => void
}

/**
 * Picks which pet's chart is injected as context.
 *
 * Renders nothing when the owner has one pet or none — with a single pet the
 * answer is already about them, and a picker with one option is noise.
 */
export function PetContextSwitcher({ pets, selectedPetId, onSelect }: PetContextSwitcherProps) {
  if (pets.length < 2) return null

  const selected = pets.find((p) => p.id === selectedPetId) ?? null
  const Icon = selected ? speciesIcon(selected) : PawPrint

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full card-raised px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60">
        <Icon className="h-4 w-4 text-primary" />
        <span className="max-w-[9rem] truncate">{selected ? `About ${selected.name}` : "General question"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        {pets.map((pet) => {
          const PetIcon = speciesIcon(pet)
          return (
            <DropdownMenuItem key={pet.id} onSelect={() => onSelect(pet.id)} className="gap-2">
              <PetIcon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">{pet.name}</span>
              {pet.id === selectedPetId && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuItem onSelect={() => onSelect(null)} className="gap-2">
          <PawPrint className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1">General question</span>
          {selectedPetId === null && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function speciesIcon(pet: Pet) {
  if (pet.species === "dog") return Dog
  if (pet.species === "cat") return Cat
  return PawPrint
}
