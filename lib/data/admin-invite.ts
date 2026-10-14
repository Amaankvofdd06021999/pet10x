import { isEmailShaped } from "@/lib/auth/email-shape"

/**
 * The role an existing account needs once it manages a building. Only a plain
 * resident (or a profile with no role) becomes a building manager so the
 * manager screens open. Every other role is kept: rewriting a business owner's
 * role could lock them out of their own console, and an admin must never be
 * demoted. They still get the building_managers link. null = leave as is.
 */
export function roleForNewManager(current: string | null | undefined): "building_manager" | null {
  return current == null || current === "pet_owner" ? "building_manager" : null
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
