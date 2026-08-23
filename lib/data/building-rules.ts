/**
 * Pet10x — house rules, and the requirements they are NOT.
 *
 * AD-9's whole point is that two things which look alike stay apart:
 *
 *   A HOUSE RULE is authored text. A person wrote it, it has a category, a
 *   title and a body, and NOTHING CHECKS IT. It is a statement.
 *
 *   A REQUIREMENT is one of the booleans in `buildings.pet_rules`. A machine
 *   checks it — `computeCompliance` (live.ts:53) reads it, the resident's
 *   missing-info card reads it, every compliance percentage in the manager's
 *   portfolio reads it. It is a predicate.
 *
 * If those merge, a manager typing "no dogs over 25 kg" into a parking notice
 * silently moves somebody's compliance score. The database keeps them in two
 * places; this module keeps them in two functions; the screens label them
 * differently and never interleave them.
 *
 * Pure by design, for the reason `violations.ts` and `disputes.ts` are: vitest
 * runs `environment: "node"` with no DOM and no session, so anything that
 * imports a Supabase client or a React hook is untestable. The hooks and
 * mutations are in `building-rules-live.ts`.
 */

import { Constants } from "@/lib/supabase/database.types"
import type { Database } from "@/lib/supabase/database.types"
import { shortDate } from "@/lib/dates"

export type BuildingRuleCategory = Database["public"]["Enums"]["building_rule_category"]

/**
 * Every category, taken from the GENERATED enum rather than retyped.
 *
 * The load-bearing import, and the same trick `violations.ts` uses for
 * `VIOLATION_STAGES`. `Constants.public.Enums.building_rule_category` is
 * regenerated from the live database, so a seventh category added in SQL and
 * forgotten here is a compile error on `CATEGORY_LABEL` — not a rule that
 * silently stops appearing on the resident's screen because a hand-written
 * array never heard of it.
 */
export const CATEGORIES = Constants.public.Enums.building_rule_category

/**
 * The order a resident reads them in, which is NOT the enum's declaration
 * order.
 *
 * `parking` is first because it is what the user actually asked for, and
 * `other` is last because a category that means "none of the above" cannot
 * sensibly precede the things it is not. `building-rules.test.ts` asserts this
 * is a PERMUTATION of `CATEGORIES` — same length, same members — so a display
 * order can be re-argued without a category being able to fall out of it.
 */
export const CATEGORY_ORDER: readonly BuildingRuleCategory[] = [
  "parking",
  "pets",
  "noise",
  "waste",
  "common_areas",
  "other",
]

/**
 * A `Record` over the generated enum, deliberately, not a lookup with a
 * fallback. A fallback would render a seventh category as its raw SQL label
 * (`bike_storage`) on a resident-facing screen; this way the seventh category
 * cannot be added without somebody choosing the words a resident reads.
 */
export const CATEGORY_LABEL: Record<BuildingRuleCategory, string> = {
  pets: "Pets",
  parking: "Parking",
  noise: "Noise",
  waste: "Waste & Recycling",
  common_areas: "Common Areas",
  other: "Other",
}

