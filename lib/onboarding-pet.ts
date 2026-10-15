import type { Species } from "@/lib/data"

/** What onboarding's done screen shows for a pet. */
export type DonePet = { name: string; species: Species; photo: string | null }

/**
 * An owner who already has a current pet skips onboarding's pet step.
 *
 * Onboarding can run again for an account that finished it once (a failed
 * onboarded flag, a second device before the flag synced). Asking "Tell us
 * about your pet" again added the same pet twice; the done screen shows the
 * one they have instead. Null when they have none, so the step shows.
 */
export function existingPetForDone(
  pets: ReadonlyArray<{ name: string; species: Species; image: string }>,
): DonePet | null {
  const pet = pets[0]
  if (!pet) return null
  // mapPet substitutes the placeholder for a pet with no photo.
  const photo = pet.image && pet.image !== "/placeholder.svg" ? pet.image : null
  return { name: pet.name, species: pet.species, photo }
}
