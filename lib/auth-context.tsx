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

/** Build the app-facing user object from the Supabase auth user + profile + links. */
async function loadAppUser(authUser: User): Promise<AppUser> {
  const supabase = getSupabaseBrowserClient()!

  // One round trip each, all in parallel. The building/unit names are embedded
  // rather than fetched in follow-up queries — on a high-latency link those
  // sequential hops were costing the better part of a second on every load.
  const [{ data: profile }, { data: link }, { count }, { data: managed }] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, full_name, email, avatar_url, member_since, plan_label, onboarded, is_super_admin, is_suspended")
      .eq("id", authUser.id)
      .maybeSingle(),
    supabase
      .from("resident_links")
      .select("building_id, buildings(name), units(unit_number)")
      .eq("profile_id", authUser.id)
      .eq("status", "approved")
      .limit(1)
      .maybeSingle(),
    supabase.from("pets").select("id", { count: "exact", head: true }).eq("owner_id", authUser.id),
    // Ordered by is_primary so a multi-building manager always lands on the same one.
    supabase
      .from("building_managers")
      .select("building_id, buildings(name)")
      .eq("profile_id", authUser.id)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const appRole = DB_ROLE_TO_APP[profile?.role ?? "pet_owner"] ?? "pet-owner"
  const petCount = count ?? 0

  type Named = { name: string } | { name: string }[] | null
  const one = (v: Named): string => (Array.isArray(v) ? (v[0]?.name ?? "") : (v?.name ?? ""))

  let building = ""
  let unit = ""

  if (link?.building_id) {
    building = one(link.buildings as Named)
    const u = link.units as { unit_number: string } | { unit_number: string }[] | null
    unit = Array.isArray(u) ? (u[0]?.unit_number ?? "") : (u?.unit_number ?? "")
  } else if (managed?.building_id) {
    building = one(managed.buildings as Named)
    if (appRole === "building-manager") unit = "Office"
  }

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
    loadAppUser(authUser)
      .then((u) => {
        if (!active) return
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
    setUser((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const markOnboarded = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (supabase) {
      const {
        data: { user: au },
      } = await supabase.auth.getUser()
      if (au) await supabase.from("profiles").update({ onboarded: true }).eq("id", au.id)
    }
    setUser((prev) => (prev ? { ...prev, onboarded: true } : prev))
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
