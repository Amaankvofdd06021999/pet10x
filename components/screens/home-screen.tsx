"use client"

import { useAuth } from "@/lib/auth-context"
import { usePets, useHomeAlerts, useBuilding } from "@/lib/data"
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
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
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

const ALERT_STYLES = {
  warning: "border-l-warning bg-[#FFF9E6]",
  info: "border-l-info bg-[#E6F2FF]",
  success: "border-l-success bg-[#E8F8ED]",
} as const

interface HomeScreenProps {
  onNavigate?: (screen: string) => void
}

export function HomeScreen({ onNavigate }: HomeScreenProps) {
  const { user } = useAuth()
  const { data: pets } = usePets()
  const { data: alerts } = useHomeAlerts()
  const { data: building } = useBuilding()
  const stats = building.stats
  const greeting = getGreeting()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Pet10x"
        rightAction={
          <button className="relative p-2" aria-label="Notifications">
            <Bell className="h-5 w-5 text-foreground" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
          </button>
        }
      />

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Greeting */}
        <section className="mb-5">
          <p className="text-[15px] text-muted-foreground">{greeting}, {user?.name?.split(" ")[0]}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[13px] text-muted-foreground">{user?.building}, Unit {user?.unit}</span>
          </div>
        </section>

        {/* Compliance Card */}
        <section className="mb-5">
          <div className="rounded-2xl bg-primary p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium text-primary-foreground/80">Building Compliance</p>
                <p className="mt-0.5 text-[32px] font-bold leading-tight text-primary-foreground">{stats.ownerComplianceScore}%</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-foreground/20">
                <Shield className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-primary-foreground/20">
              <div className="h-full rounded-full bg-primary-foreground transition-all" style={{ width: `${stats.ownerComplianceScore}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-primary-foreground/70">
              All documents up to date. 1 item needs attention.
            </p>
          </div>
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
            {pets.map((pet) => {
              const statusInfo = STATUS_CONFIG[pet.status]
              const SpeciesIcon = pet.species === "dog" ? Dog : Cat
              return (
                <button
                  key={pet.id}
                  onClick={() => onNavigate?.("pet-detail")}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-transform active:scale-[0.98]"
                >
                  <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-muted">
                    <Image
                      src={pet.image}
                      alt={pet.name}
                      fill
                      className="object-cover"
                      priority={pet.id === 1}
                    />
                  </div>
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-center gap-1.5">
                      <SpeciesIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-[15px] font-semibold text-foreground">{pet.name}</span>
                      <span className={`ml-auto flex items-center gap-1 rounded-full ${statusInfo.color} px-2 py-0.5`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-card" />
                        <span className="text-[10px] font-medium text-card">{statusInfo.label}</span>
                      </span>
                    </div>
                    <span className="mt-0.5 text-[12px] text-muted-foreground">{pet.breed}</span>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-success transition-all"
                          style={{ width: `${pet.compliance}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-medium text-muted-foreground">{pet.compliance}%</span>
                    </div>
                  </div>
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
        <section className="mb-5">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-foreground">Recent Activity</h2>
            <button className="flex items-center gap-0.5 text-[13px] font-medium text-primary">
              See All
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-xl border-l-4 p-3 ${ALERT_STYLES[alert.type]}`}
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-[14px] font-semibold text-foreground">{alert.title}</h3>
                  <span className="text-[11px] text-muted-foreground">{alert.time}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-secondary-foreground">{alert.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Building Stats */}
        <section className="mb-5">
          <h2 className="mb-2.5 text-[17px] font-semibold text-foreground">Building Stats</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] font-medium text-muted-foreground">Total Pets</p>
              <p className="mt-0.5 text-[20px] font-bold text-foreground">{stats.totalPets}</p>
              <div className="mt-1 flex items-center gap-1">
                <Badge variant="secondary" className="text-[9px] bg-success/10 text-success border-0">{stats.dogs} Dogs</Badge>
                <Badge variant="secondary" className="text-[9px] bg-accent/10 text-accent border-0">{stats.cats} Cats</Badge>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] font-medium text-muted-foreground">Risk Score</p>
              <p className="mt-0.5 text-[20px] font-bold text-success">Low</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Score: {stats.riskScore}/100</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] font-medium text-muted-foreground">Open Incidents</p>
              <p className="mt-0.5 text-[20px] font-bold text-foreground">2</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Avg resolve: 2.4 days</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] font-medium text-muted-foreground">Upcoming Events</p>
              <p className="mt-0.5 text-[20px] font-bold text-foreground">3</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Next: Dog Walk Sat</p>
            </div>
          </div>
        </section>
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
