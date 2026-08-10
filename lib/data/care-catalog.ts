import type { Species } from "./types"

/**
 * What care means for each species.
 *
 * The tracker used one hardcoded vocabulary for every animal: food measured in
 * "cups", activity called a "walk". A cat owner measures cans or pouches and
 * does not walk their cat; a fish is fed in pinches and is never taken out.
 * Offering a Walk tile to a goldfish owner is not a cosmetic problem — it
 * makes the tracker read as though it was not built for their pet.
 *
 * Units live here as a catalogue rather than a database constraint because
 * they are vocabulary, not truth: `care_entries.unit` stays free text so a
 * value recorded last year still means what it said, even after this list
 * changes. What the catalogue decides is what the UI OFFERS.
 */

export type CareKindId = "food" | "water" | "treat" | "medicine" | "walk" | "play" | "outing" | "potty" | "weight"

export interface CareUnit {
  /** Stored in `care_entries.unit` / `care_targets.unit`. */
  id: string
  label: string
  /** Input granularity — half a bowl is meaningful, half a tablet less so. */
  step: number
  /** One-tap amounts, chosen to be the common cases for that unit. */
  quick: number[]
}

export interface CareKindSpec {
  kind: CareKindId
  label: string
  /** Placeholder for the entry's own name ("Breakfast", "Heartgard"). */
  placeholder: string
  defaultLabel: string
  units: CareUnit[]
  /** How the target reads, e.g. "Daily target" vs "Daily limit". */
  targetLabel: string
  /**
   * Whether several targets of this kind are expected. Medicines and treats
   * are lists by nature; a pet has one daily food goal but may be on three
   * medications.
   */
  multi: boolean
}

/* ── Units, shared where the meaning is genuinely the same ── */

const GRAMS: CareUnit = { id: "g", label: "grams", step: 5, quick: [50, 100, 200] }
const MINUTES: CareUnit = { id: "min", label: "minutes", step: 5, quick: [15, 30, 45] }
const TIMES: CareUnit = { id: "times", label: "times", step: 1, quick: [1, 2] }
const ML: CareUnit = { id: "ml", label: "ml", step: 10, quick: [100, 250, 500] }
const DOSE: CareUnit = { id: "dose", label: "doses", step: 1, quick: [1] }
const TABLET: CareUnit = { id: "tablet", label: "tablets", step: 0.5, quick: [0.5, 1, 2] }
const PIECES: CareUnit = { id: "pieces", label: "pieces", step: 1, quick: [1, 2, 3] }
const KM: CareUnit = { id: "km", label: "km", step: 0.5, quick: [1, 2, 5] }

const BOWLS: CareUnit = { id: "bowl", label: "bowls", step: 0.25, quick: [0.5, 1, 1.5] }
const CANS: CareUnit = { id: "can", label: "cans", step: 0.25, quick: [0.5, 1] }
const POUCHES: CareUnit = { id: "pouch", label: "pouches", step: 1, quick: [1, 2] }
const CUPS: CareUnit = { id: "cup", label: "cups", step: 0.25, quick: [0.5, 1, 1.5] }
const PINCH: CareUnit = { id: "pinch", label: "pinches", step: 1, quick: [1, 2] }
const ITEMS: CareUnit = { id: "item", label: "items", step: 1, quick: [1, 2, 3] }

/* Kinds that read the same for every animal. */
const WATER = (units: CareUnit[]): CareKindSpec => ({
  kind: "water",
  label: "Water",
  placeholder: "Fresh bowl…",
  defaultLabel: "Water",
  units,
  targetLabel: "Daily target",
  multi: false,
})

/**
 * Going somewhere fun — the one activity every species shares.
 *
 * "Walk" only suits a dog; a cat has playtime, a rabbit floor time, a fish
 * neither. But every owner takes their animal somewhere occasionally, and that
 * is worth planning and tracking regardless of species. Shared verbatim so a
 * multi-pet household sees one consistent idea.
 */
const OUTING: CareKindSpec = {
  kind: "outing",
  label: "Fun places",
  placeholder: "Dog park, beach, pet cafe…",
  defaultLabel: "Outing",
  units: [TIMES, MINUTES],
  targetLabel: "Outings / week",
  // Several kinds of outing deserve their own goals — the park twice a week
  // is a different commitment to the beach once a month.
  multi: true,
}

const MEDICINE: CareKindSpec = {
  kind: "medicine",
  label: "Medicine",
  placeholder: "Heartgard, Apoquel…",
  defaultLabel: "Medication",
  units: [TABLET, DOSE, ML],
  targetLabel: "Doses / day",
  // A pet on three medications needs three targets. This was the single
  // biggest limitation of the old one-target-per-kind model.
  multi: true,
}

