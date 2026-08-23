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
  clearSelectedPet,
  type AppUser,
  type DemoRole,
  type GuestSession,
  type UserRole,
} from "@/lib/data"
import {
  canSwitchPersona,
  defaultPersona,
  personasFor,
  type ManagedBuilding,
  type Persona,
  type PersonaGrants,
} from "@/lib/rbac"
import { parseDbDate } from "@/lib/dates"

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

/* A `date` column, read through the one rule rather than a second spelling of
 * it. The `T00:00:00` splice this replaced was already correct. */
function formatMonthYear(d: string | null | undefined): string {
  const dt = parseDbDate(d)
  return dt === null ? "" : dt.toLocaleDateString("en-US", { month: "short", year: "numeric" })
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
/**
 * Bounds the profile round trip so a stalled connection can never hold the
 * sign-in spinner open forever — a slow/dropped request now falls through to
 * the minimal-profile fallback below instead of hanging indefinitely.
 */
const LOAD_APP_USER_TIMEOUT_MS = 8000

/**
 * Record the browser's IANA zone once, if the profile has none.
 *
 * Care reminders resolve their times in this zone; without it they fall back
 * to the project's region, which fires at the wrong hour for anyone outside
 * it. Captured at session load rather than only at onboarding so existing
 * accounts — all of which predate the column — get one on their next visit.
 *
 * Only writes when the column is null: a value set deliberately (support
 * correcting a traveller's zone) must not be overwritten by whatever device
 * they happen to open next.
 */
async function ensureTimezone(userId: string): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz) return
    await supabase.from("profiles").update({ timezone: tz }).eq("id", userId).is("timezone", null)
  } catch {
    // Best effort. A failure here must never block sign-in.
  }
}

async function loadAppUser(authUser: User): Promise<AppUser> {
  const supabase = getSupabaseBrowserClient()!

  const { data } = await Promise.race([
    supabase.rpc("my_app_user"),
    new Promise<{ data: null }>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out loading profile.")), LOAD_APP_USER_TIMEOUT_MS),
    ),
  ])
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

/* Persona choice is remembered per profile id, never globally: two accounts on
   one device must not inherit each other's view. */
