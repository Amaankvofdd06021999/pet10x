import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

/**
 * Pet10x — the pet dossier.
 *
 * Turns the owner's actual records into the block of text the model reasons
 * over. Every read goes through the caller's RLS-scoped client, so a dossier
 * can only ever be built from pets the signed-in owner owns.
 *
 * Kept to roughly 1500 tokens: recent and decision-relevant beats complete.
 */

type Client = SupabaseClient<Database>

/** ~4 chars per token is close enough to keep the dossier off the context budget. */
const MAX_DOSSIER_CHARS = 6000
const CARE_LOG_DAYS = 14

export interface PetDossier {
  petId: string
  petName: string
  /** The prose block injected as a system turn. Empty when there is no pet. */
  text: string
  /** Pre-filled on the emergency card so the owner doesn't go hunting for it. */
  vetPhone: string | null
  vetClinic: string | null
}

/**
 * Asserts the pet belongs to the caller and returns its chart, or null.
 *
 * Returning null for "not yours" rather than throwing is intentional — the
 * route treats an unownable pet id the same as no pet id, and RLS means a
 * forged id reads as absent rather than forbidden.
 */
export async function buildPetDossier(supabase: Client, petId: string, ownerId: string): Promise<PetDossier | null> {
  const { data: pet } = await supabase
    .from("pets")
    .select(
      "id, owner_id, name, species, breed, dob, sex, weight_grams, neutered, status, color, microchip, conditions, allergies, medications_notes, behavioral_notes, vet_clinic, vet_name, vet_phone",
    )
    .eq("id", petId)
    .is("deleted_at", null)
    .maybeSingle()

  // Belt and braces: RLS already scopes this, the explicit check documents it.
  if (!pet || pet.owner_id !== ownerId) return null

  const since = new Date(Date.now() - CARE_LOG_DAYS * 86_400_000).toISOString()

  const [vaccinations, medications, careEntries, documents] = await Promise.all([
    supabase.from("pet_vaccinations").select("name, given_on, expires_on, status").eq("pet_id", petId).order("expires_on", { ascending: true }),
    supabase.from("pet_medications").select("name, dosage, frequency, next_due, next_due_at").eq("pet_id", petId),
    supabase
      .from("care_entries")
      .select("kind, label, amount, unit, note, logged_at")
      .eq("pet_id", petId)
      .gte("logged_at", since)
      .order("logged_at", { ascending: false })
      .limit(120),
    supabase.from("pet_documents").select("kind, name, status, expires_on").eq("pet_id", petId),
  ])

  const lines: string[] = []
  lines.push(`PET CHART — ${pet.name}`)

  const identity = [
    `Species: ${pet.species}`,
    pet.breed ? `Breed: ${pet.breed}` : null,
    pet.dob ? `Date of birth: ${pet.dob} (age ${formatAge(pet.dob)})` : null,
    pet.sex && pet.sex !== "unknown" ? `Sex: ${pet.sex}` : null,
    typeof pet.neutered === "boolean" ? `Spayed/neutered: ${pet.neutered ? "yes" : "no"}` : null,
    pet.weight_grams ? `Weight: ${(pet.weight_grams / 1000).toFixed(1)} kg` : null,
    pet.color ? `Colour: ${pet.color}` : null,
    pet.status ? `Current status: ${pet.status}` : null,
  ].filter(Boolean)
  lines.push(identity.join(" · "))

  if (pet.conditions) lines.push(`Known conditions: ${pet.conditions}`)
  if (pet.allergies) lines.push(`Allergies: ${pet.allergies}`)
  if (pet.medications_notes) lines.push(`Medication notes: ${pet.medications_notes}`)
  if (pet.behavioral_notes) lines.push(`Behaviour notes: ${pet.behavioral_notes}`)

  const vet = [pet.vet_clinic, pet.vet_name, pet.vet_phone].filter(Boolean).join(" · ")
  lines.push(vet ? `Regular vet: ${vet}` : "Regular vet: not recorded in the app")

  const vax = vaccinations.data ?? []
  if (vax.length > 0) {
    lines.push("")
    lines.push("VACCINATIONS")
    for (const v of vax) {
      const expiry = v.expires_on ? `expires ${v.expires_on} (${relativeDays(v.expires_on)})` : "no expiry recorded"
      lines.push(`- ${v.name}: ${v.status}, ${v.given_on ? `given ${v.given_on}, ` : ""}${expiry}`)
    }
  }

  const meds = medications.data ?? []
  if (meds.length > 0) {
    lines.push("")
    lines.push("CURRENT MEDICATIONS (as recorded by the owner)")
    for (const m of meds) {
      const due = m.next_due_at ? `next due ${m.next_due_at} (${relativeDays(m.next_due_at)})` : m.next_due ? `next due ${m.next_due}` : "no due date recorded"
      lines.push(`- ${m.name}${m.dosage ? ` ${m.dosage}` : ""}${m.frequency ? `, ${m.frequency}` : ""}, ${due}`)
    }
  }

  const docs = (documents.data ?? []).filter((d) => d.status === "missing" || d.status === "expired" || d.status === "expiring")
  if (docs.length > 0) {
    lines.push("")
    lines.push("DOCUMENT GAPS")
    for (const d of docs) lines.push(`- ${d.name ?? d.kind}: ${d.status}${d.expires_on ? ` (expires ${d.expires_on})` : ""}`)
  }

  const care = careEntries.data ?? []
  if (care.length > 0) {
    lines.push("")
    lines.push(`CARE LOG — last ${CARE_LOG_DAYS} days, summarised`)
    for (const [kind, entries] of groupBy(care, (e) => e.kind)) {
      const days = new Set(entries.map((e) => e.logged_at.slice(0, 10))).size
      const last = entries[0]
      const detail = [last.label, last.amount != null ? `${last.amount}${last.unit ?? ""}` : null, last.note].filter(Boolean).join(" ")
      lines.push(`- ${kind}: ${entries.length} entries across ${days} day(s); most recent ${last.logged_at.slice(0, 10)}${detail ? ` — ${detail}` : ""}`)
    }

    // Weight is logged as a care entry, so a trend is readable without a
    // dedicated history table.
    const weights = care.filter((e) => e.kind === "weight" && e.amount != null)
    if (weights.length >= 2) {
      const newest = weights[0]
      const oldest = weights[weights.length - 1]
      lines.push(
        `- weight trend: ${oldest.amount}${oldest.unit ?? ""} on ${oldest.logged_at.slice(0, 10)} → ${newest.amount}${newest.unit ?? ""} on ${newest.logged_at.slice(0, 10)}`,
      )
    }
  } else {
    lines.push("")
    lines.push(`CARE LOG — nothing logged in the last ${CARE_LOG_DAYS} days.`)
  }

  let text = lines.join("\n")
  if (text.length > MAX_DOSSIER_CHARS) text = `${text.slice(0, MAX_DOSSIER_CHARS)}\n… (chart truncated)`

  return {
    petId: pet.id,
    petName: pet.name,
    text,
    vetPhone: pet.vet_phone,
    vetClinic: pet.vet_clinic,
  }
}

