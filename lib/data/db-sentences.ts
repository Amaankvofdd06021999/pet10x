/**
 * The sentences dbErrorMessage (db-error.ts) gives for the few SQLSTATEs a
 * person can act on. Pure and apart from db-error.ts so lib/user-error.ts can
 * list them without an import cycle.
 */
export const SQLSTATE_SENTENCES: Readonly<Record<string, string>> = {
  // insufficient_privilege: RLS refused, or an RPC raised "not yours".
  "42501": "You don't have access to that.",
  // unique_violation
  "23505": "That already exists.",
  // foreign_key_violation: either side — a row still in use, or one that's gone.
  "23503": "That's linked to other records, so it couldn't be changed.",
}

/*
 * Sentences our own functions and triggers raise (`raise exception '…'` in
 * supabase/migrations), written for the person who caused them, without the
 * full stop — dbErrorMessage adds one. Taken from the migrations, then kept
 * by hand: a raise that is not here (Postgres's own text, or a `hint` that
 * names an RPC for the developer) is never shown. A new user-facing raise is
 * added here when it is written.
 */
export const RAISED_SENTENCES: ReadonlySet<string> = new Set([
  "A reason is required to deny a registration",
  "A staff row cannot be moved to another person or practice",
  "Choose a tier",
  "Choose how it was paid: cash, card, e-transfer or other",
  "Enter an amount greater than zero",
  "Nobody can be added to a practice as owner",
  "Nobody can be given the owner role",
  "Not allowed to change role or admin flag",
  "Not allowed to change role, admin flag, or suspension state",
  "Nothing to change",
  "Only Pet10x admins can change verification status",
  "Only Pet10x can change that",
  "Only a Pet10x admin can ask for more information",
  "Only a Pet10x admin can change a business's tier",
  "Only a Pet10x admin can change an account's access",
  "Only a Pet10x admin can delete a business",
  "Only a Pet10x admin can list users",
  "Only a Pet10x admin can read platform statistics",
  "Only a Pet10x admin can review a verification request",
  "Only a Pet10x admin can see building activity",
  "Only a Pet10x admin can see what a business holds",
  "Only the business can cancel this booking",
  "Only the practice owner can change their own role or access",
  "Only the practice's owner or a manager can answer a verification request",
  "Only the review author can change the rating or comment",
  "Say what you need — the business sees this note",
  "Say why the bill is void — the reason is kept on the bill",
  "Say why the request is not approved — the business sees this note",
  "Sign in to cancel a booking",
  "Sign in to cancel a visit",
  "Sign in to decline an estimate",
  "Tell the customer why — they see this reason",
  "Tell the practice why — they see this note",
  "That account no longer exists",
  "That booking isn't yours",
  "That business no longer exists",
  "That estimate isn't yours",
  "That request has already been decided",
  "That request no longer exists",
  "That service isn't available to book",
  "That visit isn't yours to cancel",
  "The contact name is too long (80 characters at most)",
  "The issuing body needs 2 to 80 characters",
  "The licence number needs 3 to 40 letters, numbers, spaces, dots, slashes or dashes",
  "The note is too long (2000 characters at most)",
  "The phone number needs 7 to 20 digits, spaces, brackets, dashes or a leading +",
  "The reason is too long (2000 characters at most)",
  "This booking can't be cancelled any more",
  "You can't suspend or demote your own account",
  "You cannot change your own role or access",
  "Your account is suspended",
])

/** Every sentence dbErrorMessage can return other than a caller's fallback. */
export const DB_SENTENCES: readonly string[] = [
  ...Object.values(SQLSTATE_SENTENCES),
  ...[...RAISED_SENTENCES].map((s) => `${s}.`),
]

/*
 * The fallbacks dbErrorMessage has handed out in this runtime. A fallback is a
 * sentence a caller wrote ("Couldn't load available times. Try again."), so
 * once issued it may pass a later userError or dbErrorMessage unchanged — for
 * instance when useLive re-reads a sentence a loader threw. Exact strings
 * only: a database message can match one only by being, character for
 * character, a sentence we wrote.
 */
const issuedFallbacks = new Set<string>()

export function rememberFallback(sentence: string): void {
  issuedFallbacks.add(sentence)
}

export function isIssuedFallback(text: string): boolean {
  return issuedFallbacks.has(text)
}
