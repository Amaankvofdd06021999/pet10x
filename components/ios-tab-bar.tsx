"use client"

import { useAuth } from "@/lib/auth-context"
import { useUnreadNotificationCount } from "@/lib/data"
import { Home, Users, ShoppingBag, Bell, User, LayoutDashboard, Gavel, UserCheck, Settings } from "lucide-react"

interface TabBarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const ownerTabs = [
  { id: "home", label: "Home", icon: Home },
  { id: "community", label: "Community", icon: Users },
  { id: "services", label: "Services", icon: ShoppingBag },
  { id: "alerts", label: "Alerts", icon: Bell },
  { id: "profile", label: "Profile", icon: User },
]

const managerTabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "residents", label: "Residents", icon: Users },
  { id: "violations", label: "Violations", icon: Gavel },
  { id: "approvals", label: "Approvals", icon: UserCheck },
  { id: "settings", label: "Settings", icon: Settings },
]

export function IOSTabBar({ activeTab, onTabChange }: TabBarProps) {
  const { user } = useAuth()
  const isManager = user?.role === "building-manager"
  const unreadCount = useUnreadNotificationCount()
  const badges: Record<string, number> = { alerts: unreadCount }
  const tabs = isManager ? managerTabs : ownerTabs
  const activeColor = isManager ? "text-info" : "text-primary"

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/80 backdrop-blur-xl pb-safe md:hidden"
      role="tablist"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 pt-2 pb-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              onClick={() => onTabChange(tab.id)}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-1 transition-colors"
            >
              <span className="relative">
                <Icon
                  className={`h-6 w-6 transition-colors ${
                    isActive ? activeColor : "text-muted-foreground"
                  }`}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  fill={isActive ? "currentColor" : "none"}
                />
                {badges[tab.id] > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                    {badges[tab.id]}
                  </span>
                )}
              </span>
              <span
                className={`text-[10px] font-medium transition-colors ${
                  isActive ? activeColor : "text-muted-foreground"
                }`}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
