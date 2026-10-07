/**
 * Pet10x — the one check for a `?next=` (or any post-auth redirect) value.
 *
 * "Starts with `/` and not `//`" is not enough: `new URL("/\\evil.com", origin)`
 * resolves to evil.com (WHATWG treats `\` as `/` in special schemes), and so
 * does `/\t/evil.com`, because URL parsing strips tabs and newlines before it
 * looks for the host. So the value is refused outright if it carries a
 * backslash or a control character, then RESOLVED against our origin, and kept
 * only if the result is still on our origin.
 *
 * Returns the path + query + hash to navigate to, or null. Callers fall back
 * to their own default on null and run any route check on the returned path.
 */
export function safeNextPath(next: string | null | undefined, origin: string): string | null {
  if (typeof next !== "string" || !next.startsWith("/")) return null
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return null
  let resolved: URL
  let base: URL
  try {
    base = new URL(origin)
    resolved = new URL(next, base)
  } catch {
    return null
  }
  if (resolved.origin !== base.origin) return null
  return resolved.pathname + resolved.search + resolved.hash
}
