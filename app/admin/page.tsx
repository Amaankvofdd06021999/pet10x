"use client"

import { useState } from "react"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { canAccessRoute } from "@/lib/rbac"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"
import {
  useAdminBuildings,
  createBuilding,
  updateBuildingRules,
  updateBuildingDetails,
  deleteBuilding,
  inviteManager,
  useAdminBusinesses,
  verifyBusiness,
  deleteBusiness,
  useAdminManagers,
  setManagerSuspended,
  revokeManagerFromBuilding,
  type AdminBuilding,
  type AdminManager,
  type PetRules,
} from "@/lib/data/admin"
import {
  ShieldCheck,
  Building2,
  Plus,
  Mail,
  Loader2,
  LogOut,
  Store,
  BadgeCheck,
  ChevronDown,
  Lock,
  Users,
  Ban,
  RotateCcw,
  MapPin,
  Trash2,
  AlertTriangle,
} from "lucide-react"

export default function SuperAdminAccessPage() {
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
  if (!isAuthenticated) return <AdminLogin />
  if (!canAccessRoute("/admin", { role: user?.role ?? null, isSuperAdmin: user?.isSuperAdmin ?? false })) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <Lock className="h-10 w-10 text-muted-foreground" />
        <p className="text-[16px] font-semibold text-foreground">Not authorized</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">This account doesn&apos;t have super-admin access.</p>
        <button onClick={() => signOut()} className="mt-2 rounded-lg bg-muted px-4 py-2 text-[14px] font-semibold text-foreground">
          Sign out
        </button>
      </div>
    )
  }
  return <Portal />
}

function AdminLogin() {
  const { signInWithPassword } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit() {
    setError(null)
    if (!email || !password) {
      setError("Enter your email and password.")
      return
    }
    setLoading(true)
    const { error: e } = await signInWithPassword(email.trim(), password)
    setLoading(false)
    if (e) setError(e)
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6 py-10 [background-image:radial-gradient(55rem_38rem_at_50%_-10%,var(--color-primary)/10%,transparent)]">
      <div className="w-full max-w-sm sm:max-w-md">
        <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20 sm:h-16 sm:w-16">
            <ShieldCheck className="h-7 w-7 text-primary-foreground sm:h-8 sm:w-8" />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold text-foreground sm:text-[26px]">Pet10x Admin</h1>
          <p className="mt-1 text-[13px] text-muted-foreground sm:text-[14px]">Super-admin access only</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-foreground/5 sm:p-7">
        <div className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoCapitalize="none"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          {error && <p className="text-[13px] text-destructive">{error}</p>}
          <button
            onClick={submit}
            disabled={loading}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}

function Portal() {
  const { user, signOut } = useAuth()
  const [tab, setTab] = useState<"buildings" | "managers" | "businesses">("buildings")

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="text-[15px] font-semibold">Pet10x Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[12px] text-muted-foreground sm:block">{user?.email}</span>
          <button onClick={() => signOut()} className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[13px] font-semibold">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-6">
        <div className="mb-6 flex gap-1 rounded-xl bg-muted p-1">
          {(["buildings", "managers", "businesses"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[14px] font-semibold capitalize transition-colors ${
                tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t === "buildings" ? <Building2 className="h-4 w-4" /> : t === "managers" ? <Users className="h-4 w-4" /> : <Store className="h-4 w-4" />} {t}
            </button>
          ))}
        </div>
        {tab === "buildings" ? <Buildings /> : tab === "managers" ? <Managers /> : <Businesses />}
      </div>
    </div>
  )
}

const RULE_TOGGLES: { key: keyof PetRules; label: string }[] = [
  { key: "requires_registry", label: "Requires pet registration" },
  { key: "require_rabies", label: "Rabies vaccination required" },
  { key: "require_core_vaccines", label: "Core vaccines required" },
  { key: "require_license", label: "Municipal license required" },
  { key: "require_insurance", label: "Liability insurance required" },
  { key: "require_spay_neuter", label: "Spay/neuter required" },
]

const EMPTY_FORM = { name: "", code: "", address: "", city: "", region: "" }

