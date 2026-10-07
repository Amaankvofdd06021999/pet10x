import { describe, expect, it, vi } from "vitest"
import { createNotificationStore, type ReadableItem } from "./notification-store"

/**
 * The read-state contract: a tap clears the dot immediately, the database is
 * told afterwards, and a refusal puts the dot back. Every surface that shows
 * an unread count reads this one store, so these cases are also the contract
 * for the bells and badges.
 */

const rows = (): ReadableItem[] => [
  { id: "a", read: false },
  { id: "b", read: false },
  { id: "c", read: true },
]

function storeWith(overrides: Partial<Parameters<typeof createNotificationStore<ReadableItem>>[0]> = {}) {
  return createNotificationStore<ReadableItem>({
    load: async () => ({ data: rows(), error: null }),
    persistRead: async () => ({ error: null }),
    persistAllRead: async () => ({ error: null }),
    ...overrides,
  })
}

const unread = (s: ReturnType<typeof storeWith>) => (s.get() ?? []).filter((n) => !n.read).map((n) => n.id)

describe("notification store", () => {
  it("loads once however many readers ask", async () => {
    const load = vi.fn(async () => ({ data: rows(), error: null }))
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

  it("drops a load that lands after sign-out", async () => {
    let settle!: (v: { data: ReadableItem[]; error: string | null }) => void
    const s = storeWith({ load: () => new Promise((r) => (settle = r)) })
    const pending = s.refresh()
    s.clear()
    settle({ data: rows(), error: null })
    await pending
    expect(s.get()).toBeNull()
  })

  it("an error load leaves an empty list and the message", async () => {
    const s = storeWith({ load: async () => ({ data: [], error: "boom" }) })
    await s.refresh()
    expect(s.get()).toEqual([])
    expect(s.error()).toBe("boom")
  })
})
