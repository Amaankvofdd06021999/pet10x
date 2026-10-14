"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { IOSTabBar } from "@/components/ios-tab-bar"
import { AppSidebar } from "@/components/app-sidebar"
import { Toaster } from "@/components/ui/sonner"
import { SignInScreen } from "@/components/screens/sign-in-screen"
import { GuestReportScreen } from "@/components/screens/guest-report-screen"
import { HomeScreen } from "@/components/screens/home-screen"
import { CommunityScreen } from "@/components/screens/community-screen"
import { ServicesScreen } from "@/components/screens/services-screen"
import { AlertsScreen } from "@/components/screens/alerts-screen"
import { ProfileScreen } from "@/components/screens/profile-screen"
import { MyCasesScreen } from "@/components/screens/resident/my-cases-screen"
import { PetDetailScreen } from "@/components/screens/pet-detail-screen"
import { AddPetScreen } from "@/components/screens/add-pet-screen"
import { PetCareScreen } from "@/components/screens/pet-care-screen"
import { AiChatScreen } from "@/components/screens/ai-chat-screen"
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow"
import { LinkBuildingScreen } from "@/components/screens/link-building-screen"
import { BusinessDetailScreen } from "@/components/screens/business-detail-screen"
import { ShopScreen } from "@/components/screens/shop-screen"
import { BuildingRulesScreen } from "@/components/screens/building-rules-screen"
import { ReportScreen } from "@/components/screens/report/report-screen"
import { MyBookingsScreen } from "@/components/screens/my-bookings-screen"
import { ManagerDashboardScreen } from "@/components/screens/manager/dashboard-screen"
import { ManagerResidentsScreen } from "@/components/screens/manager/residents-screen"
import { ManagerViolationsScreen } from "@/components/screens/manager/violations-table-screen"
import { ManagerApprovalsScreen } from "@/components/screens/manager/approvals-screen"
import { ManagerIncidentsScreen } from "@/components/screens/manager/incidents-screen"
import { ManagerSettingsScreen } from "@/components/screens/manager/settings-screen"
import { MyVetsScreen } from "@/components/screens/my-vets-screen"
import { AccommodationRequestScreen } from "@/components/screens/accommodation-request-screen"
import { isScreenKey, type ScreenKey, type Surface } from "@/lib/navigation"
import {
  backTarget,
  defaultTab,
  initialRoute,
  readHistoryState,
  replaceRouteParams,
  sameRoute,
  tabForRoute,
  type AppHistoryState,
  type AppRoute,
} from "@/lib/app-route"
import { Loader2, PawPrint } from "lucide-react"

/**
 * Desktop content max-width per screen — owner/overview read as a column, data
 * screens go wide.
 *
 * Typed `Record<ScreenKey, string>` rather than `Record<string, string>`, and
 * that is load-bearing in both directions. A screen added to `SCREEN_SURFACES`
 * without a width here is a compile error, and — the direction that matters —
 * so is a width for a screen not registered there. Every plan that adds a
 * screen (Phase 5's `my-cases`, Phase 6's `building-rules`, Phase 7's
 * `accommodations`) already lists "add a CONTENT_MAX entry" as a step, so the
 * compiler catches them at the step they were going to take anyway, and
 * `alerts-screen` starts routing that phase's notifications without anyone
 * editing it.
 *
 * Adding the type immediately surfaced that `incidents` had no entry at all,
 * so the manager's Incidents screen was falling back to `max-w-2xl` (672px)
 * while every sibling data screen read at `max-w-5xl` (1024px).
 *
 * WHAT THAT ACTUALLY COST, corrected. The first version of this comment said
 * "the second column had never rendered on any display". That is false, and
 * the mistake was reasoning from the `lg` breakpoint to the container width.
 * `lg:` in Tailwind v4 is a VIEWPORT media query — container queries are the
 * separate `@lg:` family — so the breakpoint has never known how wide this
 * wrapper is. At a 1024px-or-wider viewport the second column rendered the
 * whole time; it was the CARDS that were crushed, into two thirds of the width
 * the manager screens are laid out for.
 *
 * Measured in the browser at a 1280px viewport, same page, same data, one
 * class swapped (`incidents-screen.tsx:128`, `grid gap-2.5 lg:grid-cols-2`):
 *
 *   max-w-2xl (the fallback)  wrapper 672px   grid-template-columns: 315px 315px
 *   max-w-5xl (the entry)     wrapper 1024px  grid-template-columns: 491px 491px
 *
 * `matchMedia("(min-width: 1024px)")` was true in both, which is the direct
 * evidence that the breakpoint was never the thing gating the column.
 */
