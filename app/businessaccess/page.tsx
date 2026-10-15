"use client"

import { useEffect, useRef, useState } from "react"
import { PasswordField } from "@/components/ui/password-field"
import { CodeEntry, CODE_TTL_MS, RESEND_COOLDOWN_MS } from "@/components/auth/code-entry"
import { ConsentLine } from "@/components/legal/consent-line"
import { HelpLegalLinks } from "@/components/legal/help-legal-section"
import { NotificationSettingsSheet } from "@/components/notification-settings-sheet"
import { ConsoleInbox } from "@/components/notifications/console-inbox"
import { checkPassword } from "@/lib/auth/password-rules"
import { BUSINESS_CATEGORIES } from "@/lib/auth/signup-intent"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { canAccessRoute } from "@/lib/rbac"
import { readTargetParam, resolveConsoleTarget } from "@/lib/navigation"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { ErrorText } from "@/components/ui/error-text"
import { InfoText } from "@/components/ui/info-text"
import { useMyBusiness } from "@/lib/data/business"
import { feePercentLabel } from "@/lib/data/fees"
import { DashboardTab } from "@/components/screens/business/dashboard-tab"
import { BookingsTab } from "@/components/screens/business/bookings-tab"
import { StorefrontTab } from "@/components/screens/business/storefront-tab"
import { PromotionsTab } from "@/components/screens/business/promotions-tab"
import { EarningsTab } from "@/components/screens/business/earnings-tab"
import { ReviewsTab } from "@/components/screens/business/reviews-tab"
import {
  Store,
  Loader2,
  LogOut,
  LayoutDashboard,
  CalendarCheck,
  Megaphone,
  DollarSign,
  MessageSquare,
  BadgeCheck,
  ArrowLeft,
  MailCheck,
} from "lucide-react"
import { historyStateWithout } from "@/lib/history-state"

/** The server validates against the same list (lib/auth/signup-intent.ts). */
const CATEGORIES = BUSINESS_CATEGORIES

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "bookings", label: "Bookings", icon: CalendarCheck },
  { id: "storefront", label: "Storefront", icon: Store },
  { id: "promotions", label: "Promotions", icon: Megaphone },
  { id: "earnings", label: "Earnings", icon: DollarSign },
  { id: "reviews", label: "Reviews", icon: MessageSquare },
] as const
type TabId = (typeof TABS)[number]["id"]

export default function BusinessAccessPage() {
  return (
    <AuthProvider>
      <Gate />
      <Toaster position="top-center" />
    </AuthProvider>
  )
}

function Gate() {
  const { user, isLoading, isAuthenticated, signOut } = useAuth()
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!isAuthenticated) return <BusinessAuth />
  if (!canAccessRoute("/businessaccess", { role: user?.role ?? null, isSuperAdmin: user?.isSuperAdmin ?? false })) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <Store className="h-10 w-10 text-muted-foreground" />
        <p className="text-[16px] font-semibold text-foreground">Not a business account</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">Sign in with your business account, or create one.</p>
        <Button variant="secondary" onClick={() => signOut()} className="mt-1">
          Sign out
        </Button>
      </div>
    )
  }
  return <Portal />
}

/**
 * Sign in, or sign up in two steps: details, then the 6-digit code emailed to
 * the address. It is the resident OTP gate (/api/auth/signup/start + /verify)
 * with `intent: 'business'` — no account exists until the code is entered, and
 * the verify route creates the business with it. The password stays in this
 * component's state until then, exactly as on the resident screen.
 */