const PERSONA_KEY = (profileId: string) => `pet10x.persona.${profileId}`
const BUILDING_KEY = (profileId: string) => `pet10x.building.${profileId}`

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* private mode / quota — the preference is optional */
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
  /* ── Personas ──
     Which surfaces this account was granted, and which it is currently
     wearing. A persona is a view, never a permission: switching changes what
     the app renders and what scope its queries ask for. RLS is untouched and
     cannot be influenced from here. */
  personas: Persona[]
  activePersona: Persona | null
  /**
   * The persona actually driving the UI, fallback resolved.
   *
   * Everything that branches on "am I a manager right now?" — tab bar,
   * sidebar, the surface router, the onboarding gate — must read THIS and not
   * `user.role`, or the switcher changes one of them and not the others. That
   * is precisely what happened: switching to the resident view left the
   * manager tab bar in place.
   */
  viewAs: Persona
  /** No-op unless the persona was actually granted — the client cannot invent one. */
  setActivePersona: (p: Persona) => void
  /** True only when more than one was granted; otherwise no switcher is shown. */
  canSwitch: boolean
  /** Buildings this account manages, for the strata/multi-building switcher. */
  managedBuildings: ManagedBuilding[]
  activeBuildingId: string | null
  setActiveBuilding: (id: string) => void
  /** Mock demo sign-in — only used when Supabase isn't configured. */
  signIn: (role: DemoRole) => void
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  /**
   * Step 1 of signup: email a 6-digit code. Creates no account.
   * `retryAfterSeconds` is set when a still-valid code was sent recently.
   */
  startSignup: (
    email: string,
    fullName?: string,
  ) => Promise<{ error: string | null; retryAfterSeconds?: number }>
  /**
   * Step 2: verify the code and create the account, then sign in.
   * `expired` means the code is dead and a new one must be requested.
   */
  verifySignup: (
    email: string,
    code: string,
    password: string,
    fullName?: string,
  ) => Promise<{ error: string | null; expired?: boolean }>
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
  personas: [],
  activePersona: null,
  viewAs: "pet-owner",
  setActivePersona: () => {},
  canSwitch: false,
  managedBuildings: [],
  activeBuildingId: null,
  setActiveBuilding: () => {},
  signIn: () => {},
  signInWithPassword: async () => ({ error: "Auth not configured." }),
  startSignup: async () => ({ error: "Auth not configured." }),
  verifySignup: async () => ({ error: "Auth not configured." }),
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

  /* ── Persona state ──
     `grants` is whatever my_personas() reported; it is the only input to
     which personas exist. The chosen persona is remembered per profile so a
     manager who was working in the manager view is still there tomorrow, and
     so one account's choice never leaks into another's on a shared device. */
  const [grants, setGrants] = useState<PersonaGrants | null>(null)
  const [activePersona, setActivePersonaState] = useState<Persona | null>(null)
  const [activeBuildingId, setActiveBuildingState] = useState<string | null>(null)

  const personas = grants ? personasFor(grants) : []
  const managedBuildings = grants?.managedBuildings ?? []
  const canSwitch = canSwitchPersona(personas)

  /* The single answer to "which surface am I on?".
   *
   * Falls back to the role column while grants are still loading and in mock
   * mode, where there is no RPC to ask — so the UI never flickers through the
   * wrong surface on a cold load. */
  const viewAs: Persona =
    activePersona ?? (user?.role === "building-manager" ? "building-manager" : "pet-owner")

  useEffect(() => {
    if (!SUPABASE_ENABLED || !authUser) {
      setGrants(null)
      setActivePersonaState(null)
      setActiveBuildingState(null)
      return
    }
    let active = true
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    void supabase.rpc("my_personas").then(({ data, error }) => {
      if (!active || error || !data) return
      // jsonb comes back as the generated `Json` union; the shape is fixed by
      // my_personas() itself, which is the contract this mirrors.
      const raw = data as unknown as {
        profile_id: string | null
        default_role: string | null
        is_suspended: boolean
        is_super_admin: boolean
        owns_pets: boolean
        managed_buildings: ManagedBuilding[]
      }
      const g: PersonaGrants = {
        profileId: raw.profile_id,
        defaultRole: raw.default_role,
        isSuspended: raw.is_suspended,
        isSuperAdmin: raw.is_super_admin,
        ownsPets: raw.owns_pets,
        managedBuildings: raw.managed_buildings ?? [],
      }
      setGrants(g)

      const available = personasFor(g)
      // A remembered choice is only honoured if it is still granted — access
      // revoked elsewhere must not survive in this browser's localStorage.
      const remembered = readStored(PERSONA_KEY(authUser.id)) as Persona | null
      setActivePersonaState(
        remembered && available.includes(remembered) ? remembered : defaultPersona(available, g.defaultRole),
      )

      const rememberedBuilding = readStored(BUILDING_KEY(authUser.id))
      const ids = g.managedBuildings.map((b) => b.id)
      setActiveBuildingState(
        rememberedBuilding && ids.includes(rememberedBuilding) ? rememberedBuilding : (ids[0] ?? null),
      )
    })
    return () => {
      active = false
    }
  }, [authUser])

  const setActivePersona = useCallback(
    (p: Persona) => {
      // Silently ignore anything not granted. The switcher only offers valid
      // options, so reaching here with an invalid one means something is
      // trying to assign itself a persona.
      if (!grants || !personasFor(grants).includes(p)) return
      setActivePersonaState(p)
      if (authUser) writeStored(PERSONA_KEY(authUser.id), p)
    },
    [grants, authUser],
  )

  const setActiveBuilding = useCallback(
    (id: string) => {
      if (!grants?.managedBuildings.some((b) => b.id === id)) return
      setActiveBuildingState(id)
      if (authUser) writeStored(BUILDING_KEY(authUser.id), id)
    },
    [grants, authUser],
  )

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
    const supabase = getSupabaseBrowserClient()!
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
      .catch(async (err) => {
        if (!active) return
        // The profile round trip failed or timed out. Rather than leaving
        // `user` null forever — which would hold the sign-in spinner open
        // indefinitely with no way out short of a manual reload — fall
        // through to a minimal profile. Try one cheap, single-table lookup
        // for the real role first (the full RPC joins several tables and is
        // more likely to be what stalled); only default to pet-owner if that
        // also fails, so a manager account doesn't get silently misrouted.
        console.error("loadAppUser failed, using fallback profile:", err)
        let role: UserRole = "pet-owner"
        try {
          const { data: p } = await Promise.race([
            supabase.from("profiles").select("role").eq("id", authUser.id).maybeSingle(),
            new Promise<{ data: null }>((_, reject) =>
              setTimeout(() => reject(new Error("fallback role lookup timed out")), 3000),
            ),
          ])
          if (p?.role) role = DB_ROLE_TO_APP[p.role] ?? "pet-owner"
        } catch {
          /* keep the pet-owner default */
        }
        if (!active) return
        const fallback: AppUser = {
          id: authUser.id,
          name: authUser.email?.split("@")[0] || "User",
          email: authUser.email || "",
          avatar: "",
          unit: "",
          building: "",
          role,
          roleLabel: ROLE_LABEL[role],
          description: ROLE_LABEL[role],
          memberSince: "",
          plan: "Free",
          petCount: 0,
          onboarded: false,
          isSuperAdmin: false,
          isSuspended: false,
        }
        setUser(fallback)
        setAuthMode("full")
      })
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

  /**
   * Signup is a two-step, server-side flow — the browser no longer calls
   * `supabase.auth.signUp()`.
   *
   * That call created a live `auth.users` row (and, via the
   * on_auth_user_created trigger, a profiles row) the moment it ran. With
   * email confirmation disabled on the project, typing any address into the
   * form was enough to register it.
   *
   * The password is deliberately NOT sent in step 1. It stays in this
   * component's state until the code is verified, so an abandoned signup
   * leaves neither an account nor a credential behind.
   */
  const startSignup = useCallback(async (email: string, fullName?: string) => {
    try {
      const res = await fetch("/api/auth/signup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return { error: json.error ?? "Something went wrong. Try again." }
      return { error: null, retryAfterSeconds: json.retryAfterSeconds as number | undefined }
    } catch {
      return { error: "Network error. Check your connection and try again." }
    }
  }, [])

  const verifySignup = useCallback(
    async (email: string, code: string, password: string, fullName?: string) => {
      try {
        const res = await fetch("/api/auth/signup/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code, password, fullName }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { error: json.error ?? "Something went wrong. Try again.", expired: !!json.expired }

        // The account exists and is confirmed; sign in with the password the
        // browser has been holding. Doing it here rather than on the server
        // keeps the session in the same place every other sign-in puts it.
        const supabase = getSupabaseBrowserClient()
        if (!supabase) return { error: "Auth not configured." }
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        // The account was created either way — a failure here is a sign-in
        // problem, not a signup one, and must not read as "try signing up
        // again".
        return { error: error ? "Account created. Please sign in." : null }
      } catch {
        return { error: "Network error. Check your connection and try again." }
      }
    },
    [],
  )

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
    // The pets are gone, so the id remembered against them names nothing. The
    // storage key already carries the profile id, so this is not about bleed
    // between accounts — it is about not leaving the previous person's pet
    // named in storage on a shared device.
    clearSelectedPet()
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
        personas,
        activePersona,
        viewAs,
        setActivePersona,
        canSwitch,
        managedBuildings,
        activeBuildingId,
        setActiveBuilding,
        signIn,
        signInWithPassword,
        startSignup,
        verifySignup,
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
