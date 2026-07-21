"use client"

/**
 * Pet10x — service catalog, bookings, reviews and campaigns.
 *
 * Shared by both sides of the marketplace: the business owner portal
 * (/businessaccess) and the resident app (/app). RLS keeps them apart — an
 * owner only ever sees rows for their own business, and only sees a customer or
 * a pet once a booking has introduced them.
 */

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import type { LiveResult } from "./live"

/** Platform take rate applied when a booking is created. */
export const COMMISSION_RATE = 0.15

export type BookingStatus =
  | "requested"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "paid"
  | "declined"
  | "cancelled"

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  paid: "Paid",
  declined: "Declined",
  cancelled: "Cancelled",
}

/** Statuses that still need the owner to do something. */
export const OPEN_STATUSES: BookingStatus[] = ["requested", "confirmed", "in_progress", "completed"]

const first = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

/* ------------------------------------------------------------------ */
/* Service catalog                                                     */
/* ------------------------------------------------------------------ */

export interface ServiceItem {
  id: string
  businessId: string
  name: string
  description: string | null
  priceCents: number
  currency: string
  durationMin: number | null
  active: boolean
  sortOrder: number
}

export function useBusinessServices(businessId?: string): LiveResult<ServiceItem[]> {
  const [data, setData] = useState<ServiceItem[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !businessId) return setLoading(false)
    setLoading(true)
    const { data: rows, error: err } = await supabase
      .from("business_services")
      .select("id, business_id, name, description, price_cents, currency, duration_min, active, sort_order")
      .eq("business_id", businessId)
      .order("sort_order", { ascending: true })
    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(
        (rows ?? []).map((r) => ({
          id: r.id,
          businessId: r.business_id,
          name: r.name,
          description: r.description,
          priceCents: r.price_cents,
          currency: r.currency,
          durationMin: r.duration_min,
          active: r.active,
          sortOrder: r.sort_order,
        })),
      )
      setError(null)
    }
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

export async function createService(
  businessId: string,
  input: { name: string; description?: string; priceCents: number; durationMin?: number | null; sortOrder?: number },
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("business_services").insert({
    business_id: businessId,
    name: input.name,
    description: input.description || null,
    price_cents: input.priceCents,
    duration_min: input.durationMin ?? null,
    sort_order: input.sortOrder ?? 0,
  })
  return { error: error?.message ?? null }
}

export async function updateService(
  id: string,
  patch: Partial<{ name: string; description: string | null; priceCents: number; durationMin: number | null; active: boolean }>,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const db: Database["public"]["Tables"]["business_services"]["Update"] = {}
  if (patch.name !== undefined) db.name = patch.name
  if (patch.description !== undefined) db.description = patch.description
  if (patch.priceCents !== undefined) db.price_cents = patch.priceCents
  if (patch.durationMin !== undefined) db.duration_min = patch.durationMin
  if (patch.active !== undefined) db.active = patch.active
  const { error } = await supabase.from("business_services").update(db).eq("id", id)
  return { error: error?.message ?? null }
}

export async function deleteService(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("business_services").delete().eq("id", id)
  return { error: error?.message ?? null }
}

/* ------------------------------------------------------------------ */
/* Owner side — the booking inbox                                      */
/* ------------------------------------------------------------------ */

export interface OwnerBooking {
  id: string
  status: BookingStatus
  scheduledFor: string | null
  createdAt: string
  respondedAt: string | null
  amount: number
  commission: number
  net: number
  currency: string
  customerName: string
  petName: string | null
  petSpecies: string | null
  petBreed: string | null
  serviceName: string | null
  durationMin: number | null
  note: string | null
  declinedReason: string | null
}

