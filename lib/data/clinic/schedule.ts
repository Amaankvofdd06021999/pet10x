"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { useLive, must, readOutcome, sentenceFor, type LiveResult } from "./use-live"
import { dayBounds } from "./time"

type ApptRow = Database["public"]["Tables"]["appointments"]["Row"]
export type AppointmentStatus = Database["public"]["Enums"]["appointment_status"]

export interface AppointmentType {
  id: string
  name: string
  durationMin: number
  priceCents: number
  colour: string
  isOnlineBookable: boolean
  requiresConfirmation: boolean
  isActive: boolean
}

export interface Appointment {
  id: string
  startsAt: string
  endsAt: string
  status: AppointmentStatus
  reason: string | null
  note: string | null
  source: string
  patientId: string | null
  patientName: string
  species: string | null
  isLinked: boolean
  customerId: string | null
  customerName: string
  customerPhone: string | null
  staffId: string | null
  staffName: string
  typeId: string | null
  typeName: string
  colour: string
  arrivedAt: string | null
  behaviouralAlert: string | null
}

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  requested: "Requested",
  booked: "Booked",
  arrived: "Arrived",
  in_progress: "In room",
  ready: "Ready",
  completed: "Completed",
  no_show: "No show",
  cancelled: "Cancelled",
}

/** Which moves the console offers. The database holds the same table. */
export const NEXT_STATUS: Record<AppointmentStatus, AppointmentStatus[]> = {
  requested: ["booked", "cancelled"],
  booked: ["arrived", "no_show", "cancelled"],
  arrived: ["in_progress", "cancelled", "no_show"],
  in_progress: ["ready", "completed"],
  ready: ["completed", "in_progress"],
  completed: [],
  no_show: ["booked", "cancelled"],
  cancelled: [],
}

export const OPEN_STATUSES: AppointmentStatus[] = [
  "requested",
  "booked",
  "arrived",
  "in_progress",
  "ready",
]

const APPT_SELECT =
  "*, clinic_patients(id, name, species, pet_id, behavioural_alert), clinic_customers(id, first_name, last_name, phone), appointment_types(id, name, colour), business_staff(id, profiles!business_staff_profile_id_fkey(full_name))"

type ApptJoined = ApptRow & {
  clinic_patients: { id: string; name: string; species: string; pet_id: string | null; behavioural_alert: string | null } | null
  clinic_customers: { id: string; first_name: string; last_name: string | null; phone: string | null } | null
  appointment_types: { id: string; name: string; colour: string } | null
  business_staff: { id: string; profiles: { full_name: string | null } | null } | null
}

function mapAppointment(r: ApptJoined): Appointment {
  return {
    id: r.id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status,
    reason: r.reason,
    note: r.note,
    source: r.source,
    patientId: r.patient_id,
    patientName: r.clinic_patients?.name ?? "Unassigned",
    species: r.clinic_patients?.species ?? null,
    isLinked: Boolean(r.clinic_patients?.pet_id),
    customerId: r.customer_id,
    customerName: r.clinic_customers
      ? [r.clinic_customers.first_name, r.clinic_customers.last_name].filter(Boolean).join(" ")
      : "—",
    customerPhone: r.clinic_customers?.phone ?? null,
    staffId: r.staff_id,
    staffName: r.business_staff?.profiles?.full_name ?? "Unassigned",
    typeId: r.type_id,
    typeName: r.appointment_types?.name ?? r.reason ?? "Appointment",
    colour: r.appointment_types?.colour ?? "#0E6E68",
    arrivedAt: r.arrived_at,
    behaviouralAlert: r.clinic_patients?.behavioural_alert ?? null,
  }
}

export function useAppointmentTypes(businessId: string | null): LiveResult<AppointmentType[]> {
  return useLive<AppointmentType[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("appointment_types")
          .select("*")
          .eq("business_id", businessId as string)
          .order("sort_order"),
      ) as Array<Database["public"]["Tables"]["appointment_types"]["Row"]>
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        durationMin: r.duration_min,
        priceCents: r.price_cents,
        colour: r.colour,
        isOnlineBookable: r.is_online_bookable,
        requiresConfirmation: r.requires_confirmation,
        isActive: r.is_active,
      }))
    },
    [businessId],
    Boolean(businessId),
  )
}

/** One day of the book, in the practice's own timezone. */
export function useDayAppointments(
  businessId: string | null,
  dateISO: string,
  tz: string,
): LiveResult<Appointment[]> {
  return useLive<Appointment[]>(
    [],
    async (db) => {
      const { from, to } = dayBounds(dateISO, tz)
      const rows = must(
        await db
          .from("appointments")
          .select(APPT_SELECT)
          .eq("business_id", businessId as string)
          .gte("starts_at", from)
          .lt("starts_at", to)
          .order("starts_at"),
      ) as ApptJoined[]
      return rows.map(mapAppointment)
    },
    [businessId, dateISO, tz],
    Boolean(businessId),
  )
}

