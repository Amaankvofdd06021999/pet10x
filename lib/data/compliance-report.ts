/**
 * Pet10x — the building compliance report (manager Settings › Compliance
 * Report), and the per-pet census CSV the strata board pack shares.
 *
 * Pure: the hook in ./compliance-report-live.ts reads the rows, this turns
 * them into the summary, the expiry list and the CSV, and vitest pins it.
 * Compliance itself is `computeCompliance` — the one calculation the
 * dashboard, the strata overview and the bylaws preview already use — so the
 * report cannot disagree with the dashboard about who is compliant.
 */

import { computeCompliance, type BuildingRules } from "./compliance"
import { toCsv } from "@/lib/csv"

export interface ReportPet {
  id: string
  name: string
  species: string
  breed: string | null
  unit: string | null
  registrationStatus: string
  neutered: boolean | null
  /** `recordedAt` orders records of the same vaccine: given_on, else created_at. */
  vax: { name: string; status: string; expiresOn: string | null; recordedAt?: string | null }[]
  docs: { kind: string; status: string; expiresOn: string | null; recordedAt?: string | null }[]
}

/**
 * The records that currently stand: per vaccine (by name, case-insensitive)
 * and per document kind, the most recent one that was not rejected. A rabies
 * shot replaced last spring, or a licence the manager rejected, is history —
 * counting its expiry would report a pet "expired" that is in fact covered.
 * A record with no date sorts oldest, so a dated replacement always wins.
 */
export function currentRecords(p: Pick<ReportPet, "vax" | "docs">): Pick<ReportPet, "vax" | "docs"> {
  const latest = <T extends { status: string; recordedAt?: string | null }>(items: T[], key: (t: T) => string) => {
    const by = new Map<string, T>()
    for (const it of items) {
      if (it.status === "rejected") continue
      const k = key(it)
      const prev = by.get(k)
      if (!prev || (it.recordedAt ?? "") > (prev.recordedAt ?? "")) by.set(k, it)
    }
    return [...by.values()]
  }
  return {
    vax: latest(p.vax, (v) => v.name.trim().toLowerCase()),
    docs: latest(p.docs, (d) => d.kind),
  }
}

export interface ExpiringItem {
  petId: string
  pet: string
  unit: string | null
  item: string
  kind: "vaccination" | "document"
  expiresOn: string
  expired: boolean
}

export interface ComplianceReport {
  pets: number
  registered: number
  pending: number
  compliant: number
  nonCompliant: number
  /** "Rabies" → 3: how many pets miss each required item, largest first. */
  missingByItem: { item: string; pets: number }[]
  /** Expired, or expiring within 30 days of `today`, soonest first. */
  expiring: ExpiringItem[]
  /** Open cases per stage, ladder order. */
  openByStage: { stage: string; count: number }[]
  rows: (ReportPet & { compliancePct: number; missing: string[] })[]
}

const DOC_LABEL: Record<string, string> = {
  vaccination: "Vaccination record",
  municipal_license: "Municipal licence",
  liability_insurance: "Liability insurance",
  building_registration: "Building registration",
  microchip_registration: "Microchip registration",
  esa_letter: "ESA letter",
  provider_license: "Provider licence",
  other: "Document",
}

const OPEN_STAGES = ["open", "warning", "fine_1", "fine_2"]
export const STAGE_LABEL: Record<string, string> = {
  open: "Open",
  warning: "Warning",
  fine_1: "First fine",
  fine_2: "Second fine",
}

/** Whole days from `today` (YYYY-MM-DD) to `date` (YYYY-MM-DD); negative is past. */
function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}

export function buildComplianceReport(input: {
  pets: ReportPet[]
  rules: BuildingRules
  openCaseStages: string[]
  /** YYYY-MM-DD, the building's today. */
  today: string
}): ComplianceReport {
  const rows = input.pets.map((p) => {
    const { pct, missing } = computeCompliance({ neutered: p.neutered, vax: p.vax, docs: p.docs }, input.rules)
    return { ...p, compliancePct: pct, missing }
  })

  const missingCounts = new Map<string, number>()
  for (const r of rows) for (const m of r.missing) missingCounts.set(m, (missingCounts.get(m) ?? 0) + 1)

  const expiring: ExpiringItem[] = []
  for (const p of input.pets) {
    const standing = currentRecords(p)
    const items = [
      ...standing.vax.map((v) => ({ item: v.name, kind: "vaccination" as const, expiresOn: v.expiresOn })),
      ...standing.docs.map((d) => ({ item: DOC_LABEL[d.kind] ?? "Document", kind: "document" as const, expiresOn: d.expiresOn })),
    ]
    for (const it of items) {
      if (!it.expiresOn) continue
      const days = daysUntil(it.expiresOn, input.today)
      if (days > 30) continue
      expiring.push({
        petId: p.id,
        pet: p.name,
        unit: p.unit,
        item: it.item,
        kind: it.kind,
        expiresOn: it.expiresOn,
        expired: days < 0,
      })
    }
  }
  expiring.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.pet.localeCompare(b.pet))

  return {
    pets: rows.length,
    registered: rows.filter((r) => r.registrationStatus === "approved").length,
    pending: rows.filter((r) => r.registrationStatus === "pending" || r.registrationStatus === "info_requested").length,
    compliant: rows.filter((r) => r.compliancePct === 100).length,
    nonCompliant: rows.filter((r) => r.compliancePct < 100).length,
    missingByItem: [...missingCounts.entries()]
      .map(([item, pets]) => ({ item, pets }))
      .sort((a, b) => b.pets - a.pets || a.item.localeCompare(b.item)),
    expiring,
    openByStage: OPEN_STAGES.map((stage) => ({
      stage,
      count: input.openCaseStages.filter((s) => s === stage).length,
    })),
    rows,
  }
}

/**
 * The per-pet census, as CSV. The strata board pack writes the first five
 * columns; the building report adds unit, registration and the next expiry.
 */
export function complianceCensusCsv(
  pets: {
    name: string
    species: string
    breed: string | null
    compliancePct: number
    missing: string[]
    unit?: string | null
    registrationStatus?: string
    nextExpiry?: string | null
  }[],
  opts: { detailed?: boolean } = {},
): string {
  const rows = pets.map((p) => ({
    pet: p.name,
    species: p.species,
    breed: p.breed || "—",
    compliance_pct: p.compliancePct,
    missing: p.missing.join("; ") || "—",
    unit: p.unit ?? "—",
    registration: p.registrationStatus ? p.registrationStatus.replace(/_/g, " ") : "—",
    next_expiry: p.nextExpiry ?? "—",
  }))
  const base = [
    { key: "pet", label: "Pet" },
    { key: "species", label: "Species" },
    { key: "breed", label: "Breed" },
    { key: "compliance_pct", label: "Compliance %" },
    { key: "missing", label: "Missing requirements" },
  ]
  const detail = [
    { key: "unit", label: "Unit" },
    { key: "registration", label: "Registration" },
    { key: "next_expiry", label: "Next expiry" },
  ]
  return toCsv(rows, opts.detailed ? [...base, ...detail] : base)
}

/** The soonest expiry among the records that currently stand, for the CSV. */
export function nextExpiry(p: Pick<ReportPet, "vax" | "docs">): string | null {
  const standing = currentRecords(p)
  const dates = [...standing.vax, ...standing.docs].map((x) => x.expiresOn).filter((d): d is string => !!d)
  return dates.length ? dates.sort()[0] : null
}
