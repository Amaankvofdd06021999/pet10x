/**
 * The move of `toCsv` out of `lib/data/portfolio.ts` was supposed to change
 * nothing. This file is what makes that a measured claim rather than an
 * assertion.
 *
 * `toCsvBeforeTheMove` below is the implementation as it stood at 16a9721
 * (`git show 16a9721:lib/data/portfolio.ts`, lines 386-396), pasted in. Every
 * test compares the two implementations on the same input, so a future edit to
 * `lib/csv.ts` that changes escaping — the part with all the sharp edges —
 * fails here by name instead of silently corrupting a strata's board pack.
 *
 * `downloadCsv` is not covered: it is DOM-only, vitest runs `environment:
 * "node"`, and its body is `typeof window === "undefined" ? return : ...`, so
 * under this runner it does nothing observable. Its text is pinned by the
 * byte-diff recorded in the task report instead.
 */

import { describe, it, expect } from "vitest"
import { toCsv } from "./csv"

/* The pre-move original, verbatim. Do not "clean this up" — it is a fixture. */
function toCsvBeforeTheMove(
  rows: Record<string, unknown>[],
  columns: { key: string; label: string }[],
): string {
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map((c) => escape(c.label)).join(",")
  const body = rows.map((row) => columns.map((c) => escape(row[c.key])).join(",")).join("\n")
  return `${header}\n${body}`
}

/** The exact column set `reports-screen.tsx:69-79` passes. */
const PORTFOLIO_COLUMNS = [
  { key: "building", label: "Building" },
  { key: "code", label: "Code" },
  { key: "compliance_pct", label: "Compliance %" },
  { key: "benchmark_vs_median", label: "vs Median (pts)" },
  { key: "pets", label: "Pets" },
  { key: "non_compliant", label: "Non-compliant" },
  { key: "open_violations", label: "Open violations" },
  { key: "resolved_violations", label: "Resolved violations" },
  { key: "fines_outstanding", label: "Fines outstanding ($)" },
]

/** The exact column set `reports-screen.tsx:94-100` passes. */
const BOARD_PACK_COLUMNS = [
  { key: "pet", label: "Pet" },
  { key: "species", label: "Species" },
  { key: "breed", label: "Breed" },
  { key: "compliance_pct", label: "Compliance %" },
  { key: "missing", label: "Missing requirements" },
]

const CASES: { name: string; rows: Record<string, unknown>[]; columns: typeof BOARD_PACK_COLUMNS }[] = [
  { name: "no rows", rows: [], columns: BOARD_PACK_COLUMNS },
  {
    name: "the reports screen's portfolio summary",
    rows: [
      {
        building: "Maple Court Residences",
        code: "MAPLE01",
        compliance_pct: 82,
        benchmark_vs_median: -3,
        pets: 14,
        non_compliant: 3,
        open_violations: 4,
        resolved_violations: 1,
        fines_outstanding: "0.00",
      },
      {
        building: 'The "Wellington", Ltd.',
        code: "WELL01",
        compliance_pct: 100,
        benchmark_vs_median: 15,
        pets: 2,
        non_compliant: 0,
        open_violations: 1,
        resolved_violations: 0,
        fines_outstanding: "200.00",
      },
    ],
    columns: PORTFOLIO_COLUMNS,
  },
  {
    name: "a board pack with every escape trigger",
    rows: [
      { pet: "Comma, Dog", species: "dog", breed: 'A "quoted" breed', compliance_pct: 50, missing: "Licence; Rabies" },
      { pet: "Line\nBreak", species: "cat", breed: "—", compliance_pct: 0, missing: "" },
      { pet: null, species: undefined, breed: 0, compliance_pct: false, missing: ["a", "b"] },
    ],
    columns: BOARD_PACK_COLUMNS,
  },
  {
    name: "a column whose key is absent from every row",
    rows: [{ pet: "Rex" }],
    columns: BOARD_PACK_COLUMNS,
  },
]

describe("toCsv is byte-identical to the pre-move implementation", () => {
  for (const c of CASES) {
    it(c.name, () => {
      expect(toCsv(c.rows, c.columns)).toBe(toCsvBeforeTheMove(c.rows, c.columns))
    })
  }

  it("agrees on 500 randomly generated tables", () => {
    // Deterministic PRNG so a failure is reproducible from the seed alone.
    let seed = 0x2f6e2b1
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    const alphabet = ['a', 'Z', '0', ',', '"', "\n", " ", "—", "'", "\r", "\t"]

    for (let n = 0; n < 500; n++) {
      const width = 1 + Math.floor(rnd() * 4)
      const columns = Array.from({ length: width }, (_, i) => ({
        key: `k${i}`,
        label: Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join(""),
      }))
      const rows = Array.from({ length: Math.floor(rnd() * 4) }, () =>
        Object.fromEntries(
          columns.map((c) => [
            c.key,
            Array.from({ length: Math.floor(rnd() * 6) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join(""),
          ]),
        ),
      )
      expect(toCsv(rows, columns)).toBe(toCsvBeforeTheMove(rows, columns))
    }
  })
})

describe("toCsv, on its own terms", () => {
  it("emits a header even with no rows, and a trailing newline is that empty body", () => {
    expect(toCsv([], [{ key: "a", label: "A" }])).toBe("A\n")
  })

  it("quotes and doubles embedded quotes", () => {
    expect(toCsv([{ a: 'say "hi"' }], [{ key: "a", label: "A" }])).toBe('A\n"say ""hi"""')
  })

  it("renders null and undefined as empty, not as the words", () => {
    expect(toCsv([{ a: null, b: undefined }], [{ key: "a", label: "A" }, { key: "b", label: "B" }])).toBe("A,B\n,")
  })
})
