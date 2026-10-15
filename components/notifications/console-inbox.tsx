"use client"

import { useEffect, useState } from "react"
import { Bell, BellOff, CheckCheck, Settings2, X } from "lucide-react"
import { toast } from "sonner"
import { Portal } from "@/components/ui/portal"
import { NotificationRow } from "@/components/notifications/notification-row"
import {
  markAllNotificationsRead,
  markNotificationRead,
  refreshNotifications,
  useNotifications,
} from "@/lib/data"
import { resolveConsoleTarget, type ConsoleRoute } from "@/lib/navigation"

/**
 * The business and clinic consoles' inbox: a bell with the unread count, and a
 * panel listing the account's notifications with mark-read.
 *
 * Neither console ever reaches /app — middleware sends those accounts to their
 * own shell — so until now a booking request, a cancellation or an approved
 * estimate reached them by email or push and nowhere in the product. The list
 * is the same shared store the resident's Alerts screen reads
 * (lib/data/notification-store.ts), so reading one here reads it everywhere.
 *
 * A notification's button exists only when its target names THIS console
 * (`business:bookings` in /businessaccess, `clinic:billing` in /clinic); an
 * /app target has nowhere to go from here, so it renders no button.
 */
export function ConsoleInbox({
  console: consoleName,
  onOpenTab,
  onOpenSettings,
  className = "",
}: {
  console: ConsoleRoute["console"]
  onOpenTab: (tab: string) => void
  /** Opens the Email & push sheet. */
  onOpenSettings: () => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const { data: items, error, isLoading } = useNotifications()
  const unread = items.filter((n) => !n.read).length

  // Opening the panel is when it must be current — there is no realtime feed.
  useEffect(() => {
    if (open) void refreshNotifications()
  }, [open])

  const read = (id: string) => {
    void markNotificationRead(id).then(({ error: e }) => {
      if (e) toast.error(e)
    })
  }
  const readAll = () => {
    void markAllNotificationsRead().then(({ error: e }) => {
      if (e) toast.error(e)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className={`relative flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-[13px] font-semibold text-foreground ${className}`}
      >
        <Bell className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Notifications</span>
        {unread > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-start sm:justify-end sm:p-4" onClick={() => setOpen(false)}>
            <div
              role="dialog"
              aria-label="Notifications"
              className="flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-card shadow-float sm:mt-12 sm:w-[400px] sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h2 className="text-[15px] font-semibold text-foreground">Notifications</h2>
                <div className="flex items-center gap-1">
                  {unread > 0 && (
                    <button
                      onClick={readAll}
                      className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[12px] font-semibold text-primary-text"
                    >
                      <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setOpen(false)
                      onOpenSettings()
                    }}
                    aria-label="Email and push settings"
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {error ? (
                  // A failed load is said as one — never as "all caught up".
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-center">
                    <p className="text-[13px] text-foreground">{error}</p>
                    <button onClick={() => void refreshNotifications()} className="mt-2 text-[13px] font-semibold text-primary-text">
                      Try again
                    </button>
                  </div>
                ) : items.length === 0 && !isLoading ? (
                  <div className="py-10 text-center">
                    <BellOff className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-2 text-[13px] font-semibold text-foreground">You&apos;re all caught up</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">New bookings and updates will appear here.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {items.map((n) => {
                      const route = resolveConsoleTarget(n.actionTarget)
                      const tab = route?.console === consoleName ? route.tab : undefined
                      return (
                        <NotificationRow
                          key={n.id}
                          notification={n}
                          className="rounded-xl border border-border p-3"
                          onOpen={() => read(n.id)}
                          onAction={
                            tab
                              ? () => {
                                  read(n.id)
                                  setOpen(false)
                                  onOpenTab(tab)
                                }
                              : undefined
                          }
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  )
}
