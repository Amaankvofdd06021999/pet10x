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
}

/**
 * Ordered by prefix specificity isn't required — matching uses the most
 * specific (longest) prefix that matches a given path.
 */
export const ROLE_ROUTES: RoleRoute[] = [
  { prefix: "/admin", requireSuperAdmin: true },
  { prefix: "/businessaccess", roles: ["business"] },
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

/** Where to send an authenticated user whose role doesn't belong on the current route. */
export function getHomeRouteForRole(subject: RoleCheckSubject): string {
  if (subject.isSuperAdmin) return "/admin"
  switch (subject.role) {
    case "business":
      return "/businessaccess"
    case "pet-owner":
    case "building-manager":
      return "/app"
    default:
      return "/login"
  }
}
