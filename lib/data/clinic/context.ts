"use client"

import { useCallback, useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { useLive, must, type LiveResult } from "./use-live"

export type ClinicRole = Database["public"]["Enums"]["clinic_staff_role"]
export type BusinessTier = Database["public"]["Enums"]["business_tier"]

export interface ClinicMembership {
  businessId: string
  name: string
  kind: string
  role: ClinicRole
  tier: BusinessTier
  staffId: string
  /** Owning the business confers administration whatever the clinical role is. */
  isOwner: boolean
}

export interface ClinicLocation {
  id: string
  name: string
  address: string | null
  city: string | null
  phone: string | null
  timezone: string
  isPrimary: boolean
  isActive: boolean
  hours: Record<string, string>
  afterHoursNote: string | null
}

const ACTIVE_KEY = "pet10x.clinic.active"

/** Every practice this person works at. Owners appear even with no staff row. */
export function useMyClinics(): LiveResult<ClinicMembership[]> {
  return useLive<ClinicMembership[]>(
    [],
    async (db) => {
      const { data: auth } = await db.auth.getUser()
      const uid = auth.user?.id
      if (!uid) return []
      const rows = must(
        await db
          .from("business_staff")
          .select("id, role, business_id, businesses(id, name, business_kind, tier, owner_id)")
          .eq("profile_id", uid)
          .eq("is_active", true),
      ) as Array<{
        id: string
        role: ClinicRole
        business_id: string
        businesses: {
          id: string
          name: string
          business_kind: string
          tier: BusinessTier
          owner_id: string
        } | null
      }>
      return rows
        .filter((r) => r.businesses)
        .map((r) => ({
          businessId: r.business_id,
          name: r.businesses?.name ?? "Practice",
          kind: r.businesses?.business_kind ?? "other",
          role: r.role,
          tier: r.businesses?.tier ?? "registered",
          staffId: r.id,
          isOwner: r.businesses?.owner_id === uid,
        }))
    },
    [],
  )
}

/**
 * The practice the console is currently showing. Remembered per browser so a
 * receptionist at a two-site group does not re-pick every morning.
 */
export function useActiveClinic() {
  const { data: clinics, isLoading, error, refetch } = useMyClinics()
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (clinics.length === 0) return
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(ACTIVE_KEY)
    } catch {
      stored = null
    }
    const match = clinics.find((c) => c.businessId === stored)
    setActiveId(match ? match.businessId : clinics[0].businessId)
  }, [clinics])

  const setActive = useCallback((id: string) => {
    setActiveId(id)
    try {
      window.localStorage.setItem(ACTIVE_KEY, id)
    } catch {
      /* private browsing — the choice simply does not persist */
    }
  }, [])

  const clinic = clinics.find((c) => c.businessId === activeId) ?? null
  return { clinic, clinics, setActive, isLoading, error, refetch }
}

export function useClinicLocations(businessId: string | null): LiveResult<ClinicLocation[]> {
  return useLive<ClinicLocation[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("business_locations")
          .select("*")
          .eq("business_id", businessId as string)
          .order("is_primary", { ascending: false })
          .order("name"),
      ) as Array<Database["public"]["Tables"]["business_locations"]["Row"]>
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        address: r.address,
        city: r.city,
        phone: r.phone,
        timezone: r.timezone,
        isPrimary: r.is_primary,
        isActive: r.is_active,
        hours: (r.hours as Record<string, string>) ?? {},
        afterHoursNote: r.after_hours_note,
      }))
    },
    [businessId],
    Boolean(businessId),
  )
}

export interface ClinicStaffMember {
  id: string
  profileId: string
  name: string
  email: string | null
  role: ClinicRole
  title: string | null
  isBookable: boolean
  isActive: boolean
  colour: string | null
  licenceNumber: string | null
  licenceExpiresOn: string | null
}

export function useClinicStaff(businessId: string | null): LiveResult<ClinicStaffMember[]> {
  return useLive<ClinicStaffMember[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("business_staff")
          .select("*, profiles!business_staff_profile_id_fkey(full_name, email)")
          .eq("business_id", businessId as string)
          .order("role"),
      ) as Array<
        Database["public"]["Tables"]["business_staff"]["Row"] & {
          profiles: { full_name: string | null; email: string | null } | null
        }
      >
      return rows.map((r) => ({
        id: r.id,
        profileId: r.profile_id,
        name: r.profiles?.full_name ?? "Team member",
        email: r.profiles?.email ?? null,
        role: r.role,
        title: r.title,
        isBookable: r.is_bookable,
        isActive: r.is_active,
        colour: r.colour,
        licenceNumber: r.licence_number,
        licenceExpiresOn: r.licence_expires_on,
      }))
    },
    [businessId],
    Boolean(businessId),
  )
}

/** What this role may do. Mirrors the capability table in the design document. */
export function capabilities(
  role: ClinicRole | null,
  tier: BusinessTier | null,
  isOwner = false,
) {
  const clinical = role === "owner" || role === "veterinarian" || role === "nurse"
  const admin = isOwner || role === "owner" || role === "manager"
  const verified = tier === "verified"
  return {
    bookAppointments: role !== null,
    editCustomers: role !== null,
    recordVisits: clinical,
    readSharedRecords: clinical && verified,
    publishRecords: clinical && verified,
    emergencyPull: clinical && verified,
    workReminders: admin || role === "reception" || role === "nurse",
    takePayment: admin || role === "reception" || role === "veterinarian",
    manageShop: admin || clinical,
    manageTeam: admin,
    exportData: admin,
  }
}

export async function updateLocation(
  id: string,
  patch: Database["public"]["Tables"]["business_locations"]["Update"],
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { error } = await db.from("business_locations").update(patch).eq("id", id)
  return { error: error?.message ?? null }
}

export async function updateStaff(
  id: string,
  patch: Database["public"]["Tables"]["business_staff"]["Update"],
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { error } = await db.from("business_staff").update(patch).eq("id", id)
  return { error: error?.message ?? null }
}
