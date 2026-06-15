"use client"

import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { useBuildingResidents, useBuildingPets } from "@/lib/data"
import {
  Shield,
  AlertTriangle,
  UserCheck,
  Gavel,
  BarChart3,
  QrCode,
  Dog,
  Cat,
  Clock,
  Building2,
  Bell,
  Loader2,
  CheckCircle2,
} from "lucide-react"

const QUICK_ACTIONS = [
  { icon: UserCheck, label: "Review\nResidents", color: "bg-primary/10 text-primary", screen: "residents" },
  { icon: Gavel, label: "Violations", color: "bg-destructive/10 text-destructive", screen: "violations" },
  { icon: BarChart3, label: "Approvals", color: "bg-info/10 text-info", screen: "approvals" },
  { icon: QrCode, label: "Emergency\nQR", color: "bg-accent/10 text-accent", screen: "" },
]

interface DashboardScreenProps {
  onNavigate?: (screen: string) => void
}

export function ManagerDashboardScreen({ onNavigate }: DashboardScreenProps) {
  const { user } = useAuth()
  const { data: residents, isLoading: rLoading } = useBuildingResidents()
  const { data: pets, isLoading: pLoading } = useBuildingPets()

  const members = residents.filter((r) => r.status === "approved").length
  const pending = residents.filter((r) => r.status === "pending").length
  const dogs = pets.filter((p) => p.species === "dog").length
  const cats = pets.filter((p) => p.species === "cat").length
  const compliant = pets.filter((p) => p.compliancePct >= 100).length
  const needsAttention = pets.length - compliant
  const avgCompliance = pets.length ? Math.round(pets.reduce((s, p) => s + p.compliancePct, 0) / pets.length) : 100
  const loading = rLoading || pLoading

  const SUMMARY = [
    { label: "Pets", value: pets.length, icon: Dog, color: "text-primary" },
    { label: "Members", value: members, icon: UserCheck, color: "text-info" },
    { label: "Pending", value: pending, icon: Clock, color: "text-[#B8860B]" },
    { label: "Attention", value: needsAttention, icon: AlertTriangle, color: "text-destructive" },
  ]

  const handleQuickAction = (screen: string) => {
    if (!screen) toast.success("Emergency QR generated", { description: "Valid for 4 hours." })
    else onNavigate?.(screen)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Dashboard"
        rightAction={
          <button onClick={() => toast("No new notifications")} className="relative p-2" aria-label="Notifications">
            <Bell className="h-5 w-5 text-foreground" />
          </button>
        }
      />

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Greeting */}
        <section className="mb-4">
          <p className="text-[13px] text-muted-foreground">Welcome back, {user?.name?.split(" ")[0]}</p>
          {user?.building && (
            <div className="mt-0.5 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[13px] text-muted-foreground">{user.building}</span>
            </div>
          )}
        </section>

        {/* Compliance hero */}
        <section className="mb-5">
          <div className="rounded-2xl bg-info p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium text-info-foreground/80">Building compliance</p>
                <p className="text-[32px] font-semibold leading-tight text-info-foreground">
                  {loading ? "—" : `${avgCompliance}%`}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-info-foreground/20">
                <Shield className="h-6 w-6 text-info-foreground" />
              </div>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-info-foreground/20">
              <div className="h-full rounded-full bg-info-foreground transition-all" style={{ width: `${avgCompliance}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-info-foreground/70">
              {pets.length === 0
                ? "No registered pets yet"
                : needsAttention === 0
                  ? "All registered pets are compliant"
                  : `${needsAttention} pet${needsAttention === 1 ? "" : "s"} need attention`}
            </p>
          </div>
        </section>

        {/* Summary row */}
        <section className="mb-5">
          <div className="grid grid-cols-4 gap-2">
            {SUMMARY.map((stat) => {
              const Icon = stat.icon
              return (
                <div key={stat.label} className="rounded-2xl border border-border bg-card p-2.5 text-center">
                  <Icon className={`mx-auto h-4 w-4 ${stat.color}`} />
                  <p className={`mt-1 text-[18px] font-semibold ${stat.color}`}>{loading ? "—" : stat.value}</p>
                  <p className="text-[9px] font-medium text-muted-foreground">{stat.label}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Pending approvals nudge */}
        {pending > 0 && (
          <button
            onClick={() => onNavigate?.("residents")}
            className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-warning/30 bg-[#FFFBEF] p-3.5 text-left transition-transform active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-warning/15">
              <Clock className="h-5 w-5 text-[#B8860B]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-foreground">
                {pending} resident{pending === 1 ? "" : "s"} awaiting approval
              </p>
              <p className="text-[12px] text-muted-foreground">Review and approve to add them to your building</p>
            </div>
          </button>
        )}

        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-5">
          {/* Quick Actions */}
          <section className="mb-5">
            <h2 className="mb-2.5 text-[15px] font-semibold text-foreground">Quick actions</h2>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.label}
                    onClick={() => handleQuickAction(action.screen)}
                    className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card p-2.5 transition-transform active:scale-[0.97]"
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${action.color}`}>
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="whitespace-pre-line text-center text-[10px] font-medium leading-tight text-foreground">
                      {action.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Pet breakdown */}
          <section className="mb-5">
            <h2 className="mb-2.5 text-[15px] font-semibold text-foreground">Pet breakdown</h2>
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
              <div className="grid grid-cols-2 gap-2">
                <BreakdownCard icon={Dog} color="text-primary" label="Dogs" value={dogs} />
                <BreakdownCard icon={Cat} color="text-accent" label="Cats" value={cats} />
                <BreakdownCard icon={CheckCircle2} color="text-success" label="Compliant" value={compliant} />
                <BreakdownCard icon={AlertTriangle} color="text-destructive" label="Needs attention" value={needsAttention} />
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

function BreakdownCard({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: typeof Dog
  color: string
  label: string
  value: number
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-[13px] font-semibold text-foreground">{label}</span>
      </div>
      <p className="mt-1 text-[22px] font-semibold text-foreground">{value}</p>
    </div>
  )
}
