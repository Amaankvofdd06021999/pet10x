"use client"

/**
 * The bylaw fine schedule, with its own save button.
 *
 * ONE COMPONENT, TWO MOUNTS. It renders inside the strata portal's
 * `BuildingBylawsEditor` and inside the in-app manager's `BylawsSheet`, which
 * are near-duplicates that each carry their own copy of `RULE_TOGGLES`.
 * Building this twice is the mistake that produced the bug this work started
 * from, so it is built once.
 *
 * IT NEVER CALLS `updateMyBuildingRules`. The toggles above it save the whole
 * `pet_rules` object; this saves three keys inside that object through
 * `manager_set_fine_schedule`, which is the only audited writer there is.
 * Nobody changes what a fine costs as a side effect of toggling "rabies
 * required" — that is Decision 8, and `buildings_fine_schedule_guard` now
 * enforces it in the database whatever this component does.
 */

import { useState } from "react"
import { toast } from "sonner"
import { setFineSchedule } from "@/lib/data/building-rules-live"
import { readFineSchedule, parseAmountToCents, formatCentsForInput } from "@/lib/data/fine-schedule"
import { Loader2, Coins } from "lucide-react"

/** What a typed field currently is: a number of cents, "no schedule", or wrong. */
type Parsed = number | null | "invalid"

export function FineScheduleEditor({
  buildingId,
  /** The building's whole `pet_rules` jsonb. Read-only here. */
  petRules,
  onSaved,
}: {
  buildingId: string
  petRules: unknown
  onSaved?: () => void
}) {
  const initial = readFineSchedule(petRules)

  /* The typed STRING is the state, never a number. Holding cents and
     re-rendering `formatCentsForInput` on every keystroke would fight the
     manager's cursor the moment they typed a decimal point; holding dollars as
     a float would round-trip 1250.50 through IEEE-754 for no reason. The string
     converts to cents exactly once, on save. */
  const [first, setFirst] = useState(() => formatCentsForInput(initial.fine_1))
  const [second, setSecond] = useState(() => formatCentsForInput(initial.fine_2))
  const [currency, setCurrency] = useState(initial.currency)
  const [saving, setSaving] = useState(false)

  const firstParsed: Parsed = parseAmountToCents(first)
  const secondParsed: Parsed = parseAmountToCents(second)
  const currencyOk = /^[A-Za-z]{3}$/.test(currency.trim())
  const blocked = firstParsed === "invalid" || secondParsed === "invalid" || !currencyOk

  const dirty =
    first !== formatCentsForInput(initial.fine_1) ||
    second !== formatCentsForInput(initial.fine_2) ||
    currency.toUpperCase() !== initial.currency

  /* Whether this building HAS a schedule, as opposed to having just saved one.
     The idle button used to read "Fine schedule saved" for every building,
     including the five that have never had one — a claim about a save that
     never happened, on the exact screen whose job is to make the absence
     visible. Found by opening the strata portal and reading it. */
  const hasSchedule = initial.fine_1 !== null || initial.fine_2 !== null

  async function save() {
    /* One guard, not three. `blocked` is a const boolean alias for
     * `firstParsed === "invalid" || secondParsed === "invalid" || !currencyOk`,
     * so TypeScript's aliased-condition narrowing gives both parsed values the
     * type `number | null` below this line. Re-testing them for "invalid" here
     * is not defence in depth — it is a comparison the compiler can prove is
     * always false, which is what it said when they were written. */
    if (blocked) return
    setSaving(true)
    const { error } = await setFineSchedule(buildingId, {
      fine1Cents: firstParsed,
      fine2Cents: secondParsed,
      currency: currency.trim().toUpperCase(),
    })
    setSaving(false)
    if (error) return toast.error("Couldn't save the fine schedule", { description: error })
    toast.success("Fine schedule saved", {
      description:
        firstParsed === null && secondParsed === null
          ? "No amounts are set, so a manager must type one on every fine."
          : "New fines will default to these amounts.",
    })
    // Refetch the building so the Violations screen's amount sheet picks the
    // new default up without a reload.
    onSaved?.()
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="mb-1 flex items-center gap-2">
        <Coins className="h-4 w-4 flex-shrink-0 text-warning" />
        <h4 className="text-[13.5px] font-semibold text-foreground">Bylaw fine schedule</h4>
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
        What a first and second offence cost under the building&apos;s bylaws. A fine issued from the Violations
        screen defaults to these amounts, and a manager can still override one case by case.
      </p>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <AmountField
          id="fine-first"
          label="First offence"
          value={first}
          onChange={setFirst}
          parsed={firstParsed}
          currency={currency}
        />
        <AmountField
          id="fine-second"
          label="Second offence"
          value={second}
          onChange={setSecond}
          parsed={secondParsed}
          currency={currency}
        />
      </div>

      <div className="mt-2.5 max-w-[10rem]">
        <label className="mb-1 block text-[11.5px] font-semibold text-muted-foreground" htmlFor="fine-currency">
          Currency
        </label>
        <input
          id="fine-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
          maxLength={3}
          className={`w-full rounded-lg border bg-background px-3 py-2 text-[13px] uppercase text-foreground focus:outline-none ${
            currencyOk ? "border-border focus:border-info" : "border-destructive"
          }`}
        />
        {!currencyOk && (
          <p className="mt-1 text-[11.5px] text-destructive">Use a three-letter code, like CAD.</p>
        )}
      </div>

      {/* Leaving a field empty is a real setting, not an omission, so it says
          what it costs. Phase 2 shipped the refusal (`no_fine_amount`) with no
          way to configure the thing it refuses for; this is the sentence that
          connects the two. */}
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
        Leave a field empty for &ldquo;no schedule for this degree&rdquo;. With no amount set, a manager must type
        an amount on every fine of that degree.
      </p>

      {/* Stated rather than discovered. `buildings_select` is
          `is_resident_of(id) or manages_building(id) or is_admin()`, and the
          schedule lives in the same jsonb as the toggles, so a resident of this
          building can read it. That is defensible — a bylaw fine schedule is
          not a secret from the people it applies to — but it must be a choice
          somebody made, not a surprise. */}
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
        Residents can see the fine schedule for their building.
      </p>

      <button
        onClick={save}
        disabled={saving || blocked || !dirty}
        className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-warning px-4 py-2 text-[13px] font-semibold text-warning-foreground transition-colors disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {dirty ? "Save fine schedule" : hasSchedule ? "Fine schedule saved" : "No fine schedule set"}
      </button>
    </div>
  )
}

