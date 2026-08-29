"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import type { Database } from "@/lib/supabase/database.types"
import { useLive, must, readOutcome, sentenceFor, type LiveResult } from "./use-live"

export interface ReminderItem {
  id: string
  kind: string
  label: string
  dueOn: string
  status: string
  channel: string
  note: string | null
  snoozedUntil: string | null
  patientId: string | null
  patientName: string
  species: string | null
  isLinked: boolean
  customerId: string | null
  customerName: string
  customerPhone: string | null
  serviceReminders: boolean
}

const ITEM_SELECT =
  "*, clinic_patients(id, name, species, pet_id), clinic_customers(id, first_name, last_name, phone, service_reminders)"

type ItemJoined = Database["public"]["Tables"]["reminder_items"]["Row"] & {
  clinic_patients: { id: string; name: string; species: string; pet_id: string | null } | null
  clinic_customers: {
    id: string
    first_name: string
    last_name: string | null
    phone: string | null
    service_reminders: boolean
  } | null
}

function mapItem(r: ItemJoined): ReminderItem {
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    dueOn: r.due_on,
    status: r.status,
    channel: r.channel,
    note: r.note,
    snoozedUntil: r.snoozed_until,
    patientId: r.patient_id,
    patientName: r.clinic_patients?.name ?? "Patient",
    species: r.clinic_patients?.species ?? null,
    isLinked: Boolean(r.clinic_patients?.pet_id),
    customerId: r.customer_id,
    customerName: r.clinic_customers
      ? [r.clinic_customers.first_name, r.clinic_customers.last_name].filter(Boolean).join(" ")
      : "—",
    customerPhone: r.clinic_customers?.phone ?? null,
    serviceReminders: r.clinic_customers?.service_reminders ?? true,
  }
}

/**
 * The call list. One queue, most overdue first, with the phone number right
 * there — because working a call list is a real job in a practice and most
 * software buries it behind a bulk-email screen.
 */
export function useReminderQueue(
  businessId: string | null,
  status: string[] = ["pending", "snoozed"],
): LiveResult<ReminderItem[]> {
  return useLive<ReminderItem[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("reminder_items")
          .select(ITEM_SELECT)
          .eq("business_id", businessId as string)
          .in("status", status)
          .order("due_on")
          .limit(300),
      ) as ItemJoined[]
      return rows.map(mapItem)
    },
    [businessId, status.join(",")],
    Boolean(businessId),
  )
}

export interface ReminderRule {
  id: string
  name: string
  triggerKind: string
  leadDays: number
  channel: string
  isActive: boolean
}

export function useReminderRules(businessId: string | null): LiveResult<ReminderRule[]> {
  return useLive<ReminderRule[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("reminder_rules")
          .select("*")
          .eq("business_id", businessId as string)
          .order("name"),
      ) as Array<Database["public"]["Tables"]["reminder_rules"]["Row"]>
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        triggerKind: r.trigger_kind,
        leadDays: r.lead_days,
        channel: r.channel,
        isActive: r.is_active,
      }))
    },
    [businessId],
    Boolean(businessId),
  )
}

export async function generateReminders(businessId: string): Promise<{ error: string | null; created?: number }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("clinic_generate_reminders", { p_business: businessId })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  if (!out.ok) return { error: sentenceFor(out.error) }
  return { error: null, created: Number(out.created ?? 0) }
}

export type ReminderAction = "snooze" | "done" | "booked" | "suppress" | "log_call" | "notify"

export async function actOnReminder(
  itemId: string,
  action: ReminderAction,
  note?: string,
  days?: number,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { data, error } = await db.rpc("clinic_reminder_action", {
    p_item: itemId,
    p_action: action,
    p_note: note ?? undefined,
    p_days: days ?? undefined,
  })
  if (error) return { error: error.message }
  const out = readOutcome(data)
  return { error: out.ok ? null : sentenceFor(out.error) }
}

export async function saveReminderRule(input: {
  id?: string
  businessId: string
  name: string
  triggerKind: string
  leadDays: number
  channel: string
  isActive: boolean
}): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  if (!input.name.trim()) return { error: "Give the rule a name." }
  const payload = {
    business_id: input.businessId,
    name: input.name.trim(),
    trigger_kind: input.triggerKind,
    lead_days: input.leadDays,
    channel: input.channel,
    is_active: input.isActive,
  }
  const { error } = input.id
    ? await db.from("reminder_rules").update(payload).eq("id", input.id)
    : await db.from("reminder_rules").insert(payload)
  return { error: error?.message ?? null }
}

/* ------------------------------ tasks ----------------------------------- */

export interface ClinicTask {
  id: string
  title: string
  detail: string | null
  dueOn: string | null
  status: string
}

export function useClinicTasks(businessId: string | null): LiveResult<ClinicTask[]> {
  return useLive<ClinicTask[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("clinic_tasks")
          .select("*")
          .eq("business_id", businessId as string)
          .eq("status", "open")
          .order("due_on", { nullsFirst: false })
          .limit(50),
      ) as Array<Database["public"]["Tables"]["clinic_tasks"]["Row"]>
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        detail: r.detail,
        dueOn: r.due_on,
        status: r.status,
      }))
    },
    [businessId],
    Boolean(businessId),
  )
}

export async function addTask(
  businessId: string,
  title: string,
  dueOn?: string,
): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  if (!title.trim()) return { error: "What is the task?" }
  const { error } = await db
    .from("clinic_tasks")
    .insert({ business_id: businessId, title: title.trim(), due_on: dueOn || null })
  return { error: error?.message ?? null }
}

export async function completeTask(id: string): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { error } = await db
    .from("clinic_tasks")
    .update({ status: "done", done_at: new Date().toISOString() })
    .eq("id", id)
  return { error: error?.message ?? null }
}

/* ------------------------- communication log ---------------------------- */

export interface CommunicationEntry {
  id: string
  channel: string
  direction: string
  subject: string | null
  body: string | null
  outcome: string | null
  occurredAt: string
}

export function useCommunicationLog(customerId: string | null): LiveResult<CommunicationEntry[]> {
  return useLive<CommunicationEntry[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("communication_log")
          .select("*")
          .eq("customer_id", customerId as string)
          .order("occurred_at", { ascending: false })
          .limit(50),
      ) as Array<Database["public"]["Tables"]["communication_log"]["Row"]>
      return rows.map((r) => ({
        id: r.id,
        channel: r.channel,
        direction: r.direction,
        subject: r.subject,
        body: r.body,
        outcome: r.outcome,
        occurredAt: r.occurred_at,
      }))
    },
    [customerId],
    Boolean(customerId),
  )
}

export async function logCommunication(input: {
  businessId: string
  customerId: string
  patientId?: string | null
  channel: string
  subject?: string
  body?: string
  outcome?: string
}): Promise<{ error: string | null }> {
  const db = getSupabaseBrowserClient()
  if (!db) return { error: "Not configured." }
  const { error } = await db.from("communication_log").insert({
    business_id: input.businessId,
    customer_id: input.customerId,
    patient_id: input.patientId ?? null,
    channel: input.channel,
    subject: input.subject ?? null,
    body: input.body ?? null,
    outcome: input.outcome ?? null,
  })
  return { error: error?.message ?? null }
}
