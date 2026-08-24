import { describe, expect, it } from "vitest"
import { groupHouseholdTasks, type ScheduledCareTask } from "./care-schedule"

/**
 * The grouping is where a household schedule becomes readable or does not.
 *
 * Isabella's three pets carry byte-identical labels at identical times. Widen
 * the strip naively and she reads "Breakfast, Breakfast, Breakfast" with no
 * clue which animal each belongs to. Group by (label, time), write the label
 * once, and give each pet its own row: the repetition removed is the part
 * that was the same, and the part that differs becomes the content.
 *
 * These fixtures are the Task 1 seed households, so the test and the screen
 * are describing the same data.
 */

const BUDDY = "pet-buddy"
const LOLA = "pet-lola"
const ZOE = "pet-zoe"
const HOUSEHOLD = [BUDDY, LOLA, ZOE]

function task(petId: string, label: string, scheduledAt: string | null, id = `${petId}-${label}`): ScheduledCareTask {
  return {
    id,
    petId,
    label,
    detail: null,
    kind: "meal",
    scheduledAt,
    daysOfWeek: [],
    isActive: true,
    remindMinutesBefore: 0,
    sortOrder: 0,
    doneToday: false,
    recurrence: "daily",
    intervalDays: null,
    nextDueOn: null,
    startsOn: null,
    endsOn: null,
    dose: null,
    targetId: null,
    logAmount: null,
  }
}

describe("groupHouseholdTasks", () => {
  it("collapses three pets' identical Breakfast into one group, in petIds order", () => {
    // Deliberately shuffled: the order must come from petIds, not from input.
    const groups = groupHouseholdTasks(
      [task(ZOE, "Breakfast", "07:30"), task(LOLA, "Breakfast", "07:30"), task(BUDDY, "Breakfast", "07:30")],
      HOUSEHOLD,
      0,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe("Breakfast")
    expect(groups[0].scheduledAt).toBe("07:30")
    expect(groups[0].tasks.map((t) => t.petId)).toEqual([BUDDY, LOLA, ZOE])
  })

  it("keeps the same label at different times apart, soonest first", () => {
    const groups = groupHouseholdTasks(
      [task(LOLA, "Dinner", "18:00"), task(BUDDY, "Dinner", "17:00")],
      HOUSEHOLD,
      0,
    )
    expect(groups.map((g) => g.scheduledAt)).toEqual(["17:00", "18:00"])
    expect(groups.every((g) => g.tasks.length === 1)).toBe(true)
  })

  it("keeps different labels at the same time apart, ordered by label", () => {
    const groups = groupHouseholdTasks(
      [task(BUDDY, "Walk", "08:00"), task(LOLA, "Thyroid tablet", "08:00")],
      HOUSEHOLD,
      0,
    )
    expect(groups.map((g) => g.label)).toEqual(["Thyroid tablet", "Walk"])
  })

  it("treats a hand-typed 'Breakfast' and ' breakfast ' as the same meal", () => {
    // These labels are typed by an owner, once per pet. Case and stray spaces
    // are not a different intention.
    const groups = groupHouseholdTasks(
      [task(BUDDY, "Breakfast", "07:30"), task(LOLA, " breakfast ", "07:30")],
      HOUSEHOLD,
      0,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].tasks).toHaveLength(2)
    // The group shows the first member's label as the owner typed it.
    expect(groups[0].label).toBe("Breakfast")
  })

  it("sinks an all-day task to the bottom whatever its label", () => {
    const groups = groupHouseholdTasks(
      [task(BUDDY, "Aaa brush", null), task(LOLA, "Zzz supper", "19:00")],
      HOUSEHOLD,
      0,
    )
    expect(groups.map((g) => g.label)).toEqual(["Zzz supper", "Aaa brush"])
    expect(groups[1].scheduledAt).toBeNull()
  })

  it("calls a group overdue only strictly past its time, and never when all-day", () => {
    const at8 = [task(BUDDY, "Breakfast", "08:00")]
    expect(groupHouseholdTasks(at8, HOUSEHOLD, 479)[0].overdue).toBe(false) // 07:59
    expect(groupHouseholdTasks(at8, HOUSEHOLD, 480)[0].overdue).toBe(false) // 08:00, due now
    expect(groupHouseholdTasks(at8, HOUSEHOLD, 481)[0].overdue).toBe(true) // 08:01
    expect(groupHouseholdTasks([task(BUDDY, "Brush", null)], HOUSEHOLD, 1439)[0].overdue).toBe(false)
  })

  it("returns nothing for an empty household", () => {
    expect(groupHouseholdTasks([], HOUSEHOLD, 600)).toEqual([])
    expect(groupHouseholdTasks([], [], 600)).toEqual([])
  })
})
