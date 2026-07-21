"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { resolveBuildingCodeLive } from "@/lib/data/incidents"
import {
  MOCK_USERS,
  VALID_BUILDING_CODES,
  resolveBuildingCode,
  clearPetsCache,
  type AppUser,
  type DemoRole,
  type GuestSession,
  type UserRole,
} from "@/lib/data"

export type AuthMode = "full" | "guest"

/* Re-exported so existing imports (`@/lib/auth-context`) keep working. */
export type { AppUser, GuestSession, UserRole, DemoRole }
export { MOCK_USERS, VALID_BUILDING_CODES }

const SUPABASE_ENABLED = isSupabaseConfigured()

const DB_ROLE_TO_APP: Record<string, UserRole> = {
  pet_owner: "pet-owner",
  building_manager: "building-manager",
  super_admin: "super-admin",
  business: "business",
}
const ROLE_LABEL: Record<UserRole, string> = {
  "pet-owner": "Pet Owner",
  "building-manager": "Building Manager",
  "super-admin": "Super Admin",
  business: "Business",
}

function formatMonthYear(d: string | null | undefined): string {
  if (!d) return ""
  const dt = new Date(`${d}T00:00:00`)
  return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

function sanitizeAuthError(message: string): string {
  const m = message.toLowerCase()
  if (/rate limit|too many|over.*limit/.test(m)) return "Please wait a moment before trying again."
  if (/invalid login|invalid credentials|wrong password/.test(m)) return "Incorrect email or password."
  if (/email not confirmed|not confirmed/.test(m)) return "Please confirm your email first — check your inbox."
  if (/already registered|already exists|user already/.test(m)) return "An account with this email already exists."
  if (/password/.test(m) && /weak|short|least/.test(m)) return "Password must be at least 8 characters."
  return "Something went wrong. Please try again."
}

/**
 * Build the app-facing user object from the Supabase auth user.
 *
 * This used to fan out into four PostgREST queries. They ran in parallel, but
 * each one was still a chance to stall on a slow link, and users can be a long
 * way from the database region. `my_app_user()` returns the whole thing —
 * profile, building/unit, pet count — in a single round trip, still RLS-scoped.
 */
async function loadAppUser(authUser: User): Promise<AppUser> {
  const supabase = getSupabaseBrowserClient()!

  const { data } = await supabase.rpc("my_app_user")
  const j = (data ?? {}) as {
    role?: string
    full_name?: string | null
    email?: string | null
    avatar_url?: string | null
    member_since?: string | null
    plan_label?: string | null
    onboarded?: boolean
    is_super_admin?: boolean
    is_suspended?: boolean
    pet_count?: number
    building?: { name?: string | null; unit?: string | null } | null
  }

  const profile = {
    role: j.role,
    full_name: j.full_name,
    email: j.email,
    avatar_url: j.avatar_url,
    member_since: j.member_since,
    plan_label: j.plan_label,
    onboarded: j.onboarded,
    is_super_admin: j.is_super_admin,
    is_suspended: j.is_suspended,
  }
  const appRole = DB_ROLE_TO_APP[profile.role ?? "pet_owner"] ?? "pet-owner"
  const petCount = j.pet_count ?? 0

  const building = j.building?.name ?? ""
  let unit = j.building?.unit ?? ""
  // A manager's "unit" is their office, not a home.
  if (!unit && building && appRole === "building-manager") unit = "Office"

  return {
    id: authUser.id,
    name: profile?.full_name || authUser.email?.split("@")[0] || "User",
    email: profile?.email || authUser.email || "",
    avatar: profile?.avatar_url || "",
    unit,
    building,
    role: appRole,
    roleLabel: ROLE_LABEL[appRole],
    description:
      appRole === "pet-owner" ? `${petCount} pet${petCount === 1 ? "" : "s"} registered` : ROLE_LABEL[appRole],
    memberSince: formatMonthYear(profile?.member_since),
    plan: profile?.plan_label || "Free",
    petCount,
    onboarded: profile?.onboarded ?? false,
    isSuperAdmin: profile?.is_super_admin ?? false,
    isSuspended: profile?.is_suspended ?? false,
  }
}

/**
 * Last successfully-resolved app user, held at module scope so it outlives an
 * AuthProvider remount. Each route mounts its own provider, so the redirect
 * after sign-in (/login → /app, → /admin, → /businessaccess) used to re-resolve
 * the profile from scratch and flash a full-screen spinner.
 * With this, the second mount paints instantly and revalidates in the
 * background. Cleared on sign-out; kept in step with local user edits.
 * Module scope is per-tab; the localStorage mirror below survives reloads.
 */
let cachedAppUser: AppUser | null = null

/**
 * ...and mirrored into localStorage so a hard reload paints from cache too.
 * This is a rendering cache only: it decides which tabs to draw first, never
 * what data you may read. Every real permission is still enforced by RLS and by
 * the server-side middleware, and the cache is revalidated on every mount and
 * dropped on sign-out.
 */
const USER_CACHE_KEY = "pet10x.appUser.v1"

function readPersistedUser(): AppUser | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(USER_CACHE_KEY)
    return raw ? (JSON.parse(raw) as AppUser) : null
  } catch {
    return null
  }
}

