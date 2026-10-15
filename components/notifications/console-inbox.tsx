"use client"

import { useEffect, useState } from "react"
import { Bell, BellOff, CheckCheck, Settings2, X } from "lucide-react"
import { toast } from "sonner"
import { DialogLayer, DialogTitle } from "@/components/ui/dialog"
import { NotificationRow } from "@/components/notifications/notification-row"
import {
  markAllNotificationsRead,
  markNotificationRead,
  refreshNotifications,
  useNotifications,
} from "@/lib/data"
import { resolveConsoleTarget, type ConsoleRoute } from "@/lib/navigation"
import { Button } from "@/components/ui/button"
import { LoadError } from "@/components/ui/load-error"

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
 * Each row swipes (or, here on a desktop, hovers) to Snooze and Delete —
 * NotificationRow carries both, so the console and Alerts behave alike.
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className={`relative ${className}`}
      >
        <Bell className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Notifications</span>
        {unread > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-caption font-bold leading-none text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      {/* Escape, a tap outside and X close it; focus returns to the bell. */}
      <DialogLayer
        open={open}
        onOpenChange={setOpen}
        overlayClassName="flex items-end justify-center bg-black/40 sm:items-start sm:justify-end sm:p-4"
        className="flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-card shadow-float sm:mt-12 sm:w-[400px] sm:rounded-2xl"
      >
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <DialogTitle className="text-body font-semibold leading-normal text-foreground">Notifications</DialogTitle>
                <div className="flex items-center gap-1">
                  {unread > 0 && (
                    <Button variant="secondary" size="sm" onClick={readAll}>
                      <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                    </Button>
                  )}
                  <Button
                    variant="quiet"
                    size="icon-sm"
                    onClick={() => {
                      setOpen(false)
                      onOpenSettings()
                    }}
                    aria-label="Email and push settings"
                  >
                    <Settings2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button variant="quiet" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {/* Focusable (not tabbable), and outside the list so it is still
                  here once the last row is snoozed or deleted: where focus
                  lands then. */}
              <div data-notification-list="" tabIndex={-1} className="flex-1 overflow-y-auto p-3 outline-none">
                {error ? (
                  // A failed load is said as one — never as "all caught up".
                  <LoadError message={error} onRetry={() => void refreshNotifications()} />
                ) : items.length === 0 && !isLoading ? (
                  <div className="py-10 text-center">
                    <BellOff className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-2 text-meta font-semibold text-foreground">You&apos;re all caught up</p>
                    <p className="mt-0.5 text-caption text-muted-foreground">New bookings and updates will appear here.</p>
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
                          className="rounded-xl border border-border"
                          contentClassName="p-3"
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
      </DialogLayer>
    </>
  )
}