/** Medication categories offered as suggestions when naming a target. */
export const MEDICATION_CATEGORIES = [
  "Prescription drug",
  "Preventative (flea / tick / worm)",
  "Supplement",
  "Probiotic",
  "Pain relief",
  "Other",
] as const

const TREAT: CareKindSpec = {
  kind: "treat",
  label: "Treats",
  placeholder: "Dental chew, training treat…",
  defaultLabel: "Treat",
  units: [PIECES, GRAMS],
  // A limit, not a goal — the point of tracking treats is to not exceed them.
  targetLabel: "Daily limit",
  multi: true,
}

const WEIGHT: CareKindSpec = {
  kind: "weight",
  label: "Weight",
  placeholder: "Vet scale, home scale…",
  defaultLabel: "Weight",
  units: [{ id: "kg", label: "kg", step: 0.1, quick: [] }, { id: "g", label: "grams", step: 10, quick: [] }],
  targetLabel: "Goal weight",
  multi: false,
}

const POTTY: CareKindSpec = {
  kind: "potty",
  label: "Potty",
  placeholder: "Garden, litter tray…",
  defaultLabel: "Potty",
  units: [TIMES],
  targetLabel: "Times / day",
  multi: false,
}

/* ── Per-species vocabularies ── */

const DOG: CareKindSpec[] = [
  {
    kind: "food",
    label: "Food",
    placeholder: "Breakfast, kibble…",
    defaultLabel: "Meal",
    // Bowls first: it is how most owners actually think about a dog's meal.
    units: [BOWLS, GRAMS, CUPS, CANS],
    targetLabel: "Daily target",
    // Wet and dry, or morning and evening, are separate goals for plenty of
    // households — same reasoning as medicines.
    multi: true,
  },
  WATER([ML, BOWLS]),
  TREAT,
  MEDICINE,
  {
    kind: "walk",
    label: "Walks",
    placeholder: "Morning walk, block…",
    defaultLabel: "Walk",
    // Count first, then duration, then distance — an owner reliably knows how
    // many walks; minutes and km are the ones they estimate.
    units: [TIMES, MINUTES, KM],
    targetLabel: "Walks / day",
    multi: false,
  },
  OUTING,
  POTTY,
  WEIGHT,
]

const CAT: CareKindSpec[] = [
  {
    kind: "food",
    label: "Food",
    placeholder: "Wet food, kibble…",
    defaultLabel: "Meal",
    // Cans and pouches first — cat food is portioned, not scooped.
    units: [CANS, GRAMS, POUCHES, BOWLS],
    targetLabel: "Daily target",
    // Wet and dry, or morning and evening, are separate goals for plenty of
    // households — same reasoning as medicines.
    multi: true,
  },
  WATER([ML, BOWLS]),
  TREAT,
  MEDICINE,
  {
    kind: "play",
    label: "Playtime",
    placeholder: "Wand toy, laser…",
    defaultLabel: "Play",
    units: [MINUTES, TIMES],
    targetLabel: "Minutes / day",
    multi: false,
  },
  OUTING,
  POTTY,
  WEIGHT,
]

const BIRD: CareKindSpec[] = [
  {
    kind: "food",
    label: "Food",
    placeholder: "Seed mix, pellets…",
    defaultLabel: "Feed",
    units: [GRAMS, { ...PIECES, label: "portions" }],
    targetLabel: "Daily target",
    // Wet and dry, or morning and evening, are separate goals for plenty of
    // households — same reasoning as medicines.
    multi: true,
  },
  WATER([ML]),
  TREAT,
  MEDICINE,
  {
    kind: "play",
    label: "Out of cage",
    placeholder: "Free flight, perch time…",
    defaultLabel: "Out of cage",
    units: [MINUTES],
    targetLabel: "Minutes / day",
    multi: false,
  },
  OUTING,
  WEIGHT,
]

const SMALL_MAMMAL: CareKindSpec[] = [
  {
    kind: "food",
    label: "Food",
    placeholder: "Hay, pellets, greens…",
    defaultLabel: "Feed",
    units: [GRAMS, { ...PIECES, label: "portions" }],
    targetLabel: "Daily target",
    // Wet and dry, or morning and evening, are separate goals for plenty of
    // households — same reasoning as medicines.
    multi: true,
  },
  WATER([ML]),
  TREAT,
  MEDICINE,
  {
    kind: "play",
    label: "Exercise",
    placeholder: "Run time, floor time…",
    defaultLabel: "Exercise",
    units: [MINUTES],
    targetLabel: "Minutes / day",
    multi: false,
  },
  OUTING,
  WEIGHT,
]

