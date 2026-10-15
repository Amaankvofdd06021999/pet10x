/**
 * A copy of `history.state` that is safe to hand back to replaceState or
 * pushState: Next's keys kept, all but `__NA`, plus any `extraKeys` dropped.
 *
 * Next's patched pushState and replaceState skip their own bookkeeping for
 * data carrying `__NA`, and that bookkeeping is what copies the router tree
 * into the entry AND tells the router the URL changed — without it a later
 * router update rewrites the bar back to the URL it last knew. Passing
 * `window.history.state` straight through carries `__NA` along, so every
 * write goes through here.
 */
export function historyStateWithout(state: unknown, extraKeys: readonly string[] = []): Record<string, unknown> {
  const data: Record<string, unknown> = state && typeof state === "object" ? { ...(state as Record<string, unknown>) } : {}
  delete data.__NA
  for (const k of extraKeys) delete data[k]
  return data
}
