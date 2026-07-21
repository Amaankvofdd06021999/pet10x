"use client"

import { useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { useNearbyBusinesses, useMyLocation, setMyLocation } from "@/lib/data/business"
import { toast } from "sonner"
import { Search, Star, MapPin, Navigation, Loader2, Store, CalendarCheck } from "lucide-react"

export function ServicesScreen({ onNavigate }: { onNavigate?: (screen: string, id?: string) => void }) {
  const { origin, isLoading: locLoading, refetch: refetchLoc } = useMyLocation()
  const { data: businesses, isLoading, refetch } = useNearbyBusinesses(origin ? { lat: origin.lat, lng: origin.lng } : null)
  const [search, setSearch] = useState("")
  const [gps, setGps] = useState(false)

  const filtered = businesses.filter(
    (b) =>
      search === "" ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.category.toLowerCase().includes(search.toLowerCase()),
  )

  function useGps() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return toast.error("Location not available")
    setGps(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { error } = await setMyLocation(pos.coords.latitude, pos.coords.longitude, "Current location")
        setGps(false)
        if (error) return toast.error("Couldn't save location", { description: error })
        toast.success("Location set")
        refetchLoc()
        refetch()
      },
      () => {
        setGps(false)
        toast.error("Couldn't get your location")
      },
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Services"
        rightAction={
          <button
            onClick={() => onNavigate?.("my-bookings")}
            className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-[12.5px] font-semibold text-accent"
          >
            <CalendarCheck className="h-3.5 w-3.5" /> My bookings
          </button>
        }
      />

      <main className="ios-scroll flex-1 pb-24">
        {/* Location */}
        <div className="px-4 pb-2 pt-1">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
            <MapPin className="h-4 w-4 flex-shrink-0 text-primary" />
            <span className="flex-1 truncate text-[13px] text-foreground">
              {locLoading ? "Locating…" : origin ? origin.label : "Set your location to see nearby"}
            </span>
            <button
              onClick={useGps}
              disabled={gps}
              className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[12px] font-semibold text-primary disabled:opacity-60"
            >
              {gps ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
              {origin ? "Update" : "Use GPS"}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services…"
              className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
        </div>

        <section className="px-4">
          <h2 className="mb-3 text-[17px] font-semibold text-foreground">{origin ? "Near you" : "Pet services"}</h2>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <Store className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-[14px] font-semibold text-foreground">No services yet</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Verified pet businesses near you will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((b) => (
                <button
                  key={b.id}
                  onClick={() => onNavigate?.("business-detail", b.id)}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-transform active:scale-[0.98]"
                >
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
                    <Store className="h-6 w-6 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-[14px] font-semibold text-foreground">{b.name}</h3>
                      <span
                        className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                          b.openNow ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {b.openNow ? "Open" : "Closed"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{b.category}</p>
                    <div className="mt-1.5 flex items-center gap-2.5">
                      {b.ratingCount > 0 && (
                        <span className="flex items-center gap-1 text-[12px] text-foreground">
                          <Star className="h-3 w-3 fill-primary text-primary" />
                          {b.ratingAvg.toFixed(1)}
                        </span>
                      )}
                      {b.distanceKm != null && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {b.distanceKm < 1 ? `${Math.round(b.distanceKm * 1000)} m` : `${b.distanceKm.toFixed(1)} km`}
                        </span>
                      )}
                      {b.priceRange && <span className="text-[11px] text-muted-foreground">{b.priceRange}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
