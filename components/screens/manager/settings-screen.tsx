"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import QRCode from "qrcode"
import {
  useManagerBuilding,
  useBuildingStats,
  useEmergencyTokens,
  updateMyBuilding,
  updateMyBuildingRules,
  issueEmergencyToken,
  revokeEmergencyToken,
  type PetRules,
} from "@/lib/data/manager"
import {
  Building2,
  Shield,
  FileText,
  Bell,
  Search,
  Lock,
  Globe,
  Moon,
  HelpCircle,
  LogOut,
  ChevronRight,
  QrCode,
  Users,
  CreditCard,
  Clipboard,
  Loader2,
  X,
  Copy,
  Ban,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"

/** Menu items that don't have a real destination yet — kept, but honestly labelled. */
const UNBUILT: { icon: typeof Bell; label: string; section: string }[] = [
  { icon: FileText, label: "Document Templates", section: "Building Configuration" },
  { icon: Bell, label: "Notification Rules", section: "Building Configuration" },
  { icon: Users, label: "Staff & Access Control", section: "Administration" },
  { icon: Search, label: "Audit Log", section: "Administration" },
  { icon: Clipboard, label: "Compliance Report", section: "Administration" },
  { icon: CreditCard, label: "Subscription & Billing", section: "Administration" },
  { icon: Lock, label: "Security & Access", section: "Account" },
  { icon: Globe, label: "Language", section: "Account" },
  { icon: Moon, label: "Appearance", section: "Account" },
  { icon: HelpCircle, label: "Help & FAQ", section: "Support" },
  { icon: FileText, label: "Terms & Privacy Policy", section: "Support" },
]

const RULE_TOGGLES: { key: keyof PetRules; label: string }[] = [
  { key: "requires_registry", label: "Requires pet registration" },
  { key: "require_rabies", label: "Rabies vaccination required" },
  { key: "require_core_vaccines", label: "Core vaccines required" },
  { key: "require_license", label: "Municipal license required" },
  { key: "require_insurance", label: "Liability insurance required" },
  { key: "require_spay_neuter", label: "Spay/neuter required" },
]

type Sheet = "profile" | "bylaws" | "qr" | null

export function ManagerSettingsScreen() {
  const { user, signOut } = useAuth()
  const { data: building, isLoading, refetch } = useManagerBuilding()
  const { data: stats, isLoading: statsLoading } = useBuildingStats(building?.id)
  const [sheet, setSheet] = useState<Sheet>(null)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar title="Settings" />

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Profile Card */}
        <section className="mb-5">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                {user?.avatar ? (
                  <Image src={user.avatar} alt={user.name ?? ""} fill className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[18px] font-semibold text-muted-foreground">
                    {user?.name?.charAt(0) ?? "?"}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[17px] font-semibold text-foreground">{user?.name}</h2>
                <p className="truncate text-[12px] text-muted-foreground">{building?.name ?? "No building assigned"}</p>
                <Badge className="mt-1 border-0 bg-info/10 text-[10px] text-info">{user?.roleLabel}</Badge>
              </div>
            </div>
          </div>
        </section>

        {/* Real stats, straight from the building's own rows. */}
        <section className="mb-5">
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Pets" value={statsLoading ? null : String(stats.pets)} />
            <StatTile label="Compliance" value={statsLoading ? null : `${stats.compliancePct}%`} />
            <StatTile
              label="Open Issues"
              value={statsLoading ? null : String(stats.openIssues)}
              tone={stats.openIssues > 0 ? "danger" : undefined}
            />
          </div>
        </section>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !building ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground">
            You aren&apos;t assigned to a building yet. Ask a Pet10x admin to add you.
          </p>
        ) : (
          <MenuSection title="Building Configuration">
            <MenuRow icon={Building2} label="Building Profile" detail={building.name} onClick={() => setSheet("profile")} />
            <MenuRow
              icon={Shield}
              label="Pet Bylaws & Policies"
              detail={`${RULE_TOGGLES.filter((r) => building.rules[r.key]).length} rules active`}
              onClick={() => setSheet("bylaws")}
            />
            <MenuRow icon={QrCode} label="Emergency QR Code" detail="Issue / revoke" onClick={() => setSheet("qr")} last />
          </MenuSection>
        )}

        {/* Not built yet — say so rather than pretending. */}
        {["Administration", "Account", "Support"].map((section) => (
          <MenuSection key={section} title={section}>
            {UNBUILT.filter((i) => i.section === section).map((item, idx, arr) => (
              <MenuRow
                key={item.label}
                icon={item.icon}
                label={item.label}
                detail="Not available yet"
                onClick={() => toast(item.label, { description: "This isn't built yet." })}
                last={idx === arr.length - 1}
              />
            ))}
          </MenuSection>
        ))}

        <section className="mb-5">
          <button
            onClick={signOut}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 transition-transform active:scale-[0.98]"
          >
            <LogOut className="h-5 w-5 text-destructive" />
            <span className="text-[14px] font-semibold text-destructive">Sign Out</span>
          </button>
        </section>

        <div className="mb-4 text-center">
          <p className="text-[11px] text-muted-foreground">Pet10x v1.0.0 &middot; Park10x Services Inc.</p>
        </div>
      </main>

      {building && sheet === "profile" && (
        <BuildingProfileSheet
          building={building}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null)
            refetch()
          }}
        />
      )}
      {building && sheet === "bylaws" && (
        <BylawsSheet
          building={building}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null)
            refetch()
          }}
        />
      )}
      {building && sheet === "qr" && <EmergencyQrSheet buildingId={building.id} onClose={() => setSheet(null)} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Building profile                                                    */
/* ------------------------------------------------------------------ */

function BuildingProfileSheet({
  building,
  onClose,
  onSaved,
}: {
  building: NonNullable<ReturnType<typeof useManagerBuilding>["data"]>
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: building.name,
    address: building.address ?? "",
    city: building.city ?? "",
    region: building.region ?? "",
    totalUnits: building.totalUnits ? String(building.totalUnits) : "",
  })
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!form.name.trim()) return toast.error("Building name can't be empty.")
    setBusy(true)
    const { error } = await updateMyBuilding(building.id, {
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      region: form.region.trim(),
      totalUnits: form.totalUnits ? Number(form.totalUnits) : null,
    })
    setBusy(false)
    if (error) return toast.error("Couldn't save", { description: error })
    toast.success("Building profile updated")
    onSaved()
  }

  return (
    <Sheet title="Building Profile" onClose={onClose}>
      <p className="mb-3 text-[12px] text-muted-foreground">
        Building code <span className="font-mono font-semibold text-foreground">{building.code}</span> — residents use
        this to link their unit. It can only be changed by a Pet10x admin.
      </p>
      <Field label="Building name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} />
      <Field label="Address" value={form.address} onChange={(v) => setForm((p) => ({ ...p, address: v }))} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="City" value={form.city} onChange={(v) => setForm((p) => ({ ...p, city: v }))} />
        <Field label="Region" value={form.region} onChange={(v) => setForm((p) => ({ ...p, region: v }))} />
      </div>
      <Field
        label="Total units"
        value={form.totalUnits}
        onChange={(v) => setForm((p) => ({ ...p, totalUnits: v.replace(/\D/g, "") }))}
      />
      <SheetButton onClick={save} busy={busy} label="Save changes" />
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* Bylaws                                                              */
/* ------------------------------------------------------------------ */

function BylawsSheet({
  building,
  onClose,
  onSaved,
}: {
  building: NonNullable<ReturnType<typeof useManagerBuilding>["data"]>
  onClose: () => void
  onSaved: () => void
}) {
  const [rules, setRules] = useState<PetRules>(building.rules)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const { error } = await updateMyBuildingRules(building.id, rules)
    setBusy(false)
    if (error) return toast.error("Couldn't save bylaws", { description: error })
    toast.success("Bylaws updated", { description: "Residents see the new rules immediately." })
    onSaved()
  }

  return (
    <Sheet title="Pet Bylaws & Policies" onClose={onClose}>
      <p className="mb-3 text-[12px] text-muted-foreground">
        These drive every compliance check in the app. Turning one on immediately affects each resident&apos;s score.
      </p>

      <div className="mb-4 flex flex-col gap-2">
        {RULE_TOGGLES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRules((p) => ({ ...p, [r.key]: !p[r.key] }))}
            className="flex items-center justify-between rounded-xl bg-muted px-3 py-2.5 text-left"
          >
            <span className="text-[13px] text-foreground">{r.label}</span>
            <span
              className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                rules[r.key] ? "bg-success" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  rules[r.key] ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
        ))}
      </div>

      <Field
        label="Max weight (kg)"
        value={rules.max_weight_kg != null ? String(rules.max_weight_kg) : ""}
        onChange={(v) => setRules((p) => ({ ...p, max_weight_kg: v ? Number(v.replace(/\D/g, "")) : null }))}
      />
      <div className="mb-3">
        <label className="mb-1 block text-[12px] font-semibold text-muted-foreground">Notes / bylaw reference</label>
        <textarea
          value={rules.notes ?? ""}
          onChange={(e) => setRules((p) => ({ ...p, notes: e.target.value }))}
          rows={4}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] text-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <SheetButton onClick={save} busy={busy} label="Publish bylaws" />
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* Emergency QR                                                        */
/* ------------------------------------------------------------------ */

