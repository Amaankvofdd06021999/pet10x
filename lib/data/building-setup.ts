/**
 * The "Get your building ready" checklist (BM-8), as pure decisions.
 *
 * A new manager used to land on a dashboard of zeros with the building code
 * buried in Settings. The four jobs below are what makes a building usable for
 * its residents; each row is done from data the app already has, and each
 * names the Settings sheet that does the job. The targets use tabs
 * `lib/app-route.ts` accepts for `settings`, so a row opens the same place
 * from a link as from a tap.
 */
import { readFineSchedule } from "./fine-schedule"
import { readRequirements } from "./building-rules"

export type SetupKey = "bylaws" | "fines" | "rules" | "staff"

export interface SetupInputs {
  bylawsPublished: boolean
  fineScheduleSet: boolean
  houseRulesCount: number
  /** Managers other than the viewer. */
  staffCount: number
}

export interface SetupRow {
  key: SetupKey
  label: string
  done: boolean
  target: { screen: "settings"; tab: SetupKey }
}

export function setupChecklist(b: SetupInputs): SetupRow[] {
  return [
    { key: "bylaws", label: "Publish your pet bylaws", done: b.bylawsPublished },
    { key: "fines", label: "Set the fine schedule", done: b.fineScheduleSet },
    { key: "rules", label: "Publish a house rule", done: b.houseRulesCount > 0 },
    { key: "staff", label: "Add a co-manager or staff member", done: b.staffCount > 0 },
  ].map((r) => ({ ...r, key: r.key as SetupKey, target: { screen: "settings" as const, tab: r.key as SetupKey } }))
}

/**
 * Bylaws are "published" once `pet_rules` holds at least one requirement a
 * machine checks — the same reading residents get (`readRequirements`). A
 * building that has only toggled things off has published nothing.
 */
export function bylawsPublished(petRules: unknown): boolean {
  return readRequirements(petRules).length > 0
}

/** Set once either fine has a price; `readFineSchedule` is the rule the database charges by. */
export function fineScheduleSet(petRules: unknown): boolean {
  const s = readFineSchedule(petRules)
  return s.fine_1 !== null || s.fine_2 !== null
}

/** localStorage key for "I have hidden this building's checklist". */
export function setupHiddenKey(buildingId: string): string {
  return `pet10x.setup-hidden.${buildingId}`
}
