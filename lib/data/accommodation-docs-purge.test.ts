import { describe, it, expect } from "vitest"
import {
  classify,
  retentionExpiryMs,
  MIN_AGE_HOURS,
  RETENTION_DAYS,
  type EvidenceObject,
  type PurgeDocument,
  type PurgeRequest,
  type PurgeVerdict,
  redactPath,
  reasonHistogram,
  readAllRows,
  PAGE_ROWS,
  type PageReader,
} from "./accommodation-docs-purge"
import { MS_PER_DAY } from "./accommodations"

const NOW = Date.parse("2027-06-01T12:00:00Z")
const HOUR = 3_600_000
const B = "b41968f8-f45c-4a2b-a644-e94311100faf"
const R1 = "7cb1d59f-c193-4477-88d0-e9a767b303fd"
const R2 = "1a7f1f64-fd8f-4b20-a75d-272d00378e52"

function obj(path: string, agoHours: number): EvidenceObject {
  return { path, createdAt: new Date(NOW - agoHours * HOUR).toISOString() }
}
function doc(id: string, requestId: string, path: string): PurgeDocument {
  return { id, requestId, storagePath: path }
}
const P1 = `${B}/${R1}/esa_letter-1.pdf`
const P2 = `${B}/${R2}/esa_letter-1.pdf`

describe("retentionExpiryMs", () => {
  it("counts 400 days from decided_at", () => {
    const r: PurgeRequest = { id: R1, status: "denied", decidedAt: "2026-01-01T00:00:00Z", withdrawnAt: null }
    expect(retentionExpiryMs(r)).toBe(Date.parse("2026-01-01T00:00:00Z") + RETENTION_DAYS * MS_PER_DAY)
  })
  it("counts from withdrawn_at for a withdrawal", () => {
    const r: PurgeRequest = { id: R1, status: "withdrawn", decidedAt: null, withdrawnAt: "2026-01-01T00:00:00Z" }
    expect(retentionExpiryMs(r)).toBe(Date.parse("2026-01-01T00:00:00Z") + RETENTION_DAYS * MS_PER_DAY)
  })
  it("is NaN for an open request, so nothing can ever compare true against it", () => {
    for (const status of ["draft", "pending", "info_requested"] as const) {
      expect(retentionExpiryMs({ id: R1, status, decidedAt: null, withdrawnAt: null })).toBeNaN()
    }
  })
  it("is NaN for a terminal request with no stamp or an unreadable one", () => {
    expect(retentionExpiryMs({ id: R1, status: "denied", decidedAt: null, withdrawnAt: null })).toBeNaN()
    expect(retentionExpiryMs({ id: R1, status: "denied", decidedAt: "nonsense", withdrawnAt: null })).toBeNaN()
  })
})

