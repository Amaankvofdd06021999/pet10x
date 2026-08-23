/**
 * Pet10x — the bylaw fine schedule, as the client understands it.
 *
 * TWO HALVES THAT MUST AGREE, which is the whole reason this is one module.
 *
 *   `readFineSchedule`   what `buildings.pet_rules` says a fine costs.
 *   `parseAmountToCents` what a manager typed, turned into what the database
 *                        would store.
 *
 * A value the editor is willing to SEND must be a value the client is willing
 * to DISPLAY and the database is willing to CHARGE. Split across two files
 * those three drift; `fine-schedule.test.ts` asserts the round trip.
 *
 * WHY IT LIVES HERE AND NOT IN `manager-queues.ts`
 *
 * `readFineSchedule` was at `manager-queues.ts:1212` — inside a `"use client"`
 * module full of React hooks and a Supabase client, so it was untestable where
 * it stood under vitest's `environment: "node"`. It is also the function that
 * decides whether a manager is shown a bylaw default at all. Moved verbatim,
 * with no behaviour change; the same split `violations.ts` made from the same
 * file for the same reason.
 *
 * THE GRAMMAR IS POSITIVE. Every function below states the one shape a value is
 * allowed to take and rejects everything else, rather than listing the shapes
 * it will not accept. The database says the same thing in the same terms:
 * `manager_set_fine_schedule` takes an integer 1..1000000 or NULL, and
 * `manager_advance_violation` reads only `jsonb_typeof(...) = 'number'`.
 */

/**
 * What `buildings.pet_rules` says a fine of each degree should cost.
 *
 * AD-5 puts the schedule under `fine_1_cents` / `fine_2_cents` /
 * `fine_currency`, which is where `manager_advance_violation` reads it from
 * (`20260823000001:129-160`). **Measured 2026-08-23, before this phase: 0 of 6
 * buildings had any of those keys**, so `null` was the normal answer and the
 * caller has to treat "no schedule configured" as a first-class state rather
 * than as a missing default it can quietly substitute for. Phase 6 ships the
 * writer (`manager_set_fine_schedule`), so it can now be non-null — but a
 * building that has never had one still answers null, and always will until a
 * manager decides otherwise.
 *
 * The reader is deliberately narrow — a number, or nothing. The RPC applies the
 * same rule, so a schedule the client is willing to display is exactly a
 * schedule the database is willing to charge.
 */
export interface FineSchedule {
  fine_1: number | null
  fine_2: number | null
  currency: string
}

export function readFineSchedule(rules: unknown): FineSchedule {
  const r = (rules ?? {}) as Record<string, unknown>
  const cents = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : null
  const currency = typeof r.fine_currency === "string" && r.fine_currency.trim() ? r.fine_currency.trim() : "CAD"
  return {
    fine_1: cents(r.fine_1_cents),
    fine_2: cents(r.fine_2_cents),
    currency: currency.toUpperCase(),
  }
}

/** The inclusive cent range `manager_set_fine_schedule` accepts: 1¢ to $10,000. */
export const MIN_FINE_CENTS = 1
export const MAX_FINE_CENTS = 1_000_000

/**
 * The two shapes a typed amount is allowed to take, after `$` and whitespace
 * are removed. Anything else is invalid.
 *
 *   PLAIN     250        250.5      250.00      10000
 *   GROUPED   1,250      1,250.50   10,000.00
 *
 * GROUPED is written as a real grammar rather than "strip every comma", which
 * is the shortcut this would normally get. Stripping would silently accept
 * `1,2,3` as 123 and `2,50` as 250 — a manager who typed a European decimal
 * comma meaning two dollars fifty would be charged two hundred and fifty. A
 * separator that is only valid in the position it actually means something is
 * the difference between parsing and guessing.
 */
const PLAIN = /^\d{1,5}(\.\d{1,2})?$/
const GROUPED = /^\d{1,2},\d{3}(\.\d{1,2})?$/

