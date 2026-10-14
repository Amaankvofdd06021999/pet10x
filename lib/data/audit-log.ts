/**
 * Pet10x — reading `audit_log` back as sentences (manager Settings › Audit Log).
 *
 * Every definer RPC that changes a building's record writes an audit row:
 * `action` is a dotted name (`violation.advanced`, `fine.status_changed`…),
 * `metadata` is whatever that RPC thought worth keeping. Nothing read it back
 * until now. The screen shows one plain-English sentence per row and never
 * the raw metadata, and never `ip_hash`.
 *
 * Pure, so vitest pins every sentence.
 */

export type AuditArea =
  | "violations"
  | "fines"
  | "rules"
  | "accommodations"
  | "incidents"
  | "community"
  | "emergency"

export const AUDIT_AREAS: { id: AuditArea; label: string; prefixes: string[] }[] = [
  { id: "violations", label: "Violations", prefixes: ["violation."] },
  { id: "fines", label: "Fines", prefixes: ["fine."] },
  { id: "rules", label: "Rules", prefixes: ["building_rule.", "building."] },
  { id: "accommodations", label: "Accommodations", prefixes: ["accommodation."] },
  { id: "incidents", label: "Incidents", prefixes: ["incident."] },
  { id: "community", label: "Community", prefixes: ["community."] },
  { id: "emergency", label: "Emergency", prefixes: ["emergency_directory."] },
]

/**
 * The PostgREST `or` filter for an area: `action.like.violation.%,…`. The
 * prefixes are fixed strings from the table above, never user input.
 */
export function auditAreaFilter(area: AuditArea): string {
  const a = AUDIT_AREAS.find((x) => x.id === area)!
  return a.prefixes.map((p) => `action.like.${p}%`).join(",")
}

export interface AuditRow {
  action: string
  entityType: string | null
  metadata: unknown
}

type Meta = Record<string, unknown>

const meta = (m: unknown): Meta => (m && typeof m === "object" && !Array.isArray(m) ? (m as Meta) : {})
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null)

/** `fine_1` → "fine 1", `info_requested` → "info requested". */
function words(v: unknown): string | null {
  const s = str(v)
  return s ? s.replace(/_/g, " ") : null
}

const STAGE: Record<string, string> = {
  open: "open",
  warning: "warning",
  fine_1: "first fine",
  fine_2: "second fine",
  resolved: "resolved",
  dismissed: "dismissed",
}
const stage = (v: unknown) => (str(v) ? STAGE[v as string] ?? words(v) : null)

function money(m: Meta): string | null {
  const cents = typeof m.amount_cents === "number" ? m.amount_cents : null
  if (cents === null) return null
  const cur = (str(m.currency) ?? "cad").toUpperCase()
  return `${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`
}

/** "from X to Y", "to Y", or "" — whichever the metadata supports. */
function fromTo(from: string | null, to: string | null): string {
  if (from && to) return ` from ${from} to ${to}`
  if (to) return ` to ${to}`
  return ""
}

/**
 * One sentence for one audit row, without the actor — the screen puts the
 * actor's name in front. Starts lower-case after the actor ("Dana Whitlock
 * moved a case…"); an action this function has never heard of still reads as
 * English rather than as its dotted name.
 */
