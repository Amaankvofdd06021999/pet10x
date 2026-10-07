/*
 * Pet10x service worker — web push only.
 *
 * Registered by lib/push.ts when someone turns on "Push on this device", never
 * on page load. It caches nothing and intercepts no requests: its whole job is
 * to show a notification the dispatcher (/api/notifications/dispatch) sends,
 * and to open the screen it names when it is tapped.
 *
 * The payload is the JSON `pushPayload` builds (lib/notifications/dispatch.ts):
 *   { title, body, tag, url }
 * where `url` is a same-origin path such as /app?target=my-bookings.
 */

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  // Take control of open pages now, so a tap can navigate the one already open.
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Pet10x"
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url: typeof data.url === "string" ? data.url : "/app" },
    }),
  )
})

/** Only a path on this origin is ever opened — never another site. */
function safeUrl(raw) {
  // `/\host` and `/\t/host` resolve to another origin, so the RESOLVED origin
  // is what is checked (the same rule as lib/safe-next.ts).
  const fallback = new URL("/app", self.location.origin).href
  if (typeof raw !== "string" || !raw.startsWith("/")) return fallback
  try {
    const url = new URL(raw, self.location.origin)
    return url.origin === self.location.origin ? url.href : fallback
  } catch {
    return fallback
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = safeUrl(event.notification.data && event.notification.data.url)
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        // A full navigation, so /app reads ?target= on load and routes it.
        if ("navigate" in client) {
          try {
            await client.navigate(url)
            return
          } catch {
            // Not controlled by this worker yet; fall through to a new window.
          }
        }
        break
      }
      await self.clients.openWindow(url)
    })(),
  )
})