function persistUser(u: AppUser | null): void {
  if (typeof window === "undefined") return
  try {
    if (u) window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u))
    else window.localStorage.removeItem(USER_CACHE_KEY)
  } catch {
    /* private mode / quota — the cache is optional */
  }
}

interface AuthContextValue {
  user: AppUser | null
  guestSession: GuestSession | null
  authMode: AuthMode | null
  isAuthenticated: boolean
  isGuest: boolean
  isLoading: boolean
  supabaseEnabled: boolean
  /** Mock demo sign-in — only used when Supabase isn't configured. */
  signIn: (role: DemoRole) => void
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<{ error: string | null; needsConfirmation?: boolean }>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  markOnboarded: () => Promise<void>
  /** Patch the locally-cached user after a profile write elsewhere (e.g. account.ts). */
  updateLocalUser: (patch: Partial<AppUser>) => void
  signInGuest: (code: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  guestSession: null,
  authMode: null,
  isAuthenticated: false,
  isGuest: false,
  isLoading: true,
  supabaseEnabled: SUPABASE_ENABLED,
  signIn: () => {},
  signInWithPassword: async () => ({ error: "Auth not configured." }),
  signUp: async () => ({ error: "Auth not configured." }),
  resetPassword: async () => ({ error: "Auth not configured." }),
  markOnboarded: async () => {},
  updateLocalUser: () => {},
  signInGuest: async () => null,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const [isLoading, setIsLoading] = useState(SUPABASE_ENABLED)

  // Track the Supabase session (real mode only). Profile is loaded in a separate
  // effect to avoid running queries inside the onAuthStateChange callback.
  useEffect(() => {
    if (!SUPABASE_ENABLED) return
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setAuthUser(data.session?.user ?? null)
      if (!data.session) setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null)
      if (!session) {
        cachedAppUser = null
        persistUser(null)
        setUser(null)
        setAuthMode((m) => (m === "guest" ? m : null))
        setIsLoading(false)
      }
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // Load the app user whenever the Supabase auth user changes.
  useEffect(() => {
    if (!SUPABASE_ENABLED) return
    if (!authUser) return
    let active = true

    // Same user we already resolved before → paint from cache now and revalidate
    // below, instead of blocking the screen on a cross-region round trip.
    if (!cachedAppUser) cachedAppUser = readPersistedUser()
    if (cachedAppUser && cachedAppUser.id === authUser.id) {
      setUser(cachedAppUser)
      setAuthMode("full")
      setIsLoading(false)
    }

    loadAppUser(authUser)
      .then((u) => {
        if (!active) return
        cachedAppUser = u
        persistUser(u)
        setUser(u)
        setAuthMode("full")
      })
      .catch(() => {})
      .finally(() => active && setIsLoading(false))
    return () => {
      active = false
    }
  }, [authUser])

  const signIn = useCallback((role: DemoRole) => {
    if (SUPABASE_ENABLED) return // demo sign-in is mock-mode only
    setUser(MOCK_USERS[role])
    setGuestSession(null)
    setAuthMode("full")
  }, [])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { error: "Auth not configured." }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? sanitizeAuthError(error.message) : null }
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { error: "Auth not configured." }
    const emailRedirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/auth/callback?next=/app` : undefined
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo },
    })
    if (error) return { error: sanitizeAuthError(error.message) }
    return { error: null, needsConfirmation: !data.session }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { error: "Auth not configured." }
    // Route through the server callback: PKCE recovery codes are exchanged there
    // (the code-verifier lives in an httpOnly cookie the browser can't read),
    // which then forwards to the set-password page with an active session.
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/set-password")}`
        : undefined
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    return { error: error ? sanitizeAuthError(error.message) : null }
  }, [])

  const updateLocalUser = useCallback((patch: Partial<AppUser>) => {
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      if (cachedAppUser?.id === next.id) {
        cachedAppUser = next
        persistUser(next)
      }
      return next
    })
  }, [])

  const markOnboarded = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (supabase) {
      const {
        data: { user: au },
      } = await supabase.auth.getUser()
      if (au) await supabase.from("profiles").update({ onboarded: true }).eq("id", au.id)
    }
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, onboarded: true }
      if (cachedAppUser?.id === next.id) {
        cachedAppUser = next
        persistUser(next)
      }
      return next
    })
  }, [])

  const signInGuest = useCallback(async (code: string): Promise<string | null> => {
    // Resolve against the real buildings table. (Before Supabase is configured
    // we fall back to the mock list so the demo still runs offline.)
    const building = SUPABASE_ENABLED
      ? (await resolveBuildingCodeLive(code)).name ?? null
      : resolveBuildingCode(code)

    if (!building) return "That building code isn't recognised. Check with your building management."
    setUser(null)
    setGuestSession({ buildingCode: code.trim().toUpperCase(), buildingName: building })
    setAuthMode("guest")
    return null
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (supabase) await supabase.auth.signOut().catch(() => {})
    clearPetsCache()
    cachedAppUser = null
    persistUser(null)
    setUser(null)
    setAuthUser(null)
    setGuestSession(null)
    setAuthMode(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        guestSession,
        authMode,
        isAuthenticated: !!user || !!guestSession,
        isGuest: authMode === "guest",
        isLoading,
        supabaseEnabled: SUPABASE_ENABLED,
        signIn,
        signInWithPassword,
        signUp,
        resetPassword,
        markOnboarded,
        updateLocalUser,
        signInGuest,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
