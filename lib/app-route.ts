/**
 * What `/app` is showing, as a URL.
 *
 * WHY THIS FILE EXISTS
 *
 * The app shell keeps its screen in React state, so the address bar never
 * changed: Back left the app, refresh dropped the viewer on Home, and no
 * screen could be linked to. This module is the pure half of the fix — route
 * state to a query string and back — so the shell only has to call it.
 *
 * The query string is UNTRUSTED, so `searchToRoute` follows the grammar rule
 * in `navigation.ts`: it accepts only what it can positively name. The screen
 * must be registered for this surface, an id must be a uuid (or, for
 * `pet-care`, a care kind), a tab and a pet must match their patterns. Anything
 * else is `null`, and the caller shows the tab root rather than guess.
 *
 * Old email and push links still arrive as `?target=screen:id`.
 * `fromLegacyTarget` reads them through `resolveActionTarget`, so the shell can
 * replace that parameter with `?screen=` instead of leaving both in the bar.
 */
import {
  ID_BEARING,
  ID_REQUIRED,
  SCREEN_SURFACES,
  TAB_BEARING,
  isScreenKey,
  readTargetParam,
  resolveActionTarget,
  type ScreenKey,
  type Surface,
} from "./navigation"

export type AppRoute = { screen: ScreenKey; id?: string; petId?: string; tab?: string }

export const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const TAB_RE = /^[a-z][a-z-]{0,31}$/
/** The `pet-care` id is a care kind ("food"), not a uuid. */
export const CARE_KIND_RE = /^[a-z_]{1,24}$/

/** Screens that are a tab's landing page: with no other params they are the bare `/app`. */
export const TAB_ROOTS: ReadonlySet<ScreenKey> = new Set<ScreenKey>([
  "home",
  "community",
  "services",
  "profile",
  "dashboard",
  "residents",
  "violations",
  "approvals",
  "incidents",
  "settings",
])

/**
 * Tabs of screens that open on one but are not in `TAB_BEARING`, which governs
 * notification targets. The lists are the ones the screens themselves accept
 * (`DETAIL_TABS` in pet-detail-screen, the `lost | events | feed` check in
 * community-screen), so a URL can round-trip any tab the app pushes.
 */
const SCREEN_TABS: Partial<Record<ScreenKey, readonly string[]>> = {
  ...TAB_BEARING,
  "pet-detail": ["overview", "care", "vaccinations", "documents", "contacts"],
  community: ["feed", "lost", "events"],
}

function idMatches(screen: ScreenKey, id: string): boolean {
  return (screen === "pet-care" ? CARE_KIND_RE : ID_RE).test(id)
}

export function routeToSearch(r: AppRoute): string {
  if (TAB_ROOTS.has(r.screen) && !r.id && !r.petId && !r.tab) return ""
  const p = new URLSearchParams({ screen: r.screen })
  if (r.id) p.set("id", r.id)
  if (r.petId) p.set("pet", r.petId)
  if (r.tab) p.set("tab", r.tab)
  return `?${p.toString()}`
}

export function searchToRoute(search: string, surface: Surface): AppRoute | null {
  let p: URLSearchParams
  try {
    p = new URLSearchParams(search)
  } catch {
    return null
  }
  const screen = p.get("screen")
  if (screen === null || !isScreenKey(screen)) return null
  if (!SCREEN_SURFACES[screen].includes(surface)) return null

  // `handleNavigate` hands an id only to ID_BEARING screens (and a pet only to
  // the tracker); an id anywhere else would stash a stale pet for the next
  // screen that reads one. A screen whose subject IS the id cannot open without.
  const route: AppRoute = { screen }
  const id = p.get("id")
  if (id !== null) {
    if (!ID_BEARING.includes(screen) || !idMatches(screen, id)) return null
    route.id = id
  } else if (ID_REQUIRED.includes(screen)) return null
  const pet = p.get("pet")
  if (pet !== null) {
    if (screen !== "pet-care" || !ID_RE.test(pet)) return null
    route.petId = pet
  }
  const tab = p.get("tab")
  if (tab !== null) {
    if (!TAB_RE.test(tab) || !SCREEN_TABS[screen]?.includes(tab)) return null
    route.tab = tab
  }
  return route
}

/** A `?target=screen:id` link from an email or push, as a route; null if this surface cannot open it. */
export function fromLegacyTarget(search: string, surface: Surface): AppRoute | null {
  const resolved = resolveActionTarget(readTargetParam(search), surface)
  if (!resolved) return null
  if (resolved.id !== undefined && !idMatches(resolved.screen, resolved.id)) return null
  if (resolved.tab !== undefined && !TAB_RE.test(resolved.tab)) return null
  return resolved
}

/** Back goes through browser history if the app has pushed any; otherwise to the tab root, never out of the app. */
export function backTarget(depth: number, activeTab: ScreenKey): "history" | AppRoute {
  return depth > 0 ? "history" : { screen: activeTab }
}
