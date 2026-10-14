/**
 * Pet10x — the admin console's Activity tab: the platform-wide audit log.
 *
 * Same sentences as the manager's Audit Log (`describeAuditEntry`), but not
 * scoped to a building, and with the account and business actions only an
 * admin takes. The filter is a positive list of action prefixes — the
 * entity each audit row is about.
 */

import { AUDIT_AREAS } from "./audit-log"

export const ADMIN_AUDIT_AREAS: { id: string; label: string; prefixes: string[] }[] = [
  ...AUDIT_AREAS,
  { id: "pets", label: "Pets", prefixes: ["pet.", "pet_document."] },
  { id: "residents", label: "Residents", prefixes: ["resident_link."] },
  { id: "city", label: "City reports", prefixes: ["municipal_report."] },
  { id: "accounts", label: "Accounts", prefixes: ["user."] },
  { id: "businesses", label: "Businesses", prefixes: ["business."] },
]

/** PostgREST `or` filter for one area, or null for an id not on the list. */
export function adminAuditFilter(areaId: string): string | null {
  const a = ADMIN_AUDIT_AREAS.find((x) => x.id === areaId)
  return a ? a.prefixes.map((p) => `action.like.${p}%`).join(",") : null
}
