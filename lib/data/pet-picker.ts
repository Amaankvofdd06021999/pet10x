/**
 * Pet10x — where a "which pet?" row goes.
 *
 * Profile's Pet Profiles row used to open Home, and Documents & Records opened
 * `pet-detail` with no id at all — which `usePet(undefined)` quietly resolves
 * to the oldest pet, so a household of three was always shown the same animal's
 * documents. The rule is now one function with three answers:
 *
 *   no pets   → add one (there is nothing to open)
 *   one pet   → open it (a picker with one option is noise)
 *   several   → ask
 *
 * Pure, so vitest (`environment: "node"`) can hold it to that.
 */

export type PetPick = { kind: "add" } | { kind: "open"; petId: string } | { kind: "choose" }

export function pickPet(pets: readonly { id: string }[]): PetPick {
  if (pets.length === 0) return { kind: "add" }
  if (pets.length === 1) return { kind: "open", petId: pets[0].id }
  return { kind: "choose" }
}
