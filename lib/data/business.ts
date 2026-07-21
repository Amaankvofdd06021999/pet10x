"use client"

/**
 * Pet10x — Business portal + consumer "nearby" data layer.
 * Business owners read/write their own row (RLS businesses_owner_write).
 * Consumers see only verified businesses (RLS businesses_select is_verified).
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"

const ENABLED = isSupabaseConfigured()
type BizRow = Database["public"]["Tables"]["businesses"]["Row"]

/** Per-day opening hours; a null day means closed. */
export type BusinessHours = Record<string, { open: string; close: string } | null>
export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
export const DAY_LABEL: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
}

/** Derive "open now" from the hours table rather than a hand-flipped switch. */
export function isOpenNow(hours: BusinessHours | null | undefined, now = new Date()): boolean | null {
  if (!hours || Object.keys(hours).length === 0) return null
  const key = DAY_KEYS[(now.getDay() + 6) % 7] // JS: 0=Sun → our week starts Monday
  const today = hours[key]
  if (!today) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  const [oh, om] = today.open.split(":").map(Number)
  const [ch, cm] = today.close.split(":").map(Number)
  return mins >= oh * 60 + om && mins < ch * 60 + cm
}

export interface MyBusiness {
  id: string
  name: string
  category: string
  description: string | null
  priceRange: string | null
  isVerified: boolean
  isOpen: boolean
  latitude: number | null
  longitude: number | null
  serviceRadiusM: number | null
  logoUrl: string | null
  hours: BusinessHours | null
  tags: string[]
  ratingAvg: number
  ratingCount: number
  listingTier: string
  address: string | null
  city: string | null
  region: string | null
  postalCode: string | null
}

/**
 * Format a minor-unit amount in its own currency. Businesses are not all in one
 * country, so a hardcoded "$" would misprice every non-CAD listing.
 */
export function formatPrice(cents: number, currency?: string | null): string {
  const code = (currency || "cad").toUpperCase()
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format((cents ?? 0) / 100)
  } catch {
    return `${((cents ?? 0) / 100).toFixed(2)} ${code}`
  }
}

/** One-line street address, or null when nothing has been filled in. */
export function formatAddress(b: {
  address?: string | null
  city?: string | null
  region?: string | null
  postalCode?: string | null
}): string | null {
  const parts = [b.address, b.city, b.region].filter(Boolean)
  if (!parts.length) return null
  return parts.join(", ") + (b.postalCode ? ` ${b.postalCode}` : "")
}

/** Directions link — mirrors the convention already used for incident reports. */
export function mapsUrl(opts: { address?: string | null; latitude?: number | null; longitude?: number | null }): string {
  const query =
    opts.latitude != null && opts.longitude != null ? `${opts.latitude},${opts.longitude}` : (opts.address ?? "")
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function mapMine(r: BizRow): MyBusiness {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description,
    priceRange: r.price_range,
    isVerified: r.is_verified,
    isOpen: r.is_open,
    latitude: r.latitude,
    longitude: r.longitude,
    serviceRadiusM: r.service_radius_m,
    logoUrl: r.logo_url,
    hours: (r.hours as BusinessHours) ?? null,
    tags: r.tags ?? [],
    ratingAvg: r.rating_avg,
    ratingCount: r.rating_count,
    listingTier: r.listing_tier,
    address: r.address,
    city: r.city,
    region: r.region,
    postalCode: r.postal_code,
  }
}

/**
 * Storefront completeness — names the exact blocker rather than a vague score,
 * because an incomplete profile is what keeps a business invisible.
 */
export function profileCompleteness(
  biz: MyBusiness | null,
  serviceCount: number,
): { pct: number; done: number; total: number; missing: string[] } {
  const checks: { ok: boolean; label: string }[] = [
    { ok: !!biz?.name?.trim(), label: "Business name" },
    { ok: !!biz?.category?.trim(), label: "Category" },
    { ok: (biz?.description?.trim().length ?? 0) >= 40, label: "Description (40+ characters)" },
    { ok: !!biz?.priceRange?.trim(), label: "Price range" },
    { ok: biz?.latitude != null && biz?.longitude != null, label: "Location" },
    { ok: (biz?.serviceRadiusM ?? 0) > 0, label: "Service radius" },
    { ok: !!biz?.hours && Object.keys(biz.hours).length > 0, label: "Business hours" },
    { ok: (biz?.tags?.length ?? 0) > 0, label: "Tags" },
    { ok: serviceCount > 0, label: "At least one service" },
    { ok: !!biz?.isVerified, label: "Pet10x verification" },
  ]
  const done = checks.filter((c) => c.ok).length
  return {
    pct: Math.round((done / checks.length) * 100),
    done,
    total: checks.length,
    missing: checks.filter((c) => !c.ok).map((c) => c.label),
  }
}

