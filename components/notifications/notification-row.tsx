"use client"

import { useEffect, useRef, useState } from "react"
import { AlarmClock, AlertTriangle, Calendar, CheckCircle2, FileText, Shield, Sparkles, Syringe, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SwipeRow } from "@/components/ui/swipe-row"
import {
  dismissNotification,
  getMyTimezone,
  restoreNotification,
  snoozeNotification,
  type AppNotification,
  type NotificationIconKey,
} from "@/lib/data"
import { deviceTimezone, safeTimeZone, snoozeOptions, type SnoozeOption } from "@/lib/notifications/snooze"

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
  warning: { bg: "bg-warning-soft", iconColor: "text-warning" },
  error: { bg: "bg-destructive-soft", iconColor: "text-destructive" },
  info: { bg: "bg-info-soft", iconColor: "text-info" },
  success: { bg: "bg-success-soft", iconColor: "text-success" },
}

/** How long Undo stays on the "Notification deleted" toast. */
const UNDO_MS = 5000

/**
 * The zone the snooze times are worked out in. The profile's, when Intl
 * accepts it; the device's otherwise — including when reading the profile
 * fails or throws. Never rejects, so the sheet always gets its times.
 */
async function snoozeZone(): Promise<string> {
  const device = deviceTimezone()
  try {
    return safeTimeZone(await getMyTimezone(), device)
  } catch (e) {
    console.error("[notifications] could not read the profile timezone; using the device's", e)
    return device
  }
}

/**
 * Where keyboard focus goes when this row leaves the list: the next row, or
 * the list itself when it was the last. Without this, focus falls to <body>
 * and a keyboard user starts again from the top of the page. Rows and lists
 * are found by the data attributes the two inboxes set.
 */
function focusAfterRemoval(row: HTMLElement | null): HTMLElement | null {
  const list = row?.closest<HTMLElement>("[data-notification-list]") ?? null
  if (!row || !list) return null
  const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-notification-row]"))
  const next = rows[rows.indexOf(row) + 1]
  return next?.querySelector<HTMLElement>('[role="button"]') ?? list
}

/* After React has removed the row, and after any Radix layer closing with it
   has put focus back where it found it (its own deferred restore). */
function focusSoon(el: HTMLElement | null) {
  if (!el) return
  requestAnimationFrame(() => setTimeout(() => el.isConnected && el.focus(), 0))
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
 *
 * Swipe left (or hover, or Tab into it) for Snooze and Delete (spec §4). Both
 * take the row out of the shared store at once, so every surface's list and
 * unread count drop it together; a refused write puts it back with a toast.
 * Delete is undoable for five seconds; Snooze offers its times in the
 * person's own timezone (lib/notifications/snooze.ts).
 */
export function NotificationRow({
  notification: n,
  onOpen,
  onAction,
  actionLabel,
  className = "rounded-2xl card-raised",
  contentClassName = "p-3.5",
}: {
  notification: AppNotification
  onOpen: () => void
  onAction?: () => void
  /** Replaces the notification's own label — "Switch to Pet owner" when the
      button changes persona first, which the stored label cannot say. */
  actionLabel?: string
  /** The row's shape — radius, border or shadow. */
  className?: string
  /** Padding inside it. */
  contentClassName?: string
}) {
  const style = SEVERITY_STYLES[n.severity]
  const Icon = NOTIFICATION_ICONS[n.iconKey]
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [options, setOptions] = useState<SnoozeOption[] | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  /* Bumped on every open, so a slow zone read from an earlier open cannot
     overwrite the times of this one. */
  const snoozeTicket = useRef(0)

  /* The times are worked out when the sheet opens, not when the row
     rendered — a row left on screen since the afternoon must not offer
     "This evening" at eight. */
  const computeOptions = () => {
    const ticket = ++snoozeTicket.current
    void snoozeZone().then((tz) => {
      if (ticket === snoozeTicket.current) setOptions(snoozeOptions(new Date(), tz))
    })
  }

  const openSnooze = () => {
    setOptions(null)
    setSnoozeOpen(true)
    computeOptions()
  }

  /* A sheet left open while the tab is in the background would still offer
     a time that has since passed; work the times out again on return. */
  useEffect(() => {
    if (!snoozeOpen) return
    const refresh = () => {
      if (document.visibilityState === "visible") computeOptions()
    }
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [snoozeOpen])

  const snooze = (until: Date) => {
    focusSoon(focusAfterRemoval(rowRef.current))
    setSnoozeOpen(false)
    void snoozeNotification(n.id, until).then(({ error }) => {
      if (error) toast.error(error)
    })
  }

  /* The row goes and the toast shows at once, without waiting for the write;
     if the write is refused the store puts the row back, and the Undo toast
     is swapped for the reason. */
  const remove = () => {
    focusSoon(focusAfterRemoval(rowRef.current))
    const undoToast = toast("Notification deleted", {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          void restoreNotification(n.id).then(({ error }) => {
            if (error) toast.error(error)
          })
        },
      },
    })
    void dismissNotification(n.id).then(({ error }) => {
      if (error) {
        toast.dismiss(undoToast)
        toast.error(error)
      }
    })
  }

  return (
    <>
      <SwipeRow
        rootRef={rowRef}
        data-notification-row=""
        className={className}
        actions={[
          { label: "Snooze", icon: AlarmClock, onPress: openSnooze },
          { label: "Delete", icon: Trash2, onPress: remove, tone: "danger" },
        ]}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(e) => {
            // Only the row's own keys: Enter on the action link inside it
            // must reach the link, not open the row.
            if (e.target !== e.currentTarget) return
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onOpen()
            }
          }}
          className={`cursor-pointer transition-transform active:scale-[0.99] ${contentClassName}`}
        >
          <div className="flex gap-3">
            <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${style.bg}`}>
              <Icon className={`h-4 w-4 ${style.iconColor}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className={`text-body font-semibold text-foreground ${n.read ? "opacity-70" : ""}`}>{n.title}</h3>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {!n.read && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
                  <span className="text-caption text-muted-foreground">{n.time}</span>
                </div>
              </div>
              <p className={`mt-0.5 text-caption leading-relaxed ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>
                {n.body}
              </p>
              {onAction && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={(e) => {
                    // The row's own handler would mark it too; once is enough.
                    e.stopPropagation()
                    onAction()
                  }}
                  className="mt-1.5 text-caption"
                >
                  {/* A target with no label is a real case, not an oversight —
                      Phase 6 writes one on purpose. "Open" is the honest generic. */}
                  {actionLabel ?? n.actionLabel ?? "Open"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </SwipeRow>

      <Sheet open={snoozeOpen} onOpenChange={setSnoozeOpen}>
        <SheetContent side="bottom" className="rounded-t-lg bg-card pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle className="text-title">Snooze until</SheetTitle>
            <SheetDescription className="text-meta">
              It leaves your inbox and comes back unread.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4">
            {options === null ? (
              <p className="py-3 text-center text-meta text-muted-foreground" aria-live="polite">
                Working out the times…
              </p>
            ) : (
              options.map((o) => (
                <Button key={o.key} variant="secondary" className="justify-start" onClick={() => snooze(o.until)}>
                  {o.label}
                </Button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
