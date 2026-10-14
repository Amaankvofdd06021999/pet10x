/**
 * Where the sign-up form was left, kept in sessionStorage so a phone that
 * reloads the tab while the person fetches the code from Mail drops them back
 * on the code screen, not a blank form.
 *
 * Never holds the password: storage is readable by any script on the origin,
 * and a credential that outlives the tab is worse than asking for it again.
 * Storage is injected so the logic runs (and is tested) without a DOM, and so
 * the component can hand over whatever it was able to open — private mode
 * throws on access, which every function here absorbs.
 */

import { EMAIL_SHAPE } from "@/lib/auth/email-shape"

export const SIGNUP_DRAFT_KEY = "pet10x.signup"

/** Longer than the 15-minute code, so a late return still sees "expired" and a resend. */
export const DRAFT_TTL_MS = 30 * 60 * 1000

export type DraftView = "form" | "verify"
export type Draft = { email: string; name: string; view: DraftView; savedAt: number }

const MAX_NAME = 80

export function saveDraft(
  storage: Pick<Storage, "setItem">,
  d: { email: string; name: string; view: DraftView },
  now: number = Date.now(),
): void {
  try {
    // Fields are copied one by one, so nothing extra on `d` can reach storage.
    const out: Draft = { email: d.email, name: d.name, view: d.view, savedAt: now }
    storage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(out))
  } catch {
    // Storage unavailable: the draft is a convenience, not a requirement.
  }
}

export function loadDraft(storage: Pick<Storage, "getItem">, now: number): Draft | null {
  try {
    const raw = storage.getItem(SIGNUP_DRAFT_KEY)
    if (!raw) return null
    const v: unknown = JSON.parse(raw)
    if (typeof v !== "object" || v === null) return null
    const o = v as Record<string, unknown>
    const { email, name, view, savedAt } = o
    if (typeof email !== "string" || !EMAIL_SHAPE.test(email)) return null
    if (typeof name !== "string" || name.length > MAX_NAME) return null
    if (view !== "form" && view !== "verify") return null
    if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null
    if (now - savedAt > DRAFT_TTL_MS) return null
    return { email, name, view, savedAt }
  } catch {
    return null
  }
}

export function clearDraft(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(SIGNUP_DRAFT_KEY)
  } catch {
    // see saveDraft
  }
}
