"use client"

import { useState } from "react"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { canAccessRoute } from "@/lib/rbac"
import { Toaster } from "@/components/ui/sonner"
import { useMyBusiness } from "@/lib/data/business"
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
} from "lucide-react"

const CATEGORIES = ["Veterinary", "Grooming", "Boarding", "Dog walking", "Training", "Pet store", "Other"]

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
        <button onClick={() => signOut()} className="mt-1 rounded-lg bg-muted px-4 py-2 text-[14px] font-semibold text-foreground">
          Sign out
        </button>
      </div>
    )
  }
  return <Portal />
}

function BusinessAuth() {
  const { signInWithPassword } = useAuth()
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [f, setF] = useState({ businessName: "", category: CATEGORIES[0], fullName: "", email: "", password: "" })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  async function submit() {
    setError(null)
    if (!f.email || !f.password) {
      setError("Enter your email and password.")
      return
    }
    setLoading(true)
    if (mode === "signin") {
      const { error: e } = await signInWithPassword(f.email.trim(), f.password)
      setLoading(false)
      if (e) setError(e)
      return
    }
    if (!f.businessName.trim()) {
      setLoading(false)
      setError("Enter your business name.")
      return
    }
    const res = await fetch("/api/business/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: f.email.trim(),
        password: f.password,
        businessName: f.businessName.trim(),
        category: f.category,
        fullName: f.fullName.trim() || undefined,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!res.ok || !json.ok) {
      setLoading(false)
      setError(json.error ?? "Couldn't create your business account.")
      return
    }
    const { error: e } = await signInWithPassword(f.email.trim(), f.password)
    setLoading(false)
    if (e) setError(e)
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6 py-10 [background-image:radial-gradient(60rem_40rem_at_50%_-10%,var(--color-accent)/8%,transparent)]">
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent shadow-sm sm:h-16 sm:w-16">
            <Store className="h-7 w-7 text-white sm:h-8 sm:w-8" />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold text-foreground sm:text-[26px]">Pet10x for Business</h1>
          <p className="mt-1 text-[13px] text-muted-foreground sm:text-[14px]">Reach pet owners in nearby buildings</p>
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-5 shadow-sm sm:p-7">
          <div className="mb-4 flex rounded-xl bg-muted p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m)
                  setError(null)
                }}
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
              <>
                <Input placeholder="Business name" value={f.businessName} onChange={(v) => set("businessName", v)} />
                <select
                  value={f.category}
                  onChange={(e) => set("category", e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-[15px] text-foreground focus:border-primary focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <Input placeholder="Your name" value={f.fullName} onChange={(v) => set("fullName", v)} />
              </>
            )}
            <Input placeholder="Email" type="email" value={f.email} onChange={(v) => set("email", v)} />
            <Input placeholder="Password" type="password" value={f.password} onChange={(v) => set("password", v)} onEnter={submit} />
            {error && <p className="text-[13px] text-destructive">{error}</p>}
            <button
              onClick={submit}
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create business account"}
            </button>
          </div>
        </div>
        <p className="mt-5 text-center text-[12px] text-muted-foreground sm:mt-6">
          New businesses are reviewed before appearing in the directory.
        </p>
      </div>
    </div>
  )
}

function Portal() {
  const { user, signOut } = useAuth()
  const { data: biz, isLoading, refetch } = useMyBusiness()
  const [tab, setTab] = useState<TabId>("dashboard")

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
          {user?.email} doesn&apos;t have a business record yet. Sign up again with your business details, or ask Pet10x
          support to link one.
        </p>
        <button onClick={() => signOut()} className="mt-1 rounded-lg bg-muted px-4 py-2 text-[14px] font-semibold text-foreground">
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Store className="h-5 w-5 flex-shrink-0 text-accent" />
            <span className="truncate text-[15px] font-semibold text-foreground">{biz.name}</span>
            {biz.isVerified && <BadgeCheck className="h-4 w-4 flex-shrink-0 text-success" />}
          </div>
          <button
            onClick={() => signOut()}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[13px] font-semibold text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
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
                  active ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-muted"
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
      </main>
    </div>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  onEnter,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  onEnter?: () => void
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      placeholder={placeholder}
      autoCapitalize={type === "email" ? "none" : undefined}
      className="w-full min-w-0 rounded-xl border border-border bg-card px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
    />
  )
}