const REPTILE: CareKindSpec[] = [
  {
    kind: "food",
    label: "Food",
    placeholder: "Crickets, greens…",
    // Reptiles are fed on a cycle, not daily — the target is weekly by default.
    defaultLabel: "Feed",
    units: [ITEMS, GRAMS],
    targetLabel: "Feeds / week",
    multi: false,
  },
  WATER([ML]),
  MEDICINE,
  OUTING,
  WEIGHT,
]

const FISH: CareKindSpec[] = [
  {
    kind: "food",
    label: "Food",
    placeholder: "Flakes, pellets…",
    defaultLabel: "Feed",
    units: [PINCH, GRAMS],
    targetLabel: "Feeds / day",
    multi: false,
  },
  // No walk, no play, no potty, no treats. A tracker that offered them would
  // be telling a fish owner it was not built for them.
  MEDICINE,
  // Outings are otherwise universal — every owner takes their animal
  // somewhere. Not a fish. Offering "Fun places" here would be the same
  // mistake as the Walk tile it replaced.
]

const OTHER: CareKindSpec[] = [
  {
    kind: "food",
    label: "Food",
    placeholder: "Meal…",
    defaultLabel: "Feed",
    units: [GRAMS, { ...PIECES, label: "portions" }],
    targetLabel: "Daily target",
    // Wet and dry, or morning and evening, are separate goals for plenty of
    // households — same reasoning as medicines.
    multi: true,
  },
  WATER([ML]),
  TREAT,
  MEDICINE,
  {
    kind: "play",
    label: "Activity",
    placeholder: "Exercise, enrichment…",
    defaultLabel: "Activity",
    units: [MINUTES, TIMES],
    targetLabel: "Minutes / day",
    multi: false,
  },
  OUTING,
  WEIGHT,
]

const BY_SPECIES: Record<Species, CareKindSpec[]> = {
  dog: DOG,
  cat: CAT,
  bird: BIRD,
  small_mammal: SMALL_MAMMAL,
  reptile: REPTILE,
  fish: FISH,
  other: OTHER,
}

/** Every care kind offered for a species, in tab order. */
export function careKindsFor(species: Species | null | undefined): CareKindSpec[] {
  return BY_SPECIES[species ?? "other"] ?? OTHER
}

/** One kind's spec, or null when that species does not have it. */
export function careKindSpec(species: Species | null | undefined, kind: string): CareKindSpec | null {
  return careKindsFor(species).find((k) => k.kind === kind) ?? null
}

/** The unit a new entry should default to for this species and kind. */
export function defaultUnitFor(species: Species | null | undefined, kind: string): CareUnit | null {
  return careKindSpec(species, kind)?.units[0] ?? null
}

/**
 * Resolve a stored unit id back to its spec.
 *
 * Falls back to a synthetic unit so an entry logged in a unit this species no
 * longer offers — or one recorded before the catalogue changed — still renders
 * with its original wording instead of silently becoming something else.
 */
export function unitById(species: Species | null | undefined, kind: string, unitId: string | null): CareUnit {
  const spec = careKindSpec(species, kind)
  const found = spec?.units.find((u) => u.id === unitId)
  if (found) return found
  if (unitId) return { id: unitId, label: unitId, step: 1, quick: [] }
  return spec?.units[0] ?? { id: "", label: "", step: 1, quick: [] }
}

/* ── Medicine courses ── */

/**
 * Common dosing intervals, in days.
 *
 * Offered as presets because "every 6 months" is a thing an owner says and
 * `interval_days = 182` is not. Anything else can still be typed.
 */
export const COURSE_PRESETS: { label: string; intervalDays: number }[] = [
  { label: "Every day", intervalDays: 1 },
  { label: "Every 2 days", intervalDays: 2 },
  { label: "Weekly", intervalDays: 7 },
  { label: "Fortnightly", intervalDays: 14 },
  { label: "Monthly", intervalDays: 30 },
  { label: "Every 3 months", intervalDays: 91 },
  { label: "Every 6 months", intervalDays: 182 },
  { label: "Yearly", intervalDays: 365 },
]

/** How long a course runs, for the "6 month medicine" case. */
export const DURATION_PRESETS: { label: string; days: number | null }[] = [
  { label: "Ongoing", days: null },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 91 },
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
]

export const VACCINATION_KINDS: { id: string; label: string }[] = [
  { id: "vaccine", label: "Vaccination" },
  { id: "booster", label: "Booster" },
  { id: "injection", label: "Injection" },
  { id: "treatment", label: "Treatment" },
]

