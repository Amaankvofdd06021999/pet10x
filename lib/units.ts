export type WeightUnit = "kg" | "lb"

const KG_PER_LB = 0.45359237
/** Heaviest pet we accept, in kg, checked after any lb conversion. */
export const MAX_WEIGHT_KG = 150

/* The whole grammar: 1-3 digits, an optional . or , with 1-2 digits, an
   optional unit. Anything else is refused, never guessed at. */
const WEIGHT = /^\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(kg|kgs|lb|lbs)?\s*$/i

export type ParsedWeight = { ok: true; kg: number | null } | { ok: false }

/* Unrounded kg for the text, null when empty, undefined when it breaks the
   grammar. Kept separate so a unit toggle can convert without rounding drift. */
function exactKg(raw: string, unit: WeightUnit): number | null | undefined {
  if (raw.trim() === "") return null
  const m = WEIGHT.exec(raw)
  if (!m) return undefined
  const n = parseFloat(m[1].replace(",", "."))
  const typed = m[2]?.toLowerCase()
  const inLb = typed ? typed.startsWith("lb") : unit === "lb"
  return inLb ? n * KG_PER_LB : n
}

/** Weight as typed -> kg rounded to 0.1. A unit typed in the text beats the
    toggle ("70 lbs" is pounds even with kg selected); empty means "no weight".
    A weight that rounds to 0 kg is refused: it is not a weight. */
export function parseWeightKg(raw: string, unit: WeightUnit): ParsedWeight {
  const exact = exactKg(raw, unit)
  if (exact === undefined) return { ok: false }
  if (exact === null) return { ok: true, kg: null }
  const kg = Math.round(exact * 10) / 10
  if (kg <= 0 || kg > MAX_WEIGHT_KG) return { ok: false }
  return { ok: true, kg }
}

export type WeightFieldState = {
  text: string
  unit: WeightUnit
  /** Unrounded kg behind `text` while the text is untouched since a toggle or
      load; null once the user types (the text is then the truth). */
  kgExact: number | null
}

/** Flip the unit. Converts from the held kg (so 70 lb -> kg -> lb is 70 again,
    not 70.1); with no held kg, from the text if it parses. Empty or invalid
    text just switches the unit. */
export function toggleWeightUnit(s: WeightFieldState, next: WeightUnit): WeightFieldState {
  if (next === s.unit) return s
  let kg = s.kgExact
  if (kg === null) {
    const p = parseWeightKg(s.text, s.unit)
    const e = exactKg(s.text, s.unit)
    if (p.ok && p.kg !== null && typeof e === "number") kg = e
  }
  if (kg === null) return { text: s.text, unit: next, kgExact: null }
  return { text: formatWeight(kg, next), unit: next, kgExact: kg }
}

/** Only US locales think in pounds; everyone else (en-CA included) in kg. */
export function defaultWeightUnit(locale: string): WeightUnit {
  return locale === "en-US" ? "lb" : "kg"
}

/** Stored kg as the text for a field in `unit`, to 0.1 ("31.8", "70.1"). */
export function formatWeight(kg: number, unit: WeightUnit): string {
  const v = unit === "lb" ? kg / KG_PER_LB : kg
  return String(Math.round(v * 10) / 10)
}
