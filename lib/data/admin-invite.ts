import { isEmailShaped } from "@/lib/auth/email-shape"

/** Roles that already open the manager surface, or outrank it. Adding a manager link must not change them. */
const KEEP_ROLES = ["building_manager", "super_admin"] as const

/**
 * The role an existing account needs once it manages a building: a resident
 * (or anyone below manager) becomes a building manager so the manager screens
 * open; a manager stays one and an admin is never demoted. null = leave as is.
 */
export function roleForNewManager(current: string | null | undefined): "building_manager" | null {
  return (KEEP_ROLES as readonly string[]).includes(current ?? "") ? null : "building_manager"
}

/** Checked before anything is sent; returns the trimmed, lower-cased address or an error to show. */
export function checkInviteEmail(raw: string): { ok: true; email: string } | { ok: false; error: string } {
  const email = raw.trim().toLowerCase()
  if (!email) return { ok: false, error: "Enter the manager's email." }
  if (!isEmailShaped(email)) return { ok: false, error: "Enter a valid email address, like name@example.com." }
  return { ok: true, email }
}

/** Raw Supabase / network text never reaches the toast. */
export function inviteFailureMessage(email: string): string {
  return `Couldn't invite ${email}. Try again, or check the address.`
}
