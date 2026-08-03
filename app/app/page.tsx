"use client"

import { useState, useEffect } from "react"
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
import { PetDetailScreen } from "@/components/screens/pet-detail-screen"
import { AddPetScreen } from "@/components/screens/add-pet-screen"
import { PetCareScreen } from "@/components/screens/pet-care-screen"
import { AiChatScreen } from "@/components/screens/ai-chat-screen"
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow"
import { LinkBuildingScreen } from "@/components/screens/link-building-screen"
import { BusinessDetailScreen } from "@/components/screens/business-detail-screen"
import { MyBookingsScreen } from "@/components/screens/my-bookings-screen"
import { ManagerDashboardScreen } from "@/components/screens/manager/dashboard-screen"
import { ManagerResidentsScreen } from "@/components/screens/manager/residents-screen"
import { ManagerViolationsScreen } from "@/components/screens/manager/violations-screen"
import { ManagerApprovalsScreen } from "@/components/screens/manager/approvals-screen"
import { ManagerSettingsScreen } from "@/components/screens/manager/settings-screen"
import { Loader2, PawPrint } from "lucide-react"

/** Desktop content max-width per screen — owner/overview read as a column, data screens go wide. */
const CONTENT_MAX: Record<string, string> = {
  home: "max-w-2xl",
  community: "max-w-2xl",
  services: "max-w-5xl",
  alerts: "max-w-2xl",
  profile: "max-w-2xl",
  "pet-detail": "max-w-3xl",
  "add-pet": "max-w-2xl",
  "pet-care": "max-w-2xl",
  "ai-chat": "max-w-2xl",
  "link-building": "max-w-2xl",
  "business-detail": "max-w-2xl",
  "my-bookings": "max-w-2xl",
  dashboard: "max-w-5xl",
  residents: "max-w-5xl",
  violations: "max-w-5xl",
  approvals: "max-w-5xl",
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
  const { isAuthenticated, isGuest, isLoading, user, viewAs } = useAuth()
  const isManager = viewAs === "building-manager"
  const [activeTab, setActiveTab] = useState("home")
  const [currentScreen, setCurrentScreen] = useState("home")
  const [selectedPetId, setSelectedPetId] = useState<string | undefined>(undefined)
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | undefined>(undefined)
  // Which tracker tab to open when arriving from a Today's Care tile.
  const [careKind, setCareKind] = useState<string | undefined>(undefined)

  // Reset tabs when user/role changes (e.g. after sign-in)
  useEffect(() => {
    const tab = isManager ? "dashboard" : "home"
    setActiveTab(tab)
    setCurrentScreen(tab)
  }, [isManager])

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

  // `id` is polymorphic: a business id for the services flow, otherwise a pet id.
  const handleNavigate = (screen: string, id?: string) => {
    if (screen === "business-detail") setSelectedBusinessId(id)
    // For the tracker the id is a care kind, not a pet — a Today's Care tile
    // says which tab to land on.
    else if (screen === "pet-care") setCareKind(id)
    else if (id !== undefined) setSelectedPetId(id)
    // Entering the assistant from the FAB or the sidebar carries no pet, and a
    // pet left over from an earlier screen would silently scope the answer.
    else if (screen === "ai-chat") setSelectedPetId(undefined)
    setCurrentScreen(screen)
  }

  const handleTabChange = (tab: string) => {
    // The assistant is a screen, not a tab — routing it through navigate keeps
    // the previous tab as the back destination.
    if (tab === "ai-chat") {
      handleNavigate("ai-chat")
      return
    }
    setActiveTab(tab)
    setCurrentScreen(tab)
  }

  const handleBack = () => {
    setCurrentScreen(activeTab)
  }

  const contentMax = CONTENT_MAX[currentScreen] ?? "max-w-2xl"

  return (
    <div className="bg-background md:flex md:min-h-dvh">
      <AppSidebar activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="flex-1 md:min-w-0">
        <div key={currentScreen} className={`mx-auto w-full ${contentMax} animate-in fade-in duration-200`}>
          {currentScreen === "pet-detail" ? (
            <PetDetailScreen onBack={handleBack} petId={selectedPetId} onNavigate={handleNavigate} />
          ) : currentScreen === "add-pet" ? (
            <AddPetScreen onBack={handleBack} onNavigate={handleNavigate} />
          ) : currentScreen === "pet-care" ? (
            <PetCareScreen onBack={handleBack} onNavigate={handleNavigate} initialKind={careKind} />
          ) : currentScreen === "ai-chat" ? (
            <AiChatScreen onBack={handleBack} petId={selectedPetId} />
          ) : currentScreen === "link-building" ? (
            <LinkBuildingScreen onBack={handleBack} />
          ) : currentScreen === "business-detail" ? (
            <BusinessDetailScreen businessId={selectedBusinessId} onBack={handleBack} />
          ) : currentScreen === "my-bookings" ? (
            <MyBookingsScreen onBack={handleBack} />
          ) : isManager ? (
            <>
              {currentScreen === "dashboard" && <ManagerDashboardScreen onNavigate={handleNavigate} />}
              {currentScreen === "residents" && <ManagerResidentsScreen onNavigate={handleNavigate} />}
              {currentScreen === "violations" && <ManagerViolationsScreen onNavigate={handleNavigate} />}
              {currentScreen === "approvals" && <ManagerApprovalsScreen onNavigate={handleNavigate} />}
              {currentScreen === "settings" && <ManagerSettingsScreen onNavigate={handleNavigate} />}
              {/* Managers have no Alerts tab, but the dashboard bell routes
                  here — without this the screen renders blank. */}
              {currentScreen === "alerts" && <AlertsScreen onNavigate={handleNavigate} onBack={handleBack} />}
            </>
          ) : (
            <>
              {currentScreen === "home" && <HomeScreen onNavigate={handleNavigate} />}
              {currentScreen === "community" && <CommunityScreen onNavigate={handleNavigate} />}
              {currentScreen === "services" && <ServicesScreen onNavigate={handleNavigate} />}
              {currentScreen === "alerts" && <AlertsScreen onNavigate={handleNavigate} onBack={handleBack} />}
              {currentScreen === "profile" && <ProfileScreen onNavigate={handleNavigate} />}
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