function BusinessAuth() {
  const { signInWithPassword, startSignup, verifySignup, resetPassword } = useAuth()
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [step, setStep] = useState<"details" | "code">("details")
  const [f, setF] = useState({ businessName: "", category: CATEGORIES[0] as string, fullName: "", email: "", password: "" })
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  const [otp, setOtp] = useState("")
  const [expiresAt, setExpiresAt] = useState(0)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const otpInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step !== "code") return
    otpInputRef.current?.focus()
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [step])

  const msLeft = Math.max(0, expiresAt - now)
  const codeExpired = expiresAt > 0 && msLeft === 0
  const resendLeft = Math.max(0, resendAt - now)

  const business = () => ({ businessName: f.businessName.trim(), category: f.category })

  /** Send (or resend) the code. Creates nothing. */
  async function sendCode(): Promise<boolean> {
    const { error: e, retryAfterSeconds } = await startSignup(f.email.trim(), f.fullName.trim() || undefined, business())
    if (e) {
      setError(e)
      return false
    }
    const t = Date.now()
    setExpiresAt(t + CODE_TTL_MS)
    setResendAt(t + (retryAfterSeconds ? retryAfterSeconds * 1000 : RESEND_COOLDOWN_MS))
    setNow(t)
    setOtp("")
    return true
  }

  async function submit() {
    setError(null)
    setInfo(null)
    if (!f.email || !f.password) {
      setError("Enter your email and password.")
      return
    }
    if (mode === "signin") {
      setLoading(true)
      const { error: e } = await signInWithPassword(f.email.trim(), f.password)
      setLoading(false)
      if (e) setError(e)
      return
    }
    if (!f.businessName.trim()) {
      setError("Enter your business name.")
      return
    }
    // The same rules the server enforces at verify, checked before a code is
    // spent on a password that would be refused.
    const verdict = checkPassword(f.password)
    if (!verdict.ok) {
      setError(verdict.failed[0])
      return
    }
    setLoading(true)
    const sent = await sendCode()
    setLoading(false)
    if (sent) setStep("code")
  }

  // The same reset email /login sends (lib/auth-context resetPassword).
  async function forgot() {
    setError(null)
    setInfo(null)
    if (!f.email.trim()) return setError("Enter your email first, then tap “Forgot password?”.")
    const { error: e } = await resetPassword(f.email.trim())
    if (e) setError(e)
    else setInfo(`Password reset link sent to ${f.email.trim()}.`)
  }

  async function verify() {
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
    const { error: e, expired } = await verifySignup(f.email.trim(), otp, f.password, f.fullName.trim() || undefined)
    if (e) {
      setLoading(false)
      setError(e)
      if (expired) setExpiresAt(0)
      setOtp("")
    }
    // Success: the account and business exist and we're signed in. Gate swaps
    // to the portal once the profile loads; keep the spinner until then.
  }

  async function resend() {
    setError(null)
    setInfo(null)
    setLoading(true)
    const sent = await sendCode()
    setLoading(false)
    if (sent) setInfo(`New code sent to ${f.email.trim()}.`)
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6 py-10">
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-sm sm:h-16 sm:w-16">
            <Store className="h-7 w-7 text-primary-foreground sm:h-8 sm:w-8" />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold text-foreground sm:text-[26px]">Pet10x for Business</h1>
          <p className="mt-1 text-[13px] text-muted-foreground sm:text-[14px]">Reach pet owners in nearby buildings</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
          {step === "code" ? (
            // A form, so Enter in the code field verifies once (the field's
            // own onEnter is a no-op here — the form owns submit).
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                if (!loading && otp.length === 6 && !codeExpired) void verify()
              }}
              className="flex flex-col"
            >
              <button
                type="button"
                onClick={() => {
                  // Back, not cancel: the details are kept so a mistyped
                  // address can be corrected without retyping everything.
                  setStep("details")
                  setError(null)
                  setInfo(null)
                  setOtp("")
                }}
                className="mb-3 flex items-center gap-1.5 self-start text-[13px] font-semibold text-muted-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft">
                <MailCheck className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-center text-[18px] font-semibold text-foreground">Enter your code</h2>
              <p className="mt-1.5 text-center text-[13px] leading-relaxed text-muted-foreground">
                We sent a 6-digit code to <span className="font-semibold text-foreground">{f.email.trim()}</span>. Your
                business account is created once it&rsquo;s verified.
              </p>
              <div className="mt-5">
                <CodeEntry
                  value={otp}
                  onChange={(code) => {
                    setOtp(code)
                    setError(null)
                  }}
                  onEnter={() => {}}
                  inputRef={otpInputRef}
                  invalid={!!error}
                  msLeft={msLeft}
                  codeExpired={codeExpired}
                  resendLeft={resendLeft}
                  loading={loading}
                  onResend={resend}
                />
              </div>
              {error && (
                <ErrorText className="mt-3 text-meta">{error}</ErrorText>
              )}
              {info && (
                <InfoText className="mt-3">{info}</InfoText>
              )}
              <Button type="submit" size="lg" loading={loading} disabled={otp.length !== 6 || codeExpired} className="mt-4 w-full">
                Verify &amp; create business account
              </Button>
            </form>
          ) : (
            <>
              <div className="mb-4 flex rounded-xl bg-muted p-1">
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => {
                      setMode(m)
                      setError(null)
                      setInfo(null)
                    }}
                    className={`flex-1 rounded-lg py-2 text-[14px] font-semibold transition-all ${
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
                  void submit()
                }}
                className="flex flex-col gap-3"
              >
                {mode === "signup" && (
                  <>
                    <Input
                      id="biz-name"
                      label="Business name"
                      autoComplete="organization"
                      value={f.businessName}
                      onChange={(v) => set("businessName", v)}
                    />
                    <label htmlFor="biz-category" className="sr-only">
                      Category
                    </label>
                    <select
                      id="biz-category"
                      value={f.category}
                      onChange={(e) => set("category", e.target.value)}
                      className="w-full rounded-xl border border-input bg-card px-4 py-3 text-[15px] text-foreground focus:border-primary focus:outline-none"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <Input
                      id="biz-full-name"
                      label="Your name"
                      autoComplete="name"
                      value={f.fullName}
                      onChange={(v) => set("fullName", v)}
                    />
                  </>
                )}
                <Input
                  id="biz-email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={f.email}
                  onChange={(v) => set("email", v)}
                />
                <label htmlFor="biz-password" className="sr-only">
                  Password
                </label>
                {/* Business signup creates an account too, so it gets the same
                    checklist; signing in does not. */}
                <PasswordField
                  id="biz-password"
                  value={f.password}
                  onChange={(v) => set("password", v)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  showRules={mode === "signup"}
                />
                {error && (
                  <ErrorText className="text-meta">{error}</ErrorText>
                )}
                {info && (
                  <InfoText>{info}</InfoText>
                )}
                <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
                  {mode === "signin" ? "Sign in" : "Email me a code"}
                </Button>
                {mode === "signin" && (
                  <>
                    <Button variant="quiet" size="sm" onClick={() => void forgot()} className="self-center">
                      Forgot password?
                    </Button>
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => {
                        setMode("signup")
                        setError(null)
                        setInfo(null)
                      }}
                      className="self-center"
                    >
                      Create an account
                    </Button>
                  </>
                )}
              </form>
            </>
          )}
        </div>
        <p className="mt-5 text-center text-[12px] text-muted-foreground sm:mt-6">
          New businesses are reviewed before appearing in the directory.
        </p>
        {/* The fee is stated before anyone signs up, not discovered in Earnings. */}
        {mode === "signup" && (
          <p className="mt-1 text-center text-[12px] text-muted-foreground">
            Pet10x keeps {feePercentLabel()} of each completed booking.
          </p>
        )}
        {mode === "signup" && <ConsentLine className="mt-2" />}
      </div>
    </div>
  )
}

function Portal() {
  const { user, signOut } = useAuth()
  const { data: biz, isLoading, refetch } = useMyBusiness()
  const [tab, setTab] = useState<TabId>("dashboard")
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  /* `?target=business:bookings` — the link a booking notification's email or
     push opens (`targetHref` in lib/navigation.ts). Only a tab this console
     renders is honoured; anything else opens the Dashboard as before. Removed
     from the address bar once read, so a reload does not re-open it. */
  useEffect(() => {
    const target = readTargetParam(window.location.search)
    if (!target) return
    const url = new URL(window.location.href)
    url.searchParams.delete("target")
    window.history.replaceState(historyStateWithout(window.history.state), "", url.pathname + url.search + url.hash)
    const route = resolveConsoleTarget(target)
    const match = route?.console === "business" ? TABS.find((t) => t.id === route.tab) : undefined
    if (match) setTab(match.id)
  }, [])

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!biz) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Store className="h-10 w-10 text-muted-foreground" />
        <p className="text-[16px] font-semibold text-foreground">No business on this account</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">
          {user?.email}{" "}
          doesn&apos;t have a business record yet. Sign up again with your business details, or ask Pet10x
          support to link one.
        </p>
        <Button variant="secondary" onClick={() => signOut()} className="mt-1">
          Sign out
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Store className="h-5 w-5 flex-shrink-0 text-primary" />
            <span className="truncate text-[15px] font-semibold text-foreground">{biz.name}</span>
            {biz.isVerified && <BadgeCheck className="h-4 w-4 flex-shrink-0 text-success" />}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            {/* The inbox: booking requests and cancellations land here as
                well as by email and push (Part D); its gear opens the Email &
                push sheet. */}
            <ConsoleInbox
              console="business"
              onOpenTab={(t) => {
                const match = TABS.find((x) => x.id === t)
                if (match) setTab(match.id)
              }}
              onOpenSettings={() => setNotificationsOpen(true)}
            />
            <Button variant="secondary" size="sm" onClick={() => signOut()}>
              <LogOut className="text-destructive" /> Sign out
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-3 pb-2">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  active ? "bg-primary-soft text-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-5">
        {tab === "dashboard" && <DashboardTab business={biz} onOpenTab={setTab} />}
        {tab === "bookings" && <BookingsTab businessId={biz.id} />}
        {tab === "storefront" && <StorefrontTab business={biz} onSaved={refetch} />}
        {tab === "promotions" && <PromotionsTab business={biz} />}
        {tab === "earnings" && <EarningsTab businessId={biz.id} />}
        {tab === "reviews" && <ReviewsTab business={biz} />}
        <HelpLegalLinks className="mt-10 border-t border-border pt-4" />
      </main>
      {notificationsOpen && <NotificationSettingsSheet onClose={() => setNotificationsOpen(false)} />}
    </div>
  )
}

/** A text field with an sr-only label; the label doubles as the placeholder. */
function Input({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  autoComplete?: string
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={label}
      autoComplete={autoComplete}
      autoCapitalize={type === "email" ? "none" : undefined}
      className="w-full min-w-0 rounded-xl border border-input bg-card px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
      />
    </>
  )
}
