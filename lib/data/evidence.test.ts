import { beforeEach, describe, expect, it, vi } from "vitest"

const uploadToSignedUrl = vi.fn()
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }),
}))

import { reportablePetsSigned, uploadEvidence } from "./evidence"

const file = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" })

describe("uploadEvidence", () => {
  beforeEach(() => {
    uploadToSignedUrl.mockReset()
    vi.stubGlobal("fetch", vi.fn())
  })

  it("uploads nothing and reports no error when there are no files", async () => {
    const res = await uploadEvidence("MCR2026", "d", [])
    expect(res).toEqual({ paths: [], error: null })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("returns the paths that uploaded", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ ok: true, uploads: [{ path: "b/d/0.jpg", token: "t" }] }),
    } as Response)
    uploadToSignedUrl.mockResolvedValue({ error: null })
    const res = await uploadEvidence("MCR2026", "d", [file("a.jpg")])
    expect(res).toEqual({ paths: ["b/d/0.jpg"], error: null })
  })

  it("keeps the photos that succeeded when one fails", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({
        ok: true,
        uploads: [
          { path: "b/d/0.jpg", token: "t" },
          { path: "b/d/1.jpg", token: "t" },
        ],
      }),
    } as Response)
    uploadToSignedUrl.mockResolvedValueOnce({ error: new Error("boom") }).mockResolvedValueOnce({ error: null })
    const res = await uploadEvidence("MCR2026", "d", [file("a.jpg"), file("b.jpg")])
    expect(res.paths).toEqual(["b/d/1.jpg"])
    expect(res.error).toBeNull()
  })

  /* The one that strands a written report.
     `fetch` rejects on offline, DNS failure and CORS rather than resolving
     with a bad status, so an unguarded await here propagates out through the
     composer's `void handleSubmit()` and leaves its Submit button disabled
     forever, with the reporter's typed account behind it. */
  it("returns an error instead of throwing when the network is down", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"))
    const res = await uploadEvidence("MCR2026", "d", [file("a.jpg")])
    expect(res.paths).toEqual([])
    expect(res.error).toBe("Couldn't reach the server — check your connection.")
  })

  it("returns an error instead of throwing when the storage client rejects", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ ok: true, uploads: [{ path: "b/d/0.jpg", token: "t" }] }),
    } as Response)
    uploadToSignedUrl.mockRejectedValue(new Error("connection reset"))
    const res = await uploadEvidence("MCR2026", "d", [file("a.jpg")])
    expect(res.paths).toEqual([])
    expect(res.error).toBe("The photos didn't upload.")
  })

  it("surfaces the server's refusal", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ ok: false, error: "That building code isn't recognised." }),
    } as Response)
    const res = await uploadEvidence("NOPE", "d", [file("a.jpg")])
    expect(res.paths).toEqual([])
    expect(res.error).toBe("That building code isn't recognised.")
  })
})

describe("reportablePetsSigned", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
  })

  it("returns the building's pets", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ ok: true, pets: [{ id: "p1", name: "Max", species: "dog", breed: null, photoUrl: null }] }),
    } as Response)
    const res = await reportablePetsSigned("MCR2026")
    expect(res.pets).toHaveLength(1)
    expect(res.error).toBeNull()
  })

  /* A signing outage answers 502. Flattened to an empty list it renders as
     "no registered pets to choose from", which tells someone who could have
     identified the dog that there was nothing to identify. */
  it("distinguishes a failed load from a building with no pets", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ ok: false, error: "Couldn't load pet photos." }),
    } as Response)
    const failed = await reportablePetsSigned("MCR2026")
    expect(failed.pets).toEqual([])
    expect(failed.error).not.toBeNull()

    vi.mocked(fetch).mockResolvedValue({ json: async () => ({ ok: true, pets: [] }) } as Response)
    const empty = await reportablePetsSigned("MCR2026")
    expect(empty.pets).toEqual([])
    expect(empty.error).toBeNull()
  })

  it("returns an error instead of throwing when the network is down", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"))
    const res = await reportablePetsSigned("MCR2026")
    expect(res.pets).toEqual([])
    expect(res.error).not.toBeNull()
  })
})
