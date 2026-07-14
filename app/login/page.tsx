"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { SignInScreen } from "@/components/screens/sign-in-screen"
import { getHomeRouteForRole, canAccessRoute } from "@/lib/rbac"
import { Loader2, PawPrint, Ban } from "lucide-react"

function LoginContent() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  // Read the query string after mount rather than with useSearchParams(). The
  // hook forces a server/client divergence on first paint (the server has no
  // search params to render with), which React reports as a hydration mismatch.
  // Starting both sides at `null` and filling it in an effect keeps the first
  // render identical on both.
  const [params, setParams] = useState<URLSearchParams | null>(null)
  useEffect(() => {
    setParams(new URLSearchParams(window.location.search))
  }, [])

  const suspended = params?.get("suspended") === "1"
  const next = params?.get("next") ?? null

  // Send each role to its own home (super admin → /admin, business →
  // /businessaccess, owner/manager → /app), honouring ?next= when the user was
  // bounced here from a page they're actually allowed to see. Redirecting from
  // an effect, not during render, so it can't fire mid-hydration.
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user || suspended) return
    const subject = { role: user.role, isSuperAdmin: user.isSuperAdmin, isSuspended: user.isSuspended }
    router.replace(next && canAccessRoute(next, subject) ? next : getHomeRouteForRole(subject))
  }, [isLoading, isAuthenticated, user, suspended, next, router])

  // Hold the spinner while the session resolves, and while an authenticated user
  // is being bounced to their own home — otherwise the sign-in form flashes.
  if (isLoading || (isAuthenticated && user && !suspended)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 animate-in fade-in duration-300">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
          <PawPrint className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
        </span>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md animate-in fade-in duration-300">
      {suspended && (
        <div className="mx-4 mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-[13px] text-destructive">
          <Ban className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>Your account has been suspended. Contact your Pet10x administrator for help.</span>
        </div>
      )}
      <SignInScreen />
    </div>
  )
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginContent />
    </AuthProvider>
  )
}
