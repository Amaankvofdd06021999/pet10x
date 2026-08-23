import { describe, expect, it } from "vitest"
import { ageEligible, unclaimed, uploadedAt, CLAIMABLE_PATH } from "./evidence-purge"

const B = "b41968f8-f45c-4a2b-a644-e94311100faf"
const D = "3b1b4287-56bc-4b20-bd07-3da7e2811633"
const p = (name: string) => `${B}/${D}/${name}`

const NOW = Date.UTC(2026, 7, 23, 4, 0, 0)
const DAY = 24 * 60 * 60 * 1000
const cutoff = NOW - DAY
const at = (ms: number) => new Date(ms).toISOString()

describe("ageEligible", () => {
  it("keeps an object uploaded inside the last 24 hours", () => {
    const out = ageEligible([{ path: p("0-1.jpg"), createdAt: at(NOW - 20 * 60 * 1000) }], cutoff)
    expect(out.candidates).toEqual([])
    expect(out.tooYoung).toBe(1)
  })

  it("selects an object older than 24 hours", () => {
    const out = ageEligible([{ path: p("0-1.jpg"), createdAt: at(NOW - 2 * DAY) }], cutoff)
    expect(out.candidates).toEqual([p("0-1.jpg")])
    expect(out.tooYoung).toBe(0)
  })

  it("treats the cutoff instant itself as old enough, and a millisecond later as too young", () => {
    expect(ageEligible([{ path: p("a.jpg"), createdAt: at(cutoff) }], cutoff).candidates).toHaveLength(1)
    expect(ageEligible([{ path: p("a.jpg"), createdAt: at(cutoff + 1) }], cutoff).tooYoung).toBe(1)
  })

  it("partitions a mixed listing by age alone", () => {
    const out = ageEligible(
      [
        { path: p("old-a.jpg"), createdAt: at(NOW - 3 * DAY) },
        { path: p("old-b.jpg"), createdAt: at(NOW - 2 * DAY) },
        { path: p("fresh.jpg"), createdAt: at(NOW - 60 * 1000) },
      ],
      cutoff,
    )
    expect(out.candidates).toEqual([p("old-a.jpg"), p("old-b.jpg")])
    expect(out.tooYoung).toBe(1)
  })

  it("spares an object whose age cannot be read, and counts it apart from the young ones", () => {
    const out = ageEligible(
      [
        { path: p("null.jpg"), createdAt: null },
        { path: p("junk.jpg"), createdAt: "not a date" },
        { path: p("fresh.jpg"), createdAt: at(NOW - 60 * 1000) },
      ],
      cutoff,
    )
    expect(out.candidates).toEqual([])
    expect(out.undated).toBe(2)
    expect(out.tooYoung).toBe(1)
  })

  it("never sends a path that cannot be safely serialised to the claim query", () => {
    // A comma or brace would be split by postgrest's unquoted `ov.{…}` operand,
    // fail to match the row claiming it, and be deleted as unclaimed.
    const hostile = [
      `${B}/${D}/a,b.jpg`,
      `${B}/${D}/a{b}.jpg`,
      `${B}/${D}/a"b.jpg`,
      `${B}/${D}/a b.jpg`,
      `${B}/${D}/a\\b.jpg`,
      `${B}/${D}/.hidden.jpg`,
      `${B}/${D}/../escape.jpg`,
      `${B}/nested/${D}/deep.jpg`,
      `${B}/${D}`,
    ].map((path) => ({ path, createdAt: at(NOW - 2 * DAY) }))

    const out = ageEligible(hostile, cutoff)
    expect(out.candidates).toEqual([])
    expect(out.malformed).toHaveLength(hostile.length)
  })

  it("refuses junk prefixed before the first uuid, not just junk inside it", () => {
    // Every hostile path above varies *after* a well-formed first segment, so
    // they all still match a regex that lost its leading `^`. These do not:
    // unanchored, the trailing `{uuid}/{uuid}/name` would match and let a
    // comma through into the `&&` operand — the whole bug this filter stops.
    const prefixed = [
      `a,b/${B}/${D}/x.jpg`,
      `../${B}/${D}/x.jpg`,
      `{evil}/${B}/${D}/x.jpg`,
      `x ${B}/${D}/x.jpg`,
    ]
    for (const path of prefixed) expect(CLAIMABLE_PATH.test(path)).toBe(false)

    const out = ageEligible(
      prefixed.map((path) => ({ path, createdAt: at(NOW - 2 * DAY) })),
      cutoff,
    )
    expect(out.candidates).toEqual([])
    expect(out.malformed).toHaveLength(prefixed.length)
  })

  it("accepts the shape the sign route actually mints", () => {
    expect(CLAIMABLE_PATH.test(p("0-1787468271228.jpg"))).toBe(true)
    expect(CLAIMABLE_PATH.test(p("1-1787468271564.heic"))).toBe(true)
  })
})

describe("unclaimed", () => {
  it("spares a claimed path and removes an unclaimed one", () => {
    const claimed = new Set([p("claimed.jpg")])
    const out = unclaimed([p("claimed.jpg"), p("orphan.jpg")], claimed)
    expect(out.remove).toEqual([p("orphan.jpg")])
    expect(out.spared).toEqual([p("claimed.jpg")])
  })

  it("removes nothing when every path is claimed", () => {
    const paths = [p("a.jpg"), p("b.jpg")]
    expect(unclaimed(paths, new Set(paths)).remove).toEqual([])
  })

  it("matches byte-exactly — a path differing only in case is not the claimed one", () => {
    const out = unclaimed([p("A.jpg")], new Set([p("a.jpg")]))
    expect(out.remove).toEqual([p("A.jpg")])
  })
})

describe("the two guards together", () => {
  const objects = [
    { path: p("old-claimed.jpg"), createdAt: at(NOW - 2 * DAY) },
    { path: p("old-orphan.jpg"), createdAt: at(NOW - 2 * DAY) },
    { path: p("fresh-claimed.jpg"), createdAt: at(NOW - 60 * 1000) },
    { path: p("fresh-orphan.jpg"), createdAt: at(NOW - 60 * 1000) },
  ]
  const claimed = new Set([p("old-claimed.jpg"), p("fresh-claimed.jpg")])

  it("deletes only what fails both guards", () => {
    const { candidates } = ageEligible(objects, cutoff)
    expect(unclaimed(candidates, claimed).remove).toEqual([p("old-orphan.jpg")])
  })

  it("deletes nothing at all when everything is young, however little is claimed", () => {
    const young = objects.map((o) => ({ ...o, createdAt: at(NOW - 60 * 1000) }))
    const { candidates } = ageEligible(young, cutoff)
    expect(candidates).toEqual([])
    expect(unclaimed(candidates, new Set<string>()).remove).toEqual([])
  })

  it("deletes nothing at all when everything is claimed, however old", () => {
    const old = objects.map((o) => ({ ...o, createdAt: at(NOW - 9 * DAY) }))
    const { candidates } = ageEligible(old, cutoff)
    expect(candidates).toHaveLength(4)
    expect(unclaimed(candidates, new Set(candidates)).remove).toEqual([])
  })
})

describe("uploadedAt", () => {
  it("is NaN when storage reported no timestamp", () => {
    expect(Number.isNaN(uploadedAt({ path: p("a.jpg"), createdAt: null }))).toBe(true)
  })
})