/** One authored rule, as both the manager's editor and the resident's screen see it. */
export interface BuildingRule {
  id: string
  buildingId: string
  category: BuildingRuleCategory
  title: string
  /** VERBATIM. Every line break the manager typed is content. */
  body: string
  isPublished: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface RuleGroup {
  category: BuildingRuleCategory
  label: string
  rules: BuildingRule[]
}

/**
 * Group rules for display, in `CATEGORY_ORDER`, sorted by `sort_order` then
 * `created_at` within each.
 *
 * EMPTY CATEGORIES ARE OMITTED. A screen that renders "Noise" with nothing
 * under it tells a resident their building has a noise rule and then fails to
 * show it — worse than not mentioning noise at all, because the absence looks
 * like a loading failure rather than a fact.
 *
 * The tie-break on `created_at` matters: every rule saved through
 * `manager_save_building_rule` without an explicit order gets
 * `max(sort_order)+1` WITHIN ITS CATEGORY, so two categories both start at 0
 * and reordering one never disturbs the other. Two rules can still share a
 * sort_order if a manager reorders concurrently, and without the tie-break the
 * list would shuffle between renders for no visible reason.
 */
export function groupByCategory(rules: BuildingRule[]): RuleGroup[] {
  const groups: RuleGroup[] = []
  for (const category of CATEGORY_ORDER) {
    const inCategory = rules
      .filter((r) => r.category === category)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    if (inCategory.length === 0) continue
    groups.push({ category, label: CATEGORY_LABEL[category], rules: inCategory })
  }
  return groups
}

/**
 * "Updated 3d ago" — how current the thing the resident is reading is.
 *
 * Every rule card carries one (Decision 7). The screen does not poll and does
 * not subscribe to realtime — text changing under a reader's eyes mid-sentence
 * is worse for a legal document than being a minute stale — so the reader is
 * told how old their copy is instead.
 *
 * `now` is injectable so this is testable without freezing the clock.
 *
 * `updated_at` is a `timestamptz`, NOT a date. That matters here: the last
 * phase shipped four date-only values rendering one day early, because
 * `new Date("2026-08-23")` is parsed as UTC midnight and then displayed in
 * local time. A full timestamp carries its own offset and has no such hazard —
 * but the distinction is worth stating, because the fix for a date column is
 * different and this function must not be reused for one.
 */
export function relativeUpdated(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "Updated recently"

  const seconds = Math.max(0, (now.getTime() - then) / 1000)
  if (seconds < 60) return "Updated just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Updated ${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Updated ${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `Updated ${days}d ago`
  // Through the shared rule. `updated_at` is a `timestamptz` and rendering an
  // instant in the reader's zone is correct, so this is a consolidation rather
  // than a fix — but it is one fewer place that spells the rule for itself.
  return `Updated ${shortDate(iso, "recently")}`
}

/* ------------------------------------------------------------------------ */
/* The OTHER thing — the machine-checked requirements                        */
/* ------------------------------------------------------------------------ */

/** One requirement a machine checks, rendered as a sentence a person reads. */
export interface Requirement {
  key: string
  label: string
}

/**
 * The six compliance booleans, as a POSITIVE GRAMMAR: named one by one, in the
 * order the bylaw editors already show them (`bylaws-editor.tsx:11`), so a
 * manager toggling a switch and a resident reading the list see the same
 * wording in the same sequence.
 *
 * Written out rather than derived by iterating the jsonb's keys. That
 * derivation is the tempting one and it is wrong twice over: `pet_rules` also
 * holds `fine_1_cents`, `notes` and `quiet_hours`, so iterating would show a
 * resident their building's fine schedule under the heading "requirements Pet10x
 * checks" — which is false, nothing checks it — and it would render an unknown
 * future key by its raw SQL name.
 */
const REQUIREMENT_FLAGS: { key: string; label: string }[] = [
  { key: "requires_registry", label: "Pets must be registered with the building" },
  { key: "require_rabies", label: "Rabies vaccination required" },
  { key: "require_core_vaccines", label: "Core vaccines required" },
  { key: "require_license", label: "Municipal pet licence required" },
  { key: "require_insurance", label: "Liability insurance required" },
  { key: "require_spay_neuter", label: "Spay/neuter required" },
]

/**
 * What Pet10x actually checks for this building, from `buildings.pet_rules`.
 *
 * Only requirements that are TRUE are returned. A false toggle is not a rule —
 * listing "Liability insurance: not required" would fill a resident's screen
 * with the absence of rules, and `computeCompliance` does not score it either.
 *
 * `max_weight_kg` and `max_pets_per_unit` are included when present because
 * they are numeric limits a machine enforces, not prose. `notes`,
 * `quiet_hours`, `designated_relief_area` and `breed_restrictions` are
 * deliberately NOT here: they are authored text sitting in the compliance
 * object, which is exactly what AD-9 separates. Task 5's editor offers the
 * manager a one-button copy of them into a real rule; nothing displays them as
 * checked requirements.
 */
export function readRequirements(petRules: unknown): Requirement[] {
  const r = (petRules ?? {}) as Record<string, unknown>
  const out: Requirement[] = REQUIREMENT_FLAGS.filter((f) => r[f.key] === true).map((f) => ({
    key: f.key,
    label: f.label,
  }))

  const weight = r.max_weight_kg
  if (typeof weight === "number" && Number.isFinite(weight) && weight > 0) {
    out.push({ key: "max_weight_kg", label: `Maximum pet weight: ${weight} kg` })
  }

  const perUnit = r.max_pets_per_unit
  if (typeof perUnit === "number" && Number.isFinite(perUnit) && perUnit > 0) {
    out.push({
      key: "max_pets_per_unit",
      label: `Maximum ${perUnit} pet${perUnit === 1 ? "" : "s"} per unit`,
    })
  }

  return out
}

/**
 * The three keys that hold authored prose inside the compliance object, and
 * the labels the editor prefixes them with when a manager copies them out.
 *
 * Maple Court Residences carries real text in all three today — `notes`
 * ("Standard Bylaw 3(4) as amended March 2025…"), `quiet_hours`
 * ("22:00-07:00") and `designated_relief_area` ("Northwest lawn, off the P1
 * exit"). That is the only real rules content on the platform, and it is
 * stranded where no resident screen shows it.
 */
const LEGACY_NOTE_KEYS: { key: string; label: string }[] = [
  { key: "notes", label: "Bylaw reference" },
  { key: "quiet_hours", label: "Quiet hours" },
  { key: "designated_relief_area", label: "Designated relief area" },
]

/**
 * Turn whatever prose is stranded in `pet_rules` into a draft body a manager
 * can edit and publish — or `null` when there is none.
 *
 * It writes nothing and removes nothing. The manager presses a button, reads
 * what it produced, edits it, and publishes deliberately. No automatic
 * migration, and no screen that renders these keys as though a manager had
 * published them.
 */
export function legacyNoteDraft(petRules: unknown): string | null {
  const r = (petRules ?? {}) as Record<string, unknown>
  const lines = LEGACY_NOTE_KEYS.flatMap(({ key, label }) => {
    const v = r[key]
    return typeof v === "string" && v.trim() ? [`${label}: ${v.trim()}`] : []
  })
  return lines.length > 0 ? lines.join("\n\n") : null
}