function EmergencyQrSheet({ buildingId, onClose }: { buildingId: string; onClose: () => void }) {
  const { data: tokens, isLoading, refetch } = useEmergencyTokens(buildingId)
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState<string | null>(null)

  const active = tokens.find((t) => t.isActive)
  const url = active ? `${window.location.origin}/emergency/${active.token}` : null

  useEffect(() => {
    if (!url) {
      setQr(null)
      return
    }
    QRCode.toDataURL(url, { width: 320, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null))
  }, [url])

  async function issue() {
    setBusy(true)
    const { error } = await issueEmergencyToken(buildingId)
    setBusy(false)
    if (error) return toast.error("Couldn't issue token", { description: error })
    toast.success("Emergency access issued", { description: "Valid for 4 hours." })
    refetch()
  }

  async function revoke(id: string) {
    setBusy(true)
    const { error } = await revokeEmergencyToken(id)
    setBusy(false)
    if (error) return toast.error("Couldn't revoke", { description: error })
    toast.success("Access revoked")
    refetch()
  }

  return (
    <Sheet title="Emergency QR Code" onClose={onClose}>
      <p className="mb-3 text-[12px] text-muted-foreground">
        Issues a time-boxed, read-only link to this building&apos;s pet directory for first responders. Expires after 4
        hours and can be revoked at any time. Supplementary information only — not a life-safety system.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : active && url ? (
        <div className="flex flex-col items-center gap-3">
          {qr && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={qr} alt="Emergency access QR code" className="h-48 w-48 rounded-xl border border-border" />
          )}
          <p className="text-[12px] text-muted-foreground">
            Expires {new Date(active.expiresAt).toLocaleString()}
          </p>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(url)
              toast.success("Link copied")
            }}
            className="flex items-center gap-1.5 rounded-xl bg-muted px-4 py-2 text-[13px] font-semibold text-foreground"
          >
            <Copy className="h-3.5 w-3.5" /> Copy link
          </button>
          <button
            onClick={() => revoke(active.id)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl bg-destructive/10 px-4 py-2 text-[13px] font-semibold text-destructive disabled:opacity-60"
          >
            <Ban className="h-3.5 w-3.5" /> Revoke access
          </button>
        </div>
      ) : (
        <SheetButton onClick={issue} busy={busy} label="Issue 4-hour access" />
      )}
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function StatTile({ label, value, tone }: { label: string; value: string | null; tone?: "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2.5 text-center">
      {value === null ? (
        <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <p className={`text-[18px] font-bold ${tone === "danger" ? "text-destructive" : "text-foreground"}`}>{value}</p>
      )}
      <p className="text-[9px] font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase text-muted-foreground">{title}</h3>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">{children}</div>
    </section>
  )
}

function MenuRow({
  icon: Icon,
  label,
  detail,
  onClick,
  last,
}: {
  icon: typeof Bell
  label: string
  detail?: string
  onClick: () => void
  last?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-muted ${
        last ? "" : "border-b border-border"
      }`}
    >
      <Icon className="h-5 w-5 text-info" />
      <span className="flex-1 text-[14px] text-foreground">{label}</span>
      {detail && <span className="truncate text-[12px] text-muted-foreground">{detail}</span>}
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    </button>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[17px] font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground active:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-[12px] font-semibold text-muted-foreground">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] text-foreground focus:border-primary focus:outline-none"
      />
    </div>
  )
}

function SheetButton({ onClick, busy, label }: { onClick: () => void; busy: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  )
}
