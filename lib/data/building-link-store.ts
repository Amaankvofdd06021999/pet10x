/**
 * Pet10x — the one copy of the signed-in resident's building link.
 *
 * Home, its case card, Profile, Add Pet, Building Rules and the accommodation
 * form each called `my_building_link()` on their own, and the app shell
 * remounts screens on navigation — so Home alone asked twice per visit (the
 * screen and CaseCard), and again on every return.
 *
 * Same shape as the pets cache and the notification store in `live.ts`
 * (module-level value, subscriber set, cleared on sign-out). The I/O is
 * injected so vitest can drive the rules without a database:
 *
 *   1. Readers share one request. `ensure()` loads only when nothing is loaded
 *      and nothing is loading, so two components mounting together cost one
 *      RPC.
 *   2. "No link" is an answer and is cached; an error is not. A failed load
 *      leaves nothing cached, so the next reader tries again, and the error is
 *      reported rather than rendered as "Link your building".
 *   3. A write's refresh always wins. `refresh()` always sends a new request
 *      and only the newest may write — a load sent before the resident joined
 *      or left must not land after the one sent after it.
 *   4. A link belongs to a profile. `resetUnless` drops one loaded for anyone
 *      else, and a load in flight across that reset is discarded.
 */

export interface BuildingLinkLoad<T> {
  data: T | null
  error: string | null
  /** Whose link this is. Null when nobody is signed in — then nothing is cached. */
  profileId: string | null
}

export interface BuildingLinkStore<T> {
  get: () => T | null
  error: () => string | null
  /** True until the first answer for this account lands, unless it failed. */
  isLoading: () => boolean
  subscribe: (fn: () => void) => () => void
  /** Load if nothing is loaded and nothing is loading. */
  ensure: () => void
  /** Always re-read; resolves once this read has landed (or been superseded). */
  refresh: () => Promise<void>
  clear: () => void
  /** Drop the link if it was loaded for anyone other than `profileId`.
      True when something was dropped, so the caller can reload. */
  resetUnless: (profileId: string | null) => boolean
}

export function createBuildingLinkStore<T>(deps: { load: () => Promise<BuildingLinkLoad<T>> }): BuildingLinkStore<T> {
  let data: T | null = null
  let loaded = false
  let owner: string | null = null
  let error: string | null = null
  /* The last answer was "nobody is signed in". Not loading — a reader shows
     no link — but not cached either: the next reader asks again. */
  let signedOut = false
  let inFlight = 0
  /* Rule 3: every request takes a ticket; only the newest ticket may write.
     `clear` takes one too, so nothing sent before it can land after it. */
  let seq = 0
  const subs = new Set<() => void>()

  const notify = () => subs.forEach((fn) => fn())

  const clear = () => {
    seq++
    data = null
    loaded = false
    owner = null
    error = null
    signedOut = false
    notify()
  }

  const refresh = async () => {
    const ticket = ++seq
    inFlight++
    try {
      const res = await deps.load()
      if (ticket !== seq) return
      signedOut = false
      if (res.error) {
        data = null
        loaded = false
        owner = null
        error = res.error
      } else if (res.profileId === null) {
        // Signed out: nothing to show, nothing to cache.
        data = null
        loaded = false
        owner = null
        error = null
        signedOut = true
      } else {
        data = res.data
        loaded = true
        owner = res.profileId
        error = null
      }
    } catch (e) {
      if (ticket !== seq) return
      signedOut = false
      console.error("[building-link] load threw", e)
      data = null
      loaded = false
      owner = null
      error = "Couldn't load your building. Try again."
    } finally {
      inFlight--
      notify()
    }
  }

  return {
    get: () => data,
    error: () => error,
    isLoading: () => !loaded && (inFlight > 0 || (error === null && !signedOut)),
    subscribe(fn) {
      subs.add(fn)
      return () => {
        subs.delete(fn)
      }
    },
    ensure() {
      if (!loaded && inFlight === 0) void refresh()
    },
    refresh,
    clear,
    resetUnless(profileId) {
      const stale = (owner !== null && owner !== profileId) || (signedOut && profileId !== null)
      if (stale) clear()
      return stale
    },
  }
}

/**
 * Whether a notification about the resident's link has just arrived.
 *
 * A manager approves, denies or removes a link from their own device, so
 * nothing in this tab writes it. `manager_decide_link` notifies the resident
 * with `action_target = 'link-building'`; when the inbox first shows one we
 * have not seen, the cached link is stale. The first inbox seen only primes
 * the watch — the store loads the link itself, so nothing is stale yet.
 */
export function createLinkDecisionWatch() {
  let primed = false
  const seen = new Set<string>()
  const arrived = (list: { id: string; actionTarget?: string }[]): boolean => {
    let fresh = false
    for (const n of list) {
      if (n.actionTarget !== "link-building" || seen.has(n.id)) continue
      seen.add(n.id)
      if (primed) fresh = true
    }
    primed = true
    return fresh
  }
  return Object.assign(arrived, {
    reset() {
      primed = false
      seen.clear()
    },
  })
}
