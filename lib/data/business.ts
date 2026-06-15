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
      .select("id, name, category, description, price_range, is_open, rating_avg, rating_count, latitude, longitude")
      .eq("is_verified", true)
    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }
    const mapped: NearbyBusiness[] = (rows ?? []).map((r) => ({
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
    }))
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
