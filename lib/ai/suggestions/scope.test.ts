import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const adminUpdates: Array<{ table: string; patch: unknown; id: unknown }> = []
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      update: (patch: unknown) => ({
        eq: async (_col: string, id: unknown) => {
          adminUpdates.push({ table, patch, id })
          return { error: null }
        },
      }),
    }),
  }),
}))

import { evaluateRules } from "./rules"
import { runSuggestions } from "./run"

/**
 * The nightly job runs with the service role, so RLS no longer keeps one
 * owner's pets out of another owner's run. The only thing that does is each
 * rules query filtering by the pet ids it was handed. These tests record every
 * table a run reads and the `.in("pet_id", …)` it carries.
 */
interface Recorded {
  table: string
  pets: unknown[] | null
  ownerEq: unknown
  written: Array<{ profile_id?: string; pet_id?: string }>
}

function recordingClient(petsByOwner: Record<string, Array<{ id: string; name: string }>>) {
  const log: Recorded[] = []
  const client = {
    from(table: string) {
      const entry: Recorded = { table, pets: null, ownerEq: undefined, written: [] }
      log.push(entry)
      const builder: Record<string, unknown> = {}
      for (const m of ["select", "is", "gte", "lte", "gt", "lt", "order", "limit", "or", "not", "neq"]) {
        builder[m] = () => builder
      }
      builder.eq = (col: string, val: unknown) => {
        if (col === "owner_id") entry.ownerEq = val
        return builder
      }
      builder.upsert = (rows: Array<{ profile_id?: string; pet_id?: string }>) => {
        entry.written.push(...rows)
        return builder
      }
      builder.insert = builder.upsert
      builder.in = (col: string, vals: unknown[]) => {
        if (col === "pet_id") entry.pets = vals
        return builder
      }
      builder.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === "pets"
              ? (petsByOwner[entry.ownerEq as string] ?? [])
              : table === "pet_documents" && entry.pets
                ? // One row per scoped pet that the document rule will turn into a hit.
                  (entry.pets as string[]).map((pet_id) => ({ id: `doc-${pet_id}`, pet_id, kind: "vaccination", name: "Record", status: "missing" }))
                : table === "ai_suggestions" && entry.written.length > 0
                  ? entry.written.map((r, i) => ({ id: `s${i}`, title: "t", body: "b", action_label: null, action_target: null, severity: "info", ...r }))
                  : [],
          error: null,
        })
      return builder
    },
  }
  return { client: client as never, log }
}

const RULE_TABLES = ["care_entries", "pet_activity", "pet_documents", "pet_medications", "pet_vaccinations"]

const A = [
  { id: "a1", name: "Alba" },
  { id: "a2", name: "Ash" },
]
const B = [{ id: "b1", name: "Bruno" }]

describe("suggestion rules are scoped to the owner's pets", () => {
  it("every rules query filters pet_id to exactly the pets it was given", async () => {
    const { client, log } = recordingClient({})
    await evaluateRules(client, A)
    const tables = log.map((e) => e.table)
    expect(tables.length).toBeGreaterThan(0)
    for (const entry of log) {
      expect(entry.pets, `${entry.table} is not scoped by pet_id`).toEqual(["a1", "a2"])
    }
    // Pin the set, so a new rule reading a new table has to come through here.
    expect([...new Set(tables)].sort()).toEqual([...RULE_TABLES].sort())
  })

  it("a run for owner A never mentions owner B's pets", async () => {
    adminUpdates.length = 0
    const { client, log } = recordingClient({ A, B })
    await runSuggestions(client, "A")
    const petsQuery = log.find((e) => e.table === "pets")
    expect(petsQuery?.ownerEq).toBe("A")
    expect(log.filter((e) => RULE_TABLES.includes(e.table)).length).toBeGreaterThan(0)
    for (const entry of log.filter((e) => RULE_TABLES.includes(e.table))) {
      expect(entry.pets).toEqual(["a1", "a2"])
      expect(entry.pets).not.toContain("b1")
    }
    // Whatever it writes belongs to A and to A's pets — and something is written.
    expect(log.flatMap((e) => e.written).length).toBeGreaterThan(0)
    for (const row of log.flatMap((e) => e.written)) {
      expect(row.profile_id).toBe("A")
      if (row.pet_id) expect(["a1", "a2"]).toContain(row.pet_id)
    }
  })

  it("stamps the owner's profile even when nothing was found", async () => {
    adminUpdates.length = 0
    const { client } = recordingClient({ A: [] })
    await runSuggestions(client, "A")
    expect(adminUpdates).toHaveLength(1)
    expect(adminUpdates[0]).toMatchObject({ table: "profiles", id: "A" })
    expect(Object.keys(adminUpdates[0].patch as object)).toEqual(["suggestions_last_run_at"])
  })
})
