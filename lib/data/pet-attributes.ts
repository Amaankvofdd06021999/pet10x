/**
 * Size, restraint and diet vocabularies.
 *
 * Kept next to the breed and care catalogues rather than inline in the form,
 * because the manager's register and the compliance view need to read the same
 * words the owner picked.
 */

export interface SizeBand {
  id: "small" | "medium" | "large" | "xlarge"
  label: string
  /** Height at the shoulder, in inches — how every size chart is quoted. */
  range: string
  /** Upper bound in cm, for comparing against a building's limit. */
  maxCm: number | null
  examples: string
}

/**
 * The size chart shown beside the picker.
 *
 * Bands are by height at the shoulder, not weight: a building's concern is
 * whether the animal fits in a lift and how it reads to a nervous neighbour,
 * and a 40kg greyhound and a 40kg bulldog are not the same problem.
 */
export const SIZE_BANDS: SizeBand[] = [
  { id: "small", label: "Small", range: "Under 12 in", maxCm: 30, examples: "Chihuahua, Dachshund, most cats" },
  { id: "medium", label: "Medium", range: "12–22 in", maxCm: 56, examples: "Beagle, Border Collie, Bulldog" },
  { id: "large", label: "Large", range: "22–28 in", maxCm: 71, examples: "Labrador, German Shepherd" },
  { id: "xlarge", label: "X-Large", range: "Over 28 in", maxCm: null, examples: "Great Dane, Mastiff" },
]

/**
 * The height a building is most likely to cap at, in inches.
 *
 * The brief named both "maximum Medium" and "36 inches", which cannot both be
 * the rule — Medium tops out around 22in and 36in is taller than a Great Dane.
 * Recorded as the outer ceiling and shown on the chart; the band is what gets
 * compared against a building's own limit.
 */
export const MAX_HEIGHT_INCHES = 36

export const IN_TO_CM = 2.54

export function inchesToCm(inches: number): number {
  return Math.round(inches * IN_TO_CM * 10) / 10
}

export function cmToInches(cm: number): number {
  return Math.round((cm / IN_TO_CM) * 10) / 10
}

export function sizeBand(id: string | null | undefined): SizeBand | null {
  return SIZE_BANDS.find((b) => b.id === id) ?? null
}

/**
 * Whether a size exceeds what a building allows.
 *
 * Advisory. Nothing in the app refuses a registration on this — a resident
 * whose large dog already lives there must still be able to register it, or
 * the register stops describing the building. It surfaces to the manager as
 * something to look at.
 */
export function exceedsLimit(band: string | null | undefined, limit: string | null | undefined): boolean {
  if (!band || !limit) return false
  const order = SIZE_BANDS.map((b) => b.id)
  return order.indexOf(band as SizeBand["id"]) > order.indexOf(limit as SizeBand["id"])
}

export const RESTRAINTS: { id: string; label: string; hint: string }[] = [
  { id: "leashed", label: "Leashed", hint: "On a lead in common areas" },
  { id: "harnessed", label: "Harnessed", hint: "Body harness rather than collar" },
  { id: "muzzled", label: "Muzzled", hint: "Muzzle worn outside the unit" },
  { id: "carrier", label: "Carrier", hint: "Carried in a bag or box" },
  { id: "caged", label: "Caged", hint: "Transported in a cage or crate" },
]

export const DIET_TYPES: { id: string; label: string; hint: string }[] = [
  { id: "dried", label: "Dried", hint: "Kibble or dry food" },
  { id: "wet", label: "Wet", hint: "Tins, pouches or trays" },
  { id: "raw", label: "Raw", hint: "Raw or BARF diet" },
  { id: "mixed", label: "Mixed", hint: "A combination" },
  { id: "prescription", label: "Prescription", hint: "Vet-prescribed diet" },
]
