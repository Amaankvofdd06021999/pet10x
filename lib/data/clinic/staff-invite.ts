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
 * Deactivate / Reactivate is never offered on the business owner's row —
 * ownership keeps them staff whatever the row says (`staff_of_business`), so
 * the button would claim an effect it cannot have — nor on the viewer's own
 * row, which would lock them out of the screen they are using.
 */
export function canDeactivate(
  member: { profileId: string },
  ctx: { ownerId: string | null; viewerId: string | null },
): boolean {
  return member.profileId !== ctx.ownerId && member.profileId !== ctx.viewerId
}
