"use client"

import { useState } from "react"
import {
  CalendarDays, Users, Bell, Stethoscope, ShoppingBag, Receipt,
  Siren, UsersRound, LayoutDashboard, LogOut, Loader2, Building2, ChevronDown,
} from "lucide-react"
import { AuthProvider, useAuth } from "@/lib/auth-context"
import { useActiveClinic, capabilities } from "@/lib/data/clinic/context"
import { useBusinessType, FALLBACK_TYPE, type ModuleKey } from "@/lib/data/business-types"
import { Button, Pill } from "@/components/screens/shared/ui"
import { ClinicTodayScreen } from "@/components/screens/clinic/today-screen"
import { ClinicCalendarScreen } from "@/components/screens/clinic/calendar-screen"
import { ClinicCustomersScreen } from "@/components/screens/clinic/customers-screen"
import { ClinicRemindersScreen } from "@/components/screens/clinic/reminders-screen"
import { ClinicShopScreen } from "@/components/screens/clinic/shop-screen"
import { ClinicBillingScreen } from "@/components/screens/clinic/billing-screen"
import { ClinicEmergencyScreen } from "@/components/screens/clinic/emergency-screen"
import { ClinicTeamScreen } from "@/components/screens/clinic/team-screen"
import { ClinicSignIn, RegisterPractice } from "@/components/screens/clinic/clinic-onboarding"

export type ClinicTab =
  | "today" | "calendar" | "customers" | "reminders"
  | "shop" | "billing" | "emergency" | "team"

/**
 * Which tab each console module turns on.
 *
 * A vet, a groomer and a boarding kennel run different days, so the console is
 * assembled from the type's module list rather than being one fixed shape. A
 * module with no entry here simply contributes no tab, which is what lets a new
 * module be seeded in the database before its screen ships.
 */
const MODULE_TABS: Array<{
  id: ClinicTab
  label: string
  icon: typeof CalendarDays
  /** null = always shown. */
  module: ModuleKey | null
  /** A second module that also turns this tab on, under a different name. */
  altModule?: ModuleKey
  altLabel?: string
}> = [
  { id: "today", label: "Today", icon: LayoutDashboard, module: null },
  { id: "calendar", label: "Calendar", icon: CalendarDays, module: "schedule", altModule: "bookings", altLabel: "Bookings" },
  { id: "customers", label: "Customers", icon: Users, module: "clients" },
  { id: "reminders", label: "Reminders", icon: Bell, module: "reminders" },
  { id: "shop", label: "Shop", icon: ShoppingBag, module: "shop" },
  { id: "billing", label: "Billing", icon: Receipt, module: "invoices" },
  { id: "emergency", label: "Emergency", icon: Siren, module: "emergency" },
  { id: "team", label: "Team", icon: UsersRound, module: "team" },
]

function Console() {
  const { user, isAuthenticated, isLoading: authLoading, signOut } = useAuth()
  const { clinic, clinics, setActive, isLoading, error, refetch } = useActiveClinic()
  const businessType = useBusinessType(clinic?.kind ?? null)
  const [tab, setTab] = useState<ClinicTab>("today")
  const [switcherOpen, setSwitcherOpen] = useState(false)

  if (authLoading || (isAuthenticated && isLoading)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    )
  }

  if (!isAuthenticated) return <ClinicSignIn />
  if (!clinic) return <RegisterPractice onCreated={refetch} error={error} />

  const caps = capabilities(clinic.role, clinic.tier, clinic.isOwner)
  const type = businessType.data ?? FALLBACK_TYPE
  const has = (m: ModuleKey) => type.modules.includes(m)

  const visible = MODULE_TABS.filter((t) => {
    if (t.module !== null) {
      const on = has(t.module) || (t.altModule ? has(t.altModule) : false)
      if (!on) return false
    }
    if (t.id === "team" && !caps.manageTeam) return false
    if (t.id === "billing" && !caps.takePayment) return false
    return true
  }).map((t) => ({
    ...t,
    // A dog walker books jobs, not consultations, so the tab says so.
    label:
      t.altModule && !has(t.module as ModuleKey) && has(t.altModule) && t.altLabel
        ? t.altLabel
        : t.id === "customers"
          ? `${type.clientLabel}s`
          : t.label,
  }))

  // If the active tab is not in this type's console, fall back to Today.
  const activeTab = visible.some((t) => t.id === tab) ? tab : "today"

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="sticky top-0 hidden h-dvh w-60 flex-shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-2 border-b border-border px-4 py-4">
          <Stethoscope className="h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-foreground">{clinic.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{type.label}</p>
          </div>
        </div>
        <nav aria-label="Console sections" className="flex-1 overflow-y-auto p-2">
          {visible.map((t) => {
            const Icon = t.icon
            const on = activeTab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={on ? "page" : undefined}
                className={`mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors ${
                  on
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {t.label}
              </button>
            )
          })}
        </nav>
        <div className="border-t border-border p-3">
          {clinic.tier !== "verified" && (
            <div className="mb-2 rounded-xl bg-warning/10 p-2.5">
              <p className="text-[11.5px] font-semibold text-warning-strong">Not yet verified</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Verify to receive shared records and take Pet10x bookings.
              </p>
            </div>
          )}
          <p className="truncate px-1 text-[12px] text-muted-foreground">{user?.email}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-card/85 px-4 py-3 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] font-semibold text-foreground">
                {visible.find((t) => t.id === activeTab)?.label ?? "Console"}
              </h1>
              <Pill tone={clinic.tier === "verified" ? "good" : "warn"}>{clinic.tier}</Pill>
            </div>
            {clinics.length > 1 && (
              <div className="relative">
                <Button variant="secondary" size="sm" onClick={() => setSwitcherOpen((v) => !v)}>
                  <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {clinic.name}
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                {switcherOpen && (
                  <div className="absolute right-0 z-40 mt-1 w-60 rounded-xl border border-border bg-card p-1 shadow-float">
                    {clinics.map((c) => (
                      <button
                        key={c.businessId}
                        type="button"
                        onClick={() => {
                          setActive(c.businessId)
                          setSwitcherOpen(false)
                        }}
                        className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-secondary"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <nav aria-label="Console sections" className="mt-2 flex gap-1.5 overflow-x-auto md:hidden">
            {visible.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={activeTab === t.id ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${
                  activeTab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip p-4">
          {activeTab === "today" && <ClinicTodayScreen clinic={clinic} onGo={setTab} />}
          {activeTab === "calendar" && <ClinicCalendarScreen clinic={clinic} />}
          {activeTab === "customers" && <ClinicCustomersScreen clinic={clinic} />}
          {activeTab === "reminders" && <ClinicRemindersScreen clinic={clinic} />}
          {activeTab === "shop" && <ClinicShopScreen clinic={clinic} />}
          {activeTab === "billing" && <ClinicBillingScreen clinic={clinic} />}
          {activeTab === "emergency" && <ClinicEmergencyScreen clinic={clinic} />}
          {activeTab === "team" && <ClinicTeamScreen clinic={clinic} />}
        </main>
      </div>
    </div>
  )
}

export default function ClinicPage() {
  return (
    <AuthProvider>
      <Console />
    </AuthProvider>
  )
}
