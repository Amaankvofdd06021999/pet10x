/**
 * The weight rule for pet registrations, in one place.
 *
 * The limit is each building's own — `buildings.pet_rules.max_weight_kg`, in
 * kilograms — while `pets.weight_grams` is grams. The check used to be a
 * hard-coded `> 25000` grams, which told a manager of a 15 kg building that a
 * 20 kg dog was fine, and flagged a 30 kg dog in a building with no limit.
 */

/** The building's limit in kg, or null when it sets none (or sets nonsense). */
export function maxWeightKgOf(petRules: unknown): number | null {
  const v = ((petRules ?? {}) as Record<string, unknown>).max_weight_kg
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null
}

/** `pets.weight_grams` as kg; null for unknown (null or 0). */
export function gramsToKg(grams: number | null): number | null {
  return grams ? grams / 1000 : null
}

export const RULES_UNCHECKED = "Couldn't check this building's rules"

/**
 * The weight flag for a pet in `buildingId`, given the limits that were loaded.
 * A building missing from `limits` means its rules could not be read, which is
 * not "no limit": the pet gets a flag, so it is never counted safe to approve.
 */
export function weightCheck(
  weightKg: number | null,
  buildingId: string | null,
  limits: Map<string, number | null>,
): string | null {
  if (buildingId === null) return null
  if (!limits.has(buildingId)) return RULES_UNCHECKED
  return weightFlag(weightKg, limits.get(buildingId) ?? null)
}

/** The flag a registration carries when it is over the limit; null otherwise. */
export function weightFlag(weightKg: number | null, maxWeightKg: number | null): string | null {
  if (weightKg === null || maxWeightKg === null) return null
  if (weightKg <= maxWeightKg) return null
  return `Over this building's ${Number(maxWeightKg)} kg limit`
}
