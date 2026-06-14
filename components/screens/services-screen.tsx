"use client"

import { useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { useServiceProviders } from "@/lib/data"
import {
  Search,
  Star,
  MapPin,
  Clock,
  ChevronRight,
  Stethoscope,
  Scissors,
  PersonStanding,
  GraduationCap,
  ShoppingBag,
  Truck,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Image from "next/image"

const CATEGORIES = [
  { id: "all", label: "All", icon: ShoppingBag },
  { id: "vet", label: "Vets", icon: Stethoscope },
  { id: "grooming", label: "Grooming", icon: Scissors },
  { id: "walking", label: "Walking", icon: PersonStanding },
  { id: "training", label: "Training", icon: GraduationCap },
  { id: "supplies", label: "Supplies", icon: Truck },
]

export function ServicesScreen() {
  const [activeCategory, setActiveCategory] = useState("all")
  const { data: providers } = useServiceProviders()
  const featured = providers.filter((p) => p.featured)
  const nearby = providers.filter((p) => !p.featured)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar title="Services" />

      <main className="ios-scroll flex-1 pb-24">
        {/* Search */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-[15px] text-muted-foreground">Search services near you...</span>
          </div>
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {cat.label}
              </button>
            )
          })}
        </div>

        {/* Featured */}
        <section className="px-4 mb-6">
          <h2 className="mb-3 text-[17px] font-semibold text-foreground">Featured</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {featured.map((provider) => (
              <div
                key={provider.id}
                className="rounded-2xl border border-border bg-card overflow-hidden transition-transform active:scale-[0.98]"
              >
                <div className="relative h-28 w-full bg-muted">
                  <Image src={provider.image} alt={provider.name} fill className="object-cover" />
                  <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground text-[9px] border-0">
                    Featured
                  </Badge>
                  {provider.tags?.slice(0, 1).map((tag) => (
                    <Badge key={tag} className="absolute top-2 right-2 bg-card/90 text-foreground text-[9px] border-0 backdrop-blur-sm">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="p-2.5">
                  <h3 className="text-[13px] font-semibold leading-tight text-foreground">{provider.name}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{provider.category}</p>
                  <div className="mt-1.5 flex items-center gap-1">
                    <Star className="h-3 w-3 fill-primary text-primary" />
                    <span className="text-[12px] font-semibold text-foreground">{provider.rating}</span>
                    <span className="text-[11px] text-muted-foreground">({provider.reviews})</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">{provider.distance}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* All Providers */}
        <section className="px-4">
          <h2 className="mb-3 text-[17px] font-semibold text-foreground">Near You</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {nearby.map((provider) => (
              <button
                key={provider.id}
                className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden text-left transition-transform active:scale-[0.98]"
              >
                <div className="relative h-28 w-full bg-muted">
                  <Image src={provider.image} alt={provider.name} fill className="object-cover" />
                  {provider.isOpen ? (
                    <span className="absolute top-2 right-2 rounded-full bg-success px-1.5 py-0.5 text-[9px] font-semibold text-success-foreground">Open</span>
                  ) : (
                    <span className="absolute top-2 right-2 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">Closed</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-2.5">
                  <h3 className="text-[13px] font-semibold leading-tight text-foreground">{provider.name}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{provider.category}</p>
                  <div className="mt-1.5 flex items-center gap-1">
                    <Star className="h-3 w-3 fill-primary text-primary" />
                    <span className="text-[12px] font-semibold text-foreground">{provider.rating}</span>
                    <span className="text-[11px] text-muted-foreground">({provider.reviews})</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">{provider.distance}</span>
                  </div>
                  {provider.nextAvailable && (
                    <div className="mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{provider.nextAvailable}</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
