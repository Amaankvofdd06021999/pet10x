"use client"

import { useAuth } from "@/lib/auth-context"
import { PERSONA_LABEL } from "@/lib/rbac"
import { PersonaSwitcher } from "@/components/persona-switcher"
import { useUnsavedShellGuard } from "@/components/use-unsaved-guard"
import { useUnreadNotificationCount } from "@/lib/data"
import {
  Home,
  Users,
  ShoppingBag,
  Bell,
  User,
  LayoutDashboard,
  Gavel,
  Megaphone,
  MessageSquare,
  UserCheck,
  Settings,
  PawPrint,
  LogOut,
  Sparkles,
} from "lucide-react"
import Image from "next/image"
import { canOptimize } from "@/lib/image-src"

interface SidebarProps {
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
  /* Desktop only. The mobile bar has five slots and they are taken; on a phone
     Incidents is the dashboard's "Incident Reports" quick action. */
  { id: "incidents", label: "Incidents", icon: Megaphone },
  /* Moderation: the feed, announcements and removals. Desktop only for the same
     reason as Incidents; on a phone it is a dashboard tile. */
  { id: "community", label: "Community", icon: MessageSquare },
  { id: "approvals", label: "Approvals", icon: UserCheck },
  { id: "settings", label: "Settings", icon: Settings },
]

/**
 * Desktop-only sidebar navigation (hidden < md). Mirrors the mobile tab bar so
 * the app is a real web layout on larger screens while mobile keeps the bottom bar.
 */
export function AppSidebar({ activeTab, onTabChange }: SidebarProps) {
  // Mirrors the mobile tab bar: nav follows the persona being worn, not the
  // role column, so switching view actually changes the menu.
  const { user, signOut, viewAs, canSwitch } = useAuth()
  // Signing out leaves every screen at once: a half-filled form asks first.
  const guard = useUnsavedShellGuard()
  const handleSignOut = () => {
    void guard.confirmLeave().then((ok) => {
      if (ok) void signOut()
    })
  }
  const isManager = viewAs === "building-manager"
  const unreadCount = useUnreadNotificationCount()
  const badges: Record<string, number> = { alerts: unreadCount }
  const tabs = isManager ? managerTabs : ownerTabs

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 flex-shrink-0 flex-col border-r border-border bg-card md:flex">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary shadow-sm">
          <PawPrint className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
        </span>
        <span className="text-title font-semibold tracking-tight text-foreground">Pet10x</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-3" aria-label="Primary">
        {/* Desktop entry point to the assistant — on mobile it is the tab bar's AI slot. */}
        {!isManager && (
          <button
            onClick={() => onTabChange("ai-chat")}
            aria-current={activeTab === "ai-chat" ? "page" : undefined}
            className={`mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-body font-medium transition-colors ${
              activeTab === "ai-chat"
                ? "bg-primary-soft text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Sparkles className={`h-5 w-5 ${activeTab === "ai-chat" ? "text-primary" : ""}`} strokeWidth={activeTab === "ai-chat" ? 2.4 : 1.8} />
            <span className="flex-1 text-left">Ask Pet10x</span>
          </button>
        )}

        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-body font-medium transition-colors ${
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} strokeWidth={isActive ? 2.4 : 1.8} />
              <span className="flex-1 text-left">{tab.label}</span>
              {badges[tab.id] > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-caption font-semibold text-destructive-foreground">
                  {badges[tab.id]}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      {/* User + sign out */}
      <div className="border-t border-border p-3">
        {/* Desktop reach for the switcher — on mobile it lives on Profile /
            Settings, but a manager viewing as a resident must be able to get
            back without hunting through tabs that just changed under them. */}
        {canSwitch && <PersonaSwitcher className="mb-2 w-full" />}
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-muted">
            {user?.avatar ? (
              <Image src={user.avatar} alt={user.name} fill sizes="36px" className="object-cover" unoptimized={!canOptimize(user.avatar)} />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-meta font-semibold text-foreground">{user?.name}</p>
            <p className="truncate text-caption text-muted-foreground">{PERSONA_LABEL[viewAs]}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-body font-medium text-foreground transition-colors hover:bg-destructive-soft"
        >
          <LogOut className="h-5 w-5 text-destructive" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
