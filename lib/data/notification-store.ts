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
 *
 * Snooze and delete (20261018000001) take a row OUT of the list rather than
 * flagging it, the same optimistic way: gone at once, back in its old place
 * if the write is refused, and kept out of any refresh that lands before the
 * server knows — a delete for good, a snooze until the time it was snoozed to,
 * so a row that wakes comes back on the next refresh like a new one.
 */

import { dbErrorMessage } from "@/lib/data/db-error"

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
  persistSnooze: (id: string, until: Date) => Promise<{ error: string | null }>
  persistDismiss: (id: string) => Promise<{ error: string | null }>
  persistRestore: (id: string) => Promise<{ error: string | null }>
  /** The clock a snoozed row wakes by. Injected for the tests. */
  now?: () => number
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
  /** Hide until `until`. Optimistic; the row returns in place if refused. */
  snooze: (id: string, until: Date) => Promise<{ error: string | null }>
  /** Hide for good (the row is kept server-side, so `restore` can undo it). */
  dismiss: (id: string) => Promise<{ error: string | null }>
  /** Undo a `dismiss`. Optimistic; hidden again if refused. */
  restore: (id: string) => Promise<{ error: string | null }>
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
  /* Rows taken out by snooze or delete: id → the time (ms) they may show
     again, Infinity for a delete. A refresh drops them until then. */
  const hidden = new Map<string, number>()
  /* What each hidden row was and where it stood, so a refusal or an Undo
     puts it back in the same place rather than at the top. */
  const removed = new Map<string, { item: T; index: number }>()
  /* A delete still being written. Undo waits for it, so the restore can
     never reach the server first and then be undone by the delete. */
  const dismissing = new Map<string, Promise<unknown>>()
  const now = deps.now ?? Date.now
  const subs = new Set<() => void>()

  const notify = () => subs.forEach((fn) => fn())

  const setRead = (ids: Set<string>, read: boolean) => {
    if (!items) return
    items = items.map((n) => (ids.has(n.id) ? { ...n, read } : n))
    notify()
  }

  const isHidden = (id: string) => {
    const until = hidden.get(id)
    if (until === undefined) return false
    if (until > now()) return true
    hidden.delete(id) // woke up
    removed.delete(id)
    return false
  }

  /** Take a row out of the list. False when there is no such row. */
  const hide = (id: string, until: number) => {
    const index = items?.findIndex((n) => n.id === id) ?? -1
    if (!items || index < 0) return false
    removed.set(id, { item: items[index], index })
    hidden.set(id, until)
    items = items.filter((n) => n.id !== id)
    notify()
    return true
  }

  /** Put a hidden row back where it stood. */
  const unhide = (id: string) => {
    hidden.delete(id)
    const was = removed.get(id)
    removed.delete(id)
    if (was && items && !items.some((n) => n.id === id)) {
      const next = items.slice()
      next.splice(Math.min(was.index, next.length), 0, was.item)
      items = next
    }
    notify()
  }

  const clear = () => {
    epoch++
    seq++ // anything in flight is now stale
    items = null
    owner = null
    error = null
    pending.clear()
    hidden.clear()
    removed.clear()
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
        items = res.data.filter((n) => !isHidden(n.id)).map((n) => (pending.has(n.id) && !n.read ? { ...n, read: true } : n))
        owner = res.profileId
        error = null
      }
    } catch (e) {
      if (ticket !== seq) return
      error = dbErrorMessage(e, "Couldn't load notifications.")
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
    async snooze(id, until) {
      if (!hide(id, until.getTime())) return { error: null }
      const at = epoch
      const { error: err } = await deps.persistSnooze(id, until)
      if (at === epoch && err) unhide(id)
      return { error: err }
    },
    async dismiss(id) {
      if (!hide(id, Infinity)) return { error: null }
      const at = epoch
      const write = deps.persistDismiss(id)
      dismissing.set(id, write)
      const { error: err } = await write.finally(() => {
        if (dismissing.get(id) === write) dismissing.delete(id)
      })
      if (at === epoch && err) unhide(id)
      return { error: err }
    },
    async restore(id) {
      const was = removed.get(id)
      if (!was) return { error: null }
      const at = epoch
      unhide(id)
      const inFlightDelete = dismissing.get(id)
      if (inFlightDelete) {
        const { error: deleteErr } = (await inFlightDelete) as { error: string | null }
        // The delete never landed, so there is nothing to restore.
        if (deleteErr) return { error: null }
      }
      const { error: err } = await deps.persistRestore(id)
      if (at === epoch && err) {
        // Back out the way it went: same row, same place.
        hide(id, Infinity)
        if (removed.has(id)) removed.set(id, was)
      }
      return { error: err }
    },
  }
}
