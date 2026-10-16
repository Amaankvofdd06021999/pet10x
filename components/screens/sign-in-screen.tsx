"use client"

import { InfoText } from "@/components/ui/info-text"
import { useEffect, useRef, useState } from "react"
import { useAuth, MOCK_USERS, type DemoRole } from "@/lib/auth-context"
import { PasswordField } from "@/components/ui/password-field"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ErrorText } from "@/components/ui/error-text"
import { checkPassword } from "@/lib/auth/password-rules"
import { CodeEntry, CODE_TTL_MS, RESEND_COOLDOWN_MS } from "@/components/auth/code-entry"
import { saveDraft, loadDraft, clearDraft } from "@/lib/auth/signup-draft"
import {
  Dog,
  Building2,
  ChevronRight,
  PawPrint,
  ArrowLeft,
  Mail,
  Lock,
  MailCheck,
} from "lucide-react"
import Image from "next/image"
import { canOptimize } from "@/lib/image-src"
import Link from "next/link"
import { ConsentLine } from "@/components/legal/consent-line"

// The role is a Badge (dark words on a soft tint); only the little icon in it
// carries the role's colour.
const ROLE_CARDS: { role: DemoRole; icon: typeof Dog; iconColor: string; badge: "brand" | "info" }[] = [
  { role: "pet-owner", icon: Dog, iconColor: "text-primary", badge: "brand" },
  { role: "building-manager", icon: Building2, iconColor: "text-info", badge: "info" },
]

type SignInView = "main" | "verify-email"
type AuthMode = "signin" | "signup"

/* The tab's sessionStorage, or null where it cannot be opened (private mode
   can throw on access). Everything that touches the draft goes through this. */
function draftStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function SignInScreen({ initialMode = "signin" }: { initialMode?: AuthMode }) {
  const { signIn, signInWithPassword, startSignup, verifySignup, resetPassword, supabaseEnabled } =
    useAuth()
  const [view, setView] = useState<SignInView>("main")

  // real-auth form state
  const [mode, setMode] = useState<AuthMode>(initialMode)
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
  // True when the code screen was restored after a reload: the password was
  // never stored, so the code screen has to ask for it again.
  const [askPassword, setAskPassword] = useState(false)

  /* Come back to where the person left off. Runs after mount, not in the state
     initialisers, so server and client render the same first paint. A verify
     draft wins over `initialMode`: they were mid-sign-up, whatever the link says. */
  useEffect(() => {
    const storage = draftStorage()
    if (!storage) return
    const t = Date.now()
    const draft = loadDraft(storage, t)
    if (!draft) return
    setEmail(draft.email)
    setFullName(draft.name)
    if (draft.view === "verify") {
      setMode("signup")
      // The code's clock started when the draft was written; a late return
      // sees "Code expired" and the resend button, not a fresh countdown.
      setExpiresAt(draft.savedAt + CODE_TTL_MS)
      setNow(t)
      setAskPassword(true)
      setView("verify-email")
    }
  }, [])

  // Form drafts are written as the person types (sign-up only), not from an
  // effect, so going back or switching to Sign in can clear one without it
  // being rewritten on the next render.
  const rememberForm = (nextEmail: string, nextName: string) => {
    const storage = draftStorage()
    if (storage && mode === "signup") {
      saveDraft(storage, { email: nextEmail.trim(), name: nextName.trim(), view: "form" })
    }
  }
  const forgetDraft = () => {
    const storage = draftStorage()
    if (storage) clearDraft(storage)
  }

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
      setAskPassword(false)
      const storage = draftStorage()
      if (storage) saveDraft(storage, { email: email.trim(), name: fullName.trim(), view: "verify" }, t)
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
    if (askPassword) {
      // The server sets the password at verification, so it must be the one
      // that passes the same rules the sign-up form showed.
      if (!password) {
        setError("Enter your password.")
        return
      }
      const verdict = checkPassword(password)
      if (!verdict.ok) {
        setError(verdict.failed[0])
        return
      }
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
    forgetDraft()
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
    // A new code restarts the clock the restored screen counts from.
    const storage = draftStorage()
    if (storage) saveDraft(storage, { email: email.trim(), name: fullName.trim(), view: "verify" }, t)
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
          <Button
            type="button"
            variant="quiet"
            size="icon"
            onClick={() => {
              // Back, not cancel: email/password/name are kept so a mistyped
              // address can be corrected without retyping everything. The
              // saved draft goes, so a reload does not bounce back to the code.
              forgetDraft()
              setView("main")
              setError(null)
              setInfo(null)
              setOtp("")
            }}
            className="rounded-full bg-muted"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4.5 w-4.5 text-foreground" />
          </Button>
          <h1 className="text-title font-semibold text-foreground">Verify your email</h1>
        </div>

        <div className="flex-1 px-5 pt-6 sm:flex sm:flex-none sm:flex-col sm:justify-center sm:pt-10">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft">
            <MailCheck className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-center text-heading font-semibold text-foreground">Enter your code</h2>
          <p className="mt-1.5 text-center text-meta leading-relaxed text-muted-foreground">
            We sent a 6-digit code to <span className="font-semibold text-foreground">{email.trim()}</span>. Your
            account is created once it&rsquo;s verified.
          </p>

          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault()
              handleVerify()
            }}
          >
            <CodeEntry
              value={otp}
              onChange={(code) => {
                setOtp(code)
                setError(null)
              }}
              // Enter submits the surrounding form; handling it here too would verify twice.
              onEnter={() => {}}
              inputRef={otpInputRef}
              invalid={!!error}
              msLeft={msLeft}
              codeExpired={codeExpired}
              resendLeft={resendLeft}
              loading={loading}
              onResend={handleResend}
            />

            {askPassword && (
              <div className="mt-4">
                <label htmlFor="verify-password" className="mb-1.5 block text-meta font-medium text-foreground">
                  Your password
                </label>
                <PasswordField
                  id="verify-password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  placeholder="Password"
                  showRules
                />
              </div>
            )}

            {error && <ErrorText className="mt-3 text-meta">{error}</ErrorText>}
            {info && <InfoText className="mt-3">{info}</InfoText>}

            <Button
              type="submit"
              loading={loading}
              disabled={otp.length !== 6 || codeExpired}
              className="mt-5 w-full"
            >
              Verify &amp; create account
            </Button>

            <p className="mt-4 text-center text-caption leading-relaxed text-muted-foreground">
              Didn&rsquo;t get it? Check spam, or go back and confirm the address is right. No account exists until
              the code is entered.
            </p>
            <p className="mt-2 text-center text-caption leading-relaxed text-muted-foreground">
              Already have an account? We&rsquo;ve emailed you a sign-in link instead.
            </p>
          </form>
        </div>
      </div>
    )
  }


  /* ── Main Sign-In View ── */
  return (
    <div className="flex min-h-dvh flex-col bg-background sm:justify-center sm:py-8">
      <div className="flex flex-col items-center px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-5 sm:pt-2">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[18px] bg-primary shadow-sm">
          <PawPrint className="h-8 w-8 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <h1 className="text-[24px] font-semibold text-foreground sm:text-[26px]">Welcome to Pet10x</h1>
        <p className="mt-1 text-center text-meta text-muted-foreground">Pet governance &amp; community for your building</p>
      </div>

      <div className="flex-1 px-5 sm:flex-none">
        {supabaseEnabled ? (
          <>
            {/* Sign in / Sign up toggle */}
            <div className="mb-4 flex rounded-xl bg-muted p-1">
              {(["signin", "signup"] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m)
                    setError(null)
                    setInfo(null)
                    // Sign in is not part of a sign-up in progress.
                    if (m === "signin") forgetDraft()
                  }}
                  className={`flex-1 rounded-lg py-2 text-meta font-semibold transition-all ${
                    mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {m === "signin" ? "Sign in" : "Sign up"}
                </button>
              ))}
            </div>

            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                handleAuth()
              }}
              className="flex flex-col gap-3"
            >
              {mode === "signup" && (
                <div>
                  <label htmlFor="signup-name" className="mb-1.5 block text-meta font-medium text-foreground">
                    Your first name
                  </label>
                  <Input
                    id="signup-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value)
                      rememberForm(email, e.target.value)
                    }}
                    maxLength={80}
                    autoComplete="given-name"
                  />
                </div>
              )}
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    rememberForm(e.target.value, fullName)
                  }}
                  aria-label="Email"
                  placeholder="Email"
                  autoCapitalize="none"
                  autoComplete="email"
                  className="pl-11"
                />
              </div>
              {/* Rules panel only while creating a password — showing a
                  strength checklist over a sign-in field would imply the
                  existing password is being judged. */}
              <PasswordField
                id="auth-password"
                ariaLabel="Password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                showRules={mode === "signup"}
              />

              {error && <ErrorText className="text-meta">{error}</ErrorText>}
              {info && <InfoText>{info}</InfoText>}

              <Button type="submit" loading={loading} className="mt-1 w-full">
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>

              {mode === "signin" && (
                <Button type="button" variant="quiet" size="sm" onClick={handleForgot} className="self-center">
                  Forgot password?
                </Button>
              )}
            </form>
          </>
        ) : (
          <>
            {/* Mock demo sign-in (Supabase not configured) */}
            <p className="mb-3 text-caption font-semibold uppercase tracking-wide text-muted-foreground">Sign in as</p>
            <div className="flex flex-col gap-2.5">
              {ROLE_CARDS.map((card) => {
                const u = MOCK_USERS[card.role]
                const Icon = card.icon
                return (
                  <button
                    key={card.role}
                    onClick={() => signIn(card.role)}
                    className={`flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-all active:scale-[0.98]`}
                  >
                    <div className="relative h-11 w-11 overflow-hidden rounded-full bg-muted flex-shrink-0">
                      <Image src={u.avatar} alt={u.name} fill sizes="44px" className="object-cover" unoptimized={!canOptimize(u.avatar)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-body font-semibold text-foreground truncate">{u.name}</span>
                        <Badge variant={card.badge} className="flex-shrink-0">
                          <Icon className={`h-2.5 w-2.5 ${card.iconColor}`} />
                          {u.roleLabel}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-caption text-muted-foreground truncate">
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
        <Button asChild variant="secondary" className="h-auto w-full whitespace-normal py-2.5 text-center text-meta">
          <Link href="/manager">Are you a manager at a building? Sign in here</Link>
        </Button>
        <ConsentLine className="mt-3" />
      </div>
    </div>
  )
}
