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

// Positive grammar: a name is a vaccine when it starts a word with one of these
// spellings and no letter follows. Digits and underscores may follow
// ("Rabies3yr", "Rabies_2024"), which a plain \b would refuse; letters may not
// ("rabiesfree"), and nothing may precede ("Antirabies"). Rabies also allows a
// trailing "vaccine|vax|shot" for compact entries like "RabiesVaccine".
const MATCHERS: { key: string; re: RegExp }[] = [
  { key: "rabies", re: /\brabi(es|is|s)?(vaccine|vax|shot)?(?![a-z])/i },
  { key: "dhpp", re: /\b(dhpp|da2pp|distemper)(?![a-z])/i },
  { key: "fvrcp", re: /\bfvrcp(?![a-z])/i },
  { key: "bordetella", re: /\b(bordetella|kennel)(?![a-z])/i },
  { key: "leptospirosis", re: /\blepto(spirosis)?(?![a-z])/i },
  { key: "lyme", re: /\blyme(?![a-z])/i },
  { key: "felv", re: /\b(felv|feline\s+leuk(a)?emia)(?![a-z])/i },
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
