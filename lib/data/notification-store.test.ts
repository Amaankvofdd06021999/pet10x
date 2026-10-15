import { describe, expect, it, vi } from "vitest"
import { createNotificationStore, type NotificationLoad, type ReadableItem } from "./notification-store"

/**
 * The read-state contract: a tap clears the dot immediately, the database is
 * told afterwards, and a refusal puts the dot back. Every surface that shows
 * an unread count reads this one store, so these cases are also the contract
 * for the bells and badges — including whose list it is and which response
 * gets to be it.
 */

const rows = (): ReadableItem[] => [
  { id: "a", read: false },
  { id: "b", read: false },
  { id: "c", read: true },
]

const ok = (data: ReadableItem[] = rows(), profileId: string | null = "alice"): NotificationLoad<ReadableItem> => ({
  data,
  error: null,
  profileId,
})

/** A load the test settles by hand, to control the order responses land in. */
function deferred() {
  let settle!: (v: NotificationLoad<ReadableItem>) => void
  const promise = new Promise<NotificationLoad<ReadableItem>>((r) => (settle = r))
  return { promise, settle }
}

function storeWith(overrides: Partial<Parameters<typeof createNotificationStore<ReadableItem>>[0]> = {}) {
  return createNotificationStore<ReadableItem>({
    load: async () => ok(),
    persistRead: async () => ({ error: null }),
    persistAllRead: async () => ({ error: null }),
    persistSnooze: async () => ({ error: null }),
    persistDismiss: async () => ({ error: null }),
    persistRestore: async () => ({ error: null }),
    ...overrides,
  })
}

const unread = (s: ReturnType<typeof storeWith>) => (s.get() ?? []).filter((n) => !n.read).map((n) => n.id)
const ids = (s: ReturnType<typeof storeWith>) => (s.get() ?? []).map((n) => n.id)

describe("notification store — read state", () => {
  it("loads once however many readers ask", async () => {
    const load = vi.fn(async () => ok())
    const s = storeWith({ load })
    s.ensure()
    s.ensure()
    await s.refresh()
    s.ensure()
    expect(load).toHaveBeenCalledTimes(2) // the ensure, then the explicit refresh
    expect(unread(s)).toEqual(["a", "b"])
  })

  it("marks one read optimistically, before the write settles", async () => {
    let settle!: (v: { error: string | null }) => void
    const s = storeWith({ persistRead: () => new Promise((r) => (settle = r)) })
    await s.refresh()
    const listener = vi.fn()
    s.subscribe(listener)
    const pending = s.markRead("a")
    expect(unread(s)).toEqual(["b"])
    expect(listener).toHaveBeenCalled()
    settle({ error: null })
    expect(await pending).toEqual({ error: null })
    expect(unread(s)).toEqual(["b"])
  })

  it("reverts the row when the write fails, and returns the error", async () => {
    const s = storeWith({ persistRead: async () => ({ error: "denied" }) })
    await s.refresh()
    expect(await s.markRead("a")).toEqual({ error: "denied" })
    expect(unread(s)).toEqual(["a", "b"])
  })

  it("does not write for a row that is already read or unknown", async () => {
    const persistRead = vi.fn(async () => ({ error: null }))
    const s = storeWith({ persistRead })
    await s.refresh()
    await s.markRead("c")
    await s.markRead("zzz")
    expect(persistRead).not.toHaveBeenCalled()
  })

  it("marks all read, and on failure reverts only the rows it flipped", async () => {
    const s = storeWith({ persistAllRead: async () => ({ error: "offline" }) })
    await s.refresh()
    expect(await s.markAllRead()).toEqual({ error: "offline" })
    expect(unread(s)).toEqual(["a", "b"])
    expect(s.get()?.find((n) => n.id === "c")?.read).toBe(true)
  })

  it("marks all read and keeps it when the write succeeds", async () => {
    const persistAllRead = vi.fn(async () => ({ error: null }))
    const s = storeWith({ persistAllRead })
    await s.refresh()
    await s.markAllRead()
    expect(unread(s)).toEqual([])
    await s.markAllRead() // nothing unread → no second write
    expect(persistAllRead).toHaveBeenCalledTimes(1)
  })

  it("a refresh landing mid-write does not put the dot back", async () => {
    let settleWrite!: (v: { error: string | null }) => void
    const s = storeWith({ persistRead: () => new Promise((r) => (settleWrite = r)) })
    await s.refresh()
    const write = s.markRead("a")
    await s.refresh() // the server still says "a" is unread
    expect(unread(s)).toEqual(["b"])
    settleWrite({ error: null })
    await write
    expect(unread(s)).toEqual(["b"])
  })
})

