/**
 * Pet10x — the pure half of the admin console's Users and Overview tabs.
 * The I/O is in ./admin.ts; this is what vitest pins.
 */

/** One row of admin_list_users (20261012000002), as the console reads it. */
export interface AdminUser {
  id: string
  name: string
  email: string
  joinedAt: string
  isSuspended: boolean
  isSuperAdmin: boolean
  isResident: boolean
  managedBuildings: number
  ownsBusiness: boolean
  clinicStaff: boolean
}

/**
 * What a person is on the platform, as short labels, most privileged first.
 * Empty only for an account that has signed up and done nothing yet — the
 * console says "No role yet" for that rather than inventing one.
 */
export function personaLabels(u: Pick<AdminUser, "isSuperAdmin" | "managedBuildings" | "ownsBusiness" | "clinicStaff" | "isResident">): string[] {
  const out: string[] = []
  if (u.isSuperAdmin) out.push("Admin")
  if (u.managedBuildings > 0) {
    out.push(u.managedBuildings === 1 ? "Manager of 1 building" : `Manager of ${u.managedBuildings} buildings`)
  }
  if (u.ownsBusiness) out.push("Business")
  if (u.clinicStaff) out.push("Clinic staff")
  if (u.isResident) out.push("Resident")
  return out
}

/**
 * The sentence for an admin_set_user_flags refusal. The RPC raises a readable
 * message for the cases a person can cause; anything else is not shown raw.
 */
export function userFlagsError(error: { code?: string; message?: string }): string {
  const msg = error.message ?? ""
  if (/suspend or demote your own account/i.test(msg)) return "You can't suspend or remove admin from your own account."
  if (error.code === "P0002") return "That account no longer exists."
  if (error.code === "42501") return "Only a Pet10x admin can change an account's access."
  return "Couldn't update that account. Try again."
}

/** The typed confirmation for granting or revoking super-admin: the person's email, exactly. */
export function adminConfirmationMatches(typed: string, email: string): boolean {
  return email.length > 0 && typed.trim().toLowerCase() === email.trim().toLowerCase()
}

export interface PlatformStats {
  users: number
  pets: number
  buildingsActive: number
  buildingsArchived: number
  businessesByTier: { registered: number; listed: number; verified: number }
  incidents30d: number
  openViolations: number
  bookings30d: number
  aiConversations30d: number
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0)

/** admin_platform_stats() returns jsonb; anything missing reads as 0. */
export function parsePlatformStats(raw: unknown): PlatformStats {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const tiers = (r.businesses_by_tier && typeof r.businesses_by_tier === "object" ? r.businesses_by_tier : {}) as Record<
    string,
    unknown
  >
  return {
    users: num(r.users),
    pets: num(r.pets),
    buildingsActive: num(r.buildings_active),
    buildingsArchived: num(r.buildings_archived),
    businessesByTier: { registered: num(tiers.registered), listed: num(tiers.listed), verified: num(tiers.verified) },
    incidents30d: num(r.incidents_30d),
    openViolations: num(r.open_violations),
    bookings30d: num(r.bookings_30d),
    aiConversations30d: num(r.ai_conversations_30d),
  }
}