/** Everything still open, whatever day it sits on — drives the Today board. */
export function useOpenAppointments(businessId: string | null, tz: string): LiveResult<Appointment[]> {
  return useLive<Appointment[]>(
    [],
    async (db) => {
      const { from, to } = dayBounds(new Date().toISOString().slice(0, 10), tz)
      const rows = must(
        await db
          .from("appointments")
          .select(APPT_SELECT)
          .eq("business_id", businessId as string)
          .in("status", OPEN_STATUSES)
          .gte("starts_at", new Date(Date.parse(from) - 3 * 86400_000).toISOString())
          .lt("starts_at", to)
          .order("starts_at"),
      ) as ApptJoined[]
      return rows.map(mapAppointment)
    },
    [businessId, tz],
    Boolean(businessId),
  )
}

export function usePatientAppointments(patientId: string | null): LiveResult<Appointment[]> {
  return useLive<Appointment[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("appointments")
          .select(APPT_SELECT)
          .eq("patient_id", patientId as string)
          .order("starts_at", { ascending: false })
          .limit(50),
      ) as ApptJoined[]
      return rows.map(mapAppointment)
    },
    [patientId],
    Boolean(patientId),
  )
}

export interface NewAppointmentInput {
  businessId: string
  patientId: string
  customerId: string | null
  typeId: string
  staffId: string | null
  locationId: string | null
  startsAt: string
  durationMin: number
  reason?: string
  note?: string
  source?: string
}

export async function createAppointment(input: NewAppointmentInput): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const start = new Date(input.startsAt)
  if (Number.isNaN(start.getTime())) return { error: "That start time is not valid." }
  const end = new Date(start.getTime() + input.durationMin * 60_000)

  // The database has no overlap constraint, so the console checks before it
  // writes. A clash is still possible under a race; that is why the clash is a
  // warning here and never silent corruption.
  if (input.staffId) {
    const { data: clash } = await db
      .from("appointments")
      .select("id")
      .eq("staff_id", input.staffId)
      .in("status", OPEN_STATUSES)
      .lt("starts_at", end.toISOString())
      .gt("ends_at", start.toISOString())
      .limit(1)
    if (clash && clash.length > 0) {
      return { error: "That clinician already has an appointment overlapping this time." }
    }
  }

  const { error } = await db.from("appointments").insert({
    business_id: input.businessId,
    patient_id: input.patientId,
    customer_id: input.customerId,
    type_id: input.typeId,
    staff_id: input.staffId,
    location_id: input.locationId,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    reason: input.reason ?? null,
    note: input.note ?? null,
    source: input.source ?? "staff",
    status: "booked",
  })
  return { error: error?.message ?? null }
}

export async function setAppointmentStatus(
  appointmentId: string,
  status: AppointmentStatus,
  note?: string,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("clinic_set_appointment_status", {
    p_appointment: appointmentId,
    p_status: status,
    p_note: note ?? undefined,
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  return { error: out.ok ? null : sentenceFor(out.error) }
}

export async function rescheduleAppointment(
  appointmentId: string,
  startsAt: string,
  durationMin: number,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const start = new Date(startsAt)
  const end = new Date(start.getTime() + durationMin * 60_000)
  const { error } = await db
    .from("appointments")
    .update({ starts_at: start.toISOString(), ends_at: end.toISOString() })
    .eq("id", appointmentId)
  return { error: error?.message ?? null }
}

export async function openVisitForAppointment(
  appointmentId: string,
): Promise<{ error: string | null; visitId?: string }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("clinic_open_visit", { p_appointment: appointmentId })
  if (error) return { error: error.message }
  return { error: null, visitId: data as string }
}

export interface Slot {
  startsAt: string
  endsAt: string
  staffId: string
  staffName: string
}

export function useAvailableSlots(
  businessId: string | null,
  typeId: string | null,
  dateISO: string,
): LiveResult<Slot[]> {
  return useLive<Slot[]>(
    [],
    async (db) => {
      const { data, error } = await db.rpc("clinic_available_slots", {
        p_business: businessId as string,
        p_type: typeId as string,
        p_date: dateISO,
      })
      if (error) throw new Error(error.message)
      const raw = (Array.isArray(data) ? data : []) as Array<Record<string, string>>
      return raw.map((s) => ({
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        staffId: s.staff_id,
        staffName: s.staff_name,
      }))
    },
    [businessId, typeId, dateISO],
    Boolean(businessId && typeId),
  )
}
