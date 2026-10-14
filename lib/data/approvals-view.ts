/**
 * What the Approvals screen shows for one tab, decided from the query alone.
 *
 * Loading wins over everything, and an error comes before empty: the screen
 * used to read "Nothing pending" while a query was still running or had
 * failed, which tells a manager there is no work when they simply have not
 * been told.
 */
export type ApprovalsState = "loading" | "error" | "empty" | "ready"

export function approvalsState<T>(q: { isLoading: boolean; error: string | null; data: T[] }): ApprovalsState {
  const hasData = q.data.length > 0
  // A refetch keeps what is already listed: swapping the list for a spinner
  // would throw away scroll position and which card is open.
  if (q.isLoading) return hasData ? "ready" : "loading"
  if (q.error) return hasData ? "ready" : "error"
  return hasData ? "ready" : "empty"
}

/** True when rows are shown but the last refresh failed, so the list may be stale. */
export function refreshFailed<T>(q: { isLoading: boolean; error: string | null; data: T[] }): boolean {
  return !q.isLoading && q.error !== null && q.data.length > 0
}

export type ApprovalsTabId = "registrations" | "documents" | "accommodations" | "incidents"

// The order a manager is asked to look in; the first with work wins.
const TAB_ORDER: ApprovalsTabId[] = ["registrations", "documents", "accommodations", "incidents"]

/** The tab to open on: the first with something waiting, else registrations. */
export function defaultApprovalsTab(counts: Record<ApprovalsTabId, number>): ApprovalsTabId {
  return TAB_ORDER.find((t) => counts[t] > 0) ?? "registrations"
}