export function useOwnerBookings(businessId?: string): LiveResult<OwnerBooking[]> {
  const [data, setData] = useState<OwnerBooking[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !businessId) return setLoading(false)
    setLoading(true)
    const { data: rows, error: err } = await supabase
      .from("service_bookings")
      .select(
        `id, status, scheduled_for, created_at, responded_at, amount_cents, commission_cents, currency,
         customer_note, declined_reason,
         customer:profiles!service_bookings_customer_id_fkey ( full_name ),
         pet:pets!service_bookings_pet_id_fkey ( name, species, breed ),
         service:business_services!service_bookings_service_id_fkey ( name, duration_min )`,
      )
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })

    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    type Row = {
      id: string
      status: string
      scheduled_for: string | null
      created_at: string
      responded_at: string | null
      amount_cents: number
      commission_cents: number
      currency: string
      customer_note: string | null
      declined_reason: string | null
      customer: { full_name: string | null } | { full_name: string | null }[] | null
      pet: { name: string; species: string; breed: string | null } | { name: string }[] | null
      service: { name: string; duration_min: number | null } | { name: string }[] | null
    }

    setData(
      ((rows ?? []) as unknown as Row[]).map((r) => {
        const pet = first(r.pet) as { name: string; species: string; breed: string | null } | null
        const svc = first(r.service) as { name: string; duration_min: number | null } | null
        const amount = (r.amount_cents ?? 0) / 100
        const commission = (r.commission_cents ?? 0) / 100
        return {
          id: r.id,
          status: r.status as BookingStatus,
          scheduledFor: r.scheduled_for,
          createdAt: r.created_at,
          respondedAt: r.responded_at,
          amount,
          commission,
          net: amount - commission,
          currency: r.currency,
          customerName: first(r.customer)?.full_name ?? "Customer",
          petName: pet?.name ?? null,
          petSpecies: pet?.species ?? null,
          petBreed: pet?.breed ?? null,
          serviceName: svc?.name ?? null,
          durationMin: svc?.duration_min ?? null,
          note: r.customer_note,
          declinedReason: r.declined_reason,
        }
      }),
    )
    setError(null)
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

/** Move a booking along the lifecycle (RLS bookings_owner_update). */
export async function setBookingStatus(
  id: string,
  status: BookingStatus,
  opts?: { declinedReason?: string },
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const db: Database["public"]["Tables"]["service_bookings"]["Update"] = { status }
  // First response to a request is what the SLA is measured against.
  if (status === "confirmed" || status === "declined") db.responded_at = new Date().toISOString()
  if (opts?.declinedReason !== undefined) db.declined_reason = opts.declinedReason
  const { error } = await supabase.from("service_bookings").update(db).eq("id", id)
  return { error: error?.message ?? null }
}

/**
 * Mark a completed booking paid. Goes through a SECURITY DEFINER RPC because it
 * also writes a `payments` row, and payments has no INSERT policy.
 */
export async function markBookingPaid(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.rpc("business_mark_booking_paid", { p_booking: id })
  return { error: error?.message ?? null }
}

/* ------------------------------------------------------------------ */
/* Customer side — booking + my bookings                               */
/* ------------------------------------------------------------------ */

export interface CustomerBooking {
  id: string
  status: BookingStatus
  scheduledFor: string | null
  createdAt: string
  amount: number
  currency: string
  businessId: string
  businessName: string
  businessCategory: string
  serviceName: string | null
  petName: string | null
  declinedReason: string | null
  reviewId: string | null
  reviewRating: number | null
}

