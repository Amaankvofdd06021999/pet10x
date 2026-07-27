import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import type { SuggestionKind } from "../types"

/**
 * Pet10x — suggestion rules.
 *
 * Every rule here is deterministic and reads real rows. The model is never
 * asked whether something is due; it is only asked, later and separately, to
 * write the sentence. That separation is the difference between a nudge an
 * owner can trust and one that invents a medication schedule.
 *
 * A rule that cannot be computed from the schema does not ship. `medication_due`
 * depends on pet_medications.next_due_at, added in 20260727000000 — rows still
 * carrying only the old free-text `next_due` are skipped rather than parsed.
 */

type Client = SupabaseClient<Database>

export interface RuleHit {
  petId: string
  petName: string
  kind: SuggestionKind
  severity: "info" | "warning" | "error"
  /** Fallback copy, used verbatim when the copy model is unavailable. */
  title: string
  /** The plain facts handed to the copy model. It may rephrase, never extend. */
  facts: string
  actionLabel: string | null
  actionTarget: string | null
  /** The rows that fired it, so the card can explain itself. */
  evidence: Record<string, unknown>
  /** Stable per (pet, thing, period) — the unique index makes re-runs idempotent. */
  dedupeKey: string
  validUntil: string | null
}

interface PetRow {
  id: string
  name: string
}

const DAY = 86_400_000

/* ------------------------------ vaccination ------------------------------ */

/** Fires within 30 days of expiry, or once already past. Severity scales with proximity. */
async function vaccinationDue(supabase: Client, pets: PetRow[]): Promise<RuleHit[]> {
  const horizon = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10)
  const { data } = await supabase
    .from("pet_vaccinations")
    .select("id, pet_id, name, expires_on, status")
    .in("pet_id", pets.map((p) => p.id))
    .not("expires_on", "is", null)
    .lte("expires_on", horizon)

  const hits: RuleHit[] = []
  for (const row of data ?? []) {
    if (!row.expires_on || row.status === "rejected") continue
    const pet = pets.find((p) => p.id === row.pet_id)
    if (!pet) continue

    const days = Math.round((new Date(row.expires_on).getTime() - Date.now()) / DAY)
    const overdue = days < 0
    hits.push({
      petId: pet.id,
      petName: pet.name,
      kind: "vaccination_due",
      severity: overdue ? "error" : days <= 7 ? "warning" : "info",
      title: overdue
        ? `${pet.name}'s ${row.name} vaccination expired ${Math.abs(days)} day${days === -1 ? "" : "s"} ago`
        : `${pet.name}'s ${row.name} booster expires in ${days} day${days === 1 ? "" : "s"}`,
      facts: overdue
        ? `${pet.name}'s ${row.name} vaccination expired on ${row.expires_on}, ${Math.abs(days)} days ago.`
        : `${pet.name}'s ${row.name} vaccination expires on ${row.expires_on}, in ${days} days.`,
      actionLabel: "View record",
      actionTarget: `pet-detail:${pet.id}`,
      evidence: { vaccination_id: row.id, name: row.name, expires_on: row.expires_on, days_remaining: days },
      // Re-keyed per expiry date, so a renewed booster produces a fresh nudge.
      dedupeKey: `vaccination_due:${row.id}:${row.expires_on}`,
      // Measured from now, not from the expiry date: an already-overdue
      // vaccination is the most urgent card there is, and dating the window
      // from `expires_on` would hide it the moment it mattered most.
      validUntil: horizonFromNow(30),
    })
  }
  return hits
}

/* ------------------------------ medication ------------------------------- */