function AmountField({
  id,
  label,
  value,
  onChange,
  parsed,
  currency,
}: {
  /* An EXPLICIT id, not one derived from `label`.
   *
   * This was `id={`fine-${label}`}`, which produced `id="fine-First offence"`.
   * An id containing whitespace is invalid HTML: `getElementById` finds it, so
   * it looks fine, but `document.querySelector("#fine-First offence")` cannot
   * address it and — the part that matters — `<label htmlFor>` emits the same
   * broken value, so THE LABEL NEVER ASSOCIATES WITH THE INPUT. Tapping the
   * label does not focus the field and a screen reader announces the input
   * unnamed. `tsc`, `pnpm build`, the test suite and the JSX-space check all
   * passed on it; a browser could not select the field at all, which is how it
   * was found. */
  id: string
  label: string
  onChange: (v: string) => void
  value: string
  parsed: Parsed
  currency: string
}) {
  const bad = parsed === "invalid"
  return (
    <div>
      <label className="mb-1 block text-[11.5px] font-semibold text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
          $
        </span>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder="No schedule"
          className={`w-full rounded-lg border bg-background py-2 pl-7 pr-3 text-[13px] text-foreground focus:outline-none ${
            bad ? "border-destructive" : "border-border focus:border-info"
          }`}
        />
      </div>
      {/* The reason is shown inline, next to the field that caused it, rather
          than as a toast on save. The bounds are the RPC's own — this component
          and `manager_set_fine_schedule` agree on which amounts exist. */}
      {bad ? (
        <p className="mt-1 text-[11.5px] text-destructive">
          Enter an amount between $0.01 and $10,000.00, like 250 or 1,250.50.
        </p>
      ) : parsed === null ? (
        <p className="mt-1 text-[11.5px] text-muted-foreground">No schedule for this degree.</p>
      ) : (
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          {formatCentsForInput(parsed)} {currency.toUpperCase()}
        </p>
      )}
    </div>
  )
}
