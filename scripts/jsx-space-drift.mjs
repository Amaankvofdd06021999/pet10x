#!/usr/bin/env node
/**
 * The two ways a space you wrote in JSX does not reach the screen.
 *
 * Four times in this phase sequence an automated gate passed on a defect
 * visible in one second of looking at the page, and every time it was a missing
 * space after an expression: "firstfine", "1 finewhose", "Log Mochi'sactivities
 * & meals", "pet10x.comdoesn't". `tsc --noEmit`, `vitest` and reading the
 * source all say the space is there. It is there. It does not ship.
 *
 * There are TWO separate causes, they are not the same rule, and the first
 * write-up of this in the repo confused them. Both were measured against this
 * project's own `@next/swc-darwin-arm64@16.2.10` and `typescript@5.7.3`.
 *
 * ---------------------------------------------------------------------------
 * SHAPE A — an expression ENDS a line and the text begins the next one.
 *
 *     <p>
 *       Log {pet.name}
 *       activities & meals
 *     </p>            ->  ["Log ", name, "activities & meals"]
 *
 * This is ORDINARY JSX SEMANTICS: leading whitespace that spans a newline is
 * stripped from a JSXText node. It is identical in tsc, SWC and Babel —
 * verified, not assumed. An earlier note in this repo blamed SWC and said
 * "Babel does not do this, which is presumably why nobody expected it"; that
 * is false. Those notes have been corrected (`today-schedule.tsx:34`,
 * `home-screen.tsx:341`).
 *
 * Nothing about Shape A is compiler-specific, so no amount of diffing
 * compilers can find it. It is detected here from the SOURCE AST instead.
 *
 * Worth knowing before you trust a hit: NOT ONE of the defects this repo has
 * actually observed was Shape A. Every one was Shape B below. The 2026-08-23
 * sweep found zero Shape A sites in 143 files, and re-running this script over
 * the pre-fix versions of the files that were "fixed" for Shape A in commit
 * `230ce4d` also finds zero — `{doneCount}/{todays.length} done` and
 * `Approve {safe.length} safe` are single-line and keep their space in both
 * compilers. Those edits were harmless no-ops made on a rule that did not
 * exist. Shape A is a real way to lose a space; it has just never been this
 * project's way.
 *
 * ---------------------------------------------------------------------------
 * SHAPE B — the text node contains an HTML ENTITY.
 *
 *     <p>{user.email} doesn&apos;t have a business record yet.</p>
 *
 *       tsc:  [email, " doesn't have a business record yet."]
 *       SWC:  [email, "doesn't have a business record yet."]
 *
 * This one IS an SWC-only defect, and it is far nastier than Shape A because
 * the source looks completely ordinary: the space is on the SAME LINE as the
 * expression, where JSX preserves it, and every rule anyone can quote says it
 * survives. It survives under tsc. Under the compiler `next build` uses it
 * does not, whenever the text node contains an entity — `&apos;`, `&amp;`,
 * anything. Isolated by bisection:
 *
 *     {x} doesn't have a record.      -> both keep the space
 *     {x} doesn&apos;t have a record. -> tsc keeps it, SWC drops it
 *     {x} cats &amp; dogs.            -> tsc keeps it, SWC drops it
 *     It doesn&apos;t have a record.  -> both same (no preceding sibling)
 *
 * Wrapping to a second line is irrelevant; the entity is the whole trigger.
 * And because `next lint` does not run in this repo and tsc emits the correct
 * output, the ONLY thing that can see Shape B is the disagreement itself. So
 * that is what is measured: transform every .tsx with both compilers and
 * report where SWC dropped padding tsc kept.
 *
 * Confirmed in a real browser at both ends before this script was trusted, on
 * the pre-fix source checked out at `aea90ad` and then on the fix, reading the
 * DOM child nodes rather than squinting at the page:
 *
 *   /businessaccess   "businessowner@pet10x.comdoesn't have a business record"
 *                  -> "businessowner@pet10x.com doesn't have a business record"
 *   /report (municipal confirmation)
 *                     "...contact details for this area yet.Search for your..."
 *                  -> "...contact details for this area yet. Search for your..."
 *
 * That matters because the shape looks fine on the page in source form, and a
 * plausible reading of the JSX rules says it IS fine. It is not. Measure it.
 *
 * ---------------------------------------------------------------------------
 * THE FIX, for either shape: an explicit `{" "}` at the END of the line before
 * the text. Put it at the end — a `{" "}` opening a line is itself followed by
 * a newline-spanning text node, and you get nothing.
 *
 * USAGE
 *     pnpm check:jsx-spaces              # whole repo, exit 1 on any hit
 *     node scripts/jsx-space-drift.mjs app/foo.tsx
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import path from "node:path"
import process from "node:process"

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/* ---- the two compilers ------------------------------------------------- */

function loadSwc() {
  const pnpm = path.join(ROOT, "node_modules/.pnpm")
  const found = []
  for (const dir of readdirSync(pnpm)) {
    if (!dir.startsWith("@next+swc-")) continue
    const pkg = dir.replace(/@[^@]*$/, "").replace("+", "/")
    const base = path.join(pnpm, dir, "node_modules", pkg)
    for (const f of readdirSync(base)) if (f.endsWith(".node")) found.push(path.join(base, f))
  }
  if (!found.length) throw new Error("no @next/swc native binding under node_modules/.pnpm")
  return { binding: require(found[0]), which: path.relative(ROOT, found[0]) }
}

const { binding: swc, which: swcPath } = loadSwc()
const ts = require("typescript")

