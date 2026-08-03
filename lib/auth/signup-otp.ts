import "server-only"
import { createHash, randomInt, timingSafeEqual } from "node:crypto"

/**
 * Shared rules for the signup email-verification code.
 *
 * The gate exists because the project has Supabase email confirmation
 * disabled, so a browser-side `auth.signUp()` produced a live, confirmed
 * account (and a profiles row, via the on_auth_user_created trigger) for any
 * address typed into the form. The account is now created server-side, once,
 * after the code is verified.
 */

/** How long a code stays usable. */
export const CODE_TTL_MINUTES = 15
export const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000

/**
 * Wrong guesses before the pending signup is destroyed.
 *
 * A 6-digit code is one-in-a-million per guess, which is only a real gate if
 * guessing is bounded — at unlimited attempts an attacker walks the space.
 * Five is generous for typing a code off a screen.
 */
export const MAX_ATTEMPTS = 5

/** Minimum gap between sends to one address. */
export const RESEND_COOLDOWN_SECONDS = 60

/**
 * Total sends allowed per pending signup, so requesting a code repeatedly
 * cannot be used to flood somebody else's inbox.
 */
export const MAX_SENDS = 5

export const MIN_PASSWORD_LENGTH = 8

/**
 * Codes are stored hashed, never in plaintext.
 *
 * Peppered with a server secret so the hashes are useless on their own —
 * a leaked dump of the table cannot be brute-forced offline against a
 * six-digit space (which takes milliseconds without a pepper). Bound to the
 * email too, so a hash lifted from one row cannot be replayed against another.
 */
export function hashCode(code: string, email: string): string {
  const pepper = process.env.OTP_PEPPER ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!pepper) throw new Error("OTP hashing is not configured (missing OTP_PEPPER / SUPABASE_SERVICE_ROLE_KEY).")
  return createHash("sha256").update(`${normaliseEmail(email)}:${code}:${pepper}`).digest("hex")
}

/** Compare without leaking, through timing, how much of the hash matched. */
export function codeMatches(code: string, email: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashCode(code, email))
  const stored = Buffer.from(storedHash)
  if (candidate.length !== stored.length) return false
  return timingSafeEqual(candidate, stored)
}

/**
 * A uniform 6-digit code. `randomInt` is CSPRNG-backed and rejection-samples,
 * so unlike `Math.random() * 900000` it has no modulo bias and is not
 * predictable from previous codes.
 */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

/** Addresses are matched case-insensitively; store and compare one form only. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Deliberately permissive — the code delivery is the real address test. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

export function isSixDigits(code: string): boolean {
  return /^\d{6}$/.test(code)
}
