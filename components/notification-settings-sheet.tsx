"use client"

import { ErrorText } from "@/components/ui/error-text"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { Loader2, Mail, Smartphone, X } from "lucide-react"
import { DialogDescription, DialogLayer, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { useNotificationPrefs, setNotificationPref, hasOtherPushDevices } from "@/lib/data/notification-prefs"
import { disablePush, enablePush, getPushState, isPushConfigured, type PushState } from "@/lib/push"

/**
 * Notifications — Email, and Push on this device.
 *
 * One sheet for every persona: the resident's Profile, the manager's
 * Settings, and the business and clinic consoles all open this. What each
 * switch sends is said under it, because "email notifications" means nothing
 * until you know which.
 *
 * The Push row exists only in a deployment with VAPID keys, and its switch
 * only in a browser with a push manager and permission not blocked. Where
 * the browser is the obstacle, the row is a sentence saying why — never a
 * switch that fails.
 */
export function NotificationSettingsSheet({ onClose }: { onClose: () => void }) {
  const prefs = useNotificationPrefs()
  const [pushState, setPushState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState<"email" | "push" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    let live = true
    void getPushState().then((s) => live && setPushState(s))
    // Safari on iPhone and iPad delivers web push only to a Home Screen app.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    setIosHint(/iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone)
    return () => {
      live = false
    }
  }, [])

  async function toggleEmail(next: boolean) {
    if (!prefs.data) return
    setBusy("email")
    setError(null)
    prefs.setData({ ...prefs.data, email: next })
    const res = await setNotificationPref("email", next)
    if (res.error) {
      prefs.setData({ ...prefs.data, email: !next })
      setError(res.error)
    }
    setBusy(null)
  }

  async function togglePush(next: boolean) {
    if (!prefs.data) return
    setBusy("push")
    setError(null)
    if (next) {
      // The permission prompt happens here, inside the click — never on load.
      const res = await enablePush()
      if (res.error) {
        setError(res.error)
        setPushState(await getPushState())
        setBusy(null)
        return
      }
      if (!prefs.data.push) {
        const saved = await setNotificationPref("push", true)
        if (saved.error) setError(saved.error)
        else prefs.setData({ ...prefs.data, push: true })
      }
    } else {
      const res = await disablePush()
      if (res.error) {
        // The browser is unsubscribed even then; show the device as it is.
        setError(res.error)
        setPushState(await getPushState())
        setBusy(null)
        return
      }
      /* "On this device" means other devices keep theirs. Only when this was
         the last one does the account-level flag go off too. */
      if (!(await hasOtherPushDevices())) {
        const saved = await setNotificationPref("push", false)
        if (!saved.error) prefs.setData({ ...prefs.data, push: false })
      }
    }
    setPushState(await getPushState())
    setBusy(null)
  }

  const pushOn = pushState === "on" && !!prefs.data?.push
  // No VAPID key in this deployment: no Push row at all, not a dead switch.
  const showPush = isPushConfigured()

  return (
    // Mounted only while open; Escape, a tap outside, X and Done all close it.
    <DialogLayer
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      described
      overlayClassName="flex items-end justify-center bg-black/40 sm:items-center"
      className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 shadow-float sm:rounded-3xl"
    >
          <div className="mb-1 flex items-center justify-between">
            <DialogTitle className="text-title font-semibold leading-normal text-foreground">Notifications</DialogTitle>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted-foreground active:bg-muted">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <DialogDescription className="mb-4 text-caption leading-relaxed text-muted-foreground">
            Everything still arrives in the app. These choose where else it reaches you.
          </DialogDescription>

          {prefs.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !prefs.data ? (
            <div className="rounded-2xl border border-border p-4 text-center">
              <p className="text-meta text-muted-foreground">{prefs.error}</p>
              <Button variant="secondary" size="sm" onClick={() => void prefs.refetch()} className="mt-2">
                Try again
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border">
              <label className={`flex items-start gap-3 px-3 py-3 ${showPush ? "border-b border-border" : ""}`}>
                <Mail className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-medium text-foreground">Email</span>
                  <span className="mt-0.5 block text-caption leading-relaxed text-muted-foreground">
                    Incidents, bookings, messages from your vet, reminders, compliance and building notices. Several
                    at once arrive as one digest, and anything you&apos;ve already read in the app isn&apos;t sent.
                  </span>
                </span>
                <Switch
                  checked={prefs.data.email}
                  disabled={busy !== null}
                  onCheckedChange={(v) => void toggleEmail(v)}
                  aria-label="Email notifications"
                  className="mt-0.5"
                />
              </label>

              {showPush && (
                <div className="flex items-start gap-3 px-3 py-3">
                  <Smartphone className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-medium text-foreground">Push on this device</span>
                    <span className="mt-0.5 block text-caption leading-relaxed text-muted-foreground">
                      {pushState === null
                        ? "Checking this device…"
                        : pushState === "denied"
                          ? "Notifications are blocked for Pet10x in this browser's settings. Allow them there to turn push on."
                          : pushState === "unsupported"
                            ? iosHint
                              ? "On iPhone and iPad, add Pet10x to your Home Screen (Share → Add to Home Screen), then open it from there to turn on push."
                              : "This browser can't receive push notifications."
                            : "Every notification, on this device, even when Pet10x is closed. Your other devices keep their own setting."}
                    </span>
                  </span>
                  {(pushState === "on" || pushState === "off") &&
                    (busy === "push" ? (
                      <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Switch
                        checked={pushOn}
                        disabled={busy !== null}
                        onCheckedChange={(v) => void togglePush(v)}
                        aria-label="Push notifications on this device"
                        className="mt-0.5"
                      />
                    ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <ErrorText className="mt-3 text-caption">
              {error}
            </ErrorText>
          )}

          <Button variant="secondary" onClick={onClose} className="mt-4 w-full">
            Done
          </Button>
    </DialogLayer>
  )
}