// Both pinned to the SAME output shape — classic React.createElement — so the
// emitted string literals line up positionally and only padding can differ.
const swcOptions = JSON.stringify({
  filename: "f.tsx",
  jsc: {
    parser: { syntax: "typescript", tsx: true },
    target: "es2022",
    transform: { react: { runtime: "classic", pragma: "React.createElement" } },
  },
  module: { type: "es6" },
  minify: false,
  sourceMaps: false,
})

/** Every string literal in emitted JS, in source order. */
function literals(code) {
  const sf = ts.createSourceFile("out.js", code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS)
  const out = []
  const walk = (n) => {
    if (ts.isStringLiteral(n)) out.push(n.text)
    ts.forEachChild(n, walk)
  }
  walk(sf)
  return out
}

/* ---- SHAPE B: what the two compilers disagree about -------------------- */

function shapeB(src) {
  let a, b
  try {
    a = literals(
      ts.transpileModule(src, {
        compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        fileName: "f.tsx",
      }).outputText,
    )
    b = literals(swc.transformSync(src, false, Buffer.from(swcOptions)).code)
  } catch {
    return [] // unparseable by one of them; `tsc --noEmit` owns that failure
  }
  if (a.length !== b.length) return [] // codegen diverged structurally; not our defect
  const hits = []
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue
    if (a[i].trim() !== b[i].trim()) continue // a real content difference, not padding
    hits.push({ shape: "B", tsc: a[i], swc: b[i] })
  }
  return hits
}

/* ---- SHAPE A: what BOTH compilers do, read off the source AST ---------- */

function shapeA(src, file) {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const hits = []
  const walk = (node) => {
    const kids = node.children
    if (kids) {
      for (let i = 1; i < kids.length; i++) {
        const prev = kids[i - 1]
        const cur = kids[i]
        if (!ts.isJsxText(cur)) continue

        /* Narrowed to RUNNING PROSE: text, then an interpolated value, then
           more text. That is the shape where a reader expects a sentence and
           gets two words joined -- "Log Mochi'sactivities", "1 finewhose",
           "Approve 3safe".

           Deliberately NOT reported:
             - `{" "}` itself, which is the FIX for this and ends a line by
               design. Without this the script flags every repair it asked for.
             - an icon element followed by a label, `<MapPin /> Near you`. The
               space is stripped there too, but these sit in a flex row with a
               `gap`, so nothing is visibly joined and there are dozens of them.
           Precision over recall: a checker that cries wolf 60 times gets
           switched off, and this defect has already survived four gates. */
        if (!ts.isJsxExpression(prev)) continue
        const inner = prev.expression
        if (inner && ts.isStringLiteral(inner) && !inner.text.trim()) continue // a {" "} fix
        const before = kids[i - 2]
        if (!before || !ts.isJsxText(before) || !before.getFullText(sf).trim()) continue
        if (/\n[^\S\n]*$/.test(before.getFullText(sf))) continue // expression starts its own line

        const raw = cur.getFullText(sf)
        if (!/^[^\S\n]*\n/.test(raw)) continue // no newline before the text: space survives
        if (!raw.trim()) continue // whitespace-only node: nothing to join to
        hits.push({
          shape: "A",
          line: sf.getLineAndCharacterOfPosition(prev.getEnd()).line + 1,
          text: raw.trim().split("\n")[0].slice(0, 60),
        })
      }
    }
    ts.forEachChild(node, walk)
  }
  walk(sf)
  return hits
}

/* ---- locate a Shape B hit in the source -------------------------------- */

function locate(src, text) {
  const first = text.trim().split(/\s+/)[0]
  if (!first) return null
  // The compilers hand back DECODED text ("doesn't") while the source holds the
  // entity ("doesn&apos;t") -- and for Shape B an entity is always present, so
  // decoding the source rather than encoding the needle is not optional.
  const decode = (s) =>
    s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  const lines = src.split("\n").map(decode)
  const exact = lines.findIndex((l) => l.trimStart().startsWith(first))
  if (exact !== -1) return exact + 1
  const loose = lines.findIndex((l) => l.includes(first))
  return loose === -1 ? null : loose + 1
}

/* ---- walk -------------------------------------------------------------- */

const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build", ".vercel"])

function* tsxFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) yield* tsxFiles(full)
    else if (entry.endsWith(".tsx")) yield full
  }
}

const args = process.argv.slice(2)
const targets = args.length ? args.map((a) => path.resolve(ROOT, a)) : [...tsxFiles(ROOT)]

let a = 0
let b = 0
for (const file of targets) {
  const src = readFileSync(file, "utf8")
  const rel = path.relative(ROOT, file)
  for (const hit of shapeA(src, file)) {
    a++
    console.log(`${rel}:${hit.line}  [A] expression ends the line; the space before the next line is stripped`)
    console.log(`    ...${JSON.stringify(hit.text)}`)
  }
  for (const hit of shapeB(src)) {
    b++
    console.log(`${rel}${locate(src, hit.tsc) ? `:${locate(src, hit.tsc)}` : ""}  [B] SWC drops a space tsc keeps (entity in the text node)`)
    console.log(`    tsc: ${JSON.stringify(hit.tsc.slice(0, 72))}`)
    console.log(`    swc: ${JSON.stringify(hit.swc.slice(0, 72))}   <-- what ships`)
  }
}

const total = a + b
console.log(
  total === 0
    ? `\nNo JSX space loss. (${targets.length} .tsx files; SWC ${swcPath})`
    : `\n${a} Shape A + ${b} Shape B = ${total}. Add {" "} at the END of the preceding line.`,
)
process.exit(total === 0 ? 0 : 1)
