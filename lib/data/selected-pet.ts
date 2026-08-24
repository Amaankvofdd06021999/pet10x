"use client"

/**
 * Pet10x — which pet the owner is currently looking at.
 *
 * Home's goal tiles and the Trackers screen both answer questions about ONE
 * animal ("1 / 3 cups", "Thyroid tablet — done"). A schedule aggregates across
 * a household; a goal never does — "2 / 4 cans" across two cats is true when
 * one ate everything and the other ate nothing. So both surfaces need the same
 * answer to "which pet", and if they hold it separately they will disagree:
 * you would pick Lola on Home, open Trackers, and be shown Buddy.
 *
 * One module-level store, mirrored to localStorage, keyed by profile. Same
 * shape as the shared pets cache in `live.ts` (subscriber set + notify), same
 * per-profile storage-key pattern as `missing-info-card.tsx`.
 */

import { useCallback, useEffect, useReducer } from "react"
import { usePets } from "./live"
import type { Pet } from "./types"

const KEY_PREFIX = "pet10x.selectedpet."
const storageKey = (profileId: string) => `${KEY_PREFIX}${profileId}`

/**
 * The whole rule, stated positively:
 *
 *   The selected pet is the stored id IF AND ONLY IF that id names a pet in
 *   the current list. Otherwise it is pets[0]. With no pets it is undefined.
 *
 * Written as one predicate rather than a list of guards ("if deleted…", "if
 * signed out…") because that list is where the dangling-id bugs get in. This
 * single sentence already answers every lifecycle:
 *
 *   - a pet is ADDED   → the stored id is still in the list → selection holds,
 *                        so adding a second cat does not silently move your
 *                        goals to it
 *   - the selected pet is SOFT-DELETED → it leaves usePets → the stored id
 *                        names nothing → pets[0]
 *   - another ACCOUNT signs in → different storage key → no bleed
 *   - NOTHING stored (first run, or a private-mode browser that threw on
 *                        write) → pets[0], which is what Home did before
 *
 * Pure on purpose: no React, no window, no localStorage. vitest here runs
 * `environment: "node"` with no jsdom, so a pure function is the only kind
 * this repo can actually test.
 */
export function resolveSelectedPet(storedId: string | null, pets: Pet[]): Pet | undefined {
  const stored = storedId ? pets.find((p) => p.id === storedId) : undefined
  return stored ?? pets[0]
}

/* ----------------------------- the store -------------------------------- */

/** Session-only mirror. Survives navigation even when localStorage throws. */
const selection = new Map<string, string>()
const subs = new Set<() => void>()

function notify() {
  subs.forEach((fn) => fn())
}

/**
 * Every read and write is wrapped: Safari private mode throws on
 * `localStorage.setItem`, and a picker that crashes the home screen is a far
 * worse outcome than one that forgets your choice when the tab closes.
 */
function readStored(profileId: string): string | null {
  const cached = selection.get(profileId)
  if (cached) return cached
  try {
    const raw = window.localStorage.getItem(storageKey(profileId))
    if (raw) selection.set(profileId, raw)
    return raw
  } catch {
    return null
  }
}

function writeStored(profileId: string, petId: string) {
  if (selection.get(profileId) === petId) return
  selection.set(profileId, petId)
  try {
    window.localStorage.setItem(storageKey(profileId), petId)
  } catch {
    /* Session-only from here. The in-memory map above still holds it. */
  }
  notify()
}

/**
 * Forget the selection — called on sign-out beside `clearPetsCache()`.
 *
 * The key already carries the profile id, so a second account on the device
 * could never have read the first one's choice. This is about not leaving the
 * previous person's pet named in storage on a shared device.
 */
export function clearSelectedPet() {
  selection.clear()
  try {
    const doomed: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k?.startsWith(KEY_PREFIX)) doomed.push(k)
    }
    doomed.forEach((k) => window.localStorage.removeItem(k))
  } catch {
    /* Nothing was persisted; the in-memory clear above is the whole job. */
  }
  notify()
}

export interface SelectedPetResult {
  pet: Pet | undefined
  petId: string | undefined
  select: (id: string) => void
}

/**
 * The shared selection.
 *
 * Keyed on `pets[0].ownerId` rather than on `useAuth()`: it is the same
 * profile id, and reaching for the auth context here would close an import
 * cycle, since `auth-context` already imports this module's neighbours from
 * `lib/data`.
 */
export function useSelectedPet(): SelectedPetResult {
  const { data: pets } = usePets()
  const [, force] = useReducer((c: number) => c + 1, 0)

  useEffect(() => {
    subs.add(force)
    return () => {
      subs.delete(force)
    }
  }, [])

  const profileId = pets[0]?.ownerId
  const stored = profileId ? readStored(profileId) : null
  const pet = resolveSelectedPet(stored, pets)

  /* Self-heal.
   *
   * When the resolved pet is not the stored id — a soft delete left a dangling
   * id, or nothing was stored at all — write the resolved id back, so the next
   * render reads a value that is true rather than retrying the same dead id
   * forever. In an effect, not in render: this writes and notifies. It cannot
   * loop, because after the write `stored === pet.id` and the condition below
   * is false. */
  useEffect(() => {
    if (profileId && pet && pet.id !== stored) writeStored(profileId, pet.id)
  }, [profileId, pet, stored])

  const select = useCallback(
    (id: string) => {
      if (profileId) writeStored(profileId, id)
    },
    [profileId],
  )

  return { pet, petId: pet?.id, select }
}
