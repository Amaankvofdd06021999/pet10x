import { describe, it, expect } from "vitest"
import { clinicSetupChecklist, type SetupInput } from "./setup-checklist"

const vet = { id: "s1", isActive: true, isBookable: true }
const nurse = { id: "s2", isActive: true, isBookable: false }

const complete: SetupInput = {
  types: [{ isActive: true, priceCents: 8500 }],
  staff: [vet, nurse],
  staffWithHours: ["s1"],
  verification: "verified",
}

describe("clinicSetupChecklist", () => {
  it("lists types, hours, team and verification, each linked to where it is fixed", () => {
    const out = clinicSetupChecklist(complete)
    expect(out.items.map((i) => [i.id, i.target])).toEqual([
      ["types", { tab: "shop", view: "services" }],
      ["hours", { tab: "team" }],
      ["team", { tab: "team" }],
      ["verification", { tab: "verification" }],
    ])
    expect(out.items.every((i) => i.done)).toBe(true)
    expect(out.doneCount).toBe(4)
    expect(out.complete).toBe(true)
  })

  it("marks services done once one is offered, still mentioning any without a price", () => {
    const unpriced = clinicSetupChecklist({
      ...complete,
      types: [
        { isActive: true, priceCents: 8500 },
        { isActive: true, priceCents: 0 },
        { isActive: false, priceCents: 0 },
      ],
    }).items[0]
    expect(unpriced.done).toBe(true)
    expect(unpriced.detail).toBe("1 service shows Price on request. Set a price, or leave it if that's what you want.")
    expect(clinicSetupChecklist({ ...complete, types: [{ isActive: false, priceCents: 100 }] }).items[0]).toMatchObject({
      done: false,
      detail: "Add at least one service so there is something to book.",
    })
  })

  it("leaves hours open until every active bookable clinician has some", () => {
    const vet2 = { id: "s3", isActive: true, isBookable: true }
    const hours = clinicSetupChecklist({ ...complete, staff: [vet, vet2, nurse] }).items[1]
    expect(hours.done).toBe(false)
    expect(hours.detail).toBe("1 clinician on the calendar has no weekly hours, so nobody can book them.")
    // An inactive or non-bookable member never counts.
    expect(
      clinicSetupChecklist({ ...complete, staff: [vet, { id: "s4", isActive: false, isBookable: true }, nurse] }).items[1]
        .done,
    ).toBe(true)
    expect(clinicSetupChecklist({ ...complete, staff: [nurse] }).items[1]).toMatchObject({
      done: false,
      detail: "Put at least one clinician on the calendar and give them weekly hours.",
    })
  })

  it("counts a practice of one as a team, still suggesting an invite", () => {
    expect(clinicSetupChecklist({ ...complete, staff: [vet] }).items[2]).toMatchObject({
      done: true,
      detail: "Invite the people who work with you, so each signs in as themselves.",
    })
    expect(clinicSetupChecklist({ ...complete, staff: [{ id: "s9", isActive: false, isBookable: false }] }).items[2]).toMatchObject({
      done: false,
    })
  })

  it("follows verification through request, question and decision", () => {
    const v = (verification: SetupInput["verification"]) => clinicSetupChecklist({ ...complete, verification }).items[3]
    expect(v("none")).toMatchObject({ done: false, actionLabel: "Request verification" })
    expect(v("requested")).toMatchObject({ done: false, actionLabel: null })
    expect(v("needs_info")).toMatchObject({ done: false, actionLabel: "Answer Pet10x" })
    expect(v("rejected")).toMatchObject({ done: false, actionLabel: "Request again" })
    const out = clinicSetupChecklist({ ...complete, verification: "none" })
    expect(out.doneCount).toBe(3)
    expect(out.complete).toBe(false)
  })
})
