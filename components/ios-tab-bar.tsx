"use client"

import { useAuth } from "@/lib/auth-context"
import { useUnreadNotificationCount } from "@/lib/data"
import {
  Home,
  Users,
  ShoppingBag,
  Bell,
  User,
  LayoutDashboard,
  Gavel,
  UserCheck,
  Settings,
  Sparkles,
} from "lucide-react"

interface TabBarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

/**
 * `emphasis` marks the centre slot from the design reference: the assistant
 * gets a tinted circular well rather than a bare glyph. It is a SCREEN, not a
 * tab — `handleTabChange` routes "ai-chat" through navigate so the previous
 * tab stays the back destination — so it never shows as selected.
 */
const ownerTabs = [
  { id: "home", label: "Home", icon: Home },
  { id: "community", label: "Community", icon: Users },
  { id: "ai-chat", label: "AI", icon: Sparkles, emphasis: true },
  { id: "services", label: "Services", icon: ShoppingBag },
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
  // Tabs follow the persona being worn, not the role column — a manager
  // viewing as a resident needs resident tabs, or the switch does nothing
  // visible and the app looks broken.
  const { viewAs } = useAuth()
  const isManager = viewAs === "building-manager"
  const unreadCount = useUnreadNotificationCount()
  const badges: Record<string, number> = { alerts: unreadCount }
  const tabs = isManager ? managerTabs : ownerTabs
  // One brand colour for both roles. Managers used to get `--info` (iOS system
  // blue), which is not a Pet10x colour and made their half of the app look
  // like a different product.
  const activeColor = "text-primary"

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/80 backdrop-blur-xl pb-safe md:hidden"
      role="tablist"
      aria-label="Main navigation"
    >
      {/* Explicit h-16 rather than a height that falls out of padding.
          Anything docking above this bar has to know how tall it is — the chat
          composer clears it with a matching 4rem — and a derived height is a
          number nobody can look up. */}
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon
          const emphasis = "emphasis" in tab && tab.emphasis

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              onClick={() => onTabChange(tab.id)}
              className="relative flex w-16 flex-col items-center gap-0.5 transition-colors"
            >
              <span
                className={
                  emphasis
                    ? "flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary transition-colors"
                    : "relative"
                }
              >
                <Icon
                  className={`h-6 w-6 transition-colors ${
                    emphasis ? "" : isActive ? activeColor : "text-muted-foreground"
                  }`}
                  strokeWidth={emphasis ? 2 : isActive ? 2.5 : 1.5}
                  fill={!emphasis && isActive ? "currentColor" : "none"}
                />
                {badges[tab.id] > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                    {badges[tab.id]}
                  </span>
                )}
              </span>

              <span
                className={`text-[10px] font-medium transition-colors ${
                  emphasis ? "text-primary" : isActive ? activeColor : "text-muted-foreground"
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
