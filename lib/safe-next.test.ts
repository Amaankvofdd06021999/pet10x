import { describe, expect, it } from "vitest"
import { safeNextPath } from "./safe-next"

const ORIGIN = "https://www.pet10x.com"

describe("safeNextPath", () => {
  it("keeps a same-origin path with its query and hash", () => {
    expect(safeNextPath("/app?target=x", ORIGIN)).toBe("/app?target=x")
    expect(safeNextPath("/app?target=my-vets%3Abills#top", ORIGIN)).toBe("/app?target=my-vets%3Abills#top")
    expect(safeNextPath("/businessaccess", ORIGIN)).toBe("/businessaccess")
  })

  it("refuses protocol-relative and backslash forms that resolve to another host", () => {
    expect(safeNextPath("//evil.com", ORIGIN)).toBeNull()
    expect(safeNextPath("/\\evil.com", ORIGIN)).toBeNull()
    // `/%5Cevil.com` after URLSearchParams has decoded it.
    expect(safeNextPath(decodeURIComponent("/%5Cevil.com"), ORIGIN)).toBeNull()
    expect(safeNextPath("\\\\evil.com", ORIGIN)).toBeNull()
  })

  it("refuses tab, newline and other control-character variants (URL parsing strips them)", () => {
    expect(safeNextPath("/\t/evil.com", ORIGIN)).toBeNull()
    expect(safeNextPath("/\n/evil.com", ORIGIN)).toBeNull()
    expect(safeNextPath("/\r\n/evil.com", ORIGIN)).toBeNull()
    expect(safeNextPath("/\u0000/evil.com", ORIGIN)).toBeNull()
  })

  it("refuses absolute URLs and script schemes", () => {
    expect(safeNextPath("https://evil.com", ORIGIN)).toBeNull()
    expect(safeNextPath("https://www.pet10x.com/app", ORIGIN)).toBeNull()
    expect(safeNextPath("javascript:alert(1)", ORIGIN)).toBeNull()
    expect(safeNextPath(" /app", ORIGIN)).toBeNull()
  })

  it("refuses nothing at all", () => {
    expect(safeNextPath(null, ORIGIN)).toBeNull()
    expect(safeNextPath(undefined, ORIGIN)).toBeNull()
    expect(safeNextPath("", ORIGIN)).toBeNull()
  })
})
