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
        "id, name, category, description, price_range, is_open, rating_avg, rating_count, latitude, longitude, tags, hours",
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
      return {
        id: r.id,
        name: r.name,
        category: r.category,
        description: r.description,
        priceRange: r.price_range,
        isOpen: r.is_open,
        ratingAvg: r.rating_avg,
        ratingCount: r.rating_count,
        distanceKm:
          lat != null && lng != null && r.latitude != null && r.longitude != null
            ? haversineKm({ lat, lng }, { lat: r.latitude, lng: r.longitude })
            : null,
        tags: r.tags ?? [],
        hours,
        // Hours are authoritative when set; the manual switch is the fallback.
        openNow: derived === null ? r.is_open : derived && r.is_open,
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
        "id, name, category, description, price_range, is_open, rating_avg, rating_count, latitude, longitude, tags, hours",
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
  source: string
}

export function useMyLocation() {
  const [origin, setOrigin] = useState<MyOrigin | null>(null)
  const [isLoading, setLoading] = useState(ENABLED)
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
      setOrigin(null)
      setLoading(false)
      return
    }
    const { data: prof } = await supabase
      .from("profiles")
      .select("latitude, longitude, location_label")
      .eq("id", user.id)
      .maybeSingle()
    if (prof?.latitude != null && prof?.longitude != null) {
      setOrigin({ lat: prof.latitude, lng: prof.longitude, label: prof.location_label ?? "My location", source: "profile" })
      setLoading(false)
      return
    }
    // fall back to the user's approved building location
    const { data: link } = await supabase.rpc("my_building_link")
    const j = link as { building_id?: string; building_name?: string; status?: string } | null
    if (j?.status === "approved" && j.building_id) {
      const { data: b } = await supabase
        .from("buildings")
        .select("name, latitude, longitude")
        .eq("id", j.building_id)
        .maybeSingle()
      if (b?.latitude != null && b?.longitude != null) {
        setOrigin({ lat: b.latitude, lng: b.longitude, label: b.name ?? "My building", source: "building" })
        setLoading(false)
        return
      }
    }
    setOrigin(null)
    setLoading(false)
  }, [])
  useEffect(() => {
    void refetch()
  }, [refetch])
  return { origin, isLoading, refetch }
}

export async function setMyLocation(lat: number, lng: number, label: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not signed in." }
  const { error } = await supabase
    .from("profiles")
    .update({ latitude: lat, longitude: lng, location_label: label, location_source: "manual" })
    .eq("id", user.id)
  return { error: error?.message ?? null }
}
