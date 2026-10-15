"use client"

import { useCallback, useEffect, useId, useReducer } from "react"
import { defaultWeightUnit, initWeightField, parseWeightKg, weightFieldReducer, type WeightUnit } from "@/lib/units"

export const WEIGHT_ERROR = "Enter a weight like 12.5"

/** State for a weight field, shared so both screens toggle the same way: the
    toggle converts what is typed. A thin wrapper over weightFieldReducer.
    `initialKg` is a stored weight to edit. The locale's unit is applied once,
    after mount (never during render, so a cold load cannot mismatch), and
    never over a unit the user has tapped. */
export function useWeightField(initialKg: number | null) {
  const [state, dispatch] = useReducer(weightFieldReducer, initialKg, initWeightField)
  useEffect(() => dispatch({ type: "applyDefaultUnit", unit: defaultWeightUnit(navigator.language) }), [])
  const parsed = parseWeightKg(state.text, state.unit)
  // dispatch is stable, so these are stable too.
  const setText = useCallback((text: string) => dispatch({ type: "setText", text }), [])
  const setUnit = useCallback((unit: WeightUnit) => dispatch({ type: "setUnit", unit }), [])
  const reset = useCallback(() => dispatch({ type: "reset", unit: defaultWeightUnit(navigator.language) }), [])
  return {
    text: state.text,
    unit: state.unit,
    edited: state.edited,
    parsed,
    /** Saveable: nothing typed yet, or what was typed parses. */
    valid: !state.edited || parsed.ok,
    setText,
    setUnit,
    reset,
  }
}

/** Weight text plus a kg/lb toggle, shared by Add Pet and the pet-detail edit
    form so the two cannot drift. It shows the inline error; the parent reads
    `field.parsed` for the value and `field.valid` to block Save. */
export function WeightInput({
  field,
  compact,
  id,
}: {
  field: ReturnType<typeof useWeightField>
  compact?: boolean
  /** Lets a visible <label htmlFor> name the input. */
  id?: string
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
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={unit === "lb" ? "e.g. 70" : "e.g. 32"}
          aria-label="Weight"
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          className={`min-w-0 flex-1 rounded-xl border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${
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
                unit === u ? "bg-primary-strong text-primary-foreground" : "bg-card text-muted-foreground"
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
