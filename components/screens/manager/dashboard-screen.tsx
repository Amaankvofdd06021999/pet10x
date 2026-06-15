"use client"

import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import {
  useUrgentItems,
  useManagerActivity,
  useBuilding,
  type BuildingStats,
  type ManagerActivityIconKey,
} from "@/lib/data"
import {
  Shield,
  AlertTriangle,
  UserCheck,
  Gavel,
  BarChart3,
  QrCode,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Dog,
  Cat,
  FileText,
  Clock,
  Building2,
  Bell,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

const SUMMARY_STATS: { label: string; key: keyof BuildingStats; icon: typeof Dog; color: string }[] = [
  { label: "Registered", key: "registered", icon: Dog, color: "text-primary" },
  { label: "Violations", key: "activeViolations", icon: Gavel, color: "text-destructive" },
  { label: "Approvals", key: "pendingApprovals", icon: UserCheck, color: "text-info" },
  { label: "Risk Score", key: "riskScore", icon: Shield, color: "text-success" },
]

const ACTIVITY_ICONS: Record<ManagerActivityIconKey, typeof UserCheck> = {
  approval: UserCheck,
  gavel: Gavel,
  file: FileText,
  alert: AlertTriangle,
}

const QUICK_ACTIONS = [
  { icon: Gavel, label: "Issue\nWarning", color: "bg-destructive/10 text-destructive" },
  { icon: UserCheck, label: "Review\nRegistration", color: "bg-primary/10 text-primary" },
  { icon: BarChart3, label: "Generate\nReport", color: "bg-accent/10 text-accent" },
  { icon: QrCode, label: "Emergency\nQR", color: "bg-info/10 text-info" },
]

interface DashboardScreenProps {
  onNavigate?: (screen: string) => void
}

export function ManagerDashboardScreen({ onNavigate }: DashboardScreenProps) {
  const { user } = useAuth()
  const { data: building } = useBuilding()
  const { data: urgentItems } = useUrgentItems()
  const { data: recentActivity } = useManagerActivity()
  const stats = building.stats

  const handleQuickAction = (label: string) => {
    if (label.includes("QR")) toast.success("Emergency QR generated", { description: "Valid for 4 hours." })
    else if (label.includes("Warning")) onNavigate?.("violations")
    else if (label.includes("Registration")) onNavigate?.("approvals")
    else if (label.includes("Report")) toast.success("Report generating…")
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Dashboard"
        rightAction={
          <button onClick={() => toast("No new notifications")} className="relative p-2" aria-label="Notifications">
            <Bell className="h-5 w-5 text-foreground" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
          </button>
        }
      />

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Greeting */}
        <section className="mb-4">
          <p className="text-[13px] text-muted-foreground">Welcome back, {user?.name?.split(" ")[0]}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[13px] text-muted-foreground">{user?.building}</span>
          </div>
        </section>

        {/* Compliance Score Hero */}
        <section className="mb-5">
          <div className="rounded-2xl bg-info p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium text-info-foreground/80">Building Compliance</p>
                <p className="text-[32px] font-bold leading-tight text-info-foreground">{stats.buildingComplianceScore}%</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-info-foreground/20">
                <Shield className="h-6 w-6 text-info-foreground" />
              </div>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-info-foreground/20">
              <div className="h-full rounded-full bg-info-foreground transition-all" style={{ width: `${stats.buildingComplianceScore}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[11px] text-info-foreground/70">{stats.nonCompliantUnits} units non-compliant</p>
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-info-foreground/70" />
                <span className="text-[11px] text-info-foreground/70">+2% this month</span>
              </div>
            </div>
          </div>
        </section>

        {/* Summary Row */}
        <section className="mb-5">
          <div className="grid grid-cols-4 gap-2">
            {SUMMARY_STATS.map((stat) => {
              const Icon = stat.icon
              return (
                <div key={stat.label} className="rounded-xl border border-border bg-card p-2.5 text-center">
                  <Icon className={`mx-auto h-4 w-4 ${stat.color}`} />
                  <p className={`mt-1 text-[18px] font-bold ${stat.color}`}>{stats[stat.key]}</p>
                  <p className="text-[9px] font-medium text-muted-foreground">{stat.label}</p>
                </div>
              )
            })}
          </div>
        </section>

        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-5">
        {/* Urgent Items */}
        {urgentItems.length > 0 && (
          <section className="mb-5">
            <div className="mb-2.5 flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-foreground">Urgent</h2>
              <Badge className="bg-destructive/10 text-destructive border-0 text-[10px]">{urgentItems.length}</Badge>
            </div>
            <div className="flex flex-col gap-2">
              {urgentItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate?.("violations")}
                  className={`w-full rounded-xl border-l-4 p-3 text-left transition-transform active:scale-[0.99] ${
                    item.severity === "critical"
                      ? "border-l-destructive bg-destructive/5"
                      : "border-l-warning bg-warning/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[14px] font-semibold text-foreground">{item.title}</h3>
                    <span className="flex-shrink-0 text-[10px] text-muted-foreground">{item.time}</span>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{item.body}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <Badge className={`border-0 text-[10px] ${
                      item.severity === "critical"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-warning/10 text-[#B8860B]"
                    }`}>
                      {item.severity === "critical" ? "Critical" : "High Priority"}
                    </Badge>
                    <span className="text-[12px] font-semibold text-info">Take Action</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Quick Actions */}
        <section className="mb-5">
          <h2 className="mb-2.5 text-[15px] font-semibold text-foreground">Quick Actions</h2>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action.label)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-2.5 transition-transform active:scale-[0.97]"
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

        {/* Recent Activity */}
        <section className="mb-5">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-foreground">Recent Activity</h2>
            <button onClick={() => toast("Activity log — coming soon")} className="text-[13px] font-medium text-info">View All</button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {recentActivity.map((item, idx) => {
              const Icon = ACTIVITY_ICONS[item.iconKey]
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-3 py-2.5 ${
                    idx < recentActivity.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">{item.action}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{item.detail}</p>
                  </div>
                  <span className="flex-shrink-0 text-[10px] text-muted-foreground">{item.time}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Pet Breakdown */}
        <section className="mb-5">
          <h2 className="mb-2.5 text-[15px] font-semibold text-foreground">Pet Breakdown</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <Dog className="h-4 w-4 text-primary" />
                <span className="text-[13px] font-semibold text-foreground">Dogs</span>
              </div>
              <p className="mt-1 text-[22px] font-bold text-foreground">{stats.dogs}</p>
              <p className="text-[10px] text-muted-foreground">{stats.largeBreedExemptions} large breed exemptions</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <Cat className="h-4 w-4 text-accent" />
                <span className="text-[13px] font-semibold text-foreground">Cats</span>
              </div>
              <p className="mt-1 text-[22px] font-bold text-foreground">{stats.cats}</p>
              <p className="text-[10px] text-muted-foreground">All compliant</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-info" />
                <span className="text-[13px] font-semibold text-foreground">ESA</span>
              </div>
              <p className="mt-1 text-[22px] font-bold text-foreground">{stats.esa}</p>
              <p className="text-[10px] text-muted-foreground">1 pending verification</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-success" />
                <span className="text-[13px] font-semibold text-foreground">Service</span>
              </div>
              <p className="mt-1 text-[22px] font-bold text-foreground">{stats.serviceAnimals}</p>
              <p className="text-[10px] text-muted-foreground">All verified</p>
            </div>
          </div>
        </section>
        </div>
      </main>
    </div>
  )
}
