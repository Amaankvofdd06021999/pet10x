"use client"

import { useState } from "react"
import { PasswordField } from "@/components/ui/password-field"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { PersonaSwitcher } from "@/components/persona-switcher"
import { canAccessRoute } from "@/lib/rbac"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"
import {
  useAdminBuildings,
  createBuilding,
  updateBuildingRules,
  updateBuildingDetails,
  deleteBuilding,
  setBuildingArchived,
  inviteManager,
  useAdminBusinesses,
  setBusinessTier,
  reviewBusinessVerification,
  deleteBusiness,
  useAdminManagers,
  setManagerSuspended,
  revokeManagerFromBuilding,
  useAdminMunicipalReports,
  useMunicipalities,
  setMunicipalReportStatus,
  type AdminBuilding,
  type AdminMunicipality,
  type AdminManager,
  type AdminBusiness,
  type PetRules,
} from "@/lib/data/admin"
import { BUSINESS_TIERS, awaitingReview, tierDescription, tierLabel, type BusinessTier } from "@/lib/data/business-tier"
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
  Landmark,
  Archive,
  ArchiveRestore,
} from "lucide-react"
import { municipalTypeLabel } from "@/lib/data/municipal"

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
        <div className="rounded-2xl card-raised p-5 shadow-xl shadow-foreground/5 sm:p-7">
        <div className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoCapitalize="none"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <PasswordField value={password} onChange={setPassword} onEnter={submit} />
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
  const [tab, setTab] = useState<"buildings" | "managers" | "businesses" | "reports">("buildings")

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="text-[15px] font-semibold">Pet10x Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[12px] text-muted-foreground sm:block">{user?.email}</span>
          {/* The console is its own shell, so without this an admin who is
              also a resident has no route back to their own pets. */}
          <PersonaSwitcher compact />
          <button onClick={() => signOut()} className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-[13px] font-semibold">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-6">
        <div className="mb-6 flex gap-1 rounded-xl bg-muted p-1">
          {(["buildings", "managers", "businesses", "reports"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[14px] font-semibold capitalize transition-colors ${
                tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t === "buildings" ? (
                <Building2 className="h-4 w-4" />
              ) : t === "managers" ? (
                <Users className="h-4 w-4" />
              ) : t === "businesses" ? (
                <Store className="h-4 w-4" />
              ) : (
                <Landmark className="h-4 w-4" />
              )}{" "}
              {t === "reports" ? "City reports" : t}
            </button>
          ))}
        </div>
        {tab === "buildings" ? (
          <Buildings />
        ) : tab === "managers" ? (
          <Managers />
        ) : tab === "businesses" ? (
          <Businesses />
        ) : (
          <MunicipalReports />
        )}
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
  const municipalities = useMunicipalities()
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
        <div className="mb-5 flex flex-col gap-2.5 rounded-xl card-raised p-4">
          <AdminInput placeholder="Building name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} />
          <AdminInput
            placeholder="Building code (e.g. MCR2026)"
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
            <BuildingCard key={b.id} building={b} municipalities={municipalities} onChange={refetch} />
          ))}
        </div>
      )}
    </div>
  )
}