export function useMyBusiness() {
  const [data, setData] = useState<MyBusiness | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setData(null)
      setLoading(false)
      return
    }
    const { data: row, error: err } = await supabase
      .from("businesses")
      .select("*")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle()
    if (err) setError(err.message)
    else setData(row ? mapMine(row) : null)
    setLoading(false)
  }, [])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

export async function updateBusiness(
  id: string,
  patch: Partial<{
    name: string
    category: string
    description: string | null
    priceRange: string | null
    isOpen: boolean
    latitude: number | null
    longitude: number | null
    serviceRadiusM: number | null
    logoUrl: string | null
    hours: BusinessHours | null
    tags: string[]
    address: string | null
    city: string | null
    region: string | null
    postalCode: string | null
  }>,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const db: Database["public"]["Tables"]["businesses"]["Update"] = {}
  if (patch.name !== undefined) db.name = patch.name
  if (patch.category !== undefined) db.category = patch.category
  if (patch.description !== undefined) db.description = patch.description
  if (patch.priceRange !== undefined) db.price_range = patch.priceRange
  if (patch.isOpen !== undefined) db.is_open = patch.isOpen
  if (patch.latitude !== undefined) db.latitude = patch.latitude
  if (patch.longitude !== undefined) db.longitude = patch.longitude
  if (patch.serviceRadiusM !== undefined) db.service_radius_m = patch.serviceRadiusM
  if (patch.logoUrl !== undefined) db.logo_url = patch.logoUrl
  if (patch.tags !== undefined) db.tags = patch.tags
  if (patch.address !== undefined) db.address = patch.address
  if (patch.city !== undefined) db.city = patch.city
  if (patch.region !== undefined) db.region = patch.region
  if (patch.postalCode !== undefined) db.postal_code = patch.postalCode
  if (patch.hours !== undefined) {
    db.hours = patch.hours as Database["public"]["Tables"]["businesses"]["Update"]["hours"]
  }
  // is_verified is deliberately absent — a DB trigger blocks self-verification.
  const { error } = await supabase.from("businesses").update(db).eq("id", id)
  return { error: error?.message ?? null }
}

/* ------------------------------- nearby --------------------------------- */

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface NearbyBusiness {
  id: string
  name: string
  category: string
  description: string | null
  priceRange: string | null
  isOpen: boolean
  ratingAvg: number
  ratingCount: number
  distanceKm: number | null
  tags: string[]
  hours: BusinessHours | null
  /** Derived from `hours` when present, else falls back to the manual is_open flag. */
  openNow: boolean
  address: string | null
  city: string | null
  region: string | null
  postalCode: string | null
  latitude: number | null
  longitude: number | null
  serviceRadiusM: number | null
  /**
   * True when the resident's location falls inside the business's stated service
   * radius. Null when either side has no coordinates — unknown, so never hidden.
   */
  servesMe: boolean | null
}

/** Does this business's service radius cover the given distance? */
export function servesDistance(distanceKm: number | null, serviceRadiusM: number | null): boolean | null {
  if (distanceKm == null || serviceRadiusM == null || serviceRadiusM <= 0) return null
  return distanceKm * 1000 <= serviceRadiusM
}

export function useNearbyBusinesses(origin: { lat: number; lng: number } | null) {
  const [data, setData] = useState<NearbyBusiness[]>([])
  const [isLoading, setLoading] = useState(ENABLED)
  const [error, setError] = useState<string | null>(null)
  const lat = origin?.lat ?? null
  const lng = origin?.lng ?? null
  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("businesses")
      .select(
        "id, name, category, description, price_range, is_open, rating_avg, rating_count, latitude, longitude, tags, hours, address, city, region, postal_code, service_radius_m",
      )
      .eq("is_verified", true)
    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }
    const mapped: NearbyBusiness[] = (rows ?? []).map((r) => {
      const hours = (r.hours as BusinessHours) ?? null
      const derived = isOpenNow(hours)
      const distanceKm =
        lat != null && lng != null && r.latitude != null && r.longitude != null
          ? haversineKm({ lat, lng }, { lat: r.latitude, lng: r.longitude })
          : null
      return {
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        priceRange: r.price_range,
        isOpen: r.is_open,
        ratingAvg: r.rating_avg,
        ratingCount: r.rating_count,
        distanceKm,
        tags: r.tags ?? [],
        hours,
        // Hours are authoritative when set; the manual switch is the fallback.
        openNow: derived === null ? r.is_open : derived && r.is_open,
        address: r.address,
        city: r.city,
        region: r.region,
        postalCode: r.postal_code,
        latitude: r.latitude,
        longitude: r.longitude,
        serviceRadiusM: r.service_radius_m,
        servesMe: servesDistance(distanceKm, r.service_radius_m),
      }
    })
    mapped.sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0
      if (a.distanceKm == null) return 1
      if (b.distanceKm == null) return -1
      return a.distanceKm - b.distanceKm
    })
    setData(mapped)
    setError(null)
    setLoading(false)
  }, [lat, lng])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

