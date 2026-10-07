/**
 * Pet10x — the one copy of the signed-in account's notifications.
 *
 * The home bell, the profile bell, the sidebar badge, the tab bar and the
 * Alerts screen each used to fetch on their own. Reading a notification in
 * Alerts could therefore never clear a badge anywhere else — and nothing read
 * one anyway, because `markNotificationRead` had no caller. Unread state that
 * cannot be cleared is not unread state, it is decoration.
 *
 * Same shape as the shared pets cache in `live.ts` (module-level value,
 * subscriber set, cleared on sign-out). The I/O is injected, so the whole of
 * the behaviour — optimistic mark, revert on failure, which response may
 * write, whose list it is — is a pure object vitest can drive without a
 * database.
 *
 * FOUR RULES, each of which was a defect in the first version:
 *
 *   1. A cached list is not a live one. There is no realtime channel, so the
 *      caller refreshes (Alerts and Home on mount, the window on focus) and
 *      a refresh replaces the list in place without a loading flash.
 *   2. A failure is not an empty inbox. An errored load leaves the list as it
 *      was (null on first load), so `ensure()` tries again and the error is
 *      reported rather than rendered as "You're all caught up".
 *   3. Only the newest request may write. Two refreshes in flight can land in
 *      either order; a sequence number drops the older one.
 *   4. A list belongs to a profile. Every load says whose it is; a list for
 *      a different profile — a session that ended in another tab and a new
 *      one started here — replaces it rather than being shown to them.
 */

export interface ReadableItem {
  id: string
  read: boolean
}

export interface NotificationLoad<T> {
  data: T[]
  error: string | null
  /** Whose notifications these are. Null when nobody is signed in or the
      user could not be resolved — then nothing is cached. */
  profileId: string | null
}

export interface NotificationStoreDeps<T extends ReadableItem> {
  load: () => Promise<NotificationLoad<T>>
  persistRead: (id: string) => Promise<{ error: string | null }>
  persistAllRead: () => Promise<{ error: string | null }>
}

export interface NotificationStore<T extends ReadableItem> {
  /** `null` until a load for a signed-in profile lands (or after `clear`). */
  get: () => T[] | null
  error: () => string | null
  /** True only while the FIRST list is loading — a refresh keeps the old one up. */
  isLoading: () => boolean
  /** The profile the cached list belongs to. */
  profileId: () => string | null
  subscribe: (fn: () => void) => () => void
  /** Load if nothing is loaded and nothing is loading. */
  ensure: () => void
  refresh: () => Promise<void>
  clear: () => void
  /** Drop the list if it was loaded for anyone other than `profileId`. */
  resetUnless: (profileId: string | null) => void
  markRead: (id: string) => Promise<{ error: string | null }>
  markAllRead: () => Promise<{ error: string | null }>
}

export function createNotificationStore<T extends ReadableItem>(
  deps: NotificationStoreDeps<T>,
): NotificationStore<T> {
  let items: T[] | null = null
  let owner: string | null = null
  let error: string | null = null
  let inFlight = 0
  /* Rule 3: every request takes a ticket; only the newest ticket may write. */
  let seq = 0
  /* Bumped by `clear`. A revert that started under one account must not land
     in the next one's list. */
  let epoch = 0
  /* Rows being marked read right now. A refresh that lands before the write
     does would otherwise put the dot straight back. */
  const pending = new Set<string>()
  const subs = new Set<() => void>()

  const notify = () => subs.forEach((fn) => fn())

  const setRead = (ids: Set<string>, read: boolean) => {
    if (!items) return
    items = items.map((n) => (ids.has(n.id) ? { ...n, read } : n))
    notify()
  }

  const clear = () => {
    epoch++
    seq++ // anything in flight is now stale
    items = null
    owner = null
    error = null
    pending.clear()
    notify()
  }

  const refresh = async () => {
    const ticket = ++seq
    inFlight++
    notify()
    try {
      const res = await deps.load()
      if (ticket !== seq) return
      if (res.error) {
        // Rule 2: keep what we had — but only if it is this profile's.
        if (res.profileId === null || res.profileId !== owner) {
          items = null
          owner = null
        }
        error = res.error
      } else if (res.profileId === null) {
        // Signed out: nothing to show, nothing to cache.
        items = null
        owner = null
        error = null
      } else {
        if (res.profileId !== owner) pending.clear()
        items = res.data.map((n) => (pending.has(n.id) && !n.read ? { ...n, read: true } : n))
        owner = res.profileId
        error = null
      }
    } catch (e) {
      if (ticket !== seq) return
      error = e instanceof Error ? e.message : "Couldn't load notifications."
      items = null
      owner = null
    } finally {
      inFlight--
      notify()
    }
  }

  return {
    get: () => items,
    error: () => error,
    isLoading: () => items === null && inFlight > 0,
    profileId: () => owner,
    subscribe(fn) {
      subs.add(fn)
      return () => {
        subs.delete(fn)
      }
    },
    ensure() {
      if (items === null && inFlight === 0) void refresh()
    },
    refresh,
    clear,
    resetUnless(profileId) {
      if (owner !== null && owner !== profileId) clear()
    },
    async markRead(id) {
      const target = items?.find((n) => n.id === id)
      if (!target || target.read) return { error: null }
      const at = epoch
      const ids = new Set([id])
      pending.add(id)
      setRead(ids, true)
      const { error: err } = await deps.persistRead(id)
      if (at !== epoch) return { error: err }
      pending.delete(id)
      if (err) setRead(ids, false)
      return { error: err }
    },
    async markAllRead() {
      /* Only the rows this call actually flips are reverted on failure — a row
         that was already read before stays read. */
      const ids = new Set((items ?? []).filter((n) => !n.read).map((n) => n.id))
      if (ids.size === 0) return { error: null }
      const at = epoch
      ids.forEach((id) => pending.add(id))
      setRead(ids, true)
      const { error: err } = await deps.persistAllRead()
      if (at !== epoch) return { error: err }
      ids.forEach((id) => pending.delete(id))
      if (err) setRead(ids, false)
      return { error: err }
    },
  }
}