describe("notification store — freshness", () => {
  it("a refresh replaces the list in place, picking up new rows", async () => {
    const load = vi
      .fn<() => Promise<NotificationLoad<ReadableItem>>>()
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok([{ id: "new", read: false }, ...rows()]))
    const s = storeWith({ load })
    await s.refresh()
    const before = s.get()
    const pending = s.refresh()
    expect(s.get()).toBe(before) // no loading flash
    expect(s.isLoading()).toBe(false)
    await pending
    expect(unread(s)).toEqual(["new", "a", "b"])
  })

  it("an errored first load caches nothing, reports the error, and is retried", async () => {
    const load = vi
      .fn<() => Promise<NotificationLoad<ReadableItem>>>()
      .mockResolvedValueOnce({ data: [], error: "boom", profileId: "alice" })
      .mockResolvedValueOnce(ok())
    const s = storeWith({ load })
    await s.refresh()
    expect(s.get()).toBeNull()
    expect(s.error()).toBe("boom")
    s.ensure() // null list → tries again
    await vi.waitFor(() => expect(s.get()).not.toBeNull())
    expect(s.error()).toBeNull()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("an errored refresh keeps this profile's list and reports the error", async () => {
    const load = vi
      .fn<() => Promise<NotificationLoad<ReadableItem>>>()
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce({ data: [], error: "offline", profileId: "alice" })
    const s = storeWith({ load })
    await s.refresh()
    await s.refresh()
    expect(unread(s)).toEqual(["a", "b"])
    expect(s.error()).toBe("offline")
  })

  it("a user lookup failure (no profile) caches nothing", async () => {
    const s = storeWith({ load: async () => ({ data: [], error: "Auth session missing", profileId: null }) })
    await s.refresh()
    expect(s.get()).toBeNull()
    expect(s.error()).toBe("Auth session missing")
  })

  it("a thrown load is an error, not an empty inbox", async () => {
    const s = storeWith({ load: async () => Promise.reject(new Error("network down")) })
    await s.refresh()
    expect(s.get()).toBeNull()
    // A sentence, never the thrown text (lib/data/db-error.ts).
    expect(s.error()).toBe("Couldn't load notifications.")
  })

  it("only the newest of two overlapping refreshes may write", async () => {
    const first = deferred()
    const second = deferred()
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const s = storeWith({ load })
    const p1 = s.refresh()
    const p2 = s.refresh()
    second.settle(ok([{ id: "newest", read: false }]))
    await p2
    first.settle(ok([{ id: "stale", read: false }]))
    await p1
    expect(s.get()?.map((n) => n.id)).toEqual(["newest"])
  })
})

describe("notification store — whose list it is", () => {
  it("drops a load that lands after sign-out", async () => {
    const d = deferred()
    const s = storeWith({ load: () => d.promise })
    const pending = s.refresh()
    s.clear()
    d.settle(ok())
    await pending
    expect(s.get()).toBeNull()
  })

  it("signed out is nothing cached, so the next sign-in loads", async () => {
    const load = vi
      .fn<() => Promise<NotificationLoad<ReadableItem>>>()
      .mockResolvedValueOnce(ok([], null))
      .mockResolvedValueOnce(ok())
    const s = storeWith({ load })
    await s.refresh()
    expect(s.get()).toBeNull()
    s.ensure()
    await vi.waitFor(() => expect(s.profileId()).toBe("alice"))
  })

  it("resetUnless drops another profile's list, and keeps its own", async () => {
    const s = storeWith()
    await s.refresh()
    s.resetUnless("alice")
    expect(s.get()).not.toBeNull()
    s.resetUnless("bob")
    expect(s.get()).toBeNull()
    expect(s.profileId()).toBeNull()
  })

  it("a load for a different profile replaces the list outright", async () => {
    const load = vi
      .fn<() => Promise<NotificationLoad<ReadableItem>>>()
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce({ data: [], error: "offline", profileId: "bob" })
    const s = storeWith({ load })
    await s.refresh()
    await s.refresh() // bob's load failed — alice's list must not be kept for him
    expect(s.get()).toBeNull()
    expect(s.profileId()).toBeNull()
  })
})

describe("notification store — snooze and delete", () => {
  it("a load for another profile drops the previous account's pending deletes", async () => {
    const persistRestore = vi.fn(async () => ({ error: null }))
    const s = storeWith({
      load: (() => {
        let n = 0
        return async () => (n++ === 0 ? ok(rows(), "alice") : ok(rows(), "bob"))
      })(),
      persistDismiss: () => new Promise(() => {}), // alice's delete never settles
      persistRestore,
    })
    await s.refresh()
    void s.dismiss("b")
    expect(ids(s)).toEqual(["a", "c"])
    // A focus refresh for bob lands before the auth context clears the store.
    await s.refresh()
    expect(s.profileId()).toBe("bob")
    expect(ids(s)).toEqual(["a", "b", "c"])
    // Alice's Undo must not put her row into bob's list or write anything.
    expect(await s.restore("b")).toEqual({ error: null })
    expect(persistRestore).not.toHaveBeenCalled()
    expect(ids(s)).toEqual(["a", "b", "c"])
  })

  it("deletes optimistically, before the write settles", async () => {
    let settle!: (v: { error: string | null }) => void
    const persistDismiss = vi.fn(() => new Promise<{ error: string | null }>((r) => (settle = r)))
    const s = storeWith({ persistDismiss })
    await s.refresh()
    const pending = s.dismiss("b")
    expect(ids(s)).toEqual(["a", "c"])
    expect(persistDismiss).toHaveBeenCalledWith("b")
    settle({ error: null })
    expect(await pending).toEqual({ error: null })
    expect(ids(s)).toEqual(["a", "c"])
  })

  it("puts a deleted row back where it was when the write fails", async () => {
    const s = storeWith({ persistDismiss: async () => ({ error: "denied" }) })
    await s.refresh()
    expect(await s.dismiss("b")).toEqual({ error: "denied" })
    expect(ids(s)).toEqual(["a", "b", "c"])
  })

  it("undo restores the row in place and writes the restore", async () => {
    const persistRestore = vi.fn(async () => ({ error: null }))
    const s = storeWith({ persistRestore })
    await s.refresh()
    await s.dismiss("b")
    expect(await s.restore("b")).toEqual({ error: null })
    expect(ids(s)).toEqual(["a", "b", "c"])
    expect(persistRestore).toHaveBeenCalledWith("b")
  })

  it("a refused undo hides the row again and returns the error", async () => {
    const s = storeWith({ persistRestore: async () => ({ error: "offline" }) })
    await s.refresh()
    await s.dismiss("b")
    expect(await s.restore("b")).toEqual({ error: "offline" })
    expect(ids(s)).toEqual(["a", "c"])
  })

  it("a refresh landing mid-delete does not bring the row back", async () => {
    let settle!: (v: { error: string | null }) => void
    const s = storeWith({ persistDismiss: () => new Promise((r) => (settle = r)) })
    await s.refresh()
    const write = s.dismiss("a")
    await s.refresh() // the server has not seen the delete yet
    expect(ids(s)).toEqual(["b", "c"])
    settle({ error: null })
    await write
    expect(ids(s)).toEqual(["b", "c"])
  })

  it("snoozes optimistically and passes the time through", async () => {
    const persistSnooze = vi.fn(async () => ({ error: null }))
    const s = storeWith({ persistSnooze })
    await s.refresh()
    const until = new Date(Date.now() + 3600_000)
    expect(await s.snooze("a", until)).toEqual({ error: null })
    expect(ids(s)).toEqual(["b", "c"])
    expect(persistSnooze).toHaveBeenCalledWith("a", until)
  })

  it("puts a snoozed row back when the write fails", async () => {
    const s = storeWith({ persistSnooze: async () => ({ error: "too far" }) })
    await s.refresh()
    expect(await s.snooze("a", new Date(Date.now() + 3600_000))).toEqual({ error: "too far" })
    expect(ids(s)).toEqual(["a", "b", "c"])
  })

  it("a snoozed row a stale refresh still returns stays hidden until it wakes", async () => {
    let clock = 1_000_000
    const s = storeWith({ now: () => clock })
    await s.refresh()
    await s.snooze("a", new Date(clock + 3600_000))
    await s.refresh() // a response that does not know about the snooze
    expect(ids(s)).toEqual(["b", "c"])
    clock += 3600_000 + 1
    await s.refresh() // awake: the server sends it, and it shows
    expect(ids(s)).toEqual(["a", "b", "c"])
  })

  it("does not write for an unknown row", async () => {
    const persistDismiss = vi.fn(async () => ({ error: null }))
    const persistSnooze = vi.fn(async () => ({ error: null }))
    const s = storeWith({ persistDismiss, persistSnooze })
    await s.refresh()
    await s.dismiss("zzz")
    await s.snooze("zzz", new Date())
    expect(persistDismiss).not.toHaveBeenCalled()
    expect(persistSnooze).not.toHaveBeenCalled()
  })

  it("a delete that settles after sign-out does not touch the next list", async () => {
    let settle!: (v: { error: string | null }) => void
    const s = storeWith({ persistDismiss: () => new Promise((r) => (settle = r)) })
    await s.refresh()
    const write = s.dismiss("a")
    s.clear()
    await s.refresh()
    settle({ error: "denied" })
    await write
    expect(ids(s)).toEqual(["a", "b", "c"]) // the fresh load, untouched by the revert
  })

  it("undo during an unfinished delete waits for it, then restores", async () => {
    const order: string[] = []
    let settle!: (v: { error: string | null }) => void
    const s = storeWith({
      persistDismiss: () =>
        new Promise((r) => (settle = r)).then((v) => {
          order.push("dismiss")
          return v as { error: string | null }
        }),
      persistRestore: async () => {
        order.push("restore")
        return { error: null }
      },
    })
    await s.refresh()
    const del = s.dismiss("a")
    const undo = s.restore("a")
    expect(ids(s)).toEqual(["a", "b", "c"]) // back at once
    settle({ error: null })
    await Promise.all([del, undo])
    expect(order).toEqual(["dismiss", "restore"])
  })

  it("a refresh landing mid-undo does not drop the restored row", async () => {
    let settle!: (v: { error: string | null }) => void
    const load = vi.fn(async () => ok())
    const s = storeWith({ load, persistRestore: () => new Promise((r) => (settle = r)) })
    await s.refresh()
    await s.dismiss("b")
    const undo = s.restore("b")
    // The server has not cleared dismissed_at yet, so its list lacks "b".
    load.mockResolvedValueOnce(ok(rows().filter((n) => n.id !== "b")))
    await s.refresh()
    expect(ids(s)).toEqual(["a", "b", "c"])
    settle({ error: null })
    await undo
    expect(ids(s)).toEqual(["a", "b", "c"])
  })

  it("re-reads the list once after an undo lands", async () => {
    const load = vi.fn(async () => ok())
    const s = storeWith({ load })
    await s.refresh()
    await s.dismiss("b")
    load.mockClear()
    await s.restore("b")
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))
  })

  it("a refused undo does not re-read", async () => {
    const load = vi.fn(async () => ok())
    const s = storeWith({ load, persistRestore: async () => ({ error: "offline" }) })
    await s.refresh()
    await s.dismiss("b")
    load.mockClear()
    await s.restore("b")
    await Promise.resolve()
    expect(load).not.toHaveBeenCalled()
    expect(ids(s)).toEqual(["a", "c"])
  })
})
