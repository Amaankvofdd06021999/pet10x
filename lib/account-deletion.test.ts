import { describe, expect, it } from "vitest"
import { deletionBlocker, isOwnCommunityObject, objectPaths } from "./account-deletion"

const none = { cases: [], fines: [], businessBookings: [] }

describe("deletionBlocker", () => {
  it("lets an account with no history go", () => {
    expect(deletionBlocker(none)).toBeNull()
  })

  it("lets closed history go — it is kept de-identified", () => {
    expect(
      deletionBlocker({
        cases: [
          { stage: "resolved", buildingName: "Harbour View" },
          { stage: "dismissed", buildingName: "Harbour View" },
        ],
        fines: [
          { status: "paid", buildingName: "Harbour View" },
          { status: "waived", buildingName: "Harbour View" },
        ],
        businessBookings: [{ status: "completed" }, { status: "cancelled" }, { status: "paid" }],
      }),
    ).toBeNull()
  })

  it("refuses an open case and names the building", () => {
    const msg = deletionBlocker({ ...none, cases: [{ stage: "warning", buildingName: "Cedar Grove" }] })
    expect(msg).toBe(
      "You have an open bylaw case with Cedar Grove. It needs to be closed before the account can be deleted — contact your building manager.",
    )
  })

  it("refuses an outstanding or disputed fine on a closed case", () => {
    for (const status of ["issued", "partially_paid", "disputed"]) {
      expect(
        deletionBlocker({
          ...none,
          cases: [{ stage: "resolved", buildingName: "Cedar Grove" }],
          fines: [{ status, buildingName: "Cedar Grove" }],
        }),
      ).toMatch(/open bylaw case with Cedar Grove/)
    }
  })

  it("says 'your building' when the name could not be read", () => {
    expect(deletionBlocker({ ...none, cases: [{ stage: "open", buildingName: null }] })).toMatch(
      /open bylaw case with your building\./,
    )
  })

  it("refuses a business with bookings still to answer", () => {
    for (const status of ["requested", "confirmed", "in_progress"]) {
      expect(deletionBlocker({ ...none, businessBookings: [{ status }] })).toMatch(/bookings that are still open/)
    }
  })
})

describe("objectPaths", () => {
  it("keeps storage paths once and drops public assets, URLs and blanks", () => {
    expect(
      objectPaths(["u/p/a.jpg", "/placeholder.svg", "https://x/y.png", null, undefined, "", "u/p/a.jpg"]),
    ).toEqual(["u/p/a.jpg"])
  })
})

describe("isOwnCommunityObject", () => {
  it("matches the uploader segment only", () => {
    expect(isOwnCommunityObject("b1/me/post-abc.jpg", "me")).toBe(true)
    expect(isOwnCommunityObject("b1/someone/post-abc.jpg", "me")).toBe(false)
    expect(isOwnCommunityObject("me/post-abc.jpg", "me")).toBe(false)
  })
})

describe("deletionBlocker — businesses others rely on", () => {
  it("refuses while the business has other active staff or any patient records", () => {
    for (const dep of [
      { otherActiveStaff: 1, patients: 0 },
      { otherActiveStaff: 0, patients: 3 },
    ]) {
      expect(deletionBlocker({ ...none, businessDependants: dep })).toMatch(/Transfer ownership first, or contact support/)
    }
  })

  it("lets a sole owner with no patients go", () => {
    expect(deletionBlocker({ ...none, businessDependants: { otherActiveStaff: 0, patients: 0 } })).toBeNull()
  })
})
