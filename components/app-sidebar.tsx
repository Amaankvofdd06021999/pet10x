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
  PawPrint,
  LogOut,
} from "lucide-react"
import Image from "next/image"

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
  { id: "approvals", label: "Approvals", icon: UserCheck },
  { id: "settings", label: "Settings", icon: Settings },
]

/**
 * Desktop-only sidebar navigation (hidden < md). Mirrors the mobile tab bar so
 * the app is a real web layout on larger screens while mobile keeps the bottom bar.
 */
export function AppSidebar({ activeTab, onTabChange }: SidebarProps) {
  const { user, signOut } = useAuth()
  const isManager = user?.role === "building-manager"
  const unreadCount = useUnreadNotificationCount()
  const badges: Record<string, number> = { alerts: unreadCount }
  const tabs = isManager ? managerTabs : ownerTabs
  const activeColor = isManager ? "text-info" : "text-primary"

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 flex-shrink-0 flex-col border-r border-border bg-card md:flex">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary shadow-sm shadow-primary/30">
          <PawPrint className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
        </span>
        <span className="text-[17px] font-semibold tracking-tight text-foreground">Pet10x</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-3" aria-label="Primary">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${
                isActive
                  ? `bg-muted ${activeColor}`
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 1.8} />
              <span className="flex-1 text-left">{tab.label}</span>
              {badges[tab.id] > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground">
                  {badges[tab.id]}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      {/* User + sign out */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-muted">
            {user?.avatar ? (
              <Image src={user.avatar} alt={user.name} fill className="object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">{user?.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user?.roleLabel}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-destructive transition-colors hover:bg-destructive/5"
        >
          <LogOut className="h-5 w-5" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
