"use client"

import Image from "next/image"
import { Cat, Dog, PawPrint } from "lucide-react"
import type { Pet } from "@/lib/data"

/**
 * A pet's face, at whatever size the caller needs.
 *
 * Shared by the schedule strip and the pet chips rather than written twice.
 * The two surfaces sit inches apart on the same card and a household is meant
 * to recognise the same animal in both; two copies of the placeholder rule is
 * how they would come to disagree about what an unphotographed pet looks like.
 *
 * `pet.image` comes from `usePets()`, whose storage paths have already been
 * signed and cached. `pets.image_url` on its own is a storage PATH — reading
 * it directly from any other query hands this an unsigned string and every
 * avatar 404s. "/placeholder.svg" is what an unphotographed pet carries, and
 * at 20px a species mark identifies better than a grey silhouette.
 */
export function PetAvatar({ pet, size = 20 }: { pet: Pet; size?: number }) {
  const box = { width: size, height: size }

  if (pet.image && pet.image !== "/placeholder.svg") {
    return (
      <span
        style={box}
        className="relative flex-shrink-0 overflow-hidden rounded-full bg-muted"
      >
        <Image src={pet.image} alt="" fill sizes={`${size}px`} className="object-cover" />
      </span>
    )
  }

  const Icon = pet.species === "dog" ? Dog : pet.species === "cat" ? Cat : PawPrint
  return (
    <span
      style={box}
      className="flex flex-shrink-0 items-center justify-center rounded-full bg-primary/10"
    >
      <Icon style={{ width: size * 0.6, height: size * 0.6 }} className="text-primary" />
    </span>
  )
}
