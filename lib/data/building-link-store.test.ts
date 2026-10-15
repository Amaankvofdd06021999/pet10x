import { describe, expect, it, vi } from "vitest"
import { createBuildingLinkStore, createLinkDecisionWatch, type BuildingLinkLoad } from "./building-link-store"

/**
 * The building link is read by Home, its case card, Profile, Add Pet, Building
 * Rules and the accommodation form. Each used to ask `my_building_link()` on
 * its own; these cases are the contract for the one shared copy — one request
 * however many readers, a write's refresh always wins, and a link belongs to
 * the account that loaded it.
 */

type Link = { buildingId: string; status: string }

const approved: Link = { buildingId: "b1", status: "approved" }

const ok = (data: Link | null = approved, profileId: string | null = "alice"): BuildingLinkLoad<Link> => ({
  data,
  error: null,
  profileId,
})

function deferred() {
  let settle!: (v: BuildingLinkLoad<Link>) => void
  const promise = new Promise<BuildingLinkLoad<Link>>((r) => (settle = r))
  return { promise, settle }
}

describe("building link store", () => {
  it("two readers mounting together cause one request", async () => {
    const d = deferred()
    const load = vi.fn(() => d.promise)
    const s = createBuildingLinkStore<Link>({ load })
    s.ensure() // Home
    s.ensure() // CaseCard
    expect(load).toHaveBeenCalledTimes(1)
    d.settle(ok())
    await Promise.resolve()
    await Promise.resolve()
    s.ensure() // a third reader after it landed
    expect(load).toHaveBeenCalledTimes(1)
    expect(s.get()).toEqual(approved)
  })

  it("is loading before the first answer, and not after — even when there is no link", async () => {
    const s = createBuildingLinkStore<Link>({ load: async () => ok(null) })
    expect(s.isLoading()).toBe(true)
    await s.refresh()
    expect(s.isLoading()).toBe(false)
    expect(s.get()).toBeNull()
    // "No link" is an answer: a later reader must not ask again.
    const load = vi.fn(async () => ok(null))
    const t = createBuildingLinkStore<Link>({ load })
    await t.refresh()
    t.ensure()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("a refresh after a write is not swallowed by an older load still in flight", async () => {
    const older = deferred()
    const newer = deferred()
    const load = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const s = createBuildingLinkStore<Link>({ load })
    s.ensure() // mount, before the request was sent
    const after = s.refresh() // the writer's refresh, after the request
    expect(load).toHaveBeenCalledTimes(2)
    newer.settle(ok({ buildingId: "b1", status: "pending" }))
    await after
    older.settle(ok(null)) // lands last, but is older
    await Promise.resolve()
    expect(s.get()).toEqual({ buildingId: "b1", status: "pending" })
  })

  it("tells every subscriber when the link changes", async () => {
    const s = createBuildingLinkStore<Link>({ load: async () => ok() })
    const a = vi.fn()
    const b = vi.fn()
    s.subscribe(a)
    const unsubscribe = s.subscribe(b)
    await s.refresh()
    expect(a).toHaveBeenCalled()
    expect(b).toHaveBeenCalled()
    unsubscribe()
    b.mockClear()
    await s.refresh()
    expect(b).not.toHaveBeenCalled()
  })

  it("an error is reported, not cached as 'no building', and the next reader retries", async () => {
    const load = vi
      .fn<() => Promise<BuildingLinkLoad<Link>>>()
      .mockResolvedValueOnce({ data: null, error: "Couldn't load your building. Try again.", profileId: "alice" })
      .mockResolvedValueOnce(ok())
    const s = createBuildingLinkStore<Link>({ load })
    await s.refresh()
    expect(s.error()).toBe("Couldn't load your building. Try again.")
    expect(s.isLoading()).toBe(false)
    s.ensure()
    expect(load).toHaveBeenCalledTimes(2)
    await Promise.resolve()
    await Promise.resolve()
    expect(s.get()).toEqual(approved)
    expect(s.error()).toBeNull()
  })

  it("a link loaded for another account is dropped, and a load in flight for it never lands", async () => {
    const d = deferred()
    const load = vi.fn().mockResolvedValueOnce(ok()).mockReturnValueOnce(d.promise)
    const s = createBuildingLinkStore<Link>({ load })
    await s.refresh()
    s.resetUnless("alice")
    expect(s.get()).toEqual(approved) // same account: kept
    const stale = s.refresh()
    s.resetUnless("bob")
    expect(s.get()).toBeNull()
    expect(s.isLoading()).toBe(true)
    d.settle(ok())
    await stale
    expect(s.get()).toBeNull() // Alice's answer must not become Bob's link
  })

  it("a reader mounting after a clear is not blocked by the load the clear superseded", async () => {
    const stale = deferred()
    const load = vi.fn().mockReturnValueOnce(stale.promise).mockResolvedValueOnce(ok(null, "bob"))
    const s = createBuildingLinkStore<Link>({ load })
    const first = s.refresh() // Alice's load, in flight
    s.clear() // sign-out
    s.ensure() // the next reader mounts
    expect(load).toHaveBeenCalledTimes(2)
    stale.settle(ok())
    await first
    await Promise.resolve()
    expect(s.get()).toBeNull()
    expect(s.isLoading()).toBe(false)
  })

  it("signed out caches nothing", async () => {
    const load = vi.fn(async () => ok(null, null))
    const s = createBuildingLinkStore<Link>({ load })
    await s.refresh()
    expect(s.get()).toBeNull()
    expect(s.isLoading()).toBe(false)
    s.ensure()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("someone signing in after a signed-out answer is told to reload", async () => {
    const s = createBuildingLinkStore<Link>({ load: async () => ok(null, null) })
    await s.refresh()
    expect(s.resetUnless(null)).toBe(false)
    expect(s.resetUnless("alice")).toBe(true)
    expect(s.isLoading()).toBe(true)
  })
})

describe("link decision watch", () => {
  const n = (id: string, actionTarget?: string) => ({ id, actionTarget })

  it("is false the first time the inbox is seen — the store loads the link itself", () => {
    const arrived = createLinkDecisionWatch()
    expect(arrived([n("1", "link-building")])).toBe(false)
  })

  it("is true once when a link-building notification appears that was not there before", () => {
    const arrived = createLinkDecisionWatch()
    arrived([n("1", "link-building")])
    expect(arrived([n("2", "link-building"), n("1", "link-building")])).toBe(true)
    expect(arrived([n("2", "link-building"), n("1", "link-building")])).toBe(false)
  })

  it("counts an empty first inbox as seen", () => {
    const arrived = createLinkDecisionWatch()
    expect(arrived([])).toBe(false)
    expect(arrived([n("1", "link-building")])).toBe(true)
  })

  it("ignores every other notification", () => {
    const arrived = createLinkDecisionWatch()
    arrived([])
    expect(arrived([n("3", "pet-detail:abc"), n("4")])).toBe(false)
  })

  it("starts over after a reset (another account signed in)", () => {
    const arrived = createLinkDecisionWatch()
    arrived([n("1", "link-building")])
    arrived.reset()
    expect(arrived([n("2", "link-building")])).toBe(false)
  })
})