/** Fires within 3 days of the next dose, or once overdue. Needs next_due_at. */
async function medicationDue(supabase: Client, pets: PetRow[]): Promise<RuleHit[]> {
  const horizon = new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10)
  const { data } = await supabase
    .from("pet_medications")
    .select("id, pet_id, name, dosage, frequency, next_due_at, reminder")
    .in("pet_id", pets.map((p) => p.id))
    .not("next_due_at", "is", null)
    .lte("next_due_at", horizon)

  const hits: RuleHit[] = []
  for (const row of data ?? []) {
    if (!row.next_due_at || !row.reminder) continue
    const pet = pets.find((p) => p.id === row.pet_id)
    if (!pet) continue

    const days = Math.round((new Date(row.next_due_at).getTime() - Date.now()) / DAY)
    const overdue = days < 0
    const when = overdue ? `was due ${Math.abs(days)} day${days === -1 ? "" : "s"} ago` : days === 0 ? "is due today" : `is due in ${days} day${days === 1 ? "" : "s"}`

    hits.push({
      petId: pet.id,
      petName: pet.name,
      kind: "medication_due",
      severity: overdue ? "error" : "warning",
      // Deliberately names the medication but never its dose — the app shows
      // the owner's own recorded dosage on the pet screen, the nudge does not
      // restate it as if it were advice.
      title: `${pet.name}'s ${row.name} ${when}`,
      facts: `${pet.name}'s medication ${row.name} ${when} (scheduled ${row.next_due_at}). Do not mention any dose or amount.`,
      actionLabel: "Log it",
      actionTarget: `pet-care:${pet.id}`,
      evidence: { medication_id: row.id, name: row.name, next_due_at: row.next_due_at, days_remaining: days },
      dedupeKey: `medication_due:${row.id}:${row.next_due_at}`,
      // From now, for the same reason as vaccination_due — an overdue dose
      // must not expire out of the list before the owner has seen it.
      validUntil: horizonFromNow(7),
    })
  }
  return hits
}

/* ---------------------------- care adherence ----------------------------- */

/**
 * Fires when a routine the owner clearly keeps has lapsed: at least 4 of the
 * previous 7 days logged, and 3 or more of the last 7 missed.
 *
 * Reads `care_entries`, which is what the app actually writes. (The plan named
 * pet_care_tasks × pet_care_log; those tables are legacy and hold no rows.)
 * Requiring an established baseline is what stops this firing at every owner
 * who has simply never used the care log.
 */
async function careAdherence(supabase: Client, pets: PetRow[]): Promise<RuleHit[]> {
  const since = new Date(Date.now() - 14 * DAY).toISOString()
  const { data } = await supabase
    .from("care_entries")
    .select("pet_id, kind, logged_at")
    .in("pet_id", pets.map((p) => p.id))
    .in("kind", ["food", "medicine"])
    .gte("logged_at", since)

  const today = startOfDay(Date.now())
  const buckets = new Map<string, { recent: Set<string>; prior: Set<string> }>()

  for (const row of data ?? []) {
    const key = `${row.pet_id}:${row.kind}`
    const bucket = buckets.get(key) ?? { recent: new Set<string>(), prior: new Set<string>() }
    const day = row.logged_at.slice(0, 10)
    const age = Math.floor((today - startOfDay(new Date(row.logged_at).getTime())) / DAY)
    if (age >= 0 && age < 7) bucket.recent.add(day)
    else if (age >= 7 && age < 14) bucket.prior.add(day)
    buckets.set(key, bucket)
  }

  const hits: RuleHit[] = []
  for (const [key, bucket] of buckets) {
    const [petId, kind] = key.split(":")
    const pet = pets.find((p) => p.id === petId)
    if (!pet) continue

    const missed = 7 - bucket.recent.size
    const established = bucket.prior.size >= 4
    if (!established || missed < 3) continue

    const label = kind === "medicine" ? "medication" : "meal"
    hits.push({
      petId: pet.id,
      petName: pet.name,
      kind: "care_adherence",
      severity: kind === "medicine" ? "warning" : "info",
      title: `${pet.name}'s ${label} log is missing ${missed} of the last 7 days`,
      facts: `${pet.name} has ${label} entries logged on ${bucket.recent.size} of the last 7 days, down from ${bucket.prior.size} of the 7 days before that. This is about the logging record, not the pet's health.`,
      actionLabel: "Open care log",
      actionTarget: `pet-care:${pet.id}`,
      evidence: { kind, days_logged_last_7: bucket.recent.size, days_logged_prior_7: bucket.prior.size, missed },
      // Weekly key: one nudge per pet per kind per ISO week.
      dedupeKey: `care_adherence:${pet.id}:${kind}:${isoWeek(new Date())}`,
      validUntil: horizonFromNow(7),
    })
  }
  return hits
}

