import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { dbErrorMessage } from "./db-error"
import { KNOWN_USER_SENTENCES, userError } from "@/lib/user-error"

const FALLBACK = "Couldn't save the service. Try again."

describe("dbErrorMessage", () => {
  let log: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    log = vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => log.mockRestore())

  it("gives the fallback for an error it does not know", () => {
    expect(dbErrorMessage({ code: "XX000", message: "internal error" }, FALLBACK)).toBe(FALLBACK)
    expect(dbErrorMessage(new Error("Failed to fetch"), FALLBACK)).toBe(FALLBACK)
  })

  it("never shows raw constraint or policy text", () => {
    for (const message of [
      'duplicate key value violates unique constraint "business_reviews_booking_id_key"',
      'new row violates row-level security policy for table "service_bookings"',
      'null value in column "name" of relation "services" violates not-null constraint',
    ]) {
      expect(dbErrorMessage({ message }, FALLBACK)).toBe(FALLBACK)
    }
  })

  it("maps the few SQLSTATEs a person can act on", () => {
    expect(dbErrorMessage({ code: "42501", message: 'permission denied for table "x"' }, FALLBACK)).toBe(
      "You don't have access to that.",
    )
    expect(dbErrorMessage({ code: "23505", message: 'duplicate key value violates "x_key"' }, FALLBACK)).toBe(
      "That already exists.",
    )
    expect(dbErrorMessage({ code: "23503", message: 'violates foreign key constraint "y_fkey"' }, FALLBACK)).toBe(
      "That's linked to other records, so it couldn't be changed.",
    )
  })

  it("passes a sentence we wrote through unchanged, whatever its code", () => {
    expect(dbErrorMessage({ code: "22023", message: "That service isn't available to book" }, FALLBACK)).toBe(
      "That service isn't available to book",
    )
    expect(dbErrorMessage(new Error("Please sign in first."), FALLBACK)).toBe("Please sign in first.")
  })

  it("keeps a raised 22023 that is not one of ours behind the fallback", () => {
    expect(dbErrorMessage({ code: "22023", message: "invalid input: p_reason too long" }, FALLBACK)).toBe(FALLBACK)
  })

  it("handles strings, null, undefined and odd shapes", () => {
    expect(dbErrorMessage("Please sign in first.", FALLBACK)).toBe("Please sign in first.")
    expect(dbErrorMessage("relation \"foo\" does not exist", FALLBACK)).toBe(FALLBACK)
    expect(dbErrorMessage(null, FALLBACK)).toBe(FALLBACK)
    expect(dbErrorMessage(undefined, FALLBACK)).toBe(FALLBACK)
    expect(dbErrorMessage({ message: 42 }, FALLBACK)).toBe(FALLBACK)
    expect(dbErrorMessage({ code: 42501 }, FALLBACK)).toBe(FALLBACK)
    expect(dbErrorMessage(12, FALLBACK)).toBe(FALLBACK)
  })

  it("logs the original exactly once", () => {
    const original = { code: "23505", message: "duplicate key" }
    dbErrorMessage(original, FALLBACK)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0]).toContain(original)
  })

  it("lists its own sentences where userError can pass them through", () => {
    for (const s of ["You don't have access to that.", "That already exists."]) {
      expect(KNOWN_USER_SENTENCES.has(s)).toBe(true)
    }
  })

  it("lets a fallback it has handed out pass a later userError or a second dbErrorMessage", () => {
    const fallback = "Couldn't load available times. Try again."
    expect(userError(fallback, "Couldn't load this.")).toBe("Couldn't load this.")
    expect(dbErrorMessage({ message: "boom" }, fallback)).toBe(fallback)
    expect(userError(fallback, "Couldn't load this.")).toBe(fallback)
    expect(dbErrorMessage(new Error(fallback), "Couldn't load this.")).toBe(fallback)
  })

  it("does not remember a fallback that was never handed out", () => {
    expect(userError("Couldn't frobnicate. Try again.", "x")).toBe("x")
  })

  it("keeps a sentence one of our functions or triggers raises, with a full stop", () => {
    expect(dbErrorMessage({ code: "42501", message: "That booking isn't yours" }, FALLBACK)).toBe("That booking isn't yours.")
    expect(dbErrorMessage({ code: "22023", message: "The reason is too long (2000 characters at most)" }, FALLBACK)).toBe(
      "The reason is too long (2000 characters at most).",
    )
    expect(userError("That booking isn't yours.", "x")).toBe("That booking isn't yours.")
  })

  it("does not keep a developer hint, even one we wrote", () => {
    expect(
      dbErrorMessage({ code: "42501", message: "Call manager_advance_violation(p_violation, p_to_stage) instead." }, FALLBACK),
    ).toBe("You don't have access to that.")
  })
})

