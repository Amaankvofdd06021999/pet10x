"use client"

import { useState } from "react"
import { useAuth, MOCK_USERS, type DemoRole } from "@/lib/auth-context"
import {
  Dog,
  Building2,
  ChevronRight,
  PawPrint,
  KeyRound,
  AlertTriangle,
  ArrowLeft,
  Mail,
  Lock,
  Loader2,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"

const ROLE_CARDS: { role: DemoRole; icon: typeof Dog; iconColor: string; iconBg: string; accent: string }[] = [
  { role: "pet-owner", icon: Dog, iconColor: "text-primary", iconBg: "bg-primary/10", accent: "border-primary/20 active:border-primary/40" },
  { role: "building-manager", icon: Building2, iconColor: "text-info", iconBg: "bg-info/10", accent: "border-info/20 active:border-info/40" },
]

type SignInView = "main" | "building-code"
type AuthMode = "signin" | "signup"

export function SignInScreen() {
  const { signIn, signInWithPassword, signUp, resetPassword, signInGuest, supabaseEnabled } = useAuth()
  const [view, setView] = useState<SignInView>("main")
  const [buildingCode, setBuildingCode] = useState("")
  const [codeError, setCodeError] = useState<string | null>(null)

  // real-auth form state
  const [mode, setMode] = useState<AuthMode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleGuestSignIn = () => {
    if (!buildingCode.trim()) {
      setCodeError("Please enter your building code.")
      return
    }
    const err = signInGuest(buildingCode)
    if (err) setCodeError(err)
  }

  const handleAuth = async () => {
    setError(null)
    setInfo(null)
    if (!email.trim() || !password) {
      setError("Enter your email and password.")
      return
    }
    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    setLoading(true)
    if (mode === "signin") {
      const { error: e } = await signInWithPassword(email.trim(), password)
      setLoading(false)
      if (e) setError(e)
      // success → AuthProvider flips the app to the authed view automatically
    } else {
      const { error: e, needsConfirmation } = await signUp(email.trim(), password, fullName.trim() || undefined)
      setLoading(false)
      if (e) setError(e)
      else if (needsConfirmation) setInfo("Almost there — check your email to confirm your account.")
    }
  }

  const handleForgot = async () => {
    setError(null)
    setInfo(null)
    if (!email.trim()) {
      setError("Enter your email first, then tap “Forgot password”.")
      return
    }
    const { error: e } = await resetPassword(email.trim())
    if (e) setError(e)
    else setInfo(`Password reset link sent to ${email.trim()}.`)
  }

  /* ── Building Code (guest) View ── */
  if (view === "building-code") {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <div className="flex items-center gap-2.5 px-4 pt-[env(safe-area-inset-top,48px)] pb-2">
          <button
            onClick={() => { setView("main"); setCodeError(null); setBuildingCode("") }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted transition-transform active:scale-95"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4.5 w-4.5 text-foreground" />
          </button>
          <h1 className="text-[17px] font-semibold text-foreground">Report an Incident</h1>
        </div>

        <div className="flex-1 px-5 pt-6">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-center text-[20px] font-semibold text-foreground">Enter Building Code</h2>
          <p className="mt-1.5 text-center text-[14px] leading-relaxed text-muted-foreground">
            No account needed. Enter the code from your property management to file an incident report.
          </p>

          <div className="mt-6">
            <label htmlFor="building-code" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Building Code
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
              <input
                id="building-code"
                type="text"
                value={buildingCode}
                onChange={(e) => { setBuildingCode(e.target.value.toUpperCase()); setCodeError(null) }}
                placeholder="e.g. HVT2024"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={10}
                className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-[16px] font-mono font-semibold tracking-widest text-foreground placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:tracking-normal focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {codeError && <p className="mt-1.5 text-[13px] text-destructive">{codeError}</p>}
          </div>

          <button
            onClick={handleGuestSignIn}
            className="mt-5 w-full rounded-xl bg-destructive py-3 text-[15px] font-semibold text-destructive-foreground transition-transform active:scale-[0.98]"
          >
            Continue to Report
          </button>

          <div className="mt-6 rounded-xl bg-muted/60 p-3.5">
            <p className="text-[12px] font-semibold text-foreground">Where do I find my building code?</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Check the lobby notice board, ask your concierge, or look in your building welcome package.
            </p>
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Demo: use code <span className="font-mono font-semibold text-foreground">HVT2024</span>
          </p>
        </div>
      </div>
    )
  }

  /* ── Main Sign-In View ── */
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="flex flex-col items-center px-5 pt-[env(safe-area-inset-top,48px)] pb-5">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[18px] bg-primary shadow-lg shadow-primary/20">
          <PawPrint className="h-8 w-8 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <h1 className="text-[24px] font-semibold text-foreground">Welcome to Pet10x</h1>
        <p className="mt-1 text-center text-[14px] text-muted-foreground">Pet governance &amp; community for your building</p>
      </div>

      <div className="flex-1 px-5">
        {supabaseEnabled ? (
          <>
            {/* Sign in / Sign up toggle */}
            <div className="mb-4 flex rounded-xl bg-muted p-1">
              {(["signin", "signup"] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(null); setInfo(null) }}
                  className={`flex-1 rounded-lg py-2 text-[14px] font-semibold transition-all ${
                    mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {m === "signin" ? "Sign in" : "Sign up"}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              {mode === "signup" && (
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoCapitalize="none"
                  autoComplete="email"
                  className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                  className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {error && <p className="text-[13px] text-destructive">{error}</p>}
              {info && <p className="text-[13px] text-success">{info}</p>}

              <button
                onClick={handleAuth}
                disabled={loading}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>

              {mode === "signin" && (
                <button onClick={handleForgot} className="text-center text-[13px] font-medium text-primary">
                  Forgot password?
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Mock demo sign-in (Supabase not configured) */}
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sign in as</p>
            <div className="flex flex-col gap-2.5">
              {ROLE_CARDS.map((card) => {
                const u = MOCK_USERS[card.role]
                const Icon = card.icon
                return (
                  <button
                    key={card.role}
                    onClick={() => signIn(card.role)}
                    className={`flex items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-all active:scale-[0.98] ${card.accent}`}
                  >
                    <div className="relative h-11 w-11 overflow-hidden rounded-full bg-muted flex-shrink-0">
                      <Image src={u.avatar} alt={u.name} fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] font-semibold text-foreground truncate">{u.name}</span>
                        <span className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold flex-shrink-0 ${card.iconBg} ${card.iconColor}`}>
                          <Icon className="h-2.5 w-2.5" />
                          {u.roleLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted-foreground truncate">
                        {u.role === "building-manager" ? u.building : `Unit ${u.unit}`} &middot; {u.description}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 border-t border-border" />
          <span className="text-[12px] text-muted-foreground">or</span>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* Guest / Incident Report */}
        <button
          onClick={() => setView("building-code")}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-destructive/25 bg-destructive/5 p-3 text-left transition-all active:scale-[0.98]"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[15px] font-semibold text-foreground">Report an Incident</span>
            <p className="mt-0.5 text-[12px] text-muted-foreground">No account needed &middot; Use building code</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </button>
      </div>

      <div className="px-5 pb-[env(safe-area-inset-bottom,24px)] pt-4">
        <Link
          href="/manager"
          className="block rounded-xl border border-border bg-card py-2.5 text-center text-[13px] font-semibold text-info transition-colors active:bg-muted"
        >
          Are you a manager at a building? Sign in here
        </Link>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          By continuing, you agree to our Terms &amp; Privacy Policy
        </p>
      </div>
    </div>
  )
}