function BuildingCard({
  building,
  municipalities,
  onChange,
}: {
  building: AdminBuilding
  municipalities: AdminMunicipality[]
  onChange: () => void
}) {
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
    municipalityId: building.municipalityId ?? "",
  })
  const municipalityName = municipalities.find((m) => m.id === building.municipalityId)?.name
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
      // Suppressed outside production, or refused by the mail provider —
      // either way, don't claim we sent one.
      const url = res.inviteUrl
      toast.success(res.emailFailed ? "Manager added — the email failed" : "Manager added — email not sent", {
        description: res.emailFailed
          ? "The invite email could not be sent. Copy the invite link to share it."
          : "Email is disabled outside production. Copy the invite link to share it.",
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
    const { error } = await updateBuildingDetails(building.id, {
      ...details,
      municipalityId: details.municipalityId || null,
    })
    setBusy(false)
    if (error) return toast.error("Couldn't save", { description: error })
    toast.success("Building updated")
    setEditing(false)
    onChange()
  }

  async function remove() {
    if (!confirm(`Delete ${building.name}? Nothing references it — no units, residents, managers, pets or records — so only the building itself is removed. This cannot be undone.`)) return
    setBusy(true)
    const { error } = await deleteBuilding(building.id)
    setBusy(false)
    if (error) return toast.error("Couldn't delete", { description: error })
    toast.success("Building deleted")
    onChange()
  }

  async function archive(archived: boolean) {
    const question = archived
      ? `Archive ${building.name}? Residents will no longer be able to join it or file reports with its code, and it disappears from search and from the strata portfolio. Its managers see it marked archived and can no longer change its settings. Its residents, pets, cases and fines are kept, and you can restore it.`
      : `Restore ${building.name}? Its code works again for joining and reporting.`
    if (!confirm(question)) return
    setBusy(true)
    const { error } = await setBuildingArchived(building.id, archived)
    setBusy(false)
    if (error) return toast.error(archived ? "Couldn't archive" : "Couldn't restore", { description: error })
    toast.success(archived ? "Building archived" : "Building restored")
    onChange()
  }

  return (
    <div className="rounded-xl card-raised">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-3.5 text-left">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15">
          <Building2 className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-[15px] font-semibold">
            <span className="truncate">{building.name}</span>
            {building.archivedAt && (
              <span className="flex-shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                Archived
              </span>
            )}
          </p>
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
              {/* Decides which city's report summary its managers see. Only an
                  admin can set it — a manager who could would read any city's. */}
              <label className="flex flex-col gap-1 text-[12px] font-semibold text-muted-foreground">
                Municipality (for city reports)
                <select
                  value={details.municipalityId}
                  onChange={(e) => setDetails((p) => ({ ...p, municipalityId: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] font-normal text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="">Not set — managers see no city reports</option>
                  {municipalities.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.region ? `, ${m.region}` : ""}
                    </option>
                  ))}
                </select>
              </label>
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
              {` · City reports: ${municipalityName ?? "no municipality set"}`}
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

          {/* Archive is the answer for any building with history; Delete exists
              only for one nobody has used — a used one would be refused by
              its foreign keys, and those rows are other people's records. */}
          <button
            onClick={() => archive(!building.archivedAt)}
            disabled={busy}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-muted py-2 text-[13px] font-semibold text-foreground disabled:opacity-60"
          >
            {building.archivedAt ? (
              <>
                <ArchiveRestore className="h-3.5 w-3.5" /> Restore building
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5" /> Archive building
              </>
            )}
          </button>
          {!building.hasHistory && (
            <button
              onClick={remove}
              disabled={busy}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-destructive/10 py-2 text-[13px] font-semibold text-destructive disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete building
            </button>
          )}
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
      <div className="mb-4 flex flex-col gap-2 rounded-xl card-raised p-3.5 sm:flex-row sm:items-center">
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
            <div key={m.linkId} className="flex items-center gap-3 rounded-xl card-raised p-3.5">
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

/**
 * Businesses and clinics, by tier. The select sets the tier through
 * admin_set_business_tier; an open verification request (a clinic's "Request
 * verification") is approved — tier verified — or rejected with a note the
 * clinic sees on its banner. "Awaiting review" is the queue: open requests and
 * businesses nobody has listed yet.
 */
function Businesses() {
  const { data: businesses, isLoading, error, refetch } = useAdminBusinesses()
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<"review" | "all">("review")

  async function changeTier(b: AdminBusiness, tier: BusinessTier) {
    if (tier === b.tier) return
    setBusy(b.id)
    const { error: err } = await setBusinessTier(b.id, tier)
    setBusy(null)
    if (err) return toast.error("Couldn't change the tier", { description: err })
    toast.success(`${b.name} is now ${tierLabel(tier)}`)
    refetch()
  }

  async function review(b: AdminBusiness, approve: boolean, note?: string) {
    if (!b.openRequest) return false
    setBusy(b.id)
    const { error: err } = await reviewBusinessVerification(b.openRequest.id, approve, note)
    setBusy(null)
    if (err) {
      toast.error("Couldn't record the decision", { description: err })
      return false
    }
    toast.success(approve ? `${b.name} is verified` : "Request rejected")
    refetch()
    return true
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

  const waiting = businesses.filter((b) => awaitingReview({ tier: b.tier, openRequest: b.openRequest !== null }))
  const shown = filter === "review" ? waiting : businesses

  return (
    <div className="flex flex-col gap-2.5">
      <div className="mb-1 flex gap-1.5">
        {(
          [
            ["review", `Awaiting review (${waiting.length})`],
            ["all", `All (${businesses.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              filter === id ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {shown.length === 0 && (
        <p className="py-8 text-center text-[14px] text-muted-foreground">Nothing is waiting for review.</p>
      )}
      {shown.map((b) => (
        <BusinessCard
          key={b.id}
          business={b}
          busy={busy === b.id}
          onTier={(t) => changeTier(b, t)}
          onReview={(approve, note) => review(b, approve, note)}
          onRemove={() => remove(b.id, b.name)}
        />
      ))}
    </div>
  )
}

function BusinessCard({
  business: b,
  busy,
  onTier,
  onReview,
  onRemove,
}: {
  business: AdminBusiness
  busy: boolean
  onTier: (tier: BusinessTier) => void
  onReview: (approve: boolean, note?: string) => Promise<boolean>
  onRemove: () => void
}) {
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState("")

  return (
    <div className="rounded-xl card-raised p-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent/15">
          <Store className="h-5 w-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
            {b.name}
            {b.isVerified && <BadgeCheck className="h-4 w-4 flex-shrink-0 text-success" aria-label="Verified" />}
          </p>
          <p className="text-[12px] text-muted-foreground">{b.category}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <label className="sr-only" htmlFor={`tier-${b.id}`}>
            Tier for {b.name}
          </label>
          <select
            id={`tier-${b.id}`}
            value={b.tier}
            disabled={busy}
            onChange={(e) => onTier(e.target.value as BusinessTier)}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px] font-semibold text-foreground disabled:opacity-60"
          >
            {BUSINESS_TIERS.map((t) => (
              <option key={t} value={t}>
                {tierLabel(t)}
              </option>
            ))}
          </select>
          <button
            onClick={onRemove}
            disabled={busy}
            title="Delete business"
            className="flex items-center rounded-lg bg-muted p-1.5 text-muted-foreground disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">{tierDescription(b.tier)}</p>

      {b.openRequest && (
        <div className="mt-2.5 rounded-lg bg-warning/10 p-2.5">
          <p className="text-[12.5px] font-semibold text-foreground">
            Verification requested{" "}
            {new Date(b.openRequest.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
          </p>
          {(b.openRequest.licenceNumber || b.openRequest.issuingBody) && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {[b.openRequest.issuingBody, b.openRequest.licenceNumber].filter(Boolean).join(" · ")}
            </p>
          )}
          {rejecting ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Why not? The business sees this."
                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:outline-none"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={async () => {
                    if (await onReview(false, note)) {
                      setRejecting(false)
                      setNote("")
                    }
                  }}
                  disabled={busy || !note.trim()}
                  className="rounded-lg bg-destructive px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
                >
                  Reject request
                </button>
                <button
                  onClick={() => setRejecting(false)}
                  disabled={busy}
                  className="rounded-lg bg-muted px-3 py-1.5 text-[12px] font-semibold text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={() => onReview(true)}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-1.5 text-[12px] font-semibold text-success disabled:opacity-60"
              >
                <BadgeCheck className="h-3.5 w-3.5" /> Approve — verify
              </button>
              <button
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="rounded-lg bg-muted px-3 py-1.5 text-[12px] font-semibold text-foreground disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * City reports. Pet10x files nothing with any city; this is where an admin
 * records that a report has been looked at (acknowledged) or is finished with
 * (closed). Forward only — a closed report is not reopened from here. Building
 * managers see these read-only, without the reporter; so does this list.
 */
function MunicipalReports() {
  const { data: reports, isLoading, error, refetch } = useAdminMunicipalReports()
  const [busy, setBusy] = useState<string | null>(null)

  async function move(id: string, status: "acknowledged" | "closed") {
    setBusy(id)
    const { error: err } = await setMunicipalReportStatus(id, status)
    setBusy(null)
    if (err) return toast.error("Couldn't update the report", { description: err })
    toast.success(status === "acknowledged" ? "Report acknowledged" : "Report closed")
    refetch()
  }

  if (isLoading)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  if (error) return <LoadError message={error} onRetry={refetch} />
  if (reports.length === 0) return <p className="py-8 text-center text-[14px] text-muted-foreground">No city reports yet.</p>

  return (
    <div className="flex flex-col gap-2.5">
      {reports.map((r) => (
        <div key={r.id} className="rounded-xl card-raised p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold">{municipalTypeLabel(r.type)}</span>
            <span className="text-[12px] text-muted-foreground">
              {new Date(r.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
              {r.municipality ? ` · ${r.municipality}` : " · No city matched"}
              {r.reference ? ` · ${r.reference}` : ""}
            </span>
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold capitalize text-muted-foreground">
              {r.status}
            </span>
          </div>
          <p className="mt-1.5 line-clamp-3 text-[13px] text-foreground">{r.description}</p>
          {r.location && <p className="mt-1 text-[12px] text-muted-foreground">{r.location}</p>}
          {r.status !== "closed" && (
            <div className="mt-2.5 flex gap-1.5">
              {r.status === "submitted" && (
                <button
                  onClick={() => move(r.id, "acknowledged")}
                  disabled={busy === r.id}
                  className="rounded-lg bg-muted px-3 py-1.5 text-[12px] font-semibold text-foreground disabled:opacity-60"
                >
                  Acknowledge
                </button>
              )}
              <button
                onClick={() => move(r.id, "closed")}
                disabled={busy === r.id}
                className="rounded-lg bg-muted px-3 py-1.5 text-[12px] font-semibold text-foreground disabled:opacity-60"
              >
                Close
              </button>
            </div>
          )}
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
        <p className="mt-0.5 w-full max-w-sm text-[12px] text-muted-foreground">{message}</p>
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
