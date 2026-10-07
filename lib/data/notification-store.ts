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
 * subscriber set, in-flight promise, cleared on sign-out). The I/O is
 * injected, so the whole of the read-state behaviour — optimistic mark,
 * revert on failure — is a pure object vitest can drive without a database.
 */

export interface ReadableItem {
  id: string
  read: boolean
}

export interface NotificationStoreDeps<T extends ReadableItem> {
  load: () => Promise<{ data: T[]; error: string | null }>
  persistRead: (id: string) => Promise<{ error: string | null }>
  persistAllRead: () => Promise<{ error: string | null }>
}

export interface NotificationStore<T extends ReadableItem> {
  /** `null` until the first load lands (or after `clear`). */
  get: () => T[] | null
  error: () => string | null
  subscribe: (fn: () => void) => () => void
  /** Load if nothing is loaded and nothing is loading. */
  ensure: () => void
  refresh: () => Promise<void>
  clear: () => void
  markRead: (id: string) => Promise<{ error: string | null }>
  markAllRead: () => Promise<{ error: string | null }>
}

export function createNotificationStore<T extends ReadableItem>(
  deps: NotificationStoreDeps<T>,
): NotificationStore<T> {
  let items: T[] | null = null
  let error: string | null = null
  let inFlight: Promise<void> | null = null
  /* Bumped by `clear`. A load or a revert that started under the previous
     account must not write into the next one's list — sign-out followed by a
     quick sign-in is exactly when a slow response lands. */
  let generation = 0
  const subs = new Set<() => void>()

  const notify = () => subs.forEach((fn) => fn())

  const setRead = (ids: Set<string>, read: boolean) => {
    if (!items) return
    items = items.map((n) => (ids.has(n.id) ? { ...n, read } : n))
    notify()
  }

  const refresh = () => {
    const gen = generation
    inFlight = deps
      .load()
      .then(({ data, error: err }) => {
        if (gen !== generation) return
        items = err ? [] : data
        error = err
        notify()
      })
      .finally(() => {
        if (gen === generation) inFlight = null
      })
    return inFlight
  }

  return {
    get: () => items,
    error: () => error,
    subscribe(fn) {
      subs.add(fn)
      return () => {
        subs.delete(fn)
      }
    },
    ensure() {
      if (items === null && !inFlight) void refresh()
    },
    refresh,
    clear() {
      generation++
      items = null
      error = null
      inFlight = null
      notify()
    },
    async markRead(id) {
      const target = items?.find((n) => n.id === id)
      if (!target || target.read) return { error: null }
      const gen = generation
      const ids = new Set([id])
      setRead(ids, true)
      const { error: err } = await deps.persistRead(id)
      if (err && gen === generation) setRead(ids, false)
      return { error: err }
    },
    async markAllRead() {
      /* Only the rows this call actually flips are reverted on failure — a row
         that was already read before stays read. */
      const ids = new Set((items ?? []).filter((n) => !n.read).map((n) => n.id))
      if (ids.size === 0) return { error: null }
      const gen = generation
      setRead(ids, true)
      const { error: err } = await deps.persistAllRead()
      if (err && gen === generation) setRead(ids, false)
      return { error: err }
    },
  }
}
