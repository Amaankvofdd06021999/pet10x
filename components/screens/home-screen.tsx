"use client"

import { useAuth } from "@/lib/auth-context"
import { usePets, useHomeAlerts, useMyBuildingLink } from "@/lib/data"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import {
  Bell,
  ChevronRight,
  MapPin,
  Shield,
  Heart,
  AlertTriangle,
  Calendar,
  Dog,
  Cat,
  Plus,
  Building2,
  Clock,
} from "lucide-react"
import Image from "next/image"

const STATUS_CONFIG = {
  home: { label: "Home", color: "bg-success" },
  away: { label: "Away", color: "bg-muted-foreground" },
  "at-vet": { label: "At Vet", color: "bg-info" },
  vacation: { label: "On Vacation", color: "bg-primary" },
} as const

const QUICK_ACTIONS = [
  { icon: Shield, label: "Building\nRules", color: "bg-info/10 text-info" },
  { icon: AlertTriangle, label: "Report\nIncident", color: "bg-destructive/10 text-destructive" },
  { icon: Calendar, label: "Events", color: "bg-primary/10 text-primary" },
  { icon: Heart, label: "Lost &\nFound", color: "bg-accent/10 text-accent" },
]

const ALERT_DOT = {
  warning: "bg-[#B8860B]",
  info: "bg-info",
  success: "bg-success",
} as const

interface HomeScreenProps {
  onNavigate?: (screen: string, petId?: string) => void
}

