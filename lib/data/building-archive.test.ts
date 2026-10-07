import { describe, it, expect } from "vitest"
import { buildingHasHistory, buildingDeleteError, HAS_HISTORY_MESSAGE } from "./building-archive"

describe("buildingHasHistory", () => {
  it("is false only when nothing at all references the building", () => {
    expect(buildingHasHistory(0)).toBe(false)
    expect(buildingHasHistory(1)).toBe(true)
  })

  it("assumes history when the counts are unknown — Delete is the dangerous default", () => {
    expect(buildingHasHistory(undefined)).toBe(true)
  })
})

describe("buildingDeleteError", () => {
  it("turns a foreign-key refusal into the archive advice, never Postgres text", () => {
    const msg = buildingDeleteError({
      code: "23503",
      message: 'update or delete on table "buildings" violates foreign key constraint "fines_building_id_fkey"',
    })
    expect(msg).toBe(HAS_HISTORY_MESSAGE)
    expect(msg).not.toMatch(/constraint|buildings"/)
  })

  it("passes other errors through as they are", () => {
    expect(buildingDeleteError({ code: "42501", message: "permission denied" })).toBe("permission denied")
  })
})
