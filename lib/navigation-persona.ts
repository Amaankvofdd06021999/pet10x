/**
 * Which persona can open a notification's target.
 *
 * WHY THIS FILE EXISTS
 *
 * `resolveActionTarget` answers for ONE surface, the one being worn, and
 * returns null for the other. That is right for "is there somewhere to go
 * from here?", but for someone holding two grants it turned a real link into
 * nothing: a resident's case notice opened while wearing the manager persona
 * landed on Dashboard with no word of why, and the same row in Notifications
 * showed no button at all. The target was fine; it was addressed to the other
 * hat.
 *
 * This names the hat. The shell switches to it (a persona is a view, so
 * switching grants nothing, and `setActivePersona` refuses anything not
 * granted anyway), and Notifications offers "Switch to …" in place of the
 * button it could not draw.
 */
import type { Persona } from "./rbac"
import { resolveActionTarget, type Surface } from "./navigation"

/**
 * The surface `/app` renders for a persona. The one expression the shell, the
 * tab bar and Notifications all used to spell out for themselves
 * (`viewAs === "building-manager"`), so they cannot disagree.
 */
export function surfaceForPersona(persona: Persona): Surface {
  return persona === "building-manager" ? "manager" : "resident"
}

/**
 * The personas a target may switch TO, each with the `/app` surface it wears.
 * Only these two: strata, admin and business live on other routes
 * (`PERSONA_ROUTE`), so switching to one would leave the app, not open the
 * target. Listed rather than derived, so a persona added later is not a
 * switch target until somebody decides it renders in `/app`.
 */
const APP_PERSONAS: readonly Persona[] = ["pet-owner", "building-manager"]

/**
 * The persona whose surface renders `target`: the worn one whenever it can,
 * otherwise a granted `/app` persona that can, otherwise null (an unknown
 * target, or one meant for a grant this account does not hold).
 */
export function personaForTarget(target: string, granted: readonly Persona[], worn: Persona): Persona | null {
  if (resolveActionTarget(target, surfaceForPersona(worn))) return worn
  for (const p of APP_PERSONAS) {
    if (p === worn || !granted.includes(p)) continue
    if (resolveActionTarget(target, surfaceForPersona(p))) return p
  }
  return null
}