/**
 * Dollars as typed by a manager → integer cents, `null` for "no schedule for
 * this degree", or the literal `"invalid"`.
 *
 * `""` is `null` and not an error: an empty field is how a manager REMOVES a
 * degree from the schedule, which `manager_set_fine_schedule` writes by
 * deleting the key rather than storing a JSON null.
 *
 * NO FLOAT ARITHMETIC. The obvious `Math.round(parseFloat(s) * 100)` is
 * avoided, not because it is wrong for these inputs — it happens to round
 * correctly for every two-decimal value in range — but because it makes the
 * answer depend on IEEE-754 representation for a value that is exactly
 * expressible as an integer. The whole and fractional parts are read as
 * separate integers and combined, so `"1,250.50"` is `1250 * 100 + 50` and
 * nothing rounds.
 *
 * The range is re-checked here against the same bounds the RPC enforces, so
 * the editor's Save button and the database agree on which amounts exist. A
 * `"0"` is `"invalid"` rather than `null`: zero is not "no schedule", it is a
 * price of nothing, and `manager_advance_violation` would refuse it later
 * anyway (`coalesce(v_amount,0) <= 0` -> `no_fine_amount`).
 */
export function parseAmountToCents(input: string): number | null | "invalid" {
  const trimmed = (input ?? "").trim()
  if (trimmed === "") return null

  // Only a LEADING currency symbol, and only one. `250$` is not how anyone
  // writes an amount, and accepting it would mean accepting `2$50`.
  const bare = trimmed.replace(/^\$\s*/, "").replace(/\s+/g, "")
  if (!PLAIN.test(bare) && !GROUPED.test(bare)) return "invalid"

  const [whole, frac = ""] = bare.replace(/,/g, "").split(".")
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2))

  if (!Number.isSafeInteger(cents)) return "invalid"
  if (cents < MIN_FINE_CENTS || cents > MAX_FINE_CENTS) return "invalid"
  return cents
}

/**
 * Integer cents → the dollars string the editor shows in its input.
 *
 * The inverse of `parseAmountToCents` for every value that function returns, so
 * a schedule loaded from the database, displayed, and saved again without being
 * touched comes back byte-identical. Two decimal places always: `$250` and
 * `$250.00` are the same money, and showing the trailing zeros is what tells a
 * manager the field holds an amount rather than a count.
 */
export function formatCentsForInput(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return ""
  const whole = Math.floor(cents / 100)
  const frac = Math.abs(cents % 100)
  return `${whole}.${String(frac).padStart(2, "0")}`
}

/** The three keys the schedule occupies inside `buildings.pet_rules`. */
export const FINE_SCHEDULE_KEYS = ["fine_1_cents", "fine_2_cents", "fine_currency"] as const

/**
 * A copy of `pet_rules` with the fine schedule removed.
 *
 * WHAT THIS IS FOR. Three surfaces round-trip the WHOLE `pet_rules` object —
 * both bylaw editors and the strata portal's template BulkApply — and none of
 * them means to write the schedule; the keys are just along for the ride. Two
 * consequences follow, and this function is the client half of both:
 *
 *   1. A toggle editor that holds the schedule in its local state compares that
 *      stale copy against a refetched building and decides it has UNSAVED
 *      CHANGES the moment somebody saves a schedule. The "Save bylaws" button
 *      lights up over an edit nobody made.
 *
 *   2. A template saved from building A would carry A's fine schedule in
 *      localStorage and try to apply it to building B. `buildings_fine_schedule_
 *      guard` refuses that in the database — it restores B's own values — but a
 *      template that silently contains another building's prices is a thing
 *      nobody should be storing in the first place.
 *
 * The DATABASE is the enforcement point either way: the guard makes every one of
 * those writes incapable of moving the schedule, whatever the client sends. This
 * is what stops the client from sending it at all, so the guard is a backstop
 * rather than the only thing standing between a template and a building's
 * prices.
 */
export function stripFineSchedule<T extends object>(rules: T): T {
  const out: Record<string, unknown> = { ...(rules as Record<string, unknown>) }
  for (const k of FINE_SCHEDULE_KEYS) delete out[k]
  return out as T
}

/** "$250.00 CAD" — the one way this module renders an amount for reading. */
export function formatFineAmount(cents: number | null | undefined, currency: string): string {
  if (cents == null) return "Not set"
  return `$${formatCentsForInput(cents)} ${currency.toUpperCase()}`
}