/* ------------------------------------------------------------------ */
/* Sensible starting points                                            */
/* ------------------------------------------------------------------ */

export interface DefaultTarget {
  kind: CareKindId
  label: string
  amount: number
  unit: string
  period: "day" | "week"
}

export interface DefaultSchedule {
  label: string
  kind: "meal" | "medication" | "water" | "walk" | "grooming" | "other"
  /** "HH:MM" local. */
  at: string
  /**
   * Label of the default target this task feeds, and how much it logs.
   * Two meals pointing at one food target is the shape most owners start
   * from — and it is what makes ticking a meal move the day's progress.
   */
  targetLabel?: string
  logAmount?: number
}

/**
 * What a new pet's tracker starts with.
 *
 * An empty tracker asks the owner to invent a routine before they know what
 * the app does; a seeded one is something to correct, which is a much easier
 * task. Every value is editable and deletable immediately.
 *
 * The numbers are ordinary-pet defaults, not veterinary advice — a Chihuahua
 * and a Great Dane do not eat the same amount. They exist to be adjusted.
 */
const DEFAULTS: Partial<Record<Species, { targets: DefaultTarget[]; schedule: DefaultSchedule[] }>> = {
  dog: {
    targets: [
      { kind: "food", label: "Meals", amount: 2, unit: "bowl", period: "day" },
      { kind: "walk", label: "Walks", amount: 2, unit: "times", period: "day" },
      { kind: "treat", label: "Treats", amount: 3, unit: "pieces", period: "day" },
      { kind: "outing", label: "Fun places", amount: 1, unit: "times", period: "week" },
    ],
    // Two walks and two meals is the shape of most dog days; the times are
    // the common ones and are the first thing an owner will drag around.
    schedule: [
      { label: "Morning walk", kind: "walk", at: "08:00", targetLabel: "Walks", logAmount: 1 },
      { label: "Breakfast", kind: "meal", at: "08:30", targetLabel: "Meals", logAmount: 1 },
      { label: "Evening walk", kind: "walk", at: "17:30", targetLabel: "Walks", logAmount: 1 },
      { label: "Dinner", kind: "meal", at: "18:00", targetLabel: "Meals", logAmount: 1 },
    ],
  },
  cat: {
    targets: [
      { kind: "food", label: "Meals", amount: 2, unit: "can", period: "day" },
      { kind: "play", label: "Playtime", amount: 20, unit: "min", period: "day" },
      { kind: "treat", label: "Treats", amount: 3, unit: "pieces", period: "day" },
    ],
    schedule: [
      { label: "Breakfast", kind: "meal", at: "08:00", targetLabel: "Meals", logAmount: 1 },
      { label: "Playtime", kind: "other", at: "18:00", targetLabel: "Playtime", logAmount: 20 },
      { label: "Dinner", kind: "meal", at: "18:30", targetLabel: "Meals", logAmount: 1 },
    ],
  },
  bird: {
    targets: [
      { kind: "food", label: "Feed", amount: 30, unit: "g", period: "day" },
      { kind: "play", label: "Out of cage", amount: 60, unit: "min", period: "day" },
    ],
    schedule: [{ label: "Morning feed", kind: "meal", at: "08:00", targetLabel: "Feed", logAmount: 30 }],
  },
  small_mammal: {
    targets: [
      { kind: "food", label: "Feed", amount: 50, unit: "g", period: "day" },
      { kind: "play", label: "Exercise", amount: 60, unit: "min", period: "day" },
    ],
    schedule: [{ label: "Morning feed", kind: "meal", at: "08:00", targetLabel: "Feed", logAmount: 50 }],
  },
  reptile: {
    // Fed on a cycle, not daily — the target is weekly and the schedule is an
    // interval task the owner sets, not a time of day.
    targets: [{ kind: "food", label: "Feed", amount: 3, unit: "item", period: "week" }],
    schedule: [],
  },
  fish: {
    targets: [{ kind: "food", label: "Feed", amount: 2, unit: "pinch", period: "day" }],
    schedule: [{ label: "Feed", kind: "meal", at: "08:00", targetLabel: "Feed", logAmount: 1 }],
  },
  other: {
    targets: [{ kind: "food", label: "Feed", amount: 1, unit: "g", period: "day" }],
    schedule: [],
  },
}

export function defaultTargetsFor(species: Species | null | undefined): DefaultTarget[] {
  return DEFAULTS[species ?? "other"]?.targets ?? []
}

export function defaultScheduleFor(species: Species | null | undefined): DefaultSchedule[] {
  return DEFAULTS[species ?? "other"]?.schedule ?? []
}