export function useMyBookings(): LiveResult<CustomerBooking[]> {
  const [data, setData] = useState<CustomerBooking[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setLoading(false)
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setData([])
      setLoading(false)
      return
    }
    const { data: rows, error: err } = await supabase
      .from("service_bookings")
      .select(
        `id, status, scheduled_for, created_at, amount_cents, currency, business_id, declined_reason,
         business:businesses!service_bookings_business_id_fkey ( name, category ),
         service:business_services!service_bookings_service_id_fkey ( name ),
         pet:pets!service_bookings_pet_id_fkey ( name ),
         review:business_reviews!business_reviews_booking_id_fkey ( id, rating )`,
      )
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })

    if (err) {
      setError(err.message)
      setData([])
      setLoading(false)
      return
    }

    type Row = {
      id: string
      status: string
      scheduled_for: string | null
      created_at: string
      amount_cents: number
      currency: string
      business_id: string
      declined_reason: string | null
      business: { name: string; category: string } | { name: string }[] | null
      service: { name: string } | { name: string }[] | null
      pet: { name: string } | { name: string }[] | null
      review: { id: string; rating: number } | { id: string; rating: number }[] | null
    }

    setData(
      ((rows ?? []) as unknown as Row[]).map((r) => {
        const biz = first(r.business) as { name: string; category: string } | null
        const rev = first(r.review) as { id: string; rating: number } | null
        return {
          id: r.id,
          status: r.status as BookingStatus,
          scheduledFor: r.scheduled_for,
          createdAt: r.created_at,
          amount: (r.amount_cents ?? 0) / 100,
          currency: r.currency,
          businessId: r.business_id,
          businessName: biz?.name ?? "Business",
          businessCategory: biz?.category ?? "",
          serviceName: first(r.service)?.name ?? null,
          petName: first(r.pet)?.name ?? null,
          declinedReason: r.declined_reason,
          reviewId: rev?.id ?? null,
          reviewRating: rev?.rating ?? null,
        }
      }),
    )
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

