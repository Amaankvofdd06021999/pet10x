/**
 * The set-up checklist on Today: what a new practice still has to do before
 * owners can book it and the console earns its keep. Pure, so the rules are
 * tested and the card only renders them.
 *
 * seed_business_defaults (20261015000006) gives every practice starter
 * services priced at 0 ("Price on request") and Mon–Fri hours for the owner,
 * so a fresh practice is bookable — but nobody has looked at those numbers
 * yet. The checklist is how they are asked to.
 */

export type VerificationProgress = "verified" | "none" | "requested" | "needs_info" | "rejected"

export interface SetupInput {
  types: Array<{ isActive: boolean; priceCents: number }>
  staff: Array<{ id: string; isActive: boolean; isBookable: boolean }>
  /** Staff ids with at least one staff_availability row. */
  staffWithHours: string[]
  verification: VerificationProgress
}

export type SetupTarget = { tab: "shop"; view: "services" } | { tab: "team" } | { tab: "verification" }

export interface SetupItem {
  id: "types" | "hours" | "team" | "verification"
  label: string
  detail: string
  done: boolean
  target: SetupTarget
  /** null when there is nothing to press — e.g. waiting on Pet10x. */
  actionLabel: string | null
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `${n} ${one}` : `${n} ${many}`)

export function clinicSetupChecklist(input: SetupInput): {
  items: SetupItem[]
  doneCount: number
  complete: boolean
} {
  const active = input.types.filter((t) => t.isActive)
  const unpriced = active.filter((t) => t.priceCents === 0).length
  const types: SetupItem = {
    id: "types",
    label: "Set your services and prices",
    detail:
      active.length === 0
        ? "Add at least one service so there is something to book."
        : unpriced > 0
          ? `${plural(unpriced, "service shows", "services show")} Price on request. Set a price, or leave it if that's what you want.`
          : "Durations drive the calendar; prices show to owners.",
    // Price on request is a legitimate choice, so prices are a nudge, not a gate.
    done: active.length > 0,
    target: { tab: "shop", view: "services" },
    actionLabel: "Edit services",
  }

  const bookable = input.staff.filter((s) => s.isActive && s.isBookable)
  const withHours = new Set(input.staffWithHours)
  const missing = bookable.filter((s) => !withHours.has(s.id)).length
  const hours: SetupItem = {
    id: "hours",
    label: "Set weekly hours",
    detail:
      bookable.length === 0
        ? "Put at least one clinician on the calendar and give them weekly hours."
        : missing > 0
          ? `${plural(missing, "clinician on the calendar has", "clinicians on the calendar have")} no weekly hours, so nobody can book them.`
          : "Online booking offers times inside these hours.",
    done: bookable.length > 0 && missing === 0,
    target: { tab: "team" },
    actionLabel: "Edit hours",
  }

  const activeStaff = input.staff.filter((s) => s.isActive).length
  const team: SetupItem = {
    id: "team",
    label: "Invite your team",
    detail:
      activeStaff > 1
        ? `${plural(activeStaff, "person", "people")} on the team.`
        : "Invite the people who work with you, so each signs in as themselves.",
    // A practice of one is a whole team; the invite stays as a suggestion.
    done: activeStaff >= 1,
    target: { tab: "team" },
    actionLabel: "Invite staff",
  }

  const v = input.verification
  const verification: SetupItem = {
    id: "verification",
    label: "Get verified",
    detail:
      v === "verified"
        ? "Verified practices receive shared records and take Pet10x bookings."
        : v === "requested"
          ? "Pet10x is reviewing your request. You'll be notified of the decision."
          : v === "needs_info"
            ? "Pet10x has a question about your request."
            : v === "rejected"
              ? "Your last request wasn't approved. You can send another."
              : "Verify to receive shared records and take Pet10x bookings.",
    done: v === "verified",
    target: { tab: "verification" },
    actionLabel:
      v === "none"
        ? "Request verification"
        : v === "needs_info"
          ? "Answer Pet10x"
          : v === "rejected"
            ? "Request again"
            : null,
  }

  const items = [types, hours, team, verification]
  const doneCount = items.filter((i) => i.done).length
  return { items, doneCount, complete: doneCount === items.length }
}