function Buildings() {
  const { data: buildings, isLoading, error, refetch } = useAdminBuildings()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [rules, setRules] = useState<PetRules>({ requires_registry: true })
  const [saving, setSaving] = useState(false)

  async function create() {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error("Name and code are required.")
      return
    }
    setSaving(true)
    const { error: err } = await createBuilding({ ...form, rules })
    setSaving(false)
    if (err) return toast.error("Couldn't create", { description: err })
    toast.success("Building created")
    setForm(EMPTY_FORM)
    setRules({ requires_registry: true })
    setCreating(false)
    refetch()
  }

  return (
    <div>
      <button
        onClick={() => setCreating((v) => !v)}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-[14px] font-semibold text-foreground"
      >
        <Plus className="h-4 w-4" /> {creating ? "Close" : "Create building"}
      </button>

      {creating && (
        <div className="mb-5 flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4">
          <AdminInput placeholder="Building name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} />
          <AdminInput
            placeholder="Building code (e.g. HVT2024)"
            value={form.code}
            onChange={(v) => setForm((p) => ({ ...p, code: v.toUpperCase() }))}
          />
          <AdminInput placeholder="Address" value={form.address} onChange={(v) => setForm((p) => ({ ...p, address: v }))} />
          <div className="grid grid-cols-2 gap-2.5">
            <AdminInput placeholder="City" value={form.city} onChange={(v) => setForm((p) => ({ ...p, city: v }))} />
            <AdminInput placeholder="Region (e.g. BC)" value={form.region} onChange={(v) => setForm((p) => ({ ...p, region: v }))} />
          </div>
          <p className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Pet rules</p>
          {RULE_TOGGLES.map((r) => (
            <Toggle key={r.key} label={r.label} on={!!rules[r.key]} onToggle={() => setRules((p) => ({ ...p, [r.key]: !p[r.key] }))} />
          ))}
          <button
            onClick={create}
            disabled={saving}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[14px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create building
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <LoadError message={error} onRetry={refetch} />
      ) : buildings.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-muted-foreground">No buildings yet.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {buildings.map((b) => (
            <BuildingCard key={b.id} building={b} onChange={refetch} />
          ))}
        </div>
      )}
    </div>
  )
}

function BuildingCard({ building, onChange }: { building: AdminBuilding; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [rules, setRules] = useState<PetRules>(building.rules)
  const [editing, setEditing] = useState(false)
  const [details, setDetails] = useState({
    name: building.name,
    code: building.code,
    address: building.address ?? "",
    city: building.city ?? "",
    region: building.region ?? "",
  })
  const [busy, setBusy] = useState(false)

  async function invite() {
    if (!email.trim()) {
      toast.error("Enter the manager's email.")
      return
    }
    setBusy(true)
    const res = await inviteManager({
      buildingId: building.id,
      buildingName: building.name,
      email: email.trim(),
      fullName: name.trim() || undefined,
    })
    setBusy(false)
    if (res.error) return toast.error("Invite failed", { description: res.error })

    if (res.emailSent === false && res.inviteUrl) {
      // Email is suppressed outside production — don't claim we sent one.
      const url = res.inviteUrl
      toast.success("Manager added — email not sent", {
        description: "Email is disabled outside production. Copy the invite link to share it.",
        duration: 15000,
        action: { label: "Copy link", onClick: () => void navigator.clipboard.writeText(url) },
      })
    } else {
      toast.success("Manager invited", { description: `Invite sent to ${email.trim()}` })
    }
    setEmail("")
    setName("")
    onChange()
  }

  async function saveRules() {
    setBusy(true)
    const { error } = await updateBuildingRules(building.id, rules)
    setBusy(false)
    if (error) return toast.error("Couldn't save rules", { description: error })
    toast.success("Rules updated")
    onChange()
  }

  async function saveDetails() {
    if (!details.name.trim() || !details.code.trim()) {
      toast.error("Name and code are required.")
      return
    }
    setBusy(true)
    const { error } = await updateBuildingDetails(building.id, details)
    setBusy(false)
    if (error) return toast.error("Couldn't save", { description: error })
    toast.success("Building updated")
    setEditing(false)
    onChange()
  }

  async function remove() {
    if (!confirm(`Delete ${building.name}? This also removes its units, residents links, and manager assignments.`)) return
    setBusy(true)
    const { error } = await deleteBuilding(building.id)
    setBusy(false)
    if (error) return toast.error("Couldn't delete", { description: error })
    toast.success("Building deleted")
    onChange()
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-3.5 text-left">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{building.name}</p>
          <p className="text-[12px] text-muted-foreground">
            {building.code}
            {building.city ? ` · ${building.city}` : ""}
            {building.region ? `, ${building.region}` : ""}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Building details</p>
            <button onClick={() => setEditing((v) => !v)} className="text-[12px] font-semibold text-primary">
              {editing ? "Cancel" : "Edit"}
            </button>
          </div>
          {editing ? (
            <div className="flex flex-col gap-2">
              <AdminInput placeholder="Building name" value={details.name} onChange={(v) => setDetails((p) => ({ ...p, name: v }))} />
              <AdminInput
                placeholder="Building code"
                value={details.code}
                onChange={(v) => setDetails((p) => ({ ...p, code: v.toUpperCase() }))}
              />
              <AdminInput placeholder="Address" value={details.address} onChange={(v) => setDetails((p) => ({ ...p, address: v }))} />
              <div className="grid grid-cols-2 gap-2">
                <AdminInput placeholder="City" value={details.city} onChange={(v) => setDetails((p) => ({ ...p, city: v }))} />
                <AdminInput placeholder="Region" value={details.region} onChange={(v) => setDetails((p) => ({ ...p, region: v }))} />
              </div>
              <button
                onClick={saveDetails}
                disabled={busy}
                className="mt-1 rounded-xl bg-primary py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"
              >
                Save details
              </button>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              {building.address || "No address"}
              {building.city ? ` · ${building.city}` : ""}
              {building.region ? `, ${building.region}` : ""}
            </p>
          )}

          <p className="mb-2 mt-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Invite a manager</p>
          <div className="flex flex-col gap-2">
            <AdminInput placeholder="Manager name (optional)" value={name} onChange={setName} />
            <div className="flex gap-2">
              <AdminInput placeholder="manager@email.com" value={email} onChange={setEmail} />
              <button onClick={invite} disabled={busy} className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Invite
              </button>
            </div>
          </div>
          <p className="mb-2 mt-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Pet rules</p>
          <div className="flex flex-col gap-2">
            {RULE_TOGGLES.map((r) => (
              <Toggle key={r.key} label={r.label} on={!!rules[r.key]} onToggle={() => setRules((p) => ({ ...p, [r.key]: !p[r.key] }))} />
            ))}
            <button onClick={saveRules} disabled={busy} className="mt-1 rounded-xl bg-muted py-2 text-[13px] font-semibold disabled:opacity-60">
              Save rules
            </button>
          </div>

          <button
            onClick={remove}
            disabled={busy}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-destructive/10 py-2 text-[13px] font-semibold text-destructive disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete building
          </button>
        </div>
      )}
    </div>
  )
}