/**
 * Guard: every dbErrorMessage( call in app/, lib/ and components/ passes a
 * fallback that is fixed text, never one built at runtime (which could carry
 * database wording onto a screen).
 *
 * Limits of this check: it is a regex scan, not a TypeScript parse. The second
 * argument is read up to the first top-level comma or closing paren, so a
 * literal containing a bare "," or ")" inside a template/quote is handled by
 * skipping quoted spans, but exotic nesting is not. Accepted forms: a quoted
 * string literal, a template literal with no ${}, or an identifier declared as
 * a module-level `const NAME = "..."` in the same file. Anything else (a
 * variable from elsewhere, a call, a ternary) fails and should be rewritten.
 */
describe("dbErrorMessage fallbacks", () => {
  const ROOT = process.cwd()
  const SKIP = new Set(["node_modules", ".next", ".git"])

  function files(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) files(p, out)
      else if (/\.tsx?$/.test(e.name)) out.push(p)
    }
    return out
  }

  /** The text of the call's second argument, or null when there is none. */
  function secondArg(src: string, open: number): string | null {
    let depth = 0
    let quote: string | null = null
    let commas = 0
    let start = -1
    for (let i = open; i < src.length; i++) {
      const c = src[i]
      if (quote) {
        if (c === "\\") i++
        else if (c === quote) quote = null
        continue
      }
      if (c === '"' || c === "'" || c === "`") quote = c
      else if (c === "(" || c === "[" || c === "{") depth++
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) return start < 0 ? null : src.slice(start, i).trim()
        depth--
      } else if (c === "," && depth === 0) {
        commas++
        if (commas === 1) start = i + 1
        else return src.slice(start, i).trim()
      }
    }
    return null
  }

  it("is a string literal or a module-level string const everywhere", () => {
    const bad: string[] = []
    let calls = 0
    for (const dir of ["app", "lib", "components"]) {
      for (const f of files(join(ROOT, dir))) {
        if (f === __filename) continue // this file mentions the call in prose
        const src = readFileSync(f, "utf8")
        const re = /\bdbErrorMessage\(/g
        let m: RegExpExecArray | null
        while ((m = re.exec(src))) {
          // Skip the definition itself and any import/type mention.
          const before = src.slice(Math.max(0, m.index - 30), m.index)
          if (/function\s+$/.test(before)) continue
          calls++
          const arg = secondArg(src, m.index + m[0].length)
          const ok =
            arg !== null &&
            (/^"(?:[^"\\]|\\.)*"$/.test(arg) ||
              /^'(?:[^'\\]|\\.)*'$/.test(arg) ||
              (/^`[^`$]*`$/.test(arg) && !arg.includes("${")) ||
              (/^[A-Za-z_$][\w$]*$/.test(arg) &&
                new RegExp(`^const\\s+${arg.replace(/\$/g, "\\$")}\\s*(?::\\s*string\\s*)?=\\s*(?:"|'|\`)`, "m").test(src)))
          if (!ok) bad.push(`${relative(ROOT, f)}: ${arg ?? "(no fallback)"}`)
        }
      }
    }
    expect(calls).toBeGreaterThan(50)
    expect(bad).toEqual([])
  })
})
