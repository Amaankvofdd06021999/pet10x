"use client"

import { useState } from "react"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"
import { useMyBusiness, updateBusiness } from "@/lib/data/business"
import { Store, Loader2, LogOut, BadgeCheck, Clock, Navigation } from "lucide-react"

const CATEGORIES = ["Veterinary", "Grooming", "Boarding", "Dog walking", "Training", "Pet store", "Other"]

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
  if (user?.role !== "business") {
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
          <Input
            placeholder="Password"
            type="password"
            value={f.password}
            onChange={(v) => set("password", v)}
            onEnter={submit}
          />
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
  const [saving, setSaving] = useState(false)
  const [gps, setGps] = useState(false)

  const [f, setF] = useState({
    name: "",
    category: CATEGORIES[0],
    description: "",
    priceRange: "",
    latitude: "",
    longitude: "",
  })
  const [initialized, setInitialized] = useState(false)
  if (biz && !initialized) {
    setF({
      name: biz.name,
      category: biz.category,
      description: biz.description ?? "",
      priceRange: biz.priceRange ?? "",
      latitude: biz.latitude != null ? String(biz.latitude) : "",
      longitude: biz.longitude != null ? String(biz.longitude) : "",
    })
    setInitialized(true)
  }

  async function save() {
    if (!biz) return
    setSaving(true)
    const lat = f.latitude ? parseFloat(f.latitude) : null
    const lng = f.longitude ? parseFloat(f.longitude) : null
    const { error } = await updateBusiness(biz.id, {
      name: f.name.trim(),
      category: f.category,
      description: f.description.trim() || null,
      priceRange: f.priceRange.trim() || null,
      latitude: lat != null && !Number.isNaN(lat) ? lat : null,
      longitude: lng != null && !Number.isNaN(lng) ? lng : null,
    })
    setSaving(false)
    if (error) return toast.error("Couldn't save", { description: error })
    toast.success("Saved")
    refetch()
  }

  function useGps() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return toast.error("Location not available")
    setGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setF((p) => ({ ...p, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }))
        setGps(false)
        toast.success("Location captured")
      },
      () => {
        setGps(false)
        toast.error("Couldn't get your location")
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-accent" />
          <span className="text-[15px] font-semibold text-foreground">Pet10x Business</span>
        </div>
        <button onClick={() => signOut()} className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[13px] font-semibold text-foreground">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </header>

      <div className="mx-auto max-w-xl px-5 py-6">
        {!biz ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">No business found for {user?.email}.</p>
        ) : (
          <>
            {/* Verification banner */}
            <div
              className={`mb-5 flex items-center gap-3 rounded-2xl p-3.5 ${
                biz.isVerified ? "bg-success/10" : "bg-[#FFF9E6]"
              }`}
            >
              {biz.isVerified ? <BadgeCheck className="h-5 w-5 text-success" /> : <Clock className="h-5 w-5 text-[#B38F00]" />}
              <div>
                <p className="text-[14px] font-semibold text-foreground">{biz.isVerified ? "Verified & listed" : "Pending review"}</p>
                <p className="text-[12px] text-muted-foreground">
                  {biz.isVerified
                    ? "You appear in the nearby directory for pet owners."
                    : "We'll review your business before it appears to pet owners."}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Field label="Business name">
                <Input value={f.name} onChange={(v) => setF((p) => ({ ...p, name: v }))} />
              </Field>
              <Field label="Category">
                <select
                  value={f.category}
                  onChange={(e) => setF((p) => ({ ...p, category: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-[15px] text-foreground focus:border-primary focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Description">
                <textarea
                  value={f.description}
                  onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  placeholder="What you offer, hours, specialties…"
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-[14px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </Field>
              <Field label="Price range">
                <Input value={f.priceRange} onChange={(v) => setF((p) => ({ ...p, priceRange: v }))} placeholder="$ · $$ · $$$" />
              </Field>

              <Field label="Location (for nearby search)">
                <div className="flex gap-2">
                  <Input value={f.latitude} onChange={(v) => setF((p) => ({ ...p, latitude: v }))} placeholder="Latitude" />
                  <Input value={f.longitude} onChange={(v) => setF((p) => ({ ...p, longitude: v }))} placeholder="Longitude" />
                </div>
                <button
                  onClick={useGps}
                  disabled={gps}
                  className="mt-2 flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-foreground disabled:opacity-60"
                >
                  {gps ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />} Use current location
                </button>
              </Field>

              <button
                onClick={save}
                disabled={saving}
                className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-accent py-3 text-[15px] font-semibold text-white disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
              </button>
            </div>
          </>
        )}
      </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}