const CONTENT_MAX: Record<ScreenKey, string> = {
  home: "max-w-2xl",
  community: "max-w-2xl",
  services: "max-w-5xl",
  alerts: "max-w-2xl",
  profile: "max-w-2xl",
  // A resident reads one case at a time, and the ledger inside it is prose.
  "my-cases": "max-w-2xl",
  "pet-detail": "max-w-3xl",
  "add-pet": "max-w-2xl",
  "pet-care": "max-w-2xl",
  "ai-chat": "max-w-2xl",
  "link-building": "max-w-2xl",
  "business-detail": "max-w-2xl",
  "my-bookings": "max-w-2xl",
  "my-vets": "max-w-3xl",
  shop: "max-w-3xl",
  report: "max-w-2xl",
  /* A bylaw is prose and is read as a column, at the same width as every other
     resident screen. Without an entry here the screen silently falls back to
     max-w-2xl — which happens to be the same value, and that is exactly why the
     entry is written rather than relied upon: `incidents` fell back for months
     to a width that was wrong for it and nobody noticed. */
  "building-rules": "max-w-2xl",
  /* A request is a form and a decision is prose. Same column width as every
     other resident screen — written rather than relied upon, because
     `incidents` fell back to a wrong width for months and nobody noticed. */
  accommodations: "max-w-2xl",
  dashboard: "max-w-5xl",
  residents: "max-w-5xl",
  violations: "max-w-5xl",
  approvals: "max-w-5xl",
  incidents: "max-w-5xl",
  settings: "max-w-2xl",
}

