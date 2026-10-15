import { beforeEach, describe, expect, it, vi } from "vitest"

const rpc = vi.fn()
let client: { rpc: typeof rpc } | null = { rpc }
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => client }))

import { fetchEmergencyDirectory } from "./emergency"

const good = {
  valid: true,
  expires_at: "2026-10-15T00:00:00Z",
  building: { name: "Maple Court", address: null },
  totals: { total: 1, dogs: 1, cats: 0, other: 0 },
  floors: [],
}

describe("fetchEmergencyDirectory", () => {
  beforeEach(() => {
    rpc.mockReset()
    client = { rpc }
  })

  it("maps the server's valid:false to denied — a bad token, whatever the reason", async () => {
    rpc.mockResolvedValue({ data: { valid: false }, error: null })
    expect(await fetchEmergencyDirectory("t")).toEqual({ kind: "denied" })
  })

  it("maps a valid answer to the directory", async () => {
    rpc.mockResolvedValue({ data: good, error: null })
    const res = await fetchEmergencyDirectory("t")
    expect(res).toEqual({
      kind: "valid",
      data: { valid: true, expiresAt: good.expires_at, building: good.building, totals: good.totals, floors: [] },
    })
  })

  it("reads an RPC error as network, never denied: the link may be fine", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } })
    expect(await fetchEmergencyDirectory("t")).toEqual({ kind: "network" })
  })

  it("reads a thrown call as network", async () => {
    rpc.mockRejectedValue(new Error("Failed to fetch"))
    expect(await fetchEmergencyDirectory("t")).toEqual({ kind: "network" })
  })

  it("reads an empty answer as network", async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await fetchEmergencyDirectory("t")).toEqual({ kind: "network" })
  })

  it("reads valid:true missing the fields it renders as network, not a broken page", async () => {
    rpc.mockResolvedValue({ data: { valid: true }, error: null })
    expect(await fetchEmergencyDirectory("t")).toEqual({ kind: "network" })
  })

  it("reads no client as network", async () => {
    client = null
    expect(await fetchEmergencyDirectory("t")).toEqual({ kind: "network" })
  })
})
