"use client"

import { useAuth } from "@/lib/auth-context"
import { usePets } from "@/lib/data"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import {
  ChevronRight,
  Settings,
  Dog,
  Cat,
  Shield,
  FileText,
  CreditCard,
  HelpCircle,
  LogOut,
  Bell,
  Lock,
  Globe,
  Moon,
  Award,
  Building2,
  Heart,
  Star,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"

const MENU_SECTIONS = [
  {
    title: "My Pets",
    items: [
      { icon: Dog, label: "Pet Profiles", detail: "2 pets registered" },
      { icon: Shield, label: "Compliance Status", detail: "96% compliant" },
      { icon: FileText, label: "Documents & Records" },
      { icon: Award, label: "Achievements", detail: "5 badges" },
    ],
  },
  {
    title: "Building",
    items: [
      { icon: Building2, label: "Building Rules", detail: "Harbour View Tower" },
      { icon: FileText, label: "Accommodation Requests" },
      { icon: Heart, label: "Favorite Services", detail: "3 saved" },
    ],
  },
  {
    title: "Account",
    items: [
      { icon: CreditCard, label: "Subscription", detail: "Pet Plus" },
      { icon: Bell, label: "Notification Settings" },
      { icon: Lock, label: "Privacy & Security" },
      { icon: Globe, label: "Language", detail: "English" },
      { icon: Moon, label: "Appearance", detail: "System" },
    ],
  },
  {
    title: "Support",
    items: [
      { icon: HelpCircle, label: "Help & FAQ" },
      { icon: Star, label: "Rate Pet10x" },
      { icon: FileText, label: "Terms & Privacy Policy" },
    ],
  },
]

interface ProfileScreenProps {
  onNavigate?: (screen: string) => void
}

export function ProfileScreen({ onNavigate }: ProfileScreenProps) {
  const { user, signOut } = useAuth()
  const { data: pets } = usePets()

  const handleItem = (label: string) => {
    if (label.includes("Pet Profiles")) onNavigate?.("home")
    else if (label.includes("Documents")) onNavigate?.("pet-detail")
    else if (label.includes("Favorite Services")) onNavigate?.("services")
    else if (label.includes("Compliance")) toast("Compliance status", { description: "96% compliant · 1 item needs attention." })
    else if (label.includes("Subscription")) toast("Pet Plus", { description: "Your premium plan is active." })
    else toast(label, { description: "Coming soon." })
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Profile"
        rightAction={
          <button onClick={() => toast("Settings — coming soon")} className="p-2" aria-label="Settings">
            <Settings className="h-5 w-5 text-foreground" />
          </button>
        }
      />

      <main className="ios-scroll flex-1 px-4 pb-24">
        {/* Profile Card */}
        <section className="mb-5">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 overflow-hidden rounded-full bg-muted flex-shrink-0">
                <Image src={user?.avatar ?? ""} alt={user?.name ?? ""} fill className="object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="truncate text-[17px] font-semibold text-foreground">{user?.name}</h2>
                <p className="text-[12px] text-muted-foreground">Unit {user?.unit} &middot; {user?.building}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge className="bg-primary/10 text-primary border-0 text-[10px]">
                    {user?.roleLabel}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">Since {user?.memberSince}</span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            </div>
          </div>
        </section>

        {/* Pet Quick View */}
        <section className="mb-5">
          <div className="flex gap-2.5">
            {pets.length === 0 && (
              <button
                onClick={() => onNavigate?.("add-pet")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border bg-card p-3.5 text-[13px] font-semibold text-muted-foreground transition-transform active:scale-[0.98]"
              >
                + Add a pet
              </button>
            )}
            {pets.map((pet) => {
              const SpeciesIcon = pet.species === "dog" ? Dog : Cat
              return (
                <div
                  key={pet.name}
                  className="flex flex-1 items-center gap-2.5 rounded-2xl border border-border bg-card p-2.5"
                >
                  <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-muted flex-shrink-0">
                    <Image src={pet.image} alt={pet.name} fill className="object-cover" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <SpeciesIcon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[13px] font-semibold text-foreground">{pet.name}</span>
                    </div>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">{pet.breed || "Pet"}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Menu Sections */}
        {MENU_SECTIONS.map((section) => (
          <section key={section.title} className="mb-5">
            <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase text-muted-foreground">
              {section.title}
            </h3>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {section.items.map((item, idx) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.label}
                    onClick={() => handleItem(item.label)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-muted ${
                      idx < section.items.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="flex-1 text-[14px] text-foreground">{item.label}</span>
                    {item.detail && <span className="text-[12px] text-muted-foreground">{item.detail}</span>}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          </section>
        ))}

        {/* Sign Out */}
        <section className="mb-5">
          <button
            onClick={signOut}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 transition-transform active:scale-[0.98]"
          >
            <LogOut className="h-5 w-5 text-destructive" />
            <span className="text-[14px] font-semibold text-destructive">Sign Out</span>
          </button>
        </section>

        <div className="mb-4 text-center">
          <p className="text-[11px] text-muted-foreground">Pet10x v1.0.0 &middot; Park10x Services Inc.</p>
        </div>
      </main>
    </div>
  )
}
