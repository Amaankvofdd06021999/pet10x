"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import {
  MOCK_USERS,
  VALID_BUILDING_CODES,
  resolveBuildingCode,
  type AppUser,
  type DemoRole,
  type GuestSession,
  type UserRole,
} from "@/lib/data"

export type AuthMode = "full" | "guest"

/* Re-exported so existing imports (`@/lib/auth-context`) keep working. The
 * canonical definitions now live in the data layer (`@/lib/data`). */
export type { AppUser, GuestSession, UserRole, DemoRole }
export { MOCK_USERS, VALID_BUILDING_CODES }

interface AuthContextValue {
  user: AppUser | null
  guestSession: GuestSession | null
  authMode: AuthMode | null
  isAuthenticated: boolean
  isGuest: boolean
  /** Demo sign-in. Phase 1 replaces this with Supabase Auth (email/OTP/Apple). */
  signIn: (role: DemoRole) => void
  signInGuest: (code: string) => string | null // returns error or null
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  guestSession: null,
  authMode: null,
  isAuthenticated: false,
  isGuest: false,
  signIn: () => {},
  signInGuest: () => null,
  signOut: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [guestSession, setGuestSession] = useState<GuestSession | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)

  const signIn = useCallback((role: DemoRole) => {
    setUser(MOCK_USERS[role])
    setGuestSession(null)
    setAuthMode("full")
  }, [])

  const signInGuest = useCallback((code: string): string | null => {
    const building = resolveBuildingCode(code)
    if (!building) {
      return "Invalid building code. Please check with your building management."
    }
    setUser(null)
    setGuestSession({ buildingCode: code.trim().toUpperCase(), buildingName: building })
    setAuthMode("guest")
    return null
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
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
        signIn,
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