/** A single verified business, for the resident-facing detail screen. */
export function usePublicBusiness(businessId?: string) {
  const [data, setData] = useState<NearbyBusiness | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !businessId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: r, error: err } = await supabase
      .from("businesses")
      .select(
        "id, name, category, description, price_range, is_open, rating_avg, rating_count, latitude, longitude, tags, hours, address, city, region, postal_code, service_radius_m",
      )
      .eq("id", businessId)
      .maybeSingle()
    if (err) {
      setError(err.message)
      setData(null)
    } else if (r) {
      const hours = (r.hours as BusinessHours) ?? null
      const derived = isOpenNow(hours)
      setData({
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        priceRange: r.price_range,
        isOpen: r.is_open,
        ratingAvg: r.rating_avg,
        ratingCount: r.rating_count,
        distanceKm: null,
        tags: r.tags ?? [],
        hours,
        openNow: derived === null ? r.is_open : derived && r.is_open,
        address: r.address,
        city: r.city,
        region: r.region,
        postalCode: r.postal_code,
        latitude: r.latitude,
        longitude: r.longitude,
        serviceRadiusM: r.service_radius_m,
        servesMe: null,
      })
      setError(null)
    }
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

/* ----------------------------- my location ------------------------------ */

export interface MyOrigin {
  lat: number
  lng: number
  label: string
  /** "device" = real GPS fix · "manual" = typed/dropped pin. */
  source: string
}

export type LocationPermission = "granted" | "prompt" | "denied" | "unsupported" | "unknown"

/** Read the geolocation permission WITHOUT triggering the browser prompt. */
async function readPermission(): Promise<LocationPermission> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return "unsupported"
  if (!navigator.permissions?.query) return "unknown"
  try {
    const s = await navigator.permissions.query({ name: "geolocation" as PermissionName })
    return s.state as LocationPermission
  } catch {
    return "unknown"
  }
}

/** Promise wrapper around the one-shot geolocation call. */
export function getDevicePosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  })
}

/**
 * The user's own location — device GPS first, then whatever they last saved.
 *
 * Deliberately does NOT fall back to their building: Pet10x is also a direct
 * consumer app, so most people won't belong to a building at all, and reporting
 * a building's coordinates as "your location" is simply wrong for anyone who
 * isn't standing in it. No location just means no distance — never a guess.
 */
export function useMyLocation() {
  const [origin, setOrigin] = useState<MyOrigin | null>(null)
  const [isLoading, setLoading] = useState(ENABLED)
  const [permission, setPermission] = useState<LocationPermission>("unknown")

  const refetch = useCallback(async () => {
    const perm = await readPermission()
    setPermission(perm)

    const supabase = getSupabaseBrowserClient()
    let saved: MyOrigin | null = null
    let userId: string | null = null

    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      userId = user?.id ?? null
      if (userId) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("latitude, longitude, location_label, location_source")
          .eq("id", userId)
          .maybeSingle()
        if (prof?.latitude != null && prof?.longitude != null) {
          saved = {
            lat: prof.latitude,
            lng: prof.longitude,
            label: prof.location_label ?? "My location",
            source: prof.location_source ?? "manual",
          }
          setOrigin(saved) // paint immediately, refine below
        }
      }
    }
    setLoading(false)

    // Already-granted permission means we can get a real fix with no prompt.
    if (perm === "granted") {
      const pos = await getDevicePosition()
      if (pos) {
        setOrigin({ lat: pos.lat, lng: pos.lng, label: "Current location", source: "device" })
        if (userId) void setMyLocation(pos.lat, pos.lng, "Current location", "device")
      }
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return { origin, isLoading, permission, refetch }
}

/** Ask for GPS (may prompt), store it, and return the fix. */
export async function captureDeviceLocation(): Promise<{ origin: MyOrigin | null; error: string | null }> {
  const pos = await getDevicePosition()
  if (!pos) return { origin: null, error: "Couldn't get your location. Check location permission for this site." }
  const { error } = await setMyLocation(pos.lat, pos.lng, "Current location", "device")
  return { origin: { lat: pos.lat, lng: pos.lng, label: "Current location", source: "device" }, error }
}

export async function setMyLocation(
  lat: number,
  lng: number,
  label: string,
  source: "device" | "manual" = "manual",
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // Signed-out visitors still get distances this session; there's just nowhere
  // to persist the fix, which is fine.
  if (!user) return { error: null }
  const { error } = await supabase
    .from("profiles")
    .update({ latitude: lat, longitude: lng, location_label: label, location_source: source })
    .eq("id", user.id)
  return { error: error?.message ?? null }
}
