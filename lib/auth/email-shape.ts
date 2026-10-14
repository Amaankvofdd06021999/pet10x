/** One shape for "looks like an email", shared by signup, staff invites and the admin invite. */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isEmailShaped(email: string): boolean {
  return EMAIL_SHAPE.test(email)
}
