/**
 * Pet10x — the vaccine list per species, and the one matcher that turns a
 * stored vaccine name into a canonical key.
 *
 * A building's rabies requirement used to be tested with /rabies/i against
 * free text in two places, so "Rabis" never cleared it. The add form now
 * offers these names, and every compliance check goes through
 * canonicalVaccineKey so there is one definition of "this is rabies".
 */

export type VaccineSpecies = "dog" | "cat" | "other"

export const VACCINES: Record<VaccineSpecies, { key: string; label: string }[]> = {
  dog: [
    { key: "rabies", label: "Rabies" },
    { key: "dhpp", label: "DHPP (distemper combo)" },
    { key: "bordetella", label: "Bordetella (kennel cough)" },
    { key: "leptospirosis", label: "Leptospirosis" },
    { key: "lyme", label: "Lyme" },
  ],
  cat: [
    { key: "rabies", label: "Rabies" },
    { key: "fvrcp", label: "FVRCP (feline combo)" },
    { key: "felv", label: "FeLV (feline leukemia)" },
  ],
  other: [{ key: "rabies", label: "Rabies" }],
}

// Whole-word patterns, tried in order. A name is a vaccine only when a word in
// it is one of these spellings; "Antirabies-free" and "Heartworm" are not.
const MATCHERS: { key: string; re: RegExp }[] = [
  { key: "rabies", re: /\brabi(es|is|s)?\b/i },
  { key: "dhpp", re: /\b(dhpp|da2pp|distemper)\b/i },
  { key: "fvrcp", re: /\bfvrcp\b/i },
  { key: "bordetella", re: /\b(bordetella|kennel)\b/i },
  { key: "leptospirosis", re: /\blepto\w*/i },
  { key: "lyme", re: /\blyme\b/i },
  { key: "felv", re: /\b(felv|leuk\w*)/i },
]

export function canonicalVaccineKey(name: string): string | null {
  for (const m of MATCHERS) if (m.re.test(name)) return m.key
  return null
}

export function hasRabies(vaccinationNames: string[]): boolean {
  return vaccinationNames.some((n) => canonicalVaccineKey(n) === "rabies")
}

/** pets.species allows seven values; the list only distinguishes dogs and cats. */
export function vaccineSpecies(species: string | null | undefined): VaccineSpecies {
  return species === "dog" || species === "cat" ? species : "other"
}
