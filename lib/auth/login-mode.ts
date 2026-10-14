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