/* ---------------------------- document missing --------------------------- */

async function documentMissing(supabase: Client, pets: PetRow[]): Promise<RuleHit[]> {
  const { data } = await supabase
    .from("pet_documents")
    .select("id, pet_id, kind, name, status")
    .in("pet_id", pets.map((p) => p.id))
    .in("status", ["missing", "expired"])

  const hits: RuleHit[] = []
  for (const row of data ?? []) {
    const pet = pets.find((p) => p.id === row.pet_id)
    if (!pet) continue
    const label = row.name ?? row.kind.replace(/_/g, " ")
    hits.push({
      petId: pet.id,
      petName: pet.name,
      kind: "document_missing",
      severity: row.status === "expired" ? "warning" : "info",
      title: `${pet.name}'s ${label} is ${row.status}`,
      facts: `${pet.name}'s ${label} document is marked ${row.status} in the app. Ask the owner to upload it.`,
      actionLabel: "Upload",
      actionTarget: `pet-detail:${pet.id}`,
      evidence: { document_id: row.id, kind: row.kind, status: row.status },
      dedupeKey: `document_missing:${row.id}:${row.status}`,
      validUntil: horizonFromNow(30),
    })
  }
  return hits
}

/* ------------------------------ checkup due ------------------------------ */

/** No vaccination given and no recorded activity in 12 months. */
async function checkupDue(supabase: Client, pets: PetRow[]): Promise<RuleHit[]> {
  const cutoff = new Date(Date.now() - 365 * DAY)
  const cutoffDate = cutoff.toISOString().slice(0, 10)

  const [vax, activity] = await Promise.all([
    supabase.from("pet_vaccinations").select("pet_id, given_on").in("pet_id", pets.map((p) => p.id)).gte("given_on", cutoffDate),
    supabase.from("pet_activity").select("pet_id, created_at").in("pet_id", pets.map((p) => p.id)).gte("created_at", cutoff.toISOString()),
  ])

  const recent = new Set<string>([
    ...(vax.data ?? []).map((r) => r.pet_id),
    ...(activity.data ?? []).map((r) => r.pet_id),
  ])

  return pets
    .filter((pet) => !recent.has(pet.id))
    .map((pet) => ({
      petId: pet.id,
      petName: pet.name,
      kind: "checkup_due" as const,
      severity: "info" as const,
      title: `It's been over a year since ${pet.name}'s last recorded vet visit`,
      facts: `Pet10x has no vaccination or vet record for ${pet.name} in the last 12 months. Suggest booking a routine check-up. Do not imply anything is wrong.`,
      actionLabel: "Find a vet",
      actionTarget: "services",
      evidence: { last_record_before: cutoffDate },
      // Monthly key, so this nudges once a month rather than every run.
      dedupeKey: `checkup_due:${pet.id}:${new Date().toISOString().slice(0, 7)}`,
      validUntil: horizonFromNow(30),
    }))
}

/* -------------------------------- registry ------------------------------- */

export const RULES = [vaccinationDue, medicationDue, careAdherence, documentMissing, checkupDue] as const

/** Runs every rule against the caller's pets. RLS scopes the reads. */
export async function evaluateRules(supabase: Client, pets: PetRow[]): Promise<RuleHit[]> {
  if (pets.length === 0) return []
  const results = await Promise.all(
    RULES.map((rule) =>
      rule(supabase, pets).catch((err) => {
        // One broken rule must not take the whole run down.
        console.error(`[ai] suggestion rule ${rule.name} failed`, err)
        return [] as RuleHit[]
      }),
    ),
  )
  return results.flat()
}

/* -------------------------------- helpers -------------------------------- */

/** A card's shelf life always runs from now, never from the date that fired it. */
function horizonFromNow(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString()
}

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}
