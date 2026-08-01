"use client"

import type { ReactNode } from "react"
import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { useBuildingResidents, useBuildingPets, useUnreadNotificationCount, useViolations } from "@/lib/data"
import { useComplianceInputs } from "@/lib/data/portfolio"
import { useManagerBuilding } from "@/lib/data/manager"
import {
  Shield,
  AlertTriangle,
  UserCheck,
  Gavel,
  QrCode,
  Dog,
  Cat,
  PawPrint,
  Bell,
  Loader2,
  FileText,
  DollarSign,
  ChevronRight,
} from "lucide-react"

/**
 * Manager dashboard.
 *
 * Colours come from the app's tokens only — primary/accent/success/warning/
 * destructive. The previous version used `--info` (#007AFF, iOS system blue)
 * for the compliance banner, the Approvals tile and the Members stat, which
 * introduced a hue that appears nowhere in the Pet10x palette.
 */

const QUICK_ACTIONS = [
  { icon: UserCheck, label: "Review Residents", tint: "bg-primary/10 text-primary", screen: "residents" },
  { icon: AlertTriangle, label: "Violations", tint: "bg-destructive/10 text-destructive", screen: "violations" },
  { icon: Shield, label: "Approvals", tint: "bg-success/10 text-success", screen: "approvals" },
  { icon: QrCode, label: "Emergency QR", tint: "bg-muted text-foreground", screen: "" },
] as const

/** Stage → the tile shown on a violation row. */
const STAGE_TILE: Record<string, { tint: string; icon: typeof Gavel }> = {
  investigation: { tint: "bg-destructive/10 text-destructive", icon: AlertTriangle },
  "pending-review": { tint: "bg-destructive/10 text-destructive", icon: AlertTriangle },
  "verbal-warning": { tint: "bg-primary/10 text-primary", icon: FileText },
  "written-warning": { tint: "bg-primary/10 text-primary", icon: Gavel },
  "fine-issued": { tint: "bg-destructive/10 text-destructive", icon: DollarSign },
}

const BAD_VAX = ["expired", "rejected"]

interface DashboardScreenProps {
  onNavigate?: (screen: string, id?: string) => void
}

