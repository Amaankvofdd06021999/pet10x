export type WeightUnit = "kg" | "lb"

const KG_PER_LB = 0.45359237
/** Heaviest pet we accept, in kg, checked after any lb conversion. */
export const MAX_WEIGHT_KG = 150

/* The whole grammar: 1-3 digits, an optional . or , with 1-2 digits, an
   optional unit. Anything else is refused, never guessed at. */
const WEIGHT = /^\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(kg|kgs|lb|lbs)?\s*$/i

export type ParsedWeight = { ok: true; kg: number | null } | { ok: false }

/** Weight as typed -> kg rounded to 0.1. A unit typed in the text beats the
    toggle ("70 lbs" is pounds even with kg selected); empty means "no weight". */
export function parseWeightKg(raw: string, unit: WeightUnit): ParsedWeight {
  if (raw.trim() === "") return { ok: true, kg: null }
  const m = WEIGHT.exec(raw)
  if (!m) return { ok: false }
  const n = parseFloat(m[1].replace(",", "."))
  const typed = m[2]?.toLowerCase()
  const inLb = typed ? typed.startsWith("lb") : unit === "lb"
  const kg = Math.round((inLb ? n * KG_PER_LB : n) * 10) / 10
  if (kg > MAX_WEIGHT_KG) return { ok: false }
  return { ok: true, kg }
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
