import { describe, expect, it } from "vitest"
import { groupBulkByBuilding } from "./bulk-approve"

const name = (id: string | null | undefined) => (id === "a" ? "Maple Court" : id === "b" ? "Birch Tower" : "Unknown building")

describe("groupBulkByBuilding", () => {
  it("groups labels under their building, buildings in order of first appearance", () => {
    const items = [
      { buildingId: "b", bulkLabel: "Rex (Sam Lee)" },
      { buildingId: "a", bulkLabel: "Pat Kim, Unit 4B" },
      { buildingId: "b", bulkLabel: "Mo (Ann Ray)" },
    ]
    expect(groupBulkByBuilding(items, name)).toEqual([
      { building: "Birch Tower", labels: ["Rex (Sam Lee)", "Mo (Ann Ray)"] },
      { building: "Maple Court", labels: ["Pat Kim, Unit 4B"] },
    ])
  })
  it("keeps an item with no building under the name the caller gives it", () => {
    expect(groupBulkByBuilding([{ buildingId: null, bulkLabel: "x" }], name)).toEqual([
      { building: "Unknown building", labels: ["x"] },
    ])
  })
  it("is empty for no items", () => {
    expect(groupBulkByBuilding([], name)).toEqual([])
  })
})