/**
 * Where to measure "nearest" from.
 *
 * Most owners never set a profile location, and an emergency card that lists
 * clinics on another continent is worse than useless. The linked building is
 * the reliable fallback: it has coordinates and a city, and it is where the
 * resident actually lives.
 */
export async function resolveOrigin(
  supabase: Client,
  profile: { latitude: number | null; longitude: number | null } | null,
): Promise<{ latitude: number | null; longitude: number | null; city: string | null }> {
  if (profile?.latitude != null && profile?.longitude != null) {
    return { latitude: profile.latitude, longitude: profile.longitude, city: null }
  }

  const { data } = await supabase
    .from("resident_links")
    .select("buildings(latitude, longitude, city)")
    .eq("status", "approved")
    .limit(1)
    .maybeSingle()

  const building = (data?.buildings ?? null) as { latitude: number | null; longitude: number | null; city: string | null } | null
  return {
    latitude: building?.latitude ?? null,
    longitude: building?.longitude ?? null,
    city: building?.city ?? null,
  }
}

/**
 * Nearest emergency clinics for the emergency card.
 *
 * `businesses` has lat/lng but no PostGIS distance operator yet, so "nearest"
 * is a haversine sort in JS over the small veterinary set. With no coordinates
 * at all we fall back to same-city first, then verified, then rating — never to
 * an arbitrary order, because this list is read by someone in a hurry.
 */
export async function findEmergencyClinics(
  supabase: Client,
  origin: { latitude: number | null; longitude: number | null; city?: string | null },
  limit = 3,
): Promise<{ name: string; address: string | null; city: string | null; distanceKm: number | null }[]> {
  const { data } = await supabase
    .from("businesses")
    .select("name, address, city, latitude, longitude, is_verified, rating_avg")
    .eq("category", "Veterinary")
    .limit(50)

  const originCity = origin.city?.trim().toLowerCase() ?? null
  const rows = data ?? []
  const scored = rows.map((b) => ({
    name: b.name,
    address: b.address,
    city: b.city,
    distanceKm:
      origin.latitude != null && origin.longitude != null && b.latitude != null && b.longitude != null
        ? haversineKm(origin.latitude, origin.longitude, b.latitude, b.longitude)
        : null,
    sameCity: !!originCity && b.city?.trim().toLowerCase() === originCity,
    verified: b.is_verified,
    rating: b.rating_avg ?? 0,
  }))

  scored.sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm
    if (a.distanceKm != null) return -1
    if (b.distanceKm != null) return 1
    if (a.sameCity !== b.sameCity) return a.sameCity ? -1 : 1
    if (a.verified !== b.verified) return a.verified ? -1 : 1
    return b.rating - a.rating
  })

  // Anything hundreds of km away is noise on an emergency card — better to show
  // two useful clinics than three with a filler.
  const useful = scored.filter((c) => c.distanceKm == null || c.distanceKm <= 150)
  return (useful.length > 0 ? useful : scored)
    .slice(0, limit)
    .map(({ name, address, city, distanceKm }) => ({ name, address, city, distanceKm }))
}

/* -------------------------------- helpers -------------------------------- */

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatAge(dob: string): string {
  const birth = new Date(dob)
  const months = Math.max(0, Math.floor((Date.now() - birth.getTime()) / (30.44 * 86_400_000)))
  if (months < 24) return `${months} month${months === 1 ? "" : "s"}`
  return `${Math.floor(months / 12)} years`
}

function relativeDays(isoDate: string): string {
  const days = Math.round((new Date(isoDate).getTime() - Date.now()) / 86_400_000)
  if (days === 0) return "today"
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`
  return `${Math.abs(days)} day${days === -1 ? "" : "s"} ago`
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const bucket = map.get(k)
    if (bucket) bucket.push(item)
    else map.set(k, [item])
  }
  return map
}