describe("classify", () => {
  it("removes an abandoned draft's file once it is 24 hours old", () => {
    const reqs: PurgeRequest[] = [{ id: R1, status: "draft", decidedAt: null, withdrawnAt: null }]
    const docs = [doc("d1", R1, P1)]
    const out = classify([obj(P1, MIN_AGE_HOURS + 1)], reqs, docs, NOW)
    expect(out.remove).toEqual([{ path: P1, reason: "abandoned_draft", documentId: "d1", requestId: R1 }])
  })

  it("keeps a draft's file that is only an hour old — that is a request still being written", () => {
    const reqs: PurgeRequest[] = [{ id: R1, status: "draft", decidedAt: null, withdrawnAt: null }]
    const out = classify([obj(P1, 1)], reqs, [doc("d1", R1, P1)], NOW)
    expect(out.remove).toEqual([])
    expect(out.tooYoung).toBe(1)
  })

  it("removes a decided request's file at 400 days and KEEPS it at 399", () => {
    const at399: PurgeRequest = {
      id: R1,
      status: "denied",
      decidedAt: new Date(NOW - 399 * MS_PER_DAY).toISOString(),
      withdrawnAt: null,
    }
    const at400: PurgeRequest = {
      id: R1,
      status: "denied",
      decidedAt: new Date(NOW - 400 * MS_PER_DAY).toISOString(),
      withdrawnAt: null,
    }
    const docs = [doc("d1", R1, P1)]
    const old = [obj(P1, 500 * 24)]
    expect(classify(old, [at399], docs, NOW).remove).toEqual([])
    expect(classify(old, [at400], docs, NOW).remove).toEqual([
      { path: P1, reason: "retention_expired", documentId: "d1", requestId: R1 },
    ])
  })

  it("applies retention to an APPROVED request too", () => {
    const approved: PurgeRequest = {
      id: R1,
      status: "approved",
      decidedAt: new Date(NOW - 401 * MS_PER_DAY).toISOString(),
      withdrawnAt: null,
    }
    const out = classify([obj(P1, 500 * 24)], [approved], [doc("d1", R1, P1)], NOW)
    expect(out.remove[0]?.reason).toBe("retention_expired")
  })

  it("keeps a request that has been pending for two years — nothing terminal has happened", () => {
    const pending: PurgeRequest = { id: R1, status: "pending", decidedAt: null, withdrawnAt: null }
    const out = classify([obj(P1, 730 * 24)], [pending], [doc("d1", R1, P1)], NOW)
    expect(out.remove).toEqual([])
    expect(out.kept).toEqual([P1])
  })

  it("removes an object no document row names — a deleted account's letter", () => {
    const out = classify([obj(P1, MIN_AGE_HOURS + 1)], [], [], NOW)
    expect(out.remove).toEqual([{ path: P1, reason: "orphan" }])
  })

  it("removes a SUPERSEDED file, whose request is alive and whose row now points elsewhere", () => {
    // The unique index on (request_id, kind) means a re-upload overwrites the
    // row. The old object is then unreferenced while its request is pending —
    // which a "segment 2 matches no request" test would never catch.
    const pending: PurgeRequest = { id: R1, status: "pending", decidedAt: null, withdrawnAt: null }
    const superseded = `${B}/${R1}/esa_letter-old.pdf`
    const out = classify(
      [obj(P1, MIN_AGE_HOURS + 1), obj(superseded, MIN_AGE_HOURS + 1)],
      [pending],
      [doc("d1", R1, P1)],
      NOW,
    )
    expect(out.remove).toEqual([{ path: superseded, reason: "orphan" }])
    expect(out.kept).toEqual([P1])
  })

  it("keeps an orphan younger than the window — an upload between the PUT and the record call", () => {
    const out = classify([obj(P1, 1)], [], [], NOW)
    expect(out.remove).toEqual([])
    expect(out.tooYoung).toBe(1)
  })

  it("keeps every undated object, under every rule", () => {
    const undated: EvidenceObject = { path: P1, createdAt: null }
    const bad: EvidenceObject = { path: P1, createdAt: "not a date" }
    const draft: PurgeRequest = { id: R1, status: "draft", decidedAt: null, withdrawnAt: null }
    const out = classify([undated, bad], [draft], [doc("d1", R1, P1)], NOW)
    expect(out.remove).toEqual([])
    expect(out.undated).toBe(2)
  })

  it("never puts a malformed path in any removal list", () => {
    const traversal = `${B}/${R1}/../evil.pdf`
    const shallow = `${B}/evil.pdf`
    const notUuid = `nope/${R1}/x.pdf`
    const out = classify(
      [obj(traversal, 1000), obj(shallow, 1000), obj(notUuid, 1000)],
      [],
      [],
      NOW,
    )
    expect(out.remove).toEqual([])
    expect(out.malformed.sort()).toEqual([shallow, notUuid, traversal].sort())
  })

  it("keeps a file whose row exists but whose request was not in the set given", () => {
    // "I could not see that request" must never read as "that request is gone".
    const out = classify([obj(P1, 1000)], [], [doc("d1", R1, P1)], NOW)
    expect(out.remove).toEqual([])
    expect(out.kept).toEqual([P1])
  })

  it("the three reasons are disjoint — one object appears exactly once", () => {
    const draft: PurgeRequest = { id: R1, status: "draft", decidedAt: null, withdrawnAt: null }
    const expired: PurgeRequest = {
      id: R2,
      status: "withdrawn",
      decidedAt: null,
      withdrawnAt: new Date(NOW - 401 * MS_PER_DAY).toISOString(),
    }
    const orphan = `${B}/${R1}/orphan.pdf`
    const out = classify(
      [obj(P1, 1000), obj(P2, 1000), obj(orphan, 1000)],
      [draft, expired],
      [doc("d1", R1, P1), doc("d2", R2, P2)],
      NOW,
    )
    expect(out.remove.map((v) => v.path).sort()).toEqual([P1, P2, orphan].sort())
    expect(new Set(out.remove.map((v) => v.reason))).toEqual(
      new Set(["abandoned_draft", "retention_expired", "orphan"]),
    )
    expect(out.remove.length).toBe(3)
  })
})

