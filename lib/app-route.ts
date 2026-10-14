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

/* ------------------------------------------------------------------ */
/* History state — what the shell writes into each entry it pushes.    */
/* ------------------------------------------------------------------ */

/**
 * Stored beside Next's own keys in `history.state` on every entry the shell
 * writes. `route` is the route exactly as `handleNavigate` received it (an id
 * on a screen the URL cannot carry still restores on Back), `activeTab` is the
 * tab bar's selection at the time, and `depth` is how many app entries sit
 * behind this one — stored rather than counted, so Forward restores it too.
 */
export type AppHistoryState = { pet10x: true; route: AppRoute; activeTab: ScreenKey; depth: number }

export function defaultTab(surface: Surface): ScreenKey {
  return surface === "manager" ? "dashboard" : "home"
}

function isOnSurface(screen: unknown, surface: Surface): screen is ScreenKey {
  return typeof screen === "string" && isScreenKey(screen) && SCREEN_SURFACES[screen].includes(surface)
}

/**
 * The tab bar selection for a restored route: a tab root selects itself;
 * any other screen keeps the tab it was opened from, or the surface's
 * default tab when that is unknown (a cold load) or not on this surface.
 */
export function tabForRoute(route: AppRoute, storedTab: unknown, surface: Surface): ScreenKey {
  if (TAB_ROOTS.has(route.screen)) return route.screen
  if (isOnSurface(storedTab, surface)) return storedTab
  return defaultTab(surface)
}

/** The route as the URL can carry it: params `searchToRoute` would refuse are dropped. */
export function canonicalRoute(r: AppRoute): AppRoute {
  const out: AppRoute = { screen: r.screen }
  if (r.id !== undefined && ID_BEARING.includes(r.screen) && idMatches(r.screen, r.id)) out.id = r.id
  if (r.petId !== undefined && r.screen === "pet-care" && ID_RE.test(r.petId)) out.petId = r.petId
  if (r.tab !== undefined && TAB_RE.test(r.tab) && SCREEN_TABS[r.screen]?.includes(r.tab)) out.tab = r.tab
  return out
}

export function sameRoute(a: AppRoute | null, b: AppRoute | null): boolean {
  if (a === null || b === null) return a === b
  return a.screen === b.screen && a.id === b.id && a.petId === b.petId && a.tab === b.tab
}

const optString = (v: unknown): v is string | undefined => v === undefined || typeof v === "string"

/** An entry this shell wrote, for this surface; null for anything else (Next's own entries, the other persona's). */
export function readHistoryState(state: unknown, surface: Surface): Omit<AppHistoryState, "pet10x"> | null {
  if (typeof state !== "object" || state === null) return null
  const s = state as Record<string, unknown>
  if (s.pet10x !== true || typeof s.route !== "object" || s.route === null) return null
  const r = s.route as Record<string, unknown>
  if (!isOnSurface(r.screen, surface) || !optString(r.id) || !optString(r.petId) || !optString(r.tab)) return null
  const route: AppRoute = { screen: r.screen }
  if (r.id !== undefined) route.id = r.id
  if (r.petId !== undefined) route.petId = r.petId
  if (r.tab !== undefined) route.tab = r.tab
  const depth = typeof s.depth === "number" && Number.isInteger(s.depth) && s.depth > 0 ? s.depth : 0
  return { route, activeTab: tabForRoute(route, s.activeTab, surface), depth }
}

/**
 * What the shell opens on its first ready render.
 *
 * A reload keeps `history.state`, so an entry this shell wrote whose route
 * still matches the address bar wins: it carries the tab and the depth (Back
 * keeps working after a refresh) and, for a tab root, which root — every tab
 * root is the bare `/app`. Otherwise the URL decides: `?screen=`, then a
 * legacy `?target=`. Null means "the tab root", with no history behind it.
 */
export function initialRoute(
  search: string,
  state: unknown,
  surface: Surface,
): Omit<AppHistoryState, "pet10x"> | null {
  const stored = readHistoryState(state, surface)
  if (stored && routeToSearch(canonicalRoute(stored.route)) === search) return stored
  const route = searchToRoute(search, surface) ?? fromLegacyTarget(search, surface)
  if (!route) return null
  return { route, activeTab: tabForRoute(route, undefined, surface), depth: 0 }
}

const ROUTE_PARAMS = ["target", "screen", "id", "pet", "tab"]

/** `search` with every route param replaced by `route`'s — never both `target=` and `screen=`; other params kept. */
export function replaceRouteParams(search: string, route: AppRoute): string {
  const p = new URLSearchParams(search)
  for (const k of ROUTE_PARAMS) p.delete(k)
  const own = new URLSearchParams(routeToSearch(canonicalRoute(route)))
  for (const [k, v] of own) p.append(k, v)
  const s = p.toString()
  return s ? `?${s}` : ""
}
