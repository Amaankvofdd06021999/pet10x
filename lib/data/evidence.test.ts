import { beforeEach, describe, expect, it, vi } from "vitest"

const uploadToSignedUrl = vi.fn()
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }),
}))

import { uploadEvidence } from "./evidence"

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

  it("surfaces the server's refusal", async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ ok: false, error: "That building code isn't recognised." }),
    } as Response)
    const res = await uploadEvidence("NOPE", "d", [file("a.jpg")])
    expect(res.paths).toEqual([])
    expect(res.error).toBe("That building code isn't recognised.")
  })
})
