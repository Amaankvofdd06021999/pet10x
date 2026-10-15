/**
 * Pet10x — which tab /login opens on.
 *
 * Landing "Get started" buttons link to `/login?mode=signup` so a first-time
 * visitor lands on Create account, not Sign in. Only the literal `signup`
 * opens it; every other value (or none) is the Sign in default, so a mangled
 * link never lands someone on a form they did not ask for.
 */
export type LoginMode = "signin" | "signup"

export function readLoginMode(search: string): LoginMode {
  return new URLSearchParams(search).get("mode") === "signup" ? "signup" : "signin"
}

/**
 * Why /login was reached, when an email link failed.
 *
 * `app/auth/callback/route.ts` sends a confirmation, invite or reset link that
 * could not be exchanged — expired, or already used — to
 * `/login?auth_error=callback`. Only that literal is read; anything else is no
 * notice at all, so a crafted URL cannot put words on the sign-in page.
 */
export type AuthError = "callback"

export function readAuthError(search: string): AuthError | null {
  return new URLSearchParams(search).get("auth_error") === "callback" ? "callback" : null
}
