import { describe, expect, it } from "vitest"
import { parseAdminTab } from "./admin-tab"

describe("parseAdminTab", () => {
  it("accepts known tabs only", () => {
    expect(parseAdminTab("activity")).toBe("activity")
    expect(parseAdminTab("municipalities")).toBe("municipalities")
    expect(parseAdminTab("nope")).toBeNull()
    expect(parseAdminTab("")).toBeNull()
    expect(parseAdminTab(null)).toBeNull()
  })
})
