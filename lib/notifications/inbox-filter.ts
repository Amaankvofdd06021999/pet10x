/**
 * The PostgREST `or` for "not asleep": never snoozed, or snoozed until a time
 * at or before `now` (20261018000001). Every inbox read pairs it with
 * `.is("dismissed_at", null)`. Kept apart from lib/data/live.ts so the exact
 * string the app sends can be tested without a database.
 */
export function awakeFilter(now: Date): string {
  return `snoozed_until.is.null,snoozed_until.lte.${now.toISOString()}`
}