export function ManagerDashboardScreen({ onNavigate }: DashboardScreenProps) {
  const { user } = useAuth()
  const { data: building, isLoading: bLoading } = useManagerBuilding()
  const { data: residents, isLoading: rLoading } = useBuildingResidents()
  const { data: allPets, isLoading: pLoading } = useBuildingPets()
  const { data: allInputs } = useComplianceInputs()
  const { data: allViolations } = useViolations()
  const unreadCount = useUnreadNotificationCount()

  // A manager may hold more than one building. Every number on this screen is
  // labelled as *this* building's, so scope to it rather than trusting RLS to
  // have returned exactly one building's worth of rows.
  //
  // While the building is still resolving, show nothing rather than a flash of
  // every building's rows. If it resolves to null the manager has no building,
  // so RLS-scoped rows are the honest fallback rather than a blank screen.
  const inBuilding = <T extends { buildingId: string | null }>(rows: T[]) => {
    if (building) return rows.filter((r) => r.buildingId === building.id)
    return bLoading ? [] : rows
  }
  const pets = inBuilding(allPets)
  const violations = inBuilding(allViolations)
  const inputs = inBuilding(allInputs)

  const members = residents.filter((r) => r.status === "approved").length
  const pending = residents.filter((r) => r.status === "pending").length
  const dogs = pets.filter((p) => p.species === "dog").length
  const cats = pets.filter((p) => p.species === "cat").length
  const others = pets.length - dogs - cats
  const ownersWithPets = new Set(pets.map((p) => p.ownerId).filter(Boolean)).size
  const compliant = pets.filter((p) => p.compliancePct >= 100).length
  const needsAttention = pets.length - compliant
  const expiredDocs = inputs.filter((p) => p.vax.some((v) => BAD_VAX.includes(v.status))).length
  const avgCompliance = pets.length ? Math.round(pets.reduce((s, p) => s + p.compliancePct, 0) / pets.length) : 100
  const loading = rLoading || pLoading || bLoading

  const handleQuickAction = (screen: string) => {
    if (!screen) toast.success("Emergency QR generated", { description: "Valid for 4 hours." })
    else onNavigate?.(screen)
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <IOSNavBar
        inlineTitle
        title={
          <>
            <PawPrint className="h-6 w-6 flex-shrink-0 text-primary" fill="currentColor" />
            Pet10x
          </>
        }
        rightAction={
          <button
            onClick={() => onNavigate?.("alerts")}
            className="relative p-2"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          >
            <Bell className="h-5 w-5 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        }
      />

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Greeting */}
        <section className="mb-5 mt-3">
          <h1 className="text-[26px] font-semibold leading-tight text-primary">
            Welcome back, {user?.name?.split(" ")[0]}
          </h1>
          {(building?.name || user?.building) && (
            <p className="mt-1 text-[14px] text-muted-foreground">{building?.name ?? user?.building}</p>
          )}
        </section>

        {/* Headline pair — the building at a glance */}
        <section className="mb-6 grid grid-cols-2 gap-3">
          <div className="relative overflow-hidden rounded-2xl bg-primary p-4">
            <PawPrint
              className="absolute -bottom-3 -right-2 h-20 w-20 text-primary-foreground/15"
              fill="currentColor"
              aria-hidden
            />
            <p className="relative text-[13px] font-medium text-primary-foreground/90">Total pets</p>
            <p className="relative mt-0.5 text-[30px] font-bold leading-none text-primary-foreground">
              {loading ? "—" : pets.length}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[13px] font-medium text-muted-foreground">Residents w/ pets</p>
            <p className="mt-0.5 text-[30px] font-bold leading-none text-primary">
              {loading ? "—" : ownersWithPets}
            </p>
          </div>
        </section>

        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-5">
          {/* Quick actions */}
          <section className="mb-6">
            <SectionLabel>Quick actions</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.label}
                    onClick={() => handleQuickAction(action.screen)}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-3 py-5 transition-transform active:scale-[0.97]"
                  >
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${action.tint}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-center text-[13px] font-semibold leading-tight text-foreground">
                      {action.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Violation tracking */}
          <section className="mb-6">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-semibold text-foreground">Violation tracking</h2>
                {violations.length > 0 && (
                  <button
                    onClick={() => onNavigate?.("violations")}
                    className="flex-shrink-0 text-[13px] font-semibold text-primary"
                  >
                    View all
                  </button>
                )}
              </div>

              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : violations.length === 0 ? (
                <div className="flex flex-col items-center gap-1 py-6 text-center">
                  <Shield className="h-6 w-6 text-success" />
                  <p className="text-[14px] font-semibold text-foreground">No open violations</p>
                  <p className="text-[12px] text-muted-foreground">Reported incidents will appear here.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {violations.slice(0, 3).map((v) => {
                    const tile = STAGE_TILE[v.stage] ?? STAGE_TILE.investigation
                    const Icon = tile.icon
                    return (
                      <button
                        key={v.id}
                        onClick={() => onNavigate?.("violations")}
                        className="flex items-center gap-3 rounded-xl bg-muted/50 p-2.5 text-left transition-colors active:bg-muted"
                      >
                        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${tile.tint}`}>
                          <Icon className="h-4.5 w-4.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-foreground">
                            {v.stageLabel}
                          </span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {v.pet} · Unit {v.unit}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Awaiting approval — the one thing on this screen that is a job to do,
            so it gets a coloured rule rather than another neutral card. */}
        {pending > 0 && (
          <button
            onClick={() => onNavigate?.("residents")}
            className="mb-6 flex w-full items-center gap-3 rounded-2xl border-l-4 border-success bg-success/10 p-4 text-left transition-transform active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-success">Residents awaiting approval</span>
              <span className="mt-0.5 block text-[24px] font-bold leading-tight text-foreground">
                {pending} new application{pending === 1 ? "" : "s"}
              </span>
            </span>
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-success">
              <UserCheck className="h-5 w-5 text-success-foreground" />
            </span>
          </button>
        )}

        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-5">
          {/* Species breakdown */}
          <section className="mb-6">
            <SectionLabel>Species breakdown</SectionLabel>
            {loading ? (
              <div className="flex justify-center rounded-2xl border border-border bg-card py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : pets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                <Dog className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-2 text-[14px] font-semibold text-foreground">No registered pets yet</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  Pets appear here once residents join and add them.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <SpeciesCard icon={Dog} tint="bg-primary/10 text-primary" label="Dogs" value={dogs} />
                <SpeciesCard icon={Cat} tint="bg-accent/10 text-accent" label="Cats" value={cats} />
                {/* Only when there are any — the app registers seven species,
                    and folding them into a permanent zero would read as a bug. */}
                {others > 0 && (
                  <SpeciesCard icon={PawPrint} tint="bg-muted text-foreground" label="Other" value={others} />
                )}
              </div>
            )}
          </section>

          {/* Register health */}
          <section className="mb-6">
            <div className="grid grid-cols-2 gap-3">
              <StatBar label="Compliant" value={compliant} total={pets.length} bar="bg-primary" loading={loading} />
              <StatBar
                label="Expired docs"
                value={expiredDocs}
                total={pets.length}
                bar="bg-destructive"
                tone="text-destructive"
                loading={loading}
              />
              <StatBar label="Members" value={members} total={members + pending} bar="bg-success" loading={loading} />
              <StatBar
                label="Pending"
                value={pending}
                total={members + pending}
                bar="bg-warning"
                tone="text-[#B8860B]"
                loading={loading}
              />
            </div>
          </section>
        </div>

        {/* Building compliance */}
        <section className="mb-2">
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
            <ComplianceRing pct={loading ? 0 : avgCompliance} />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold text-foreground">Building compliance</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {pets.length === 0
                  ? "No registered pets yet."
                  : needsAttention === 0
                    ? "All registered pets are compliant."
                    : `${needsAttention} pet${needsAttention === 1 ? "" : "s"} need attention.`}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
  )
}

function SpeciesCard({
  icon: Icon,
  tint,
  label,
  value,
}: {
  icon: typeof Dog
  tint: string
  label: string
  value: number
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
      <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${tint}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-muted-foreground">{label}</p>
        <p className="text-[20px] font-bold leading-tight text-foreground">{value}</p>
      </div>
    </div>
  )
}

function StatBar({
  label,
  value,
  total,
  bar,
  tone = "text-foreground",
  loading,
}: {
  label: string
  value: number
  total: number
  bar: string
  tone?: string
  loading: boolean
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <p className="truncate text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-[22px] font-bold leading-tight ${tone}`}>{loading ? "—" : value}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${loading ? 0 : pct}%` }} />
      </div>
    </div>
  )
}

/** Compliance as a ring rather than a filled banner — a percentage is one
 *  number, and the old full-width block gave it more weight than the work
 *  items above it. */
function ComplianceRing({ pct }: { pct: number }) {
  const r = 26
  const circumference = 2 * Math.PI * r
  return (
    <div className="relative h-16 w-16 flex-shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-success transition-[stroke-dashoffset] duration-500"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(Math.max(pct, 0), 100) / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[14px] font-bold text-foreground">
        {pct}%
      </span>
    </div>
  )
}
