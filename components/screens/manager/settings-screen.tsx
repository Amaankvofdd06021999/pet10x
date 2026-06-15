"use client"

import { useAuth } from "@/lib/auth-context"
import { toast } from "sonner"
import { IOSNavBar } from "@/components/ios-nav-bar"
import {
  Building2,
  Shield,
  FileText,
  Bell,
  Search,
  Lock,
  Globe,
  Moon,
  HelpCircle,
  LogOut,
  ChevronRight,
  QrCode,
  Users,
  CreditCard,
  Clipboard,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"

const MENU_SECTIONS = [
  {
    title: "Building Configuration",
    items: [
      { icon: Building2, label: "Building Profile", detail: "Harbour View Tower", chevron: true },
      { icon: Shield, label: "Pet Bylaws & Policies", detail: "Last updated Feb 10", chevron: true },
      { icon: FileText, label: "Document Templates", detail: "8 templates", chevron: true },
      { icon: Bell, label: "Notification Rules", detail: "12 active rules", chevron: true },
      { icon: QrCode, label: "Emergency QR Code", detail: "Generate / Print", chevron: true },
    ],
  },
  {
    title: "Administration",
    items: [
      { icon: Users, label: "Staff & Access Control", detail: "3 managers", chevron: true },
      { icon: Search, label: "Audit Log", detail: "View all activity", chevron: true },
      { icon: Clipboard, label: "Compliance Report", detail: "Generate monthly", chevron: true },
      { icon: CreditCard, label: "Subscription & Billing", detail: "Enterprise", chevron: true },
    ],
  },
  {
    title: "Account",
    items: [
      { icon: Lock, label: "Security & Access", chevron: true },
      { icon: Globe, label: "Language", detail: "English", chevron: true },
      { icon: Moon, label: "Appearance", detail: "System", chevron: true },
    ],
  },
  {
    title: "Support",
    items: [
      { icon: HelpCircle, label: "Help & FAQ", chevron: true },
      { icon: FileText, label: "Terms & Privacy Policy", chevron: true },
    ],
  },
]

export function ManagerSettingsScreen() {
  const { user, signOut } = useAuth()

  const handleItem = (label: string) => {
    if (label.includes("Emergency QR")) toast.success("Emergency QR generated", { description: "Valid for 4 hours." })
    else if (label.includes("Compliance Report")) toast.success("Compliance report generating…")
    else toast(label, { description: "Coming soon." })
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar title="Settings" />

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
                <p className="text-[12px] text-muted-foreground">{user?.building}</p>
                <Badge className="mt-1 bg-info/10 text-info border-0 text-[10px]">
                  {user?.roleLabel}
                </Badge>
              </div>
              <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            </div>
          </div>
        </section>

        {/* Quick Stats */}
        <section className="mb-5">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border bg-card p-2.5 text-center">
              <p className="text-[18px] font-bold text-foreground">47</p>
              <p className="text-[9px] font-medium text-muted-foreground">Pets</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-2.5 text-center">
              <p className="text-[18px] font-bold text-foreground">94%</p>
              <p className="text-[9px] font-medium text-muted-foreground">Compliance</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-2.5 text-center">
              <p className="text-[18px] font-bold text-destructive">5</p>
              <p className="text-[9px] font-medium text-muted-foreground">Open Issues</p>
            </div>
          </div>
        </section>

        {/* Menu Sections */}
        {MENU_SECTIONS.map((section) => (
          <section key={section.title} className="mb-5">
            <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase text-muted-foreground">
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
                    <Icon className="h-5 w-5 text-info" />
                    <span className="flex-1 text-[14px] text-foreground">{item.label}</span>
                    {item.detail && (
                      <span className="text-[12px] text-muted-foreground">{item.detail}</span>
                    )}
                    {item.chevron && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
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
