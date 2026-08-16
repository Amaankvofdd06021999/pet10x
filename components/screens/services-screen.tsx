"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { IOSNavBar } from "@/components/ios-nav-bar"
import { NavBackButton } from "@/components/nav-back-button"
import { useNearbyBusinesses, useMyLocation, captureDeviceLocation } from "@/lib/data/business"
import { toast } from "sonner"
import { Search, Star, MapPin, Navigation, Loader2, Store, CalendarCheck, Check } from "lucide-react"

export function ServicesScreen({ onNavigate }: { onNavigate?: (screen: string, id?: string) => void }) {
  const { origin, isLoading: locLoading, permission, refetch: refetchLoc } = useMyLocation()
  const { data: businesses, isLoading, refetch } = useNearbyBusinesses(origin ? { lat: origin.lat, lng: origin.lng } : null)
  const [search, setSearch] = useState("")
  const [gps, setGps] = useState(false)
  const [maxKm, setMaxKm] = useState<number | null>(null)
  const [onlyServing, setOnlyServing] = useState(false)

  const matchesSearch = (b: (typeof businesses)[number]) =>
    search === "" ||
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.category.toLowerCase().includes(search.toLowerCase()) ||
    (b.city ?? "").toLowerCase().includes(search.toLowerCase()) ||
    b.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))

  const filtered = businesses.filter((b) => {
    if (!matchesSearch(b)) return false
    // Unknown distance is never hidden — we just can't prove it's far away.
    if (maxKm != null && b.distanceKm != null && b.distanceKm > maxKm) return false
    if (onlyServing && b.servesMe === false) return false
    return true
  })
  const hiddenByFilters = businesses.filter(matchesSearch).length - filtered.length

  /**
   * `silent` is for the automatic ask on open: declining is a normal choice,
   * not an error worth shouting about, and the page works fine without it.
   * The manual button stays chatty because the owner explicitly asked.
   */
  const requestLocation = useCallback(
    async (silent = false) => {
      setGps(true)
      const { origin: fix, error } = await captureDeviceLocation()
      setGps(false)
      if (!fix) {
        if (!silent) toast.error("Couldn't get your location", { description: error ?? undefined })
        // Re-read the permission so a fresh denial flips the card's copy from
        // "turn on location" to "it's blocked, here's how to unblock it".
        refetchLoc()
        return
      }
      if (error) toast.error("Located, but couldn't save it", { description: error })
      else if (!silent) toast.success("Location updated")
      refetchLoc()
      refetch()
    },
    [refetchLoc, refetch],
  )

  /**
   * Ask on open rather than making the owner find a button — the whole screen
   * is about what's nearby, so the prompt belongs at the start of the journey.
   *
   * Fires at most once per mount, and only when the browser has genuinely
   * never been asked: a previous grant needs no prompt, and a previous denial
   * cannot be re-prompted from script. Denying leaves every business listed,
   * just without distances, so nothing is gated behind allowing it.
   */
  const askedForLocation = useRef(false)
  useEffect(() => {
    if (askedForLocation.current || locLoading) return
    askedForLocation.current = true
    if (origin) return
    if (permission === "prompt" || permission === "unknown") void requestLocation(true)
  }, [locLoading, origin, permission, requestLocation])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <IOSNavBar
        title="Services"
        largeTitle={false}
        leftAction={<NavBackButton onClick={() => onNavigate?.("home")} />}
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
        {/* Location — device GPS only; we never guess from a building */}
        <div className="px-4 pb-2 pt-1">
          {origin ? (
            <div className="flex items-center gap-2 rounded-xl card-raised px-3 py-2.5">
              <MapPin className="h-4 w-4 flex-shrink-0 text-primary" />
              <span className="flex-1 truncate text-[13px] text-foreground">{origin.label}</span>
              <button
                onClick={() => void requestLocation()}
                disabled={gps}
                className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[12px] font-semibold text-primary disabled:opacity-60"
              >
                {gps ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
                Update
              </button>
            </div>
          ) : locLoading ? (
            <div className="flex items-center gap-2 rounded-xl card-raised px-3 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-[13px] text-muted-foreground">Locating…</span>
            </div>
          ) : (
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
                <MapPin className="h-4 w-4 text-primary" /> See what&apos;s near you
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {permission === "denied"
                  ? "Location is blocked for this site. Enable it in your browser settings, then tap below."
                  : "Turn on location to sort services by distance and see who covers your area."}
              </p>
              <button
                onClick={() => void requestLocation()}
                disabled={gps}
                className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-primary-strong px-3 py-2 text-[13px] font-semibold text-primary-strong-foreground disabled:opacity-60"
              >
                {gps ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                Use my location
              </button>
            </div>
          )}
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

        {/* Distance filters — only meaningful once we know where the resident is.
            Two different kinds of control live here: distance is pick-one, and
            "Serves my area" is an independent on/off. They used to render as
            identical chips in one row, so a lit distance chip plus a lit toggle
            read as a filter letting you choose two. They are now visually and
            semantically distinct — a segmented control and a switch-style pill. */}
        {origin && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            <div
              role="radiogroup"
              aria-label="Maximum distance"
              className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-muted/50 p-0.5"
            >
              {([null, 2, 5, 10, 25] as const).map((km) => {
                const active = maxKm === km
                return (
                  <button
                    key={km ?? "any"}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMaxKm(km)}
                    className={`rounded-[10px] px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                      active
                        ? "bg-primary-strong text-primary-strong-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {km == null ? "Any" : `${km} km`}
                  </button>
                )
              })}
            </div>

            <button
              aria-pressed={onlyServing}
              onClick={() => setOnlyServing((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                onlyServing
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Check className={`h-3.5 w-3.5 transition-opacity ${onlyServing ? "opacity-100" : "opacity-30"}`} />
              Serves my area
            </button>
          </div>
        )}

        <section className="px-4">
          <h2 className="mb-3 text-[17px] font-semibold text-foreground">{origin ? "Near you" : "Pet services"}</h2>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <Store className="mx-auto h-7 w-7 text-muted-foreground" />
              {hiddenByFilters > 0 ? (
                <>
                  <p className="mt-2 text-[14px] font-semibold text-foreground">Nothing within that range</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {hiddenByFilters} business{hiddenByFilters === 1 ? " is" : "es are"} further away or outside their
                    service area.
                  </p>
                  <button
                    onClick={() => {
                      setMaxKm(null)
                      setOnlyServing(false)
                    }}
                    className="mt-3 rounded-lg bg-muted px-3.5 py-1.5 text-[12.5px] font-semibold text-foreground"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-2 text-[14px] font-semibold text-foreground">No services yet</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Verified pet businesses near you will appear here.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((b) => (
                <button
                  key={b.id}
                  onClick={() => onNavigate?.("business-detail", b.id)}
                  className="flex items-start gap-3 rounded-2xl card-interactive p-3 text-left transition-transform active:scale-[0.98]"
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
                    {(b.address || b.city) && (
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        {[b.address, b.city].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {b.servesMe === true && (
                      <span className="mt-1 inline-block rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                        Serves your area
                      </span>
                    )}
                    {b.servesMe === false && (
                      <span className="mt-1 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Outside their service area
                      </span>
                    )}
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
