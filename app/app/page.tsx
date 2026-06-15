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
import { ManagerDashboardScreen } from "@/components/screens/manager/dashboard-screen"
import { ManagerResidentsScreen } from "@/components/screens/manager/residents-screen"
import { ManagerViolationsScreen } from "@/components/screens/manager/violations-screen"
import { ManagerApprovalsScreen } from "@/components/screens/manager/approvals-screen"
import { ManagerSettingsScreen } from "@/components/screens/manager/settings-screen"

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
  dashboard: "max-w-5xl",
  residents: "max-w-5xl",
  violations: "max-w-5xl",
  approvals: "max-w-5xl",
  settings: "max-w-2xl",
}

function AppContent() {
  const { isAuthenticated, isGuest, user } = useAuth()
  const isManager = user?.role === "building-manager"
  const [activeTab, setActiveTab] = useState("home")
  const [currentScreen, setCurrentScreen] = useState("home")

  // Reset tabs when user/role changes (e.g. after sign-in)
  useEffect(() => {
    const tab = isManager ? "dashboard" : "home"
    setActiveTab(tab)
    setCurrentScreen(tab)
  }, [isManager])

  // Unauthenticated / guest flows — centered on desktop, full-screen on mobile.
  if (!isAuthenticated) {
    return (
      <div className="mx-auto w-full max-w-md">
        <SignInScreen />
      </div>
    )
  }
  if (isGuest) {
    return (
      <div className="mx-auto w-full max-w-md">
        <GuestReportScreen />
      </div>
    )
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setCurrentScreen(tab)
  }

  const handleNavigate = (screen: string) => {
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
        <div className={`mx-auto w-full ${contentMax}`}>
          {currentScreen === "pet-detail" ? (
            <PetDetailScreen onBack={handleBack} />
          ) : currentScreen === "add-pet" ? (
            <AddPetScreen onBack={handleBack} />
          ) : currentScreen === "pet-care" ? (
            <PetCareScreen onBack={handleBack} />
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
