/**
 * "A care entry for this pet just changed" — so every read of it can re-read.
 *
 * Home's goal tiles read a pet's entries once (`usePetCareToday`), and the
 * schedule strip above them is a different component: ticking "Breakfast"
 * there logs a food entry through `setCareTaskDone`, and the Food tile used to
 * keep saying "Not yet" until Home was left and reopened. The writers announce
 * here; the read listens and calls its own `refetch`.
 *
 * Pure (no React, no Supabase) so vitest can drive it.
 */

type Listener = () => void

const listeners = new Map<Listener, string>()

/** Listen for changes to one pet's entries. Returns the unsubscribe. */
export function onCareLogged(petId: string, fn: Listener): () => void {
  listeners.set(fn, petId)
  return () => {
    listeners.delete(fn)
  }
}

/** Announce a change. `undefined` when the writer only knows the entry id
    (a delete), which tells every listener rather than guessing. */
export function careLogged(petId: string | undefined): void {
  listeners.forEach((pet, fn) => {
    if (petId === undefined || pet === petId) fn()
  })
}