function Managers() {
  const [city, setCity] = useState("")
  const [region, setRegion] = useState("")
  // Fetch the whole roster and filter here — options stay stable, so picking a
  // city doesn't collapse the list of cities you can switch to.
  const { data: allManagers, isLoading, error, refetch } = useAdminManagers()
  const [busy, setBusy] = useState<string | null>(null)

  const cityOptions = Array.from(new Set(allManagers.map((m) => m.building.city).filter((c): c is string => !!c))).sort()
  const regionOptions = Array.from(new Set(allManagers.map((m) => m.building.region).filter((r): r is string => !!r))).sort()

  const managers = allManagers
    .filter((m) => (city ? m.building.city === city : true))
    .filter((m) => (region ? m.building.region === region : true))

  async function toggleSuspend(m: AdminManager) {
    setBusy(m.linkId)
    const { error: err } = await setManagerSuspended(m.id, !m.isSuspended)
    setBusy(null)
    if (err) return toast.error("Action failed", { description: err })
    toast.success(m.isSuspended ? "Manager access restored" : "Manager suspended", {
      description: m.isSuspended ? `${m.name} can sign in again.` : `${m.name} is locked out of every building and dashboard.`,
    })
    refetch()
  }

  async function revoke(m: AdminManager) {
    if (!confirm(`Remove ${m.name} as a manager of ${m.building.name}? Their account stays active.`)) return
    setBusy(m.linkId)
    const { error: err } = await revokeManagerFromBuilding(m.linkId)
    setBusy(null)
    if (err) return toast.error("Couldn't revoke", { description: err })
    toast.success("Manager removed from building")
    refetch()
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-card p-3.5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> Filter by location
        </div>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="rounded-lg border border-border bg-muted px-3 py-1.5 text-[13px] text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">All cities</option>
          {cityOptions.map((c) => (
            <option key={c} value={c} className="bg-popover">
              {c}
            </option>
          ))}
        </select>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded-lg border border-border bg-muted px-3 py-1.5 text-[13px] text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">All regions</option>
          {regionOptions.map((r) => (
            <option key={r} value={r} className="bg-popover">
              {r}
            </option>
          ))}
        </select>
        {(city || region) && (
          <button
            onClick={() => {
              setCity("")
              setRegion("")
            }}
            className="text-[12px] font-semibold text-primary"
          >
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <LoadError message={error} onRetry={refetch} />
      ) : managers.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-muted-foreground">
          {allManagers.length === 0 ? "No managers yet — invite one from a building." : "No managers match this filter."}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {managers.map((m) => (
            <div key={m.linkId} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
              <div
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                  m.isSuspended ? "bg-destructive/15" : "bg-primary/15"
                }`}
              >
                <Users className={`h-5 w-5 ${m.isSuspended ? "text-destructive" : "text-primary"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[15px] font-semibold">{m.name}</p>
                  {m.isPrimary && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Primary
                    </span>
                  )}
                  {m.isSuspended && (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                      Suspended
                    </span>
                  )}
                </div>
                <p className="truncate text-[12px] text-muted-foreground">{m.email}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {m.building.name} · {m.building.code}
                  {m.building.city ? ` · ${m.building.city}` : ""}
                  {m.building.region ? `, ${m.building.region}` : ""}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <button
                  onClick={() => toggleSuspend(m)}
                  disabled={busy === m.linkId}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60 ${
                    m.isSuspended ? "bg-muted text-foreground" : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {busy === m.linkId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : m.isSuspended ? (
                    <RotateCcw className="h-3.5 w-3.5" />
                  ) : (
                    <Ban className="h-3.5 w-3.5" />
                  )}
                  {m.isSuspended ? "Restore" : "Freeze"}
                </button>
                <button
                  onClick={() => revoke(m)}
                  disabled={busy === m.linkId}
                  title="Remove from this building"
                  className="flex items-center rounded-lg bg-muted p-1.5 text-muted-foreground disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Businesses() {
  const { data: businesses, isLoading, error, refetch } = useAdminBusinesses()
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(id: string, verified: boolean) {
    setBusy(id)
    const { error: err } = await verifyBusiness(id, verified)
    setBusy(null)
    if (err) return toast.error("Action failed", { description: err })
    toast.success(verified ? "Business verified" : "Verification removed")
    refetch()
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete ${name}? This removes their listings and cannot be undone.`)) return
    setBusy(id)
    const { error: err } = await deleteBusiness(id)
    setBusy(null)
    if (err) return toast.error("Couldn't delete", { description: err })
    toast.success("Business deleted")
    refetch()
  }

  if (isLoading)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  if (error) return <LoadError message={error} onRetry={refetch} />
  if (businesses.length === 0) return <p className="py-8 text-center text-[14px] text-muted-foreground">No businesses yet.</p>

  return (
    <div className="flex flex-col gap-2.5">
      {businesses.map((b) => (
        <div key={b.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent/15">
            <Store className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{b.name}</p>
            <p className="text-[12px] text-muted-foreground">{b.category}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            {b.isVerified ? (
              <button
                onClick={() => toggle(b.id, false)}
                disabled={busy === b.id}
                className="flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-1.5 text-[12px] font-semibold text-success disabled:opacity-60"
              >
                {busy === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />} Verified
              </button>
            ) : (
              <button
                onClick={() => toggle(b.id, true)}
                disabled={busy === b.id}
                className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[12px] font-semibold text-foreground disabled:opacity-60"
              >
                {busy === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />} Verify
              </button>
            )}
            <button
              onClick={() => remove(b.id, b.name)}
              disabled={busy === b.id}
              title="Delete business"
              className="flex items-center rounded-lg bg-muted p-1.5 text-muted-foreground disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Shown when a Supabase read fails — otherwise a failed load looks like an empty list. */
function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <div>
        <p className="text-[14px] font-semibold text-foreground">Couldn&apos;t load</p>
        <p className="mt-0.5 max-w-sm text-[12px] text-muted-foreground">{message}</p>
      </div>
      <button onClick={onRetry} className="rounded-lg bg-muted px-4 py-1.5 text-[13px] font-semibold text-foreground">
        Retry
      </button>
    </div>
  )
}

function AdminInput({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full min-w-0 rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
    />
  )
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-left">
      <span className="text-[13px] text-foreground">{label}</span>
      <span className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${on ? "bg-success" : "bg-border"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    </button>
  )
}