function AppContent() {
  /**
   * Which surface to render follows the persona being *worn*, not
   * `profiles.role`. Those disagree for anyone holding more than one grant —
   * a manager who owns a dog, an admin who is also a resident — and the role
   * column can only ever name one of them.
   *
   * `viewAs` resolves the fallback centrally so the tab bar, the sidebar and
   * this router cannot reach different answers.
   */
  const { isAuthenticated, isGuest, isLoading, user, viewAs, activePersona } = useAuth()
  const isManager = viewAs === "building-manager"
  const surface: Surface = isManager ? "manager" : "resident"
  const [activeTab, setActiveTab] = useState<ScreenKey>("home")
  const [currentScreen, setCurrentScreen] = useState("home")
  const [selectedPetId, setSelectedPetId] = useState<string | undefined>(undefined)
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | undefined>(undefined)
  // Which tracker tab to open when arriving from a Today's Care tile.
  const [careKind, setCareKind] = useState<string | undefined>(undefined)
  // Which PET to open the tracker on, when arriving from a schedule row.
  const [carePetId, setCarePetId] = useState<string | undefined>(undefined)
  /* Which bylaw case to open expanded, when arriving from a
   * `my-cases:<violation id>` notification. Its OWN state rather than
   * `selectedPetId`: `handleNavigate` stashes every unrecognised id into that
   * one, so a case id would have silently become the selected pet for whatever
   * screen opened next — the exact hazard `lib/navigation.ts`'s ID_BEARING
   * note records against `add-pet`. */
  const [selectedCaseId, setSelectedCaseId] = useState<string | undefined>(undefined)
  /* Which tab a tabbed screen opens on — `pet-detail` arriving from Documents
     & Records lands on Documents. Set on EVERY navigation, so a tab asked for
     once never sticks to the next visit. */
  const [screenTab, setScreenTab] = useState<string | undefined>(undefined)

  /* THE URL IS THE SCREEN (lib/app-route.ts).
   *
   * Every navigation writes a history entry `{ ...Next's keys, pet10x, route,
   * activeTab, depth }`, so browser and phone Back step through screens
   * instead of leaving the app, a refresh reopens the screen, and a screen can
   * be linked to. Next's keys are spread in, never replaced: the App Router
   * keeps its tree in `history.state` and reloads the page on a popstate whose
   * entry lacks it.
   *
   * `depth` counts this shell's entries behind the current one. In-app Back
   * pops history while there are any; at 0 (a cold load from a link) it goes
   * to the tab root instead of out of the app (`backTarget`).
   *
   * Nothing writes to history until the first ready render has read the URL
   * (`deepLinkDone`), so the reset below cannot wipe a `?screen=` the read has
   * not seen yet. */
  const depth = useRef(0)
  const currentRoute = useRef<AppRoute | null>(null)
  const deepLinkDone = useRef(false)

  /* `id` is polymorphic: a business id for the services flow, otherwise a pet id.
   *
   * `petId` is a third, OPTIONAL parameter rather than a fourth meaning loaded
   * onto `id`, because for the tracker `id` is already spoken for — it is the
   * care kind a Today's Care tile lands on. A schedule row needs to carry both
   * ("open Lola, on no particular tab"), and every existing call site still
   * compiles because the parameter is optional.
   *
   * `tab` is a fourth for the same reason: for `pet-detail` the id is the pet,
   * so the tab to open it on cannot ride there too.
   *
   * The one place these setters live: a navigation, Back, a popstate and the
   * first read of the URL all come through here. Setters only, so it is stable. */
  const applyScreen = useCallback((screen: string, id?: string, petId?: string, tab?: string) => {
    setScreenTab(tab)
    if (screen === "business-detail") setSelectedBusinessId(id)
    // For the tracker the id is a care kind, not a pet — a Today's Care tile
    // says which tab to land on.
    else if (screen === "pet-care") {
      setCareKind(id)
      setCarePetId(petId)
    }
    // A violation id, not a pet id.
    else if (screen === "my-cases") setSelectedCaseId(id)
    else if (id !== undefined) setSelectedPetId(id)
    // Entering the assistant from the tab bar or the sidebar carries no pet, and a
    // pet left over from an earlier screen would silently scope the answer.
    else if (screen === "ai-chat") setSelectedPetId(undefined)
    setCurrentScreen(screen)
  }, [])

  const applyRoute = useCallback(
    (route: AppRoute, tab: ScreenKey) => {
      applyScreen(route.screen, route.id, route.petId, route.tab)
      setActiveTab(tab)
      currentRoute.current = route
    },
    [applyScreen],
  )

  /** Write `route` into history: a new entry, or (`replace`) the current one. */
  const writeHistory = (route: AppRoute, tab: ScreenKey, entryDepth: number, replace: boolean) => {
    const state: AppHistoryState = { pet10x: true, route, activeTab: tab, depth: entryDepth }
    const url = "/app" + replaceRouteParams(replace ? window.location.search : "", route) + (replace ? window.location.hash : "")
    /* Next's keys are kept, all but `__NA`: Next's patched pushState and
     * replaceState skip their own bookkeeping for data carrying it, and that
     * bookkeeping is what copies the router tree into the entry AND tells the
     * router the URL changed — without it a later router update rewrites the
     * bar back to the URL it last knew. Without `__NA` it re-adds both. */
    const data: Record<string, unknown> = { ...(window.history.state ?? {}), ...state }
    delete data.__NA
    if (replace) window.history.replaceState(data, "", url)
    else window.history.pushState(data, "", url)
    depth.current = entryDepth
  }

  /** Open `route`, pushing an entry only when it differs from the one showing. */
  const navigateTo = (route: AppRoute, tab: ScreenKey, entryDepth: number) => {
    const unchanged = sameRoute(currentRoute.current, route) && tab === activeTab
    applyRoute(route, tab)
    if (deepLinkDone.current && !unchanged) writeHistory(route, tab, entryDepth, false)
  }

  /* Declared above the early returns so the deep-link effect below can call
   * it. A screen name the router does not know still renders (blank, as it
   * always has) but is never written to the URL. */
  const handleNavigate = (screen: string, id?: string, petId?: string, tab?: string) => {
    if (!isScreenKey(screen)) {
      applyScreen(screen, id, petId, tab)
      return
    }
    navigateTo({ screen, id, petId, tab }, activeTab, depth.current + 1)
  }

  /* Reset tabs when user/role changes (e.g. after sign-in, or a persona
   * switch). Before the first read of the URL it touches only React state —
   * the read below runs after it in the same commit and decides the screen.
   * After it, the entry the viewer is on belongs to the other surface, so it
   * is replaced with the new tab root and the history behind it disowned. */
  useEffect(() => {
    const tab = isManager ? "dashboard" : "home"
    if (!deepLinkDone.current) {
      setActiveTab(tab)
      setCurrentScreen(tab)
      currentRoute.current = null
      return
    }
    applyRoute({ screen: tab }, tab)
    writeHistory({ screen: tab }, tab, 0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the persona alone, as it always was
  }, [isManager])

  /* Browser / phone Back and Forward. An entry this shell wrote restores its
   * route, tab and depth; anything else (Next's initial entry, an entry from
   * the other persona) shows the tab root. Nothing is pushed here. */
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (!deepLinkDone.current) return
      const restored = readHistoryState(event.state, surface)
      if (restored) {
        applyRoute(restored.route, restored.activeTab)
        depth.current = restored.depth
      } else {
        const tab = defaultTab(surface)
        applyRoute({ screen: tab }, tab)
        depth.current = 0
      }
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [surface, applyRoute])

  /* The first read of the URL: `?screen=` (a refresh, a shared link), else
   * `/app?target=<action_target>` — the link a notification email or a push
   * notification opens (`targetHref` in lib/navigation.ts), which goes through
   * `resolveActionTarget` exactly as an Alerts button does, for the persona
   * being WORN, so a manager-only target opened while viewing as a resident
   * does nothing rather than rendering a blank screen. Read once, after the
   * session and persona have resolved (and after the reset above has run).
   * The entry is then rewritten to the route's own `?screen=` — `target=` is
   * dropped, so the bar never holds both and a reload does not re-open it as
   * a notification. A resident still onboarding keeps it until onboarding
   * finishes.
   *
   * "Persona resolved" means `my_personas()` has answered: until then `viewAs`
   * is the role-column fallback, and the reset above runs again when the real
   * persona lands — which would throw the deep link away. If that RPC never
   * answers, the fallback is the persona the screen is showing anyway, so the
   * link is honoured against it after a short wait rather than never. */
  const [personaWaitOver, setPersonaWaitOver] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setPersonaWaitOver(true), 3000)
    return () => window.clearTimeout(t)
  }, [])
  const userReady = !isLoading && isAuthenticated && !isGuest && !!user && (activePersona !== null || personaWaitOver)
  const onboardingPending = viewAs === "pet-owner" && !!user && !user.onboarded
  useEffect(() => {
    if (deepLinkDone.current || !userReady || onboardingPending) return
    deepLinkDone.current = true
    const initial = initialRoute(window.location.search, window.history.state, surface)
    if (initial) {
      applyRoute(initial.route, initial.activeTab)
      writeHistory(initial.route, initial.activeTab, initial.depth, true)
    } else {
      // No route in the URL: stamp the entry with what is showing — the tab
      // root, or a screen tapped while the persona was still resolving — so
      // Back to it restores it and the bar drops any unusable `target=`.
      const route = currentRoute.current ?? { screen: defaultTab(surface) }
      const tab = tabForRoute(route, activeTab, surface)
      applyRoute(route, tab)
      writeHistory(route, tab, 0, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when the session is ready
  }, [userReady, onboardingPending, isManager])

  // Session still resolving — avoid flashing the sign-in screen before we know.
  if (isLoading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 animate-in fade-in duration-300">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
          <PawPrint className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
        </span>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Unauthenticated / guest flows — centered on desktop, full-screen on mobile.
  if (!isAuthenticated) {
    return (
      <div key="sign-in" className="mx-auto w-full max-w-md animate-in fade-in duration-300">
        <SignInScreen />
      </div>
    )
  }
  if (isGuest) {
    return (
      <div key="guest" className="mx-auto w-full max-w-md animate-in fade-in duration-300">
        <GuestReportScreen />
      </div>
    )
  }
  /**
   * The resident surface starts with onboarding, whoever is looking at it.
   *
   * Keyed on the persona being worn rather than `profiles.role`, because a
   * manager or admin who switches to the resident view is a resident who has
   * answered nothing — no building link, no pets. Previously the gate read
   * `role === "pet-owner" && !isSuperAdmin`, so those accounts dropped into an
   * empty Home with no way to link a building.
   *
   * OnboardingFlow renders a "Back to <persona>" escape for anyone holding
   * another grant, since this replaces the shell that contains the switcher.
   */
  if (user && viewAs === "pet-owner" && !user.onboarded) {
    return (
      <div key="onboarding" className="mx-auto w-full max-w-md animate-in fade-in duration-300">
        <OnboardingFlow />
      </div>
    )
  }

  const handleTabChange = (tab: string) => {
    // The assistant is a screen, not a tab — routing it through navigate keeps
    // the previous tab as the back destination.
    if (tab === "ai-chat") {
      handleNavigate("ai-chat")
      return
    }
    if (!isScreenKey(tab)) return
    // `{ screen: tab }` carries no `tab`: a tab asked for by an earlier
    // navigation (Pet Events → Events) must not follow the viewer onto a tab
    // they chose themselves. A tab starts a new stack one entry deep.
    navigateTo({ screen: tab }, tab, 1)
  }

  /* Back to the screen the viewer came from — history, while this shell has
   * pushed any; otherwise (opened cold from a link) the tab root, in place,
   * never out of the app. */
  const handleBack = () => {
    const target = backTarget(depth.current, activeTab)
    if (target === "history") {
      window.history.back()
      return
    }
    applyRoute(target, activeTab)
    writeHistory(target, activeTab, 0, true)
  }

  const contentMax = isScreenKey(currentScreen) ? CONTENT_MAX[currentScreen] : "max-w-2xl"

  return (
    <div className="bg-background md:flex md:min-h-dvh">
      <AppSidebar activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="flex-1 md:min-w-0">
        {/* `overflow-x-clip` is the backstop: a screen with a wide table or a
            long unbroken string scrolls INSIDE its own container and can never
            drag the whole page sideways. Clip rather than hidden, because
            hidden would coerce overflow-y and break the sticky sub-headers
            several screens rely on. `min-w-0` stops a flex child claiming its
            content's intrinsic width. */}
        <div
          key={currentScreen}
          className={`mx-auto w-full min-w-0 overflow-x-clip ${contentMax} animate-in fade-in duration-200`}
        >
          {currentScreen === "pet-detail" ? (
            <PetDetailScreen
              onBack={handleBack}
              petId={selectedPetId}
              initialTab={screenTab}
              onNavigate={handleNavigate}
            />
          ) : currentScreen === "add-pet" ? (
            <AddPetScreen onBack={handleBack} onNavigate={handleNavigate} />
          ) : currentScreen === "pet-care" ? (
            <PetCareScreen
              onBack={handleBack}
              onNavigate={handleNavigate}
              initialKind={careKind}
              initialPetId={carePetId}
            />
          ) : currentScreen === "ai-chat" ? (
            <AiChatScreen onBack={handleBack} petId={selectedPetId} />
          ) : currentScreen === "link-building" ? (
            <LinkBuildingScreen onBack={handleBack} />
          ) : currentScreen === "business-detail" ? (
            <BusinessDetailScreen businessId={selectedBusinessId} onBack={handleBack} />
          ) : currentScreen === "report" ? (
            <ReportScreen onBack={handleBack} />
          ) : currentScreen === "shop" ? (
            <ShopScreen onNavigate={handleNavigate} />
          ) : currentScreen === "my-bookings" ? (
            <MyBookingsScreen onBack={handleBack} />
          ) : currentScreen === "accommodations" ? (
            /* Above the persona split, beside `report`, `shop` and
               `building-rules`: a manager opens the same screen their residents
               do, and sees the same thing. */
            <AccommodationRequestScreen onBack={handleBack} onNavigate={handleNavigate} />
          ) : currentScreen === "my-vets" ? (
            /* Above the persona split: a manager who also owns a pet reaches
               the same screen, and every writer of this target addresses the
               pet's owner. */
            <MyVetsScreen onBack={handleBack} initialTab={screenTab} />
          ) : currentScreen === "building-rules" ? (
            /* Above the persona split, beside `report` and `shop`: a manager
               opens the same screen their residents do, and sees the same
               thing. */
            <BuildingRulesScreen onBack={handleBack} onNavigate={handleNavigate} />
          ) : isManager ? (
            <>
              {currentScreen === "dashboard" && <ManagerDashboardScreen onNavigate={handleNavigate} />}
              {currentScreen === "residents" && <ManagerResidentsScreen onNavigate={handleNavigate} />}
              {currentScreen === "violations" && <ManagerViolationsScreen onNavigate={handleNavigate} />}
              {currentScreen === "approvals" && <ManagerApprovalsScreen onNavigate={handleNavigate} />}
              {currentScreen === "incidents" && <ManagerIncidentsScreen onNavigate={handleNavigate} />}
              {currentScreen === "settings" && <ManagerSettingsScreen onNavigate={handleNavigate} />}
              {/* Managers have no Alerts tab, but the dashboard bell routes
                  here — without this the screen renders blank. */}
              {currentScreen === "alerts" && <AlertsScreen onNavigate={handleNavigate} onBack={handleBack} />}
            </>
          ) : (
            <>
              {currentScreen === "home" && <HomeScreen onNavigate={handleNavigate} />}
              {currentScreen === "community" && <CommunityScreen onNavigate={handleNavigate} initialTab={screenTab} />}
              {currentScreen === "services" && <ServicesScreen onNavigate={handleNavigate} />}
              {currentScreen === "alerts" && <AlertsScreen onNavigate={handleNavigate} onBack={handleBack} />}
              {currentScreen === "profile" && <ProfileScreen onNavigate={handleNavigate} />}
              {/* A resident surface: it shows the case from its subject's side,
                  so it does not go in the manager block above. */}
              {currentScreen === "my-cases" && (
                <MyCasesScreen onBack={handleBack} focusCaseId={selectedCaseId} />
              )}
            </>
          )}
        </div>
      </div>

      <IOSTabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  )
}

export default function Pet10xApp() {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster position="top-center" />
    </AuthProvider>
  )
}
