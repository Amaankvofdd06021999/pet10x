/**
 * Has the viewer typed anything into this form since it opened?
 *
 * The forms keep their fields in separate `useState`s; each passes the values
 * it opened with and the values it has now. The compare is shallow and
 * forgiving on purpose: it answers "would leaving lose something the viewer
 * meant?", not "is this object byte-identical?".
 *
 * - Strings are trimmed: a field holding only spaces lost nothing.
 * - `""`, `null`, `undefined` and `[]` are all "empty", so a field cleared back
 *   to nothing is not a change, whatever the form uses for blank.
 * - Arrays compare item by item (a multi-select re-created as a new `[]` is
 *   not a change); anything else compares by identity (a picked `File`).
 */
export function isDirty(initial: Record<string, unknown>, current: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(initial), ...Object.keys(current)])
  for (const k of keys) {
    if (!same(norm(initial[k]), norm(current[k]))) return true
  }
  return false
}

function norm(v: unknown): unknown {
  if (typeof v === "string") v = v.trim()
  if (v === "" || v === null || v === undefined) return undefined
  if (Array.isArray(v) && v.length === 0) return undefined
  return v
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => Object.is(norm(x), norm(b[i])))
  }
  return Object.is(a, b)
}
