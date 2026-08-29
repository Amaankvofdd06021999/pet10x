"use client"

import type { Database } from "@/lib/supabase/database.types"
import { useLive, must, type LiveResult } from "./clinic/use-live"

/**
 * Business types, and what each one's console looks like.
 *
 * The list lives in the database, not in this file, so adding "pet taxi" is one
 * INSERT rather than a migration and a deploy. A module this client does not
 * recognise is IGNORED rather than crashing the console, which is what lets a
 * new module be seeded before its screen ships.
 */

export type BusinessTypeRow = Database["public"]["Tables"]["business_types"]["Row"]

/** Every console module this build knows how to render. */
export const KNOWN_MODULES = [
  "schedule",
  "bookings",
  "clients",
  "medical",
  "grooming",
  "boarding",
  "daycare",
  "classes",
  "reminders",
  "shop",
  "invoices",
  "emergency",
  "records_sharing",
  "storefront",
  "team",
] as const

export type ModuleKey = (typeof KNOWN_MODULES)[number]

export interface BusinessType {
  code: string
  label: string
  pluralLabel: string
  description: string | null
  icon: string | null
  /** Only modules this build can actually render. */
  modules: ModuleKey[]
  /** Everything the row asked for, including modules we do not know yet. */
  declaredModules: string[]
  subjectLabel: string
  subjectPlural: string
  clientLabel: string
  mayRequestRecords: boolean
}

function mapType(r: BusinessTypeRow): BusinessType {
  const declared = r.modules ?? []
  return {
    code: r.code,
    label: r.label,
    pluralLabel: r.plural_label ?? r.label,
    description: r.description,
    icon: r.icon,
    modules: declared.filter((m): m is ModuleKey =>
      (KNOWN_MODULES as readonly string[]).includes(m),
    ),
    declaredModules: declared,
    subjectLabel: r.subject_label,
    subjectPlural: r.subject_plural,
    clientLabel: r.client_label,
    mayRequestRecords: r.may_request_records,
  }
}

/** The signup picker and the admin registry both read this. */
export function useBusinessTypes(): LiveResult<BusinessType[]> {
  return useLive<BusinessType[]>(
    [],
    async (db) => {
      const rows = must(
        await db
          .from("business_types")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
      ) as BusinessTypeRow[]
      return rows.map(mapType)
    },
    [],
  )
}

export function useBusinessType(code: string | null): LiveResult<BusinessType | null> {
  return useLive<BusinessType | null>(
    null,
    async (db) => {
      const rows = must(
        await db.from("business_types").select("*").eq("code", code as string).limit(1),
      ) as BusinessTypeRow[]
      return rows[0] ? mapType(rows[0]) : null
    },
    [code],
    Boolean(code),
  )
}

/**
 * A safe default for a type we could not load. Deliberately minimal: a console
 * that shows too little is recoverable, one that shows a groomer the medical
 * tab is not.
 */
export const FALLBACK_TYPE: BusinessType = {
  code: "other",
  label: "Pet service",
  pluralLabel: "Pet services",
  description: null,
  icon: "paw-print",
  modules: ["clients", "bookings", "invoices", "storefront", "team"],
  declaredModules: ["clients", "bookings", "invoices", "storefront", "team"],
  subjectLabel: "Pet",
  subjectPlural: "Pets",
  clientLabel: "Customer",
  mayRequestRecords: false,
}

export function hasModule(type: BusinessType | null, m: ModuleKey): boolean {
  return (type ?? FALLBACK_TYPE).modules.includes(m)
}