describe("redactPath — the doc_kind must not reach a log", () => {
  /* The whole point. `esa_letter` is the label 20260827000003 refuses to write
     into audit_log, and a real path carries it in the clear. */
  it("drops the doc_kind and the filename, keeps both ids and the extension", () => {
    expect(redactPath(`${B}/${R1}/esa_letter-1787518255922.pdf`)).toBe(`${B}/${R1}/<file>.pdf`)
    expect(redactPath(`${B}/${R2}/vaccination-1787518454994.png`)).toBe(`${B}/${R2}/<file>.png`)
  })

  it("leaks no substring of the original filename, whatever it was named", () => {
    for (const name of [
      "esa_letter-1.pdf",
      "anxiety-diagnosis-final.PDF",
      "Dr Okonkwo psychiatric assessment.pdf",
      "guide_dog_certification.jpeg",
    ]) {
      const out = redactPath(`${B}/${R1}/${name}`)
      const stem = name.replace(/\.[^.]*$/, "")
      expect(out.includes(stem)).toBe(false)
      expect(out.startsWith(`${B}/${R1}/`)).toBe(true)
    }
  })

  it("lowercases the extension so casing cannot smuggle a name through", () => {
    expect(redactPath(`${B}/${R1}/esa_letter.PDF`)).toBe(`${B}/${R1}/<file>.pdf`)
  })

  it("redacts a bare filename with no folders, which is what a malformed path is", () => {
    expect(redactPath("esa_letter-stray.pdf")).toBe("<file>.pdf")
    expect(redactPath("esa_letter")).toBe("<file>")
  })

  it("treats a dotfile as all name and no extension", () => {
    expect(redactPath(`${B}/${R1}/.esa_letter`)).toBe(`${B}/${R1}/<file>`)
  })

  it("redacts the last segment of a folder path too", () => {
    expect(redactPath(`${B}/${R1}/esa_letter`)).toBe(`${B}/${R1}/<file>`)
  })
})

describe("reasonHistogram", () => {
  const v = (reason: PurgeVerdict["reason"], path: string): PurgeVerdict => ({ path, reason })

  it("counts each reason", () => {
    expect(
      reasonHistogram([v("orphan", "a"), v("orphan", "b"), v("retention_expired", "c")]),
    ).toEqual({ orphan: 2, retention_expired: 1 })
  })

  it("is empty for nothing selected, rather than absent", () => {
    expect(reasonHistogram([])).toEqual({})
  })
})

