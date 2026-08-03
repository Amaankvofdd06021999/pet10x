/**
 * Role-based access config — single source of truth for which routes each
 * role may reach. Mirrors the DB RLS policies in
 * supabase/migrations/20260601000001_functions_rls.sql and the access map in
 * the RBAC design doc. Consumed by middleware.ts (server-side redirect) and
 * by page-level Gate components (client-side UX for the loading/denied states).
 */
import type { UserRole } from "@/lib/data/types"

export type { UserRole }

/** Routes that require an authenticated session with a specific role/flag. */
export interface RoleRoute {
  /** Path prefix, matched with startsWith(). */
  prefix: string
  /** Roles allowed in, beyond the super-admin override. */
  roles?: UserRole[]
  /** Require profiles.is_super_admin = true (super-admin role alone isn't sufficient). */
  requireSuperAdmin?: boolean
  /**
   * When true, an *unauthenticated* visitor is NOT bounced to /login — the page
   * renders its own sign-in shell instead. Role enforcement still applies once a
   * user IS signed in (wrong role → redirected). Used by portals with a branded
   * login (e.g. the strata portal's blue gate).
   */
  ownLogin?: boolean
}

/**
 * Ordered by prefix specificity isn't required — matching uses the most
 * specific (longest) prefix that matches a given path.
 */
export const ROLE_ROUTES: RoleRoute[] = [
  // ownLogin: the page renders its own super-admin sign-in; a signed-in
  // non-super-admin is still redirected away by canAccessRoute below.
  { prefix: "/admin", requireSuperAdmin: true, ownLogin: true },
  // ownLogin: logged-out visitors get the branded business sign-in/sign-up page,
  // not the generic /login (which would also hide business sign-up entirely).
  { prefix: "/businessaccess", roles: ["business"], ownLogin: true },
  // The strata portfolio layer — a building_manager who runs many buildings.
  // Same role as /app, different surface; super-admin transcends via canAccessRoute.
  // ownLogin: logged-out visitors see the portal's own blue login, not /login.
  { prefix: "/strata-portal", roles: ["building-manager"], ownLogin: true },
  // /app is shared by pet-owner and building-manager; role branching happens
  // inside the page (owner vs manager tabs). Any authenticated non-business,
  // non-bare-super-admin account may enter.
  { prefix: "/app", roles: ["pet-owner", "building-manager", "super-admin"] },
]

/** Public/no-auth routes: "/", "/login", "/manager" (mgmt marketing/login), "/emergency/*". */
export function findRouteRule(pathname: string): RoleRoute | null {
  let best: RoleRoute | null = null
  for (const rule of ROLE_ROUTES) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + "/")) {
      if (!best || rule.prefix.length > best.prefix.length) best = rule
    }
  }
  return best
}

export interface RoleCheckSubject {
  role: UserRole | null
  isSuperAdmin: boolean
  isSuspended?: boolean
}

/** True if the given subject may access pathname. Unmatched paths are public. */
export function canAccessRoute(pathname: string, subject: RoleCheckSubject): boolean {
  if (subject.isSuspended) return false // suspended accounts lose every scope, on every route
  const rule = findRouteRule(pathname)
  if (!rule) return true
  if (subject.isSuperAdmin) return true // super-admin transcends every scope, per is_admin()
  if (rule.requireSuperAdmin) return false
  if (rule.roles && (!subject.role || !rule.roles.includes(subject.role))) return false
  return true
}

/* ------------------------------------------------------------------ */
/* Personas — what one account is entitled to *be*                     */
/* ------------------------------------------------------------------ */

/**
 * `profiles.role` holds one value, so it cannot describe a manager who also
 * owns a dog, or an admin who is also a resident. The grants that decide this
 * already exist as rows (building_managers, pets, is_super_admin); a persona is
 * just a name for one of them.
 *
 * A persona is a VIEW, not a permission. Switching does not grant anything —
 * RLS is unchanged and unchangeable from the client. It selects which surface
 * renders and which scope queries ask for, which is the part that was missing:
 * an account with the admin flag was shown the owner UI while its queries,
 * relying on RLS alone as their filter, returned every user's rows.
 */
