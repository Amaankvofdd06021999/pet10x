/**
 * Inviting someone to a practice's team — the rules, pure, so the API route
 * (`app/api/clinic/invite`) and the Team screen agree and the rules are
 * unit-tested. Who may invite is not decided here: the route asks
 * `can_admin_business` under the caller's own session, and `bstaff_write`
 * (20260901000000) is the floor beneath it.
 */

export type StaffRole = "owner" | "manager" | "veterinarian" | "nurse" | "reception"

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Practice manager",
  veterinarian: "Veterinarian",
  nurse: "Nurse / technician",
  reception: "Reception",
}

/** `owner` is not offered: ownership is `businesses.owner_id`, not an invite. */
export const INVITABLE_ROLES = ["veterinarian", "nurse", "reception", "manager"] as const
export type InvitableRole = (typeof INVITABLE_ROLES)[number]

export interface ClinicInvite {
  businessId: string
  email: string
  fullName: string
  role: InvitableRole
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseClinicInvite(
  body: unknown,
): { ok: true; invite: ClinicInvite } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")

  const businessId = str(b.businessId)
  if (!UUID.test(businessId)) return { ok: false, error: "Choose the practice to invite them to." }
  const fullName = str(b.fullName)
  if (!fullName) return { ok: false, error: "Enter their name." }
  if (fullName.length > 120) return { ok: false, error: "That name is too long." }
  const email = str(b.email).toLowerCase()
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: "Enter a valid email address." }
  const role = str(b.role)
  if (!(INVITABLE_ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: "Choose a role: veterinarian, nurse, reception or manager." }
  }
  return { ok: true, invite: { businessId, email, fullName, role: role as InvitableRole } }
}

/**
 * Role and Deactivate / Reactivate are never offered on the business owner's
 * row, nor on the viewer's own — business_staff_guard (20261010000002)
 * refuses both for anyone but the owner, and a manager promoting or
 * deactivating themselves is exactly what it exists to stop. (The owner may
 * change their own row in the database; the screen keeps one rule for all.)
 */
export function canEditMember(
  member: { profileId: string },
  ctx: { ownerId: string | null; viewerId: string | null },
): boolean {
  return member.profileId !== ctx.ownerId && member.profileId !== ctx.viewerId
}

/**
 * A refused staff write, in words. business_staff_guard raises 42501 with a
 * sentence already; RLS refusals and anything else get a generic one.
 */
export function staffErrorSentence(message: string): string {
  if (/practice owner can change/i.test(message)) return "Only the practice owner can change their own row."
  if (/own role or access/i.test(message)) return "You cannot change your own role or access."
  if (/owner role|as owner/i.test(message)) return "Nobody can be given the owner role."
  return "Try again, or ask the practice owner."
}