export function HomeScreen({ onNavigate }: HomeScreenProps) {
  const { user } = useAuth()
  const { data: pets } = usePets()
  const { data: alerts } = useHomeAlerts()
  const { data: buildingLink } = useMyBuildingLink()
  const greeting = getGreeting()
  const primaryPet = pets[0]

  const handleQuickAction = (label: string) => {
    if (label.includes("Rules")) toast("Building pet rules", { description: "One dog or one cat · leashed in common areas." })
    else if (label.includes("Report")) toast("Report an incident", { description: "Pet incident reporting is coming soon." })
    else if (label.includes("Events") || label.includes("Lost")) onNavigate?.("community")
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Pet10x"
        rightAction={
          <button onClick={() => onNavigate?.("alerts")} className="relative p-2" aria-label="Notifications">
            <Bell className="h-5 w-5 text-foreground" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
          </button>
        }
      />

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Greeting */}
        <section className="mb-5 mt-1">
          <h1 className="text-[26px] font-semibold leading-tight text-foreground">
            {greeting}, {user?.name?.split(" ")[0]} <span className="inline-block">🐾</span>
          </h1>
          {buildingLink?.status === "approved" ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[13px] text-muted-foreground">
                {buildingLink.buildingName}
                {buildingLink.unit ? ` · Unit ${buildingLink.unit}` : ""}
              </span>
            </div>
          ) : (
            <p className="mt-1.5 text-[14px] text-muted-foreground">
              {primaryPet ? `${primaryPet.name} is lucky to have you.` : "Welcome to your pet family."}
            </p>
          )}
        </section>

        {/* Today's Care */}
        <section className="mb-5">
          <button
            onClick={() => onNavigate?.("pet-care")}
            className="group flex w-full items-center gap-3.5 rounded-2xl border border-border bg-primary/5 p-4 text-left transition-transform active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Heart className="h-6 w-6" fill="currentColor" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[16px] font-semibold text-foreground">Today&apos;s Care</p>
                <span className="text-[14px]">🍖</span>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Track {primaryPet?.name ? `${primaryPet.name}'s` : "your pet's"} food, medicine &amp; treats
              </p>
            </div>
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 transition-transform group-active:translate-x-0.5">
              <ChevronRight className="h-5 w-5 text-primary" />
            </span>
          </button>
        </section>

        {/* Building membership */}
        <section className="mb-5">
          {buildingLink?.status === "approved" ? (
            <button
              onClick={() => onNavigate?.("link-building")}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-transform active:scale-[0.98]"
            >
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-info/10">
                <Building2 className="h-5 w-5 text-info" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-foreground">{buildingLink.buildingName}</p>
                <p className="text-[12px] text-muted-foreground">Linked{buildingLink.unit ? ` · Unit ${buildingLink.unit}` : ""}</p>
              </div>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            </button>
          ) : buildingLink?.status === "pending" ? (
            <div className="flex w-full items-center gap-3 rounded-2xl border border-warning/30 bg-[#FFF9E6] p-4">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-warning/15">
                <Clock className="h-5 w-5 text-[#B38F00]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-foreground">Membership pending</p>
                <p className="text-[12px] text-muted-foreground">{buildingLink.buildingName} will review your request</p>
              </div>
            </div>
          ) : (
            <button
              onClick={() => onNavigate?.("link-building")}
              className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-info/30 bg-info/5 p-4 text-left transition-transform active:scale-[0.98]"
            >
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-info/10">
                <Building2 className="h-5 w-5 text-info" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-foreground">Link your building</p>
                <p className="text-[12px] text-muted-foreground">Moved into a managed building? Add your code.</p>
              </div>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            </button>
          )}
        </section>

        {/* My Pets */}
        <section className="mb-5">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-foreground">My Pets</h2>
            <button
              className="flex items-center gap-1 text-[14px] font-medium text-primary"
              onClick={() => onNavigate?.("add-pet")}
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            {pets.length === 0 && (
              <button
                onClick={() => onNavigate?.("add-pet")}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-4 py-8 text-center transition-transform active:scale-[0.98]"
              >
                <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-[22px]">
                  🐶
                </div>
                <p className="text-[14px] font-semibold text-foreground">Add your first pet</p>
                <p className="text-[12px] text-muted-foreground">Register a furry friend to start tracking food, medicine &amp; treats.</p>
              </button>
            )}
            {pets.map((pet, i) => {
              const statusInfo = STATUS_CONFIG[pet.status]
              const SpeciesIcon = pet.species === "dog" ? Dog : Cat
              return (
                <button
                  key={pet.id}
                  onClick={() => onNavigate?.("pet-detail", pet.id)}
                  className="flex items-center gap-3.5 rounded-2xl border border-border bg-card p-3 text-left transition-transform active:scale-[0.98]"
                >
                  <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl bg-muted">
                    <Image
                      src={pet.image}
                      alt={pet.name}
                      fill
                      className="object-cover"
                      priority={i === 0}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[16px] font-semibold text-foreground">{pet.name}</span>
                      <span className={`ml-auto flex flex-shrink-0 items-center gap-1 rounded-full ${statusInfo.color} px-2 py-0.5`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-card" />
                        <span className="text-[10px] font-medium text-card">{statusInfo.label}</span>
                      </span>
                    </div>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <SpeciesIcon className="h-3.5 w-3.5" />
                      {pet.breed || "Pet"}
                    </span>
                  </div>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                </button>
              )
            })}
          </div>
        </section>

        {/* Quick Actions */}
        <section className="mb-5">
          <h2 className="mb-2.5 text-[17px] font-semibold text-foreground">Quick Actions</h2>
          <div className="grid grid-cols-4 gap-2">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action.label)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-2.5 transition-transform active:scale-[0.97]"
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${action.color}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="whitespace-pre-line text-center text-[10px] font-medium leading-tight text-foreground">
                    {action.label}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Recent Activity */}
        {alerts.length > 0 && (
          <section className="mb-5">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-[17px] font-semibold text-foreground">Recent Activity</h2>
              <button onClick={() => onNavigate?.("alerts")} className="flex items-center gap-0.5 text-[13px] font-medium text-primary">
                See All
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="rounded-2xl border border-border bg-card p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${ALERT_DOT[alert.type]}`} />
                      <h3 className="text-[14px] font-semibold text-foreground">{alert.title}</h3>
                    </div>
                    <span className="flex-shrink-0 text-[11px] text-muted-foreground">{alert.time}</span>
                  </div>
                  <p className="mt-1 pl-4 text-[12px] text-muted-foreground">{alert.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}