describe("readAllRows", () => {
  /**
   * PostgREST as it actually behaves: it answers `.range(from, to)` with the
   * rows in that window, TRUNCATED to `db_max_rows` when that is set, with
   * status 200 and no error. `cap` is that setting. The old loop's two
   * assumptions — that a page holds `PAGE_ROWS` unless it is the last one, and
   * that the next offset is the previous one plus `PAGE_ROWS` — are both false
   * the moment `cap < PAGE_ROWS`, and nothing in the response says so.
   */
  function postgrest(total: number, cap: number) {
    const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
    const windows: Array<[number, number]> = []
    const read: PageReader<{ id: number }> = async (from, to) => {
      windows.push([from, to])
      const asked = rows.slice(from, to + 1)
      return { data: asked.slice(0, cap), error: null }
    }
    return { read, windows }
  }

  const ids = (rows: Array<{ id: number }>) => rows.map((r) => r.id)

  it("reads a capped table WHOLE — the case that deleted doctors' letters", async () => {
    // db_max_rows = 500, so every response is 500 rows however wide the window.
    const { read, windows } = postgrest(1300, 500)
    const out = await readAllRows("the document rows", read)
    expect(out.length).toBe(1300)
    expect(ids(out)).toEqual(Array.from({ length: 1300 }, (_, i) => i))
    // Advanced by what came back, not by PAGE_ROWS: 0, 500, 1000, then 1300.
    expect(windows.map(([from]) => from)).toEqual([0, 500, 1000, 1300])
  })

  it("proves the OLD loop stopped on page one against the same server", async () => {
    // The exact shape this replaced: ask for a fixed window, advance by a
    // hardcoded ROWS, stop when a page holds fewer than ROWS.
    async function oldLoop(read: PageReader<{ id: number }>) {
      const out: Array<{ id: number }> = []
      for (let from = 0; ; from += PAGE_ROWS) {
        const { data, error } = await read(from, from + PAGE_ROWS - 1)
        if (error) throw new Error(error.message)
        const page = data ?? []
        out.push(...page)
        if (page.length < PAGE_ROWS) break
      }
      return out
    }
    const { read } = postgrest(1300, 500)
    // 500 < 1000, no error, "that was all of them" — and 800 live doctors'
    // letters are now objects no document row names, which is an orphan.
    expect((await oldLoop(read)).length).toBe(500)
    expect((await readAllRows("the document rows", postgrest(1300, 500).read)).length).toBe(1300)
  })

  it("survives a cap of 1, the pathological end of the same setting", async () => {
    const { read } = postgrest(7, 1)
    expect(ids(await readAllRows("the requests", read))).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it("reads an uncapped table in one page plus the empty one that ends it", async () => {
    const { read, windows } = postgrest(3, PAGE_ROWS)
    expect(ids(await readAllRows("the requests", read))).toEqual([0, 1, 2])
    expect(windows).toEqual([
      [0, PAGE_ROWS - 1],
      [3, 3 + PAGE_ROWS - 1],
    ])
  })

  it("does not mistake an exact multiple of the page for the end of the table", async () => {
    const { read } = postgrest(2 * PAGE_ROWS, PAGE_ROWS)
    expect((await readAllRows("the document rows", read)).length).toBe(2 * PAGE_ROWS)
  })

  it("returns nothing for an empty table without looping", async () => {
    const { read, windows } = postgrest(0, PAGE_ROWS)
    expect(await readAllRows("the requests", read)).toEqual([])
    expect(windows.length).toBe(1)
  })

  it("THROWS on an error rather than reading it as an empty page", async () => {
    const read: PageReader<{ id: number }> = async () => ({ data: null, error: { message: "57014" } })
    await expect(readAllRows("the document rows", read)).rejects.toThrow(
      "Couldn't read the document rows: 57014",
    )
  })

  it("throws on a page that never empties rather than returning a partial set", async () => {
    // A server that ignores `range` entirely. Aborting deletes nothing;
    // returning what it had would have deleted everything past it.
    const read: PageReader<{ id: number }> = async () => ({
      data: Array.from({ length: PAGE_ROWS }, (_, i) => ({ id: i })),
      error: null,
    })
    await expect(readAllRows("the document rows", read)).rejects.toThrow(/without ending/)
  })
})
