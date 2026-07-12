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
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow"
import { LinkBuildingScreen } from "@/components/screens/link-building-screen"
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
  "link-building": "max-w-2xl",
  dashboard: "max-w-5xl",
  residents: "max-w-5xl",
  violations: "max-w-5xl",
  approvals: "max-w-5xl",
  settings: "max-w-2xl",
}

function AppContent() {
  const { isAuthenticated, isGuest, isLoading, user } = useAuth()
  const isManager = user?.role === "building-manager"
  const [activeTab, setActiveTab] = useState("home")
  const [currentScreen, setCurrentScreen] = useState("home")
  const [selectedPetId, setSelectedPetId] = useState<string | undefined>(undefined)

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
  // New pet owners answer one onboarding question before entering the app.
  if (user && user.role === "pet-owner" && !user.onboarded) {
    return (
      <div key="onboarding" className="mx-auto w-full max-w-md animate-in fade-in duration-300">
        <OnboardingFlow />
      </div>
    )
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setCurrentScreen(tab)
  }

  const handleNavigate = (screen: string, petId?: string) => {
    if (petId !== undefined) setSelectedPetId(petId)
    setCurrentScreen(screen)
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
            <PetDetailScreen onBack={handleBack} petId={selectedPetId} />
          ) : currentScreen === "add-pet" ? (
            <AddPetScreen onBack={handleBack} onNavigate={handleNavigate} />
          ) : currentScreen === "pet-care" ? (
            <PetCareScreen onBack={handleBack} onNavigate={handleNavigate} />
          ) : currentScreen === "link-building" ? (
            <LinkBuildingScreen onBack={handleBack} />
          ) : isManager ? (
            <>
              {currentScreen === "dashboard" && <ManagerDashboardScreen onNavigate={handleNavigate} />}
              {currentScreen === "residents" && <ManagerResidentsScreen />}
              {currentScreen === "violations" && <ManagerViolationsScreen />}
              {currentScreen === "approvals" && <ManagerApprovalsScreen />}
              {currentScreen === "settings" && <ManagerSettingsScreen />}
            </>
          ) : (
            <>
              {currentScreen === "home" && <HomeScreen onNavigate={handleNavigate} />}
              {currentScreen === "community" && <CommunityScreen />}
              {currentScreen === "services" && <ServicesScreen />}
              {currentScreen === "alerts" && <AlertsScreen />}
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
