import { describe, expect, it } from "vitest"
import {
  EMAIL_KINDS,
  EMAIL_MIN_AGE_MS,
  DISPATCH_WINDOW_MS,
  digestTarget,
  groupByRecipient,
  isEmailEligible,
  isPushGone,
  pushPayload,
  type EmailCandidate,
} from "./dispatch"

const NOW = Date.parse("2026-10-11T12:00:00Z")
const ago = (ms: number) => new Date(NOW - ms).toISOString()

function row(over: Partial<EmailCandidate> = {}): EmailCandidate {
  return {
    id: "n1",
    profile_id: "p1",
    email: "a@example.test",
    full_name: "Ann",
    kind: "incident",
    severity: "info",
    title: "New incident",
    body: null,
    action_label: null,
    action_target: "incidents",
    created_at: ago(10 * 60 * 1000),
    read_at: null,
    notify_email: true,
    ...over,
  }
}

describe("isEmailEligible", () => {
  it("accepts an unread, opted-in notification of an email kind, between 2 minutes and 24 hours old", () => {
    expect(isEmailEligible(row(), NOW)).toBe(true)
  })

  it("emails exactly the seven kinds the spec lists, and never assistant, care or community", () => {
    expect([...EMAIL_KINDS].sort()).toEqual(
      ["appointment", "billing", "building", "clinic", "compliance", "incident", "reminder"],
    )
    for (const kind of ["assistant", "care", "community", "system"] as const) {
      expect(isEmailEligible(row({ kind }), NOW), kind).toBe(false)
    }
  })

  it("skips a notification already read in the app", () => {
    expect(isEmailEligible(row({ read_at: ago(60 * 1000) }), NOW)).toBe(false)
  })

  it("skips a recipient who turned email off, or has no address", () => {
    expect(isEmailEligible(row({ notify_email: false }), NOW)).toBe(false)
    expect(isEmailEligible(row({ email: null }), NOW)).toBe(false)
    expect(isEmailEligible(row({ email: "  " }), NOW)).toBe(false)
  })

  it("waits two minutes, so a read in the app can suppress the email", () => {
    expect(isEmailEligible(row({ created_at: ago(EMAIL_MIN_AGE_MS - 1000) }), NOW)).toBe(false)
    expect(isEmailEligible(row({ created_at: ago(EMAIL_MIN_AGE_MS) }), NOW)).toBe(true)
  })

  it("gives up after 24 hours, and on a date it cannot read", () => {
    expect(isEmailEligible(row({ created_at: ago(DISPATCH_WINDOW_MS + 1000) }), NOW)).toBe(false)
    expect(isEmailEligible(row({ created_at: "not a date" }), NOW)).toBe(false)
  })
})

describe("groupByRecipient", () => {
  it("keeps one entry per person, oldest notification first, in first-seen order", () => {
    const groups = groupByRecipient([
      row({ id: "b2", profile_id: "b", created_at: ago(3000 * 60) }),
      row({ id: "a1", profile_id: "a", created_at: ago(5000 * 60) }),
      row({ id: "b1", profile_id: "b", created_at: ago(4000 * 60) }),
    ])
    expect(groups.map((g) => g.profileId)).toEqual(["b", "a"])
    expect(groups[0].items.map((i) => i.id)).toEqual(["b1", "b2"])
    expect(groups[0].email).toBe("a@example.test")
  })

  it("returns nothing for nothing", () => {
    expect(groupByRecipient([])).toEqual([])
  })
})

describe("digestTarget", () => {
  it("opens the shared screen when every item names the same one", () => {
    expect(digestTarget([row({ action_target: "business:bookings" }), row({ action_target: "business:bookings" })])).toBe(
      "business:bookings",
    )
  })

  it("opens Alerts when they differ, or when one has no target", () => {
    expect(digestTarget([row({ action_target: "incidents" }), row({ action_target: "approvals" })])).toBe("alerts")
    expect(digestTarget([row({ action_target: "incidents" }), row({ action_target: null })])).toBe("alerts")
  })
})

describe("pushPayload", () => {
  it("carries the title, body, a per-notification tag and the deep link", () => {
    expect(
      JSON.parse(
        pushPayload({ id: "n9", title: "Booking confirmed", body: "See you Tuesday.", action_target: "my-bookings" }),
      ),
    ).toEqual({
      title: "Booking confirmed",
      body: "See you Tuesday.",
      tag: "n9",
      url: "/app?target=my-bookings",
    })
  })

  it("trims a long body so the payload stays under the push size limit", () => {
    const p = JSON.parse(pushPayload({ id: "n", title: "t", body: "x".repeat(5000), action_target: null }))
    expect(p.body.length).toBeLessThanOrEqual(300)
    expect(p.url).toBe("/app")
  })
})

describe("isPushGone", () => {
  it("treats 404 and 410 as a subscription that no longer exists", () => {
    expect(isPushGone({ statusCode: 404 })).toBe(true)
    expect(isPushGone({ statusCode: 410 })).toBe(true)
  })

  it("treats anything else as worth retrying", () => {
    expect(isPushGone({ statusCode: 500 })).toBe(false)
    expect(isPushGone({ statusCode: 429 })).toBe(false)
    expect(isPushGone(new Error("network"))).toBe(false)
    expect(isPushGone(null)).toBe(false)
  })
})
