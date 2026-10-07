"use client"

import { useEffect, useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { toast } from "sonner"
import {
  markAllNotificationsRead,
  markNotificationRead,
  refreshNotifications,
  useNotifications,
  type NotificationIconKey,
  type NotificationCategory,
} from "@/lib/data"
import { useAuth } from "@/lib/auth-context"
import { resolveActionTarget } from "@/lib/navigation"
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  FileText,
  Shield,
  Syringe,
  BellOff,
  CheckCheck,
  Sparkles,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

type AlertTab = "all" | "care" | "compliance" | "incidents" | "building" | "assistant"

const NOTIFICATION_ICONS: Record<NotificationIconKey, typeof Syringe> = {
  syringe: Syringe,
  alert: AlertTriangle,
  file: FileText,
  check: CheckCircle2,
  calendar: Calendar,
  shield: Shield,
  sparkles: Sparkles,
}

const SEVERITY_STYLES = {
  warning: { bg: "bg-[#FFF6E0]", iconColor: "text-warning-strong" },
  error: { bg: "bg-destructive/10", iconColor: "text-destructive" },
  info: { bg: "bg-info/10", iconColor: "text-info" },
  success: { bg: "bg-success/10", iconColor: "text-success" },
}

/**
 * Every tab this screen knows about, in display order.
 *
 * Which of them RENDER is decided per viewer, from the categories actually
 * present in their own notifications — see `TABS` below. The fixed list was
 * shown to everyone, so a pet owner was offered Compliance, Incidents and
 * Building (manager concerns), and a manager was offered Care and Assistant
 * (owner concerns, and managers have no pets). Both were dead ends.
 *
 * Deriving it beats a role→tab map because it cannot drift: add a notification
 * kind, or start sending an existing one to a new audience, and the tab
 * appears for exactly the people who receive it.
 */
const ALL_TABS: { id: AlertTab; label: string; category: NotificationCategory }[] = [
  { id: "care", label: "Care", category: "care" },
  { id: "compliance", label: "Compliance", category: "compliance" },
  { id: "incidents", label: "Incidents", category: "incident" },
  { id: "building", label: "Building", category: "building" },
  { id: "assistant", label: "Assistant", category: "assistant" },
]

export function AlertsScreen({
  onNavigate,
  onBack,
}: {
  /** `id` is the second half of a `screen:id` action target — a pet id, or a
      care kind for the tracker. `tab` is that half instead for a tab-bearing
      screen (`my-vets:bills`). Matches `handleNavigate` in app/app/page.tsx. */
  onNavigate?: (screen: string, id?: string, petId?: string, tab?: string) => void
  /** Returns to the tab the viewer came from — managers have no "home". */
  onBack?: () => void
}) {
  const [activeTab, setActiveTab] = useState<AlertTab>("all")
  const { data: alerts, error: loadError, isLoading } = useNotifications()
  // Opening the inbox is when it must be current — there is no realtime feed.
  useEffect(() => {
    void refreshNotifications()
  }, [])
  const { activePersona, viewAs } = useAuth()

  /* Which half of the router will be rendering when we navigate. Read from
     `viewAs`, character for character the same expression `app/app/page.tsx:67`
     uses, because a target this screen offers and that router will not render
     is a blank screen — the failure the toast was at least honest about. */
  const surface = viewAs === "building-manager" ? "manager" : "resident"

  // Only the categories this viewer actually receives, plus All.
  const present = new Set(alerts.map((a) => a.category))
  const TABS: { id: AlertTab; label: string }[] = [
    { id: "all", label: "All" },
    ...ALL_TABS.filter((t) => present.has(t.category)).map((t) => ({ id: t.id, label: t.label })),
  ]

  // A tab can vanish as notifications are read or arrive; don't strand the
  // view filtering on something that is no longer offered.
  const effectiveTab = TABS.some((t) => t.id === activeTab) ? activeTab : "all"

  const filteredAlerts =
    effectiveTab === "all"
      ? alerts
      : alerts.filter((a) =>
          effectiveTab === "incidents" ? a.category === "incident" : a.category === effectiveTab
        )

  const unreadCount = alerts.filter((a) => !a.read).length

  // Managers receive incidents; they don't file them against their own
  // building. The CTA is for residents and, for anyone else, a dead end.
  const canReportIncident = activePersona !== "building-manager" && activePersona !== "strata-manager"

  /* Opening a notification is reading it. The dot clears at once; the store
     writes `read_at` behind it and puts the dot back if the write is refused,
     so the toast is the only trace of a failure, never a silent lie. */
  const open = (id: string) => {
    void markNotificationRead(id).then(({ error }) => {
      if (error) toast.error(error)
    })
  }

  const markAll = () => {
    void markAllNotificationsRead().then(({ error }) => {
      if (error) toast.error(error)
    })
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Alerts"
        largeTitle={false}
        leftAction={<NavBackButton onClick={() => (onBack ? onBack() : onNavigate?.("home"))} />}
        /* Two right actions stood here before and neither did anything: a "+"
           that duplicated the "Report an Incident" card below, and a "Filter"
           button that toasted "coming soon". The tab row underneath already
           filters. What is here now writes, and only exists while there is
           something unread for it to write. */
        rightAction={
          unreadCount > 0 ? (
            <button
              onClick={markAll}
              className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[12.5px] font-semibold text-primary"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="sticky top-16 z-30 bg-background px-4 pb-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
                effectiveTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {tab.label}
              {tab.id === "all" && unreadCount > 0 && (
                <span className={`ml-1 ${effectiveTab === tab.id ? "opacity-80" : ""}`}>
                  ({unreadCount})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Report CTA — residents only.
            The report flow has existed and worked the whole time this card said
            it was "coming soon": Home's quick action and its nav-bar button
            both already went there. */}
        {canReportIncident && (
        <button onClick={() => onNavigate?.("report")} className="mb-4 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-destructive/30 bg-destructive/5 p-3 transition-transform active:scale-[0.98]">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-4.5 w-4.5 text-destructive" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[14px] font-semibold text-foreground">Report an Incident</p>
            <p className="text-[11px] text-muted-foreground">File a pet-related complaint or report</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        )}

        {/* Alert List */}
        <div className="flex flex-col gap-2.5">
          {/* A failed load is said as one, with a way to try again — never
              as "You're all caught up", which is a claim about the inbox. */}
          {loadError && (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-center">
              <p className="text-[13px] leading-relaxed text-foreground">{loadError}</p>
              <button
                onClick={() => void refreshNotifications()}
                className="mt-2 text-[13px] font-semibold text-primary"
              >
                Try again
              </button>
            </div>
          )}
          {filteredAlerts.length === 0 && !loadError && !isLoading && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <BellOff className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mt-4 text-[15px] font-semibold text-foreground">You&apos;re all caught up</h3>
              <p className="mx-auto mt-1 max-w-[20rem] text-[13px] leading-relaxed text-muted-foreground">
                No notifications right now. Reminders, compliance updates and building alerts will appear here.
              </p>
            </div>
          )}
          {filteredAlerts.map((alert) => {
            const style = SEVERITY_STYLES[alert.severity]
            const Icon = NOTIFICATION_ICONS[alert.iconKey]
            /* The label is not what decides whether there is a button — the
               TARGET is. `action_label` and `action_target` are two nullable
               columns written independently, and this screen used to render a
               button for any label and then toast it. Phase 6 relies on that
               being fixed: its rule-publish notification deliberately writes a
               target and NO label, precisely so it would not ship a tenth dead
               button here. */
            const route = resolveActionTarget(alert.actionTarget, surface)
            return (
              <div
                key={alert.id}
                role="button"
                tabIndex={0}
                onClick={() => open(alert.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    open(alert.id)
                  }
                }}
                className="cursor-pointer rounded-2xl card-raised p-3.5 transition-transform active:scale-[0.99]"
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
                    {route && (
                      <button
                        onClick={(e) => {
                          // The row's own handler would mark it too; once is enough.
                          e.stopPropagation()
                          open(alert.id)
                          onNavigate?.(route.screen, route.id, undefined, route.tab)
                        }}
                        className="mt-1.5 text-[12px] font-semibold text-primary"
                      >
                        {/* A target with no label is a real case, not an
                            oversight — Phase 6 writes one on purpose. "Open"
                            is the honest generic: the button opens the screen
                            the notification is about. */}
                        {alert.actionLabel ?? "Open"}
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
