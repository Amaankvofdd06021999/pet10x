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
    ...overrides,
  })
}

const unread = (s: ReturnType<typeof storeWith>) => (s.get() ?? []).filter((n) => !n.read).map((n) => n.id)

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
    expect(s.error()).toBe("network down")
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