export function describeAuditEntry(row: AuditRow): string {
  const m = meta(row.metadata)
  switch (row.action) {
    case "violation.opened":
      return "opened a bylaw case"
    case "violation.advanced":
      return `moved a bylaw case${fromTo(stage(m.from), stage(m.to))}`
    case "violation.fine_reminded":
      return "sent a fine reminder"
    case "fine.status_changed": {
      const amount = money(m)
      return `changed a fine${amount ? ` of ${amount}` : ""}${fromTo(words(m.from), words(m.to))}`
    }
    case "building.fine_schedule_set":
      return "updated the building's fine schedule"
    case "building_rule.saved":
      return "saved a house rule"
    case "building_rule.published":
      return m.published === false ? "unpublished a house rule" : "published a house rule"
    case "accommodation.submitted":
      return "submitted an accommodation request"
    case "accommodation.withdrawn":
      return "withdrew an accommodation request"
    case "accommodation.decided":
      return `decided an accommodation request${fromTo(words(m.from), words(m.to))}`
    case "accommodation.document_verified":
      return m.verified === false ? "marked an accommodation document unverified" : "verified an accommodation document"
    case "incident.submitted":
      return "submitted an incident report"
    case "incident.escalated":
      return "opened a bylaw case from an incident report"
    case "community.post_removed":
      return "removed a community post"
    case "community.event_published":
      return "published a building event"
    case "community.lost_found_reported":
      return "posted a lost-and-found report"
    case "emergency_directory.viewed":
      return "opened the emergency pet directory"
    case "pet_document.approved":
      return "approved a pet document"
    case "pet_document.rejected":
      return "rejected a pet document"
    case "pet.archived":
      return "removed a pet from the building's register"
    // 20261015000001. The note and the reason stay in the metadata; only the
    // outcome is said here, like every other row.
    case "pet.registration_decided":
      if (m.to === "approved") return "approved a pet's registration"
      if (m.to === "denied") return "denied a pet's registration"
      return "decided a pet's registration"
    case "resident_link.decided":
      if (m.decision === "approve") return "approved a resident's request to join"
      if (m.decision === "deny") return "denied a resident's request to join"
      if (m.decision === "remove") return "removed a resident from the building"
      return "decided a resident's request to join"
    case "municipal_report.submitted":
      return "sent a report to the city"
    // Platform admins' own actions, read in the admin console's Activity tab.
    case "user.suspended":
      return "suspended an account"
    case "user.unsuspended":
      return "unsuspended an account"
    case "user.admin_granted":
      return "made someone a Pet10x admin"
    case "user.admin_revoked":
      return "removed someone's Pet10x admin access"
    case "business.tier_set":
      return `changed a business's tier${fromTo(words(m.from), words(m.to))}`
    case "business.verification_approved":
      return "approved a business's verification"
    case "business.verification_rejected":
      return "rejected a business's verification"
    case "business.verification_info_requested":
      return "asked a business for more verification information"
    case "business.verification_resubmitted":
      return "resubmitted a business for verification"
    case "business.deleted":
      return "deleted a business"
  }
  return `changed the building's ${words(row.action.split(".")[0]) ?? "other"} records`
}

/** Actions only a resident takes, for naming an actor whose profile is unreadable. */
const RESIDENT_ACTIONS = new Set([
  "accommodation.submitted",
  "accommodation.withdrawn",
  "community.lost_found_reported",
  "incident.submitted",
])

/**
 * True for a row whose actor must never be shown or looked up. An incident
 * filed anonymously still records the signed-in reporter in `actor_id` (the
 * intake RPC writes `auth.uid()`), and that row is readable by the building's
 * managers — so the screen treats anything not explicitly non-anonymous as
 * anonymous, and does not even fetch the name.
 */
export function isAnonymousEntry(row: { action: string; metadata: unknown }): boolean {
  return row.action === "incident.submitted" && meta(row.metadata).anonymous !== false
}

/**
 * Who did it, in words. A null actor is a write that carried no person —
 * the emergency directory is opened with a QR token, not an account, and a
 * scheduled job is the system. An actor whose profile this manager cannot
 * read (another building's staff, an admin, a deleted account) is named by
 * their role, never by an id.
 */
export function auditActorLabel(input: {
  action: string
  metadata: unknown
  actorId: string | null
  actorName: string | null
  actorRole: string | null
}): string {
  if (isAnonymousEntry(input)) return "An anonymous reporter"
  if (input.actorName) return input.actorName
  if (!input.actorId) {
    if (input.action === "emergency_directory.viewed") return "Someone with the emergency QR code"
    if (input.action === "incident.submitted") return "A guest"
    return "System"
  }
  if (input.actorRole === "super_admin") return "A Pet10x admin"
  if (input.actorRole === "pet_owner" || RESIDENT_ACTIONS.has(input.action)) return "A resident"
  return "A manager"
}
