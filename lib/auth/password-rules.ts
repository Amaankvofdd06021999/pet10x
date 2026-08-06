/**
 * What makes a Pet10x password acceptable.
 *
 * Deliberately NOT "server-only": the signup form shows this checklist live
 * and the verify route enforces it, and they must be the same rules. A
 * checklist the server does not enforce is decoration; a server rule the
 * checklist does not show is a form that rejects you without saying why.
 */

/**
 * Eight, by product decision — twelve was judged too much friction at signup.
 *
 * Eight alone is weak, so the composition rule below is doing most of the work
 * at this length: eight characters drawn from three classes is a far larger
 * space than eight lowercase letters. The 20+ waiver still lets a passphrase
 * skip composition entirely.
 */
export const MIN_PASSWORD_LENGTH = 8

/**
 * How many of the four character classes are required.
 *
 * Not all four. Demanding a symbol reliably produces `Password1!` — the
 * requirement gets satisfied in the most predictable way possible, which is
 * exactly what an attacker's rules file expects. Three of four leaves room for
 * a long passphrase to pass without contortions.
 */
export const REQUIRED_CLASSES = 3

/**
 * At this length the composition rule is waived entirely.
 *
 * "correct horse battery staple" is 28 characters and has two character
 * classes. Rejecting it while the panel advises a passphrase is a form arguing
 * with itself — and the maths is not on the rule's side: length buys far more
 * entropy than sprinkling a digit into something short. This is also what NIST
 * SP 800-63B recommends over composition rules.
 */
export const PASSPHRASE_LENGTH = 20

export interface PasswordRule {
  id: string
  label: string
  test: (v: string) => boolean
}

const hasLower = (v: string) => /[a-z]/.test(v)
const hasUpper = (v: string) => /[A-Z]/.test(v)
const hasDigit = (v: string) => /\d/.test(v)
const hasSymbol = (v: string) => /[^A-Za-z0-9]/.test(v)

export function classCount(v: string): number {
  return [hasLower(v), hasUpper(v), hasDigit(v), hasSymbol(v)].filter(Boolean).length
}

/**
 * Rejected outright regardless of length or classes.
 *
 * A short list of the shapes that appear at the top of every credential-
 * stuffing dictionary, plus the app's own name — "pet10x" and "Pet10xPet10x"
 * are the first things anyone tries against this product specifically.
 */
const BANNED = [
  "password",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty",
  "qwertyuiop",
  "letmein",
  "welcome",
  "iloveyou",
  "admin",
  "pet10x",
  "petten",
  "abc123",
  "monkey",
  "dragon",
]

export function looksCommon(v: string): boolean {
  const s = v.toLowerCase().replace(/\s+/g, "")
  // `includes`, not equality: "Password123!" satisfies every composition rule
  // and is still the first guess anyone makes.
  return BANNED.some((b) => s.includes(b))
}

/** Shown to the user, in order, each ticking independently as they type. */
export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, test: (v) => v.length >= MIN_PASSWORD_LENGTH },
  {
    id: "classes",
    label: `${REQUIRED_CLASSES} of: lowercase, uppercase, number, symbol — or ${PASSPHRASE_LENGTH}+ characters`,
    test: (v) => v.length >= PASSPHRASE_LENGTH || classCount(v) >= REQUIRED_CLASSES,
  },
  { id: "common", label: "Not a common or guessable password", test: (v) => v.length > 0 && !looksCommon(v) },
]

export interface PasswordVerdict {
  ok: boolean
  /** Which rules are unmet, for a single message on submit. */
  failed: string[]
  /** 0–4, for the meter. Not a rule — advisory only. */
  score: number
}

export function checkPassword(v: string): PasswordVerdict {
  const failed = PASSWORD_RULES.filter((r) => !r.test(v)).map((r) => r.label)

  // Score rewards length beyond the minimum, because that is what actually
  // buys resistance — a 20-character passphrase outranks a 12-character
  // scramble even with fewer classes.
  let score = 0
  if (v.length >= MIN_PASSWORD_LENGTH) score += 1
  // Still rewarded, just no longer required — the meter should keep pointing
  // at length as the cheapest way to get stronger.
  if (v.length >= 12) score += 1
  if (v.length >= PASSPHRASE_LENGTH || classCount(v) >= REQUIRED_CLASSES) score += 1
  if (classCount(v) === 4 || v.length >= PASSPHRASE_LENGTH) score += 1
  if (looksCommon(v)) score = Math.min(score, 1)

  return { ok: failed.length === 0, failed, score: Math.min(4, score) }
}

export const STRENGTH_LABEL = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const