/** Resident books a specific service. Commission is computed at creation time. */
export async function createBooking(input: {
  businessId: string
  serviceId: string
  priceCents: number
  currency?: string
  petId?: string | null
  scheduledFor: string
  note?: string
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Please sign in first." }

  const { error } = await supabase.from("service_bookings").insert({
    business_id: input.businessId,
    customer_id: user.id,
    service_id: input.serviceId,
    pet_id: input.petId ?? null,
    amount_cents: input.priceCents,
    commission_cents: Math.round(input.priceCents * COMMISSION_RATE),
    currency: input.currency ?? "cad",
    status: "requested",
    scheduled_for: input.scheduledFor,
    customer_note: input.note || null,
  })
  return { error: error?.message ?? null }
}

export async function cancelBooking(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("service_bookings").update({ status: "cancelled" }).eq("id", id)
  return { error: error?.message ?? null }
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

export interface ReviewItem {
  id: string
  businessId: string
  bookingId: string | null
  authorName: string
  rating: number
  comment: string | null
  ownerReply: string | null
  repliedAt: string | null
  createdAt: string
}

export function useBusinessReviews(businessId?: string): LiveResult<ReviewItem[]> {
  const [data, setData] = useState<ReviewItem[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !businessId) return setLoading(false)
    setLoading(true)
    const { data: rows, error: err } = await supabase
      .from("business_reviews")
      .select("id, business_id, booking_id, author_name, rating, comment, owner_reply, replied_at, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(
        (rows ?? []).map((r) => ({
          id: r.id,
          businessId: r.business_id,
          bookingId: r.booking_id,
          authorName: r.author_name ?? "Pet owner",
          rating: r.rating,
          comment: r.comment,
          ownerReply: r.owner_reply,
          repliedAt: r.replied_at,
          createdAt: r.created_at,
        })),
      )
      setError(null)
    }
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

/** Only allowed once the booking actually completed (enforced by RLS). */
export async function submitReview(input: {
  businessId: string
  bookingId: string
  rating: number
  comment?: string
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Please sign in first." }
  const { error } = await supabase.from("business_reviews").insert({
    business_id: input.businessId,
    booking_id: input.bookingId,
    author_id: user.id,
    rating: input.rating,
    comment: input.comment || null,
  })
  return { error: error?.message ?? null }
}

export async function replyToReview(id: string, reply: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase
    .from("business_reviews")
    .update({ owner_reply: reply, replied_at: new Date().toISOString() })
    .eq("id", id)
  return { error: error?.message ?? null }
}

/* ------------------------------------------------------------------ */
/* Campaigns (business_listings)                                       */
/* ------------------------------------------------------------------ */

export type CampaignKind = "directory_featured" | "community_sponsored" | "banner"
export const CAMPAIGN_LABEL: Record<CampaignKind, string> = {
  directory_featured: "Featured in directory",
  community_sponsored: "Sponsored in a building feed",
  banner: "Home screen banner",
}

export interface Campaign {
  id: string
  kind: CampaignKind
  buildingId: string | null
  radiusM: number | null
  startsAt: string | null
  endsAt: string | null
  active: boolean
}

export interface TargetBuilding {
  id: string
  name: string
  city: string | null
  petOwners: number
  dogs: number
  cats: number
}

/** Aggregate-only reach data for campaign targeting (never resident identities). */
export function useTargetBuildings(): LiveResult<TargetBuilding[]> {
  const [data, setData] = useState<TargetBuilding[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return setLoading(false)
    setLoading(true)
    const { data: rows, error: err } = await supabase.rpc("targetable_buildings")
    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(
        ((rows ?? []) as { id: string; name: string; city: string | null; pet_owners: number; dogs: number; cats: number }[]).map(
          (r) => ({
            id: r.id,
            name: r.name,
            city: r.city,
            petOwners: Number(r.pet_owners ?? 0),
            dogs: Number(r.dogs ?? 0),
            cats: Number(r.cats ?? 0),
          }),
        ),
      )
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

export function useCampaigns(businessId?: string): LiveResult<Campaign[]> {
  const [data, setData] = useState<Campaign[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !businessId) return setLoading(false)
    setLoading(true)
    const { data: rows, error: err } = await supabase
      .from("business_listings")
      .select("id, kind, building_id, radius_m, starts_at, ends_at, active")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
    if (err) {
      setError(err.message)
      setData([])
    } else {
      setData(
        (rows ?? []).map((r) => ({
          id: r.id,
          kind: r.kind as CampaignKind,
          buildingId: r.building_id,
          radiusM: r.radius_m,
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          active: r.active,
        })),
      )
      setError(null)
    }
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    void refetch()
  }, [refetch])
  return { data, isLoading, error, refetch }
}

export async function createCampaign(input: {
  businessId: string
  kind: CampaignKind
  buildingId?: string | null
  latitude?: number | null
  longitude?: number | null
  radiusM?: number | null
  days: number
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const now = new Date()
  const end = new Date(now.getTime() + input.days * 86_400_000)
  const { error } = await supabase.from("business_listings").insert({
    business_id: input.businessId,
    kind: input.kind,
    building_id: input.buildingId ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    radius_m: input.radiusM ?? null,
    starts_at: now.toISOString(),
    ends_at: end.toISOString(),
    active: true,
  })
  return { error: error?.message ?? null }
}

export async function setCampaignActive(id: string, active: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("business_listings").update({ active }).eq("id", id)
  return { error: error?.message ?? null }
}

export async function deleteCampaign(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return { error: "Not configured." }
  const { error } = await supabase.from("business_listings").delete().eq("id", id)
  return { error: error?.message ?? null }
}

/* ------------------------------------------------------------------ */
/* Earnings (derived from the bookings the owner already has)          */
/* ------------------------------------------------------------------ */

export interface Earnings {
  grossPaid: number
  commissionPaid: number
  netPaid: number
  pipeline: number
  paidCount: number
  completedAwaitingPayment: number
}

export function computeEarnings(bookings: OwnerBooking[]): Earnings {
  const paid = bookings.filter((b) => b.status === "paid")
  const completed = bookings.filter((b) => b.status === "completed")
  const upcoming = bookings.filter((b) => b.status === "confirmed" || b.status === "in_progress")
  return {
    grossPaid: paid.reduce((s, b) => s + b.amount, 0),
    commissionPaid: paid.reduce((s, b) => s + b.commission, 0),
    netPaid: paid.reduce((s, b) => s + b.net, 0),
    pipeline: [...completed, ...upcoming].reduce((s, b) => s + b.net, 0),
    paidCount: paid.length,
    completedAwaitingPayment: completed.length,
  }
}
