/** The admin console's tabs, and the `?tab=` value that names one. */
export const ADMIN_TAB_IDS = ["overview", "users", "buildings", "managers", "businesses", "reports", "municipalities", "activity"] as const
export type AdminTabId = (typeof ADMIN_TAB_IDS)[number]

/** A tab id from a query string, or null for anything not on the list. */
export function parseAdminTab(raw: string | null | undefined): AdminTabId | null {
  return ADMIN_TAB_IDS.find((id) => id === raw) ?? null
}
