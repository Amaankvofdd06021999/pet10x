"use client"

import { useId } from "react"
import { parseWeightKg, type WeightUnit } from "@/lib/units"

export const WEIGHT_ERROR = "Enter a weight like 12.5"

/** Weight text plus a kg/lb toggle, shared by Add Pet and the pet-detail edit
    form so the two cannot drift. It shows the inline error; the parent calls
    parseWeightKg itself for the value and to block Save. */
export function WeightInput({
  value,
  unit,
  onChange,
  onUnitChange,
  compact,
}: {
  value: string
  unit: WeightUnit
  onChange: (v: string) => void
  onUnitChange: (u: WeightUnit) => void
  compact?: boolean
}) {
  const errorId = useId()
  const invalid = !parseWeightKg(value, unit).ok
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
