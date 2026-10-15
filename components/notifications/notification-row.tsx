"use client"

import { AlertTriangle, Calendar, CheckCircle2, FileText, Shield, Sparkles, Syringe } from "lucide-react"
import type { AppNotification, NotificationIconKey } from "@/lib/data"

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
 * One notification, as the Alerts screen draws it — and the business and
 * clinic consoles' inbox, which shares it so a notification looks the same
 * wherever it is read.
 *
 * Opening the row is reading it (`onOpen`). The button underneath exists only
 * when the caller resolved the target to somewhere this surface can go
 * (`onAction`): the label is not what decides whether there is a button, the
 * TARGET is — `action_label` and `action_target` are two nullable columns
 * written independently, and a label with no reachable target used to render
 * a button that went nowhere.
 */
export function NotificationRow({
  notification: n,
  onOpen,
  onAction,
  className = "rounded-2xl card-raised p-3.5",
}: {
  notification: AppNotification
  onOpen: () => void
  onAction?: () => void
  className?: string
}) {
  const style = SEVERITY_STYLES[n.severity]
  const Icon = NOTIFICATION_ICONS[n.iconKey]
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`cursor-pointer transition-transform active:scale-[0.99] ${className}`}
    >
      <div className="flex gap-3">
        <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${style.bg}`}>
          <Icon className={`h-4 w-4 ${style.iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className={`text-[14px] font-semibold text-foreground ${n.read ? "opacity-70" : ""}`}>{n.title}</h3>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              {!n.read && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
              <span className="text-[10px] text-muted-foreground">{n.time}</span>
            </div>
          </div>
          <p className={`mt-0.5 text-[12px] leading-relaxed ${!n.read ? "text-secondary-foreground" : "text-muted-foreground"}`}>
            {n.body}
          </p>
          {onAction && (
            <button
              onClick={(e) => {
                // The row's own handler would mark it too; once is enough.
                e.stopPropagation()
                onAction()
              }}
              className="mt-1.5 text-[12px] font-semibold text-primary-text"
            >
              {/* A target with no label is a real case, not an oversight —
                  Phase 6 writes one on purpose. "Open" is the honest generic. */}
              {n.actionLabel ?? "Open"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
