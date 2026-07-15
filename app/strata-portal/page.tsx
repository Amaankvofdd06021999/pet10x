"use client"

import { useState } from "react"
import Link from "next/link"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { canAccessRoute } from "@/lib/rbac"
import { Toaster } from "@/components/ui/sonner"
import { StrataProvider, BuildingSwitcher } from "@/components/screens/strata/portal-context"
import { PortfolioOverviewScreen } from "@/components/screens/strata/overview-screen"
import { WorkQueueScreen } from "@/components/screens/strata/queue-screen"
import { BuildingsScreen } from "@/components/screens/strata/buildings-screen"
import { BylawsScreen } from "@/components/screens/strata/bylaws-screen"
import { ReportsScreen } from "@/components/screens/strata/reports-screen"
import { TeamScreen } from "@/components/screens/strata/team-screen"
import {
  Building2,
  LayoutDashboard,
  Inbox,
  Scale,
  BarChart3,
  Users,
  Loader2,
  Lock,
  LogOut,
  Mail,
  ArrowLeft,
  Layers,
} from "lucide-react"

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "queue", label: "Queue", icon: Inbox },
  { id: "buildings", label: "Buildings", icon: Building2 },
  { id: "bylaws", label: "Bylaws", icon: Scale },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "team", label: "Team", icon: Users },
] as const

export default function StrataPortalPage() {
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
  if (!isAuthenticated) return <StrataLogin />
  if (!canAccessRoute("/strata-portal", { role: user?.role ?? null, isSuperAdmin: user?.isSuperAdmin ?? false })) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <Lock className="h-10 w-10 text-muted-foreground" />
        <p className="text-[16px] font-semibold text-foreground">Not authorized</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">
          The strata portal is for building managers. Ask your Pet10x admin if you should have access.
        </p>
        <div className="mt-2 flex gap-2">
          <Link href="/app" className="rounded-lg bg-muted px-4 py-2 text-[14px] font-semibold text-foreground">
            Go to app
          </Link>
          <button onClick={() => signOut()} className="rounded-lg bg-muted px-4 py-2 text-[14px] font-semibold text-foreground">
            Sign out
          </button>
        </div>
      </div>
    )
  }
  return (
    <StrataProvider>
      <Portal />
    </StrataProvider>
  )
}

function StrataLogin() {
  const { signInWithPassword, resetPassword } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit() {
    setError(null)
    setInfo(null)
    if (!email || !password) return setError("Enter your email and password.")
    setLoading(true)
    const { error: e } = await signInWithPassword(email.trim(), password)
    setLoading(false)
    if (e) setError(e)
  }
  async function forgot() {
    setError(null)
    setInfo(null)
    if (!email.trim()) return setError("Enter your email first, then tap “Forgot password”.")
    const { error: e } = await resetPassword(email.trim())
    if (e) setError(e)
    else setInfo(`Password reset link sent to ${email.trim()}.`)
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6 py-10 [background-image:radial-gradient(55rem_38rem_at_50%_-10%,var(--color-info)/10%,transparent)]">
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-info shadow-lg shadow-info/20 sm:h-16 sm:w-16">
            <Layers className="h-7 w-7 text-info-foreground sm:h-8 sm:w-8" />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold text-foreground sm:text-[26px]">Strata Portal</h1>
          <p className="mt-1 text-[13px] text-muted-foreground sm:text-[14px]">One login for your whole portfolio</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-foreground/5 sm:p-7">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoCapitalize="none"
                className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 text-[15px] text-foreground focus:border-info focus:outline-none focus:ring-2 focus:ring-info/20"
              />
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] text-foreground focus:border-info focus:outline-none focus:ring-2 focus:ring-info/20"
            />
            {error && <p className="text-[13px] text-destructive">{error}</p>}
            {info && <p className="text-[13px] text-success">{info}</p>}
            <button
              onClick={submit}
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-info py-3 text-[15px] font-semibold text-info-foreground disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
            <button onClick={forgot} className="text-center text-[13px] font-medium text-info transition-colors hover:opacity-80">
              Forgot password?
            </button>
          </div>
        </div>
        <Link href="/app" className="mx-auto mt-6 flex w-fit items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to the single-building app
        </Link>
      </div>
    </div>
  )
}

function Portal() {
  const { user, signOut } = useAuth()
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("overview")

  return (
    <div className="bg-background md:flex md:min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 flex-shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center gap-2 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-info shadow-sm shadow-info/30">
            <Layers className="h-5 w-5 text-info-foreground" strokeWidth={2.5} />
          </span>
          <span className="text-[16px] font-semibold tracking-tight text-foreground">Strata Portal</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-3" aria-label="Primary">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={active ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${
                  active ? "bg-muted text-info" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                {t.label}
              </button>
            )
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-info/15 text-[13px] font-semibold text-info">
              {(user?.name ?? "?").slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground">{user?.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">Strata manager</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-destructive transition-colors hover:bg-destructive/5"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 md:min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-6">
          <span className="flex items-center gap-2 md:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-info">
              <Layers className="h-4 w-4 text-info-foreground" strokeWidth={2.5} />
            </span>
          </span>
          <h1 className="text-[15px] font-semibold capitalize text-foreground">
            {TABS.find((t) => t.id === tab)?.label}
          </h1>
          <div className="ml-auto">
            <BuildingSwitcher />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 md:px-6 md:pb-10">
          {tab === "overview" && <PortfolioOverviewScreen onOpenTab={setTab} />}
          {tab === "queue" && <WorkQueueScreen />}
          {tab === "buildings" && <BuildingsScreen />}
          {tab === "bylaws" && <BylawsScreen />}
          {tab === "reports" && <ReportsScreen />}
          {tab === "team" && <TeamScreen />}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 grid grid-cols-6 border-t border-border bg-card/90 backdrop-blur-xl pb-safe md:hidden">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-col items-center gap-0.5 py-2 transition-colors"
              aria-label={t.label}
            >
              <Icon
                className={`h-5 w-5 ${active ? "text-info" : "text-muted-foreground"}`}
                strokeWidth={active ? 2.5 : 1.6}
              />
              <span className={`text-[10px] font-medium ${active ? "text-info" : "text-muted-foreground"}`}>
                {t.label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