export type Persona = "pet-owner" | "building-manager" | "strata-manager" | "super-admin" | "business"

export interface ManagedBuilding {
  id: string
  name: string
  isPrimary: boolean | null
}

/** Exactly the shape of the my_personas() RPC. */
export interface PersonaGrants {
  profileId: string | null
  defaultRole: string | null
  isSuspended: boolean
  isSuperAdmin: boolean
  ownsPets: boolean
  managedBuildings: ManagedBuilding[]
}

export const PERSONA_LABEL: Record<Persona, string> = {
  "pet-owner": "Pet owner",
  "building-manager": "Building manager",
  "strata-manager": "Strata portfolio",
  "super-admin": "Admin",
  business: "Business",
}

/** Where each persona lives, for the switcher to navigate to. */
export const PERSONA_ROUTE: Record<Persona, string> = {
  "pet-owner": "/app",
  "building-manager": "/app",
  "strata-manager": "/strata-portal",
  "super-admin": "/admin",
  business: "/businessaccess",
}

/**
 * The personas an account may wear, most-privileged last.
 *
 * Derived only from grants. A plain signup gets exactly one — "pet owner" —
 * so no switcher appears until an admin actually grants something. Being
 * granted is the only way to gain an option.
 */
export function personasFor(g: PersonaGrants): Persona[] {
  if (g.isSuspended) return []

  // A business account is a separate product surface, not a persona someone
  // holds alongside residency.
  if (g.defaultRole === "business") return ["business"]

  const personas: Persona[] = ["pet-owner"]

  if (g.managedBuildings.length >= 1) personas.push("building-manager")
  // Strata is the portfolio view — it only means anything across buildings.
  if (g.managedBuildings.length >= 2) personas.push("strata-manager")
  if (g.isSuperAdmin) personas.push("super-admin")

  return personas
}

/**
 * Which persona to land on when none has been chosen.
 *
 * An explicit grant outranks `profiles.role`. Granting someone a building is a
 * deliberate administrative act; the role column is a default that nothing
 * keeps in step with it, and in practice a person granted a building often
 * still reads `pet_owner` there.
 *
 * Preferring the column instead put a granted manager into *resident
 * onboarding* — "does your building manage pets?" asked of the person who
 * manages it — with their own building nowhere in sight.
 *
 * Not the most privileged, though: an admin who also manages a building is
 * usually there to manage the building, and should not land in the admin
 * console every morning. Both are one tap away in the switcher.
 */
export function defaultPersona(personas: Persona[], defaultRole: string | null): Persona | null {
  if (personas.length === 0) return null
  if (personas.includes("building-manager")) return "building-manager"

  const preferred = DB_ROLE_TO_PERSONA[defaultRole ?? ""]
  if (preferred && personas.includes(preferred)) return preferred
  return personas[0]
}

const DB_ROLE_TO_PERSONA: Record<string, Persona | undefined> = {
  pet_owner: "pet-owner",
  building_manager: "building-manager",
  super_admin: "super-admin",
  business: "business",
}

/** The switcher only exists for accounts that were granted more than one. */
export function canSwitchPersona(personas: Persona[]): boolean {
  return personas.length > 1
}

/**
 * Where to send an authenticated user whose role doesn't belong on the current
 * route — and where to land them after sign-in.
 *
 * The declared role is consulted BEFORE the admin flag, to agree with
 * `defaultPersona`. Checking `isSuperAdmin` first dropped an account that is
 * a resident holding an admin grant straight into the admin console, while the
 * switcher beside it read "Viewing as Pet owner" — the shell and the persona
 * disagreeing on the same screen.
 *
 * The flag still decides for someone whose role actually *is* super_admin, and
 * still transcends every scope in `canAccessRoute` — this is only about where
 * they start, which the switcher can change in one tap.
 */
export function getHomeRouteForRole(subject: RoleCheckSubject): string {
  switch (subject.role) {
    case "business":
      return "/businessaccess"
    case "pet-owner":
    case "building-manager":
      return "/app"
    case "super-admin":
      return "/admin"
    default:
      return subject.isSuperAdmin ? "/admin" : "/login"
  }
}
