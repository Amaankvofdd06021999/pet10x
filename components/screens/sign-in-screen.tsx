"use client"

import { useEffect, useRef, useState } from "react"
import { useAuth, MOCK_USERS, type DemoRole } from "@/lib/auth-context"
import { PasswordField } from "@/components/ui/password-field"
import { checkPassword } from "@/lib/auth/password-rules"
import {
  Dog,
  Building2,
  ChevronRight,
  PawPrint,
  ArrowLeft,
  Mail,
  Lock,
  Loader2,
  MailCheck,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"

const ROLE_CARDS: { role: DemoRole; icon: typeof Dog; iconColor: string; iconBg: string; accent: string }[] = [
  { role: "pet-owner", icon: Dog, iconColor: "text-primary", iconBg: "bg-primary/10", accent: "border-primary/20 active:border-primary/40" },
  { role: "building-manager", icon: Building2, iconColor: "text-info", iconBg: "bg-info/10", accent: "border-info/20 active:border-info/40" },
]

type SignInView = "main" | "verify-email"
type AuthMode = "signin" | "signup"

/** Mirrors the server's CODE_TTL_MINUTES / RESEND_COOLDOWN_SECONDS. */
const CODE_TTL_MS = 15 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000

const mmss = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

export function SignInScreen() {
  const { signIn, signInWithPassword, startSignup, verifySignup, resetPassword, supabaseEnabled } =
    useAuth()
  const [view, setView] = useState<SignInView>("main")

  // real-auth form state
  const [mode, setMode] = useState<AuthMode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  /* ── Email verification (signup step 2) ──
     The password lives here, in component state, from the moment it is typed
     until the code is verified. It is never sent with the code request, so an
     abandoned signup leaves no account and no credential on the server. */
  const [otp, setOtp] = useState("")
  const [expiresAt, setExpiresAt] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const otpInputRef = useRef<HTMLInputElement>(null)

  // One ticker for both countdowns, running only while the step is on screen.
  useEffect(() => {
    if (view !== "verify-email") return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [view])

  useEffect(() => {
    if (view === "verify-email") otpInputRef.current?.focus()
  }, [view])

  const msLeft = Math.max(0, expiresAt - now)
  const codeExpired = expiresAt > 0 && msLeft === 0
  const resendLeft = Math.max(0, resendAt - now)


  const handleAuth = async () => {
    setError(null)
    setInfo(null)
    if (!email.trim() || !password) {
      setError("Enter your email and password.")
      return
    }
    if (mode === "signup") {
      const verdict = checkPassword(password)
      if (!verdict.ok) {
        setError(verdict.failed[0])
        return
      }
    }
    setLoading(true)
    if (mode === "signin") {
      const { error: e } = await signInWithPassword(email.trim(), password)
      if (e) {
        setLoading(false)
        setError(e)
      }
      // success → keep the spinner running; AuthProvider is now loading the
      // profile in the background and will swap to the authed view when ready.
    } else {
      // No account is created by this call — it only sends the code.
      const { error: e, retryAfterSeconds } = await startSignup(email.trim(), fullName.trim() || undefined)
      setLoading(false)
      if (e) return setError(e)
      const t = Date.now()
      setExpiresAt(t + CODE_TTL_MS)
      setResendAt(t + (retryAfterSeconds ? retryAfterSeconds * 1000 : RESEND_COOLDOWN_MS))
      setNow(t)
      setOtp("")
      setView("verify-email")
    }
  }

  const handleVerify = async () => {
    setError(null)
    setInfo(null)
    if (otp.length !== 6) {
      setError("Enter the 6-digit code from your email.")
      return
    }
    if (codeExpired) {
      setError("That code has expired. Request a new one.")
      return
    }
    setLoading(true)
    const { error: e, expired } = await verifySignup(email.trim(), otp, password, fullName.trim() || undefined)
    if (e) {
      setLoading(false)
      setError(e)
      // A dead code can't be retyped into life — stop the clock so the UI
      // offers a resend instead of a countdown that no longer means anything.
      if (expired) setExpiresAt(0)
      setOtp("")
      return
    }
    // Success → the account exists and we're signed in. Keep the spinner up;
    // AuthProvider swaps to the authed view once the profile loads.
  }

  const handleResend = async () => {
    setError(null)
    setInfo(null)
    setLoading(true)
    const { error: e, retryAfterSeconds } = await startSignup(email.trim(), fullName.trim() || undefined)
    setLoading(false)
    if (e) return setError(e)
    const t = Date.now()
    setExpiresAt(t + CODE_TTL_MS)
    setResendAt(t + (retryAfterSeconds ? retryAfterSeconds * 1000 : RESEND_COOLDOWN_MS))
    setNow(t)
    setOtp("")
    setInfo(`New code sent to ${email.trim()}.`)
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

  /* ── Verify email (signup step 2) ── */
  if (view === "verify-email") {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <div className="flex items-center gap-2.5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
          <button
            onClick={() => {
              // Back, not cancel: email/password/name are kept so a mistyped
              // address can be corrected without retyping everything.
              setView("main")
              setError(null)
              setInfo(null)
              setOtp("")
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted transition-transform active:scale-95"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4.5 w-4.5 text-foreground" />
          </button>
          <h1 className="text-[17px] font-semibold text-foreground">Verify your email</h1>
        </div>

        <div className="flex-1 px-5 pt-6 sm:flex sm:flex-none sm:flex-col sm:justify-center sm:pt-10">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <MailCheck className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-center text-[20px] font-semibold text-foreground">Enter your code</h2>
          <p className="mt-1.5 text-center text-[14px] leading-relaxed text-muted-foreground">
            We sent a 6-digit code to <span className="font-semibold text-foreground">{email.trim()}</span>. Your
            account is created once it&rsquo;s verified.
          </p>

          <div className="mt-6">
            <label htmlFor="otp" className="sr-only">
              6-digit verification code
            </label>
            <input
              id="otp"
              ref={otpInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                setError(null)
              }}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              placeholder="••••••"
              aria-invalid={!!error}
              className="w-full rounded-xl border border-input bg-card py-4 text-center font-mono text-[28px] font-bold tracking-[0.4em] text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <span className={`text-[13px] ${codeExpired ? "text-destructive" : "text-muted-foreground"}`}>
                {codeExpired ? "Code expired" : `Expires in ${mmss(msLeft)}`}
              </span>
              <button
                onClick={handleResend}
                disabled={loading || (resendLeft > 0 && !codeExpired)}
                className="text-[13px] font-semibold text-primary disabled:text-muted-foreground"
              >
                {resendLeft > 0 && !codeExpired ? `Resend in ${Math.ceil(resendLeft / 1000)}s` : "Send a new code"}
              </button>
            </div>

            {error && <p className="mt-3 text-[13px] text-destructive">{error}</p>}
            {info && <p className="mt-3 text-[13px] text-success">{info}</p>}

            <button
              onClick={handleVerify}
              disabled={loading || otp.length !== 6 || codeExpired}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-strong py-3 text-[15px] font-semibold text-primary-strong-foreground transition-colors hover:bg-primary-strong/90 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify &amp; create account
            </button>

            <p className="mt-4 text-center text-[12px] leading-relaxed text-muted-foreground">
              Didn&rsquo;t get it? Check spam, or go back and confirm the address is right. No account exists until
              the code is entered.
            </p>
          </div>
        </div>
      </div>
    )
  }


  /* ── Main Sign-In View ── */
  return (
    <div className="flex min-h-dvh flex-col bg-background sm:justify-center sm:py-8">
      <div className="flex flex-col items-center px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-5 sm:pt-2">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[18px] bg-primary shadow-lg shadow-primary/20">
          <PawPrint className="h-8 w-8 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <h1 className="text-[24px] font-semibold text-foreground sm:text-[26px]">Welcome to Pet10x</h1>
        <p className="mt-1 text-center text-[14px] text-muted-foreground">Pet governance &amp; community for your building</p>
      </div>

      <div className="flex-1 px-5 sm:flex-none">
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
                  className="w-full rounded-xl border border-input bg-card px-4 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                  className="w-full rounded-xl border border-input bg-card py-3 pl-11 pr-4 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {/* Rules panel only while creating a password — showing a
                  strength checklist over a sign-in field would imply the
                  existing password is being judged. */}
              <PasswordField
                value={password}
                onChange={setPassword}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                onEnter={handleAuth}
                showRules={mode === "signup"}
              />

              {error && <p className="text-[13px] text-destructive">{error}</p>}
              {info && <p className="text-[13px] text-success">{info}</p>}

              <button
                onClick={handleAuth}
                disabled={loading}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-strong py-3 text-[15px] font-semibold text-primary-strong-foreground transition-colors hover:bg-primary-strong/90 disabled:opacity-60"
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

        {/* Incident reporting used to live here, behind the sign-in form.
            It is a public route now (/report), reachable from the landing nav —
            a witness who is not a resident should not have to look at a
            sign-up page to report a dog bite. */}
      </div>

      <div className="px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:pb-2">
        <Link
          href="/manager"
          className="block rounded-xl card-interactive py-2.5 text-center text-[13px] font-semibold text-info transition-colors active:bg-muted"
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
