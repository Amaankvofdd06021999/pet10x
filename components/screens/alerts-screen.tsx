"use client"

import { useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { useNotifications, type NotificationIconKey } from "@/lib/data"
import { toast } from "sonner"
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  FileText,
  Shield,
  Syringe,
  Plus,
  Filter,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

type AlertTab = "all" | "compliance" | "incidents" | "building"

const NOTIFICATION_ICONS: Record<NotificationIconKey, typeof Syringe> = {
  syringe: Syringe,
  alert: AlertTriangle,
  file: FileText,
  check: CheckCircle2,
  calendar: Calendar,
  shield: Shield,
}

const SEVERITY_STYLES = {
  warning: { bg: "bg-[#FFF6E0]", iconColor: "text-[#B8860B]" },
  error: { bg: "bg-destructive/10", iconColor: "text-destructive" },
  info: { bg: "bg-info/10", iconColor: "text-info" },
  success: { bg: "bg-success/10", iconColor: "text-success" },
}

const TABS: { id: AlertTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "compliance", label: "Compliance" },
  { id: "incidents", label: "Incidents" },
  { id: "building", label: "Building" },
]

export function AlertsScreen() {
  const [activeTab, setActiveTab] = useState<AlertTab>("all")
  const { data: alerts } = useNotifications()

  const filteredAlerts =
    activeTab === "all"
      ? alerts
      : alerts.filter((a) =>
          activeTab === "incidents" ? a.category === "incident" : a.category === activeTab
        )

  const unreadCount = alerts.filter((a) => !a.read).length

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Alerts"
        rightAction={
          <div className="flex items-center gap-2">
            <button onClick={() => toast("Report an incident", { description: "Coming soon." })} className="p-2" aria-label="Report incident">
              <Plus className="h-5 w-5 text-primary" />
            </button>
            <button onClick={() => toast("Filters — coming soon")} className="p-2" aria-label="Filter">
              <Filter className="h-5 w-5 text-foreground" />
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="sticky top-[88px] z-30 bg-background px-4 pb-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {tab.label}
              {tab.id === "all" && unreadCount > 0 && (
                <span className={`ml-1 ${activeTab === tab.id ? "opacity-80" : ""}`}>
                  ({unreadCount})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Report CTA */}
        <button onClick={() => toast("Report an incident", { description: "Pet incident reporting is coming soon." })} className="mb-4 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-destructive/30 bg-destructive/5 p-3 transition-transform active:scale-[0.98]">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-4.5 w-4.5 text-destructive" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[14px] font-semibold text-foreground">Report an Incident</p>
            <p className="text-[11px] text-muted-foreground">File a pet-related complaint or report</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Alert List */}
        <div className="flex flex-col gap-2.5">
          {filteredAlerts.map((alert) => {
            const style = SEVERITY_STYLES[alert.severity]
            const Icon = NOTIFICATION_ICONS[alert.iconKey]
            return (
              <div
                key={alert.id}
                className="rounded-2xl border border-border bg-card p-3.5 transition-transform active:scale-[0.99]"
              >
                <div className="flex gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${style.bg}`}>
                    <Icon className={`h-4 w-4 ${style.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={`text-[14px] font-semibold text-foreground ${alert.read ? "opacity-70" : ""}`}>
                        {alert.title}
                      </h3>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {!alert.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                        <span className="text-[10px] text-muted-foreground">{alert.time}</span>
                      </div>
                    </div>
                    <p className={`mt-0.5 text-[12px] leading-relaxed ${!alert.read ? "text-secondary-foreground" : "text-muted-foreground"}`}>
                      {alert.body}
                    </p>
                    {alert.actionLabel && (
                      <button onClick={() => toast.success(alert.actionLabel ?? "Done")} className="mt-1.5 text-[12px] font-semibold text-primary">
                        {alert.actionLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
