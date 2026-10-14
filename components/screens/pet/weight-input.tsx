"use client"

import { useId, useState } from "react"
import { formatWeight, parseWeightKg, toggleWeightUnit, type WeightFieldState, type WeightUnit } from "@/lib/units"

export const WEIGHT_ERROR = "Enter a weight like 12.5"

/** State for a weight field, shared so both screens toggle the same way: the
    toggle converts what is typed (see toggleWeightUnit). `initialKg` is a
    stored weight to edit; `edited` is true once the user types, so an
    untouched legacy value is neither re-saved nor flagged invalid. */
export function useWeightField(initialKg: number | null, initialUnit: WeightUnit | (() => WeightUnit) = "kg") {
  const [state, setState] = useState<WeightFieldState>(() => {
    const unit = typeof initialUnit === "function" ? initialUnit() : initialUnit
    return { text: initialKg === null ? "" : formatWeight(initialKg, unit), unit, kgExact: initialKg }
  })
  const [edited, setEdited] = useState(false)
  const parsed = parseWeightKg(state.text, state.unit)
  return {
    text: state.text,
    unit: state.unit,
    edited,
    parsed,
    /** Saveable: nothing typed yet, or what was typed parses. */
    valid: !edited || parsed.ok,
    setText: (text: string) => {
      setState((s) => ({ ...s, text, kgExact: null }))
      setEdited(true)
    },
    setUnit: (u: WeightUnit) => setState((s) => toggleWeightUnit(s, u)),
  }
}

/** Weight text plus a kg/lb toggle, shared by Add Pet and the pet-detail edit
    form so the two cannot drift. It shows the inline error; the parent reads
    `field.parsed` for the value and `field.valid` to block Save. */
export function WeightInput({
  field,
  compact,
}: {
  field: ReturnType<typeof useWeightField>
  compact?: boolean
}) {
  const errorId = useId()
  const { text: value, unit } = field
  const invalid = !field.valid
  const onChange = field.setText
  const onUnitChange = field.setUnit
  return (
    <div>
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={unit === "lb" ? "e.g. 70" : "e.g. 32"}
          aria-label="Weight"
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          className={`min-w-0 flex-1 rounded-xl border bg-card text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 ${
            compact ? "px-3.5 py-2.5 text-[14px]" : "px-4 py-3 text-[15px]"
          } ${
            invalid
              ? "border-destructive focus:border-destructive focus:ring-destructive/20"
              : "border-input focus:border-primary focus:ring-primary/20"
          }`}
        />
        <div role="group" aria-label="Weight unit" className="flex shrink-0 overflow-hidden rounded-xl border border-input">
          {(["kg", "lb"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => onUnitChange(u)}
              className={`px-3.5 text-[14px] font-semibold ${
                unit === u ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      {invalid && (
        <p id={errorId} role="alert" className="mt-1.5 text-[13px] text-destructive">
          {WEIGHT_ERROR}
        </p>
      )}
    </div>
  )
}
