"use client"

import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { usePets, useHomeAlerts, useMyBuildingLink, useUnreadNotificationCount } from "@/lib/data"
import { useAiSuggestions } from "@/lib/ai/client"
import { SuggestionCard } from "@/components/ai/suggestion-card"
import { TodayCareTiles } from "@/components/screens/home/today-care-tiles"
import { TodayScheduleStrip } from "@/components/screens/home/today-schedule"
import { MissingInfoCard } from "@/components/screens/home/missing-info-card"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import {
  Bell,
  PawPrint,
  ChevronRight,
  MapPin,
  Heart,
  AlertTriangle,
  Calendar,
  Dog,
  Cat,
  Plus,
  Building2,
  Clock,
  PlusCircle,
  ShoppingBag,
  Sun,
  Sunrise,
  Moon,
  Utensils,
} from "lucide-react"
import Image from "next/image"

const STATUS_CONFIG = {
  home: { label: "Home", pill: "bg-success/10 text-success" },
  away: { label: "Away", pill: "bg-muted text-muted-foreground" },
  "at-vet": { label: "At Vet", pill: "bg-info/10 text-info" },
  vacation: { label: "On Vacation", pill: "bg-primary/10 text-primary" },
} as const

/** 2×2 grid per the design reference, single row from `md` up. */
const QUICK_ACTIONS = [
  { icon: Building2, label: "Building Rules", color: "bg-info/10 text-info" },
  { icon: AlertTriangle, label: "Report Incident", color: "bg-destructive/10 text-destructive" },
  { icon: Calendar, label: "Pet Events", color: "bg-primary/10 text-primary" },
  { icon: ShoppingBag, label: "Shop", color: "bg-accent/10 text-accent" },
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
  // Alerts is no longer a tab (the assistant took the slot), so the unread
  // count has to surface here or it is invisible until you open the screen.
  const unreadCount = useUnreadNotificationCount()
  const suggestions = useAiSuggestions()
  const { greeting, icon: GreetingIcon } = getGreeting()
  const primaryPet = pets[0]
  const singlePet = pets.length === 1

  // Re-evaluate the rules once the owner's pets are known. The runner is
  // idempotent by dedupe_key, so landing on Home repeatedly costs nothing.
  useEffect(() => {
    if (pets.length > 0) void suggestions.run()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per pet-set change
  }, [pets.length])

  /**
   * Which pet card is centred in the carousel, for the dot indicator. Read
   * from scroll position rather than tracked separately, so a drag, a
   * keyboard scroll and a programmatic jump all stay in sync.
   */
  const railRef = useRef<HTMLDivElement>(null)
  const [activePet, setActivePet] = useState(0)
  const handleRailScroll = () => {
    const rail = railRef.current
    if (!rail || rail.children.length === 0) return
    const card = rail.children[0] as HTMLElement
    const stride = card.offsetWidth + 16 // card + gap-4
    setActivePet(Math.round(rail.scrollLeft / stride))
  }

  const handleSuggestionAction = (target: string | null) => {
    if (!target) return
    const [screen, id] = target.split(":")
    onNavigate?.(screen, id)
  }

  const handleQuickAction = (label: string) => {
    if (label.includes("Rules"))
      toast("Building pet rules", { description: "One dog or one cat · leashed in common areas." })
    else if (label.includes("Report"))
      toast("Report an incident", { description: "Pet incident reporting is coming soon." })
    else if (label.includes("Shop")) onNavigate?.("shop")
    else if (label.includes("Events")) onNavigate?.("community")
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <IOSNavBar
        inlineTitle
        title={
          <>
            <PawPrint className="h-6 w-6 flex-shrink-0 text-primary" fill="currentColor" />
            Pet10x
          </>
        }
        rightAction={
          <button
            onClick={() => onNavigate?.("alerts")}
            className="relative p-2"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          >
            <Bell className="h-5 w-5 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        }
      />

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Greeting — icon + name on the left, avatar on the right */}
        <section className="mb-6 mt-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <GreetingIcon className="h-5 w-5 flex-shrink-0 text-primary" />
              <h1 className="truncate text-[26px] font-semibold leading-tight text-foreground">
                {greeting}, {user?.name?.split(" ")[0]}
              </h1>
            </div>
            {buildingLink?.status === "approved" ? (
              <span className="ml-7 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">
                  {buildingLink.buildingName}
                  {buildingLink.unit ? ` · Unit ${buildingLink.unit}` : ""}
                </span>
              </span>
            ) : (
              <p className="ml-7 text-[14px] text-muted-foreground">
                {primaryPet ? `${primaryPet.name} is lucky to have you.` : "Welcome to your pet family."}
              </p>
            )}
          </div>

          {user?.avatar ? (
            <button
              onClick={() => onNavigate?.("profile")}
              aria-label="Your profile"
              className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border-2 border-card shadow-md transition-transform active:scale-95"
            >
              <Image src={user.avatar} alt="" fill className="object-cover" />
            </button>
          ) : null}
        </section>

        <div className="mb-6">
          <MissingInfoCard onNavigate={onNavigate} />
        </div>

        {/* My Pets — horizontal rail on compact, grid from md up */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[17px] font-semibold text-foreground">My Pets</h3>
            <button
              className="flex items-center gap-1 text-[14px] font-medium text-primary"
              onClick={() => onNavigate?.("add-pet")}
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>

          {pets.length === 0 ? (
            <button
              onClick={() => onNavigate?.("add-pet")}
              className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-4 py-8 text-center transition-transform active:scale-[0.98]"
            >
              <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-[22px]">
                🐶
              </span>
              <span className="text-[14px] font-semibold text-foreground">Add your first pet</span>
              <span className="text-[12px] text-muted-foreground">
                Register a furry friend to start tracking food, medicine &amp; treats.
              </span>
            </button>
          ) : (
            <>
              <div
                ref={railRef}
                onScroll={handleRailScroll}
                className={
                  /* A rail of one is not a rail. With a single pet the 280px
                     card left ~80px of dead space beside it on a phone, so
                     drop the scroller entirely and let the card own the row. */
                  singlePet
                    ? "grid gap-4 md:grid-cols-2"
                    : "no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0"
                }
              >
                {pets.map((pet, i) => {
                  const status = STATUS_CONFIG[pet.status]
                  const SpeciesIcon = pet.species === "dog" ? Dog : Cat
                  return (
                    <button
                      key={pet.id}
                      onClick={() => onNavigate?.("pet-detail", pet.id)}
                      className={`flex items-center gap-4 rounded-2xl border border-border bg-card text-left shadow-sm transition-transform active:scale-[0.98] md:min-w-0 ${
                        singlePet ? "w-full p-5" : "min-w-[280px] snap-start p-4"
                      }`}
                    >
                      {/* The extra width would otherwise read as emptiness, so
                          the one-pet card spends it on the photo. */}
                      <div
                        className={`relative flex-shrink-0 overflow-hidden rounded-xl bg-muted ${
                          singlePet ? "h-24 w-24" : "h-20 w-20"
                        }`}
                      >
                        <Image src={pet.image} alt={pet.name} fill className="object-cover" priority={i === 0} />
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="truncate text-[16px] font-semibold text-foreground">{pet.name}</h4>
                          <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground/50" />
                        </div>
                        <div className="mb-1 flex items-center gap-1 text-muted-foreground">
                          <SpeciesIcon className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate text-[12px]">{pet.breed || "Pet"}</span>
                        </div>
                        <span
                          className={`inline-block w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${status.pill}`}
                        >
                          {status.label}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Position indicator — compact only, where the rail scrolls */}
              {pets.length > 1 && (
                <div className="mt-3 flex justify-center gap-1.5 md:hidden">
                  {pets.map((pet, i) => (
                    <span
                      key={pet.id}
                      className={`h-1.5 rounded-full transition-all ${
                        i === activePet ? "w-4 bg-primary" : "w-1.5 bg-border"
                      }`}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Today's Care — header row + the three-up status strip */}
        <section className="mb-6">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <button
              onClick={() => onNavigate?.("pet-care")}
              className="mb-4 flex w-full items-center justify-between gap-3 text-left transition-transform active:scale-[0.99]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Heart className="h-6 w-6" fill="currentColor" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[16px] font-semibold text-foreground">Today&apos;s Care</h3>
                    <Utensils className="h-4 w-4 flex-shrink-0 text-primary" />
                  </div>
                  <p className="truncate text-[12px] text-muted-foreground">
                    Log {primaryPet?.name ? `${primaryPet.name}'s` : "your pet's"} activities &amp; meals
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground/50" />
            </button>

            <TodayCareTiles
              petId={primaryPet?.id}
              species={primaryPet?.species}
              onOpen={(kind) => onNavigate?.("pet-care", kind)}
            />
            <TodayScheduleStrip petId={primaryPet?.id} />
          </div>
        </section>

        {/* Quick Actions — 2×2 on compact, 4-up from md */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[17px] font-semibold text-foreground">Quick Actions</h3>
            <button
              onClick={() => toast("Customise quick actions", { description: "Coming soon." })}
              className="text-[14px] font-medium text-primary"
            >
              Customize
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action.label)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm transition-transform active:scale-[0.97]"
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full ${action.color}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-center text-[12px] font-semibold leading-tight text-foreground">{action.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* Building membership — full-width banner */}
        <section className="mb-6">
          {buildingLink?.status === "approved" ? (
            <button
              onClick={() => onNavigate?.("link-building")}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-transform active:scale-[0.98]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-info/10">
                  <Building2 className="h-5 w-5 text-info" />
                </span>
                <div className="min-w-0">
                  <h4 className="truncate text-[15px] font-semibold text-foreground">{buildingLink.buildingName}</h4>
                  <p className="truncate text-[12px] text-muted-foreground">
                    Linked{buildingLink.unit ? ` · Unit ${buildingLink.unit}` : ""}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            </button>
          ) : buildingLink?.status === "pending" ? (
            <div className="flex w-full items-center gap-3 rounded-2xl border border-[#B8860B]/25 bg-[#FFF6E0] p-4">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#B8860B]/10">
                <Clock className="h-5 w-5 text-[#B8860B]" />
              </span>
              <div className="min-w-0">
                <h4 className="truncate text-[15px] font-semibold text-foreground">Membership pending</h4>
                <p className="truncate text-[12px] text-muted-foreground">
                  {buildingLink.buildingName} will review your request
                </p>
              </div>
            </div>
          ) : (
            <button
              onClick={() => onNavigate?.("link-building")}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-accent/20 bg-accent/5 p-4 text-left transition-transform active:scale-[0.98]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent">
                  <Building2 className="h-5 w-5 text-accent-foreground" />
                </span>
                <div className="min-w-0">
                  <h4 className="truncate text-[15px] font-semibold text-foreground">Link your building</h4>
                  <p className="truncate text-[12px] text-muted-foreground">
                    Access pet-friendly amenities &amp; rules
                  </p>
                </div>
              </div>
              <PlusCircle className="h-6 w-6 flex-shrink-0 text-accent" />
            </button>
          )}
        </section>

        {/* Assistant nudges — deterministic rules, model-written wording */}
        {suggestions.data.length > 0 && (
          <section className="mb-6">
            <div className="flex flex-col gap-3">
              {suggestions.data.slice(0, 4).map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onAction={handleSuggestionAction}
                  onDismiss={suggestions.dismiss}
                />
              ))}
            </div>
          </section>
        )}

        {/* Recent Activity */}
        {alerts.length > 0 && (
          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-foreground">Recent Activity</h3>
              <button
                onClick={() => onNavigate?.("alerts")}
                className="flex items-center gap-0.5 text-[14px] font-medium text-primary"
              >
                See All
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${ALERT_DOT[alert.type]}`} />
                      <h4 className="text-[14px] font-semibold text-foreground">{alert.title}</h4>
                    </div>
                    <span className="flex-shrink-0 text-[11px] text-muted-foreground">{alert.time}</span>
                  </div>
                  <p className="mt-1 pl-4 text-[12px] leading-relaxed text-muted-foreground">{alert.body}</p>
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
  if (h < 12) return { greeting: "Good morning", icon: Sunrise }
  if (h < 17) return { greeting: "Good afternoon", icon: Sun }
  return { greeting: "Good evening", icon: Moon }
}
