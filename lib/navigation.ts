/**
 * The screens `app/app/page.tsx` can render, and who can reach each one.
 *
 * WHY THIS FILE EXISTS
 *
 * `notifications.action_target` is written by the database — five migrations
 * and two API routes set it — and read by `alerts-screen.tsx`, which turns it
 * into a button. Until Phase 3 that button called `toast.success(actionLabel)`
 * and navigated nowhere, so every target ever written was decoration.
 *
 * Wiring it naively would replace one lie with a worse one, because the router
 * is SPLIT BY PERSONA. `app/app/page.tsx:183` renders the manager block only
 * when `viewAs === "building-manager"`; a resident asked to open `approvals`
 * (which `request_building_link` writes, addressed to managers) would land on a
 * blank div. A button that navigates to nothing is not an improvement on a
 * button that toasts.
 *
 * So the rule this file enforces is: A TARGET THAT CANNOT BE RENDERED FOR THIS
 * VIEWER PRODUCES NO BUTTON. Not a disabled one, not a toast — nothing.
 *
 * WHY IT IS A LIST AND NOT A HARDCODED SWITCH
 *
 * Planned phases write targets for screens that do not exist yet: Phase 6's
 * rule-publish notification sets `building-rules`, and Phase 7's accommodation
 * decisions set `accommodations`. Neither should have to come back and edit
 * `alerts-screen.tsx` — and neither should ship a dead button in the window
 * before its screen lands.
 *
 * That is exactly how Phase 5 went. It was on this list too, as an unrendered
 * `my-cases` target; its screen landed, `my-cases` was registered below, and
 * `manager_advance_violation`, `manager_remind_fine` and
 * `manager_resolve_dispute` now all write `my-cases:<violation id>` to a
 * button that really navigates. `alerts-screen.tsx` was not touched.
 *
 * Both properties fall out of this list. An unregistered target resolves to
 * `null` (no button, today), and registering a screen here is a step each of
 * those phases already takes: `CONTENT_MAX` in `app/app/page.tsx` is typed
 * `Record<ScreenKey, string>`, so adding a width for an unregistered screen —
 * which all three plans instruct — is a COMPILE ERROR until the screen is
 * registered here. That is the coupling that keeps this list honest;
 * `navigation.test.ts` checks the other direction, that no screen the router
 * renders is missing from it.
 */

/** Which of the two `/app` surfaces a viewer is on. Mirrors `isManager` at `app/app/page.tsx:67`. */
export type Surface = "resident" | "manager"

const RESIDENT: readonly Surface[] = ["resident"]
const MANAGER: readonly Surface[] = ["manager"]
const BOTH: readonly Surface[] = ["resident", "manager"]

/**
 * Every screen key `app/app/page.tsx` switches on, mapped to the surfaces that
 * render it. `BOTH` means the branch sits ABOVE the `isManager` split at
 * `:183`, so either persona reaches it.
 */
export const SCREEN_SURFACES = {
  // Shared — matched before the persona split.
  "pet-detail": BOTH,
  "add-pet": BOTH,
  "pet-care": BOTH,
  "ai-chat": BOTH,
  "link-building": BOTH,
  "business-detail": BOTH,
  report: BOTH,
  shop: BOTH,
  /* BOTH, not RESIDENT. `publish_building_rule` writes this target to the
   * building's residents, so a resident must reach it — and a MANAGER must be
   * able to open it too, to see precisely what their residents see. That is not
   * a convenience: the manager's editor renders a preview, and a preview is a
   * claim about another screen. Being able to open the real one is how the
   * claim gets checked. It carries no id: the screen's subject is the viewer's
   * OWN building, resolved by the screen from whichever of the two the viewer
   * actually has — the resident's `my_building_link`, or, for a manager who is
   * not a resident of the building they manage, the active persona grant. That
   * second half was missing when this comment was first written, so the claim
   * above was made and not true: manager@pet10x.com holds no resident link and
   * was shown a "Link my building" button instead of their building's rules. */
  "building-rules": BOTH,
  /* BOTH, not RESIDENT. `manager_decide_accommodation` writes this target to
   * the requesting resident, so a resident must reach it — and a manager must
   * be able to open it too, to see exactly what their residents see when they
   * file one. It carries no id: the screen lists the viewer's OWN requests,
   * resolved from their approved resident link, and a manager who is not a
   * resident of the building they manage correctly sees the "link your
   * building" affordance rather than a broken form.
   *
   * THAT AFFORDANCE IS ALSO WHY NO NOTIFICATION ADDRESSED TO A MANAGER MAY
   * CARRY THIS TARGET. `withdraw_accommodation_request` did: it wrote
   * `accommodations` to every manager of the building under the label "Open
   * approvals", and the button rendered, navigated, and put the manager on
   * "Join your building first" instead of the queue it named. Both halves were
   * valid strings and nothing here could have caught it, because BOTH means the
   * screen renders — not that it answers. `20260829000001` moved that
   * notification to `approvals`, which is MANAGER-only below and is what the
   * label always said. `manager_decide_accommodation`, addressed to the
   * resident, is now the only writer of this target. */
  accommodations: BOTH,
  "my-bookings": BOTH,
  /* BOTH, not RESIDENT. The writers are `clinic_publish_record`,
   * `clinic_reminder_action` and `clinic_emergency_pull`, and all three address
   * the PET'S OWNER — who may also hold a manager persona. It carries no id:
   * the screen lists the viewer's own pets and the practices they have shared
   * with, resolved from `record_shares`. */
  "my-vets": BOTH,
  // Rendered in both blocks: managers have no Alerts tab, but the dashboard
  // bell routes here.
  alerts: BOTH,

  // Resident block.
  home: RESIDENT,
  community: RESIDENT,
  services: RESIDENT,
  profile: RESIDENT,
  /* The resident's own bylaw cases. RESIDENT and not BOTH: a manager reads the
   * same cases on their Violations screen, from the other side, and routing
   * them here would show them the subject's view of their own enforcement
   * action. `manager_advance_violation`, `manager_remind_fine` and
   * `manager_resolve_dispute` all write `my-cases:<violation id>`, and all
   * three address the RESIDENT. */
  "my-cases": RESIDENT,

  // Manager block.
  dashboard: MANAGER,
  residents: MANAGER,
  violations: MANAGER,
  approvals: MANAGER,
  incidents: MANAGER,
  settings: MANAGER,
} as const satisfies Record<string, readonly Surface[]>

export type ScreenKey = keyof typeof SCREEN_SURFACES

/**
 * Screens that READ the second half of a `screen:id` target.
 *
 * `handleNavigate` (`app/app/page.tsx:159`) stashes any id it is handed into
 * `selectedPetId` unless the screen is `business-detail` or `pet-care`. Handing
 * it an id for a screen that does not consume one therefore leaves a stale pet
 * selected for the NEXT screen that does. Naming the screens that take an id,
 * rather than denying the ones that do not, means a screen added later gets no
 * id until somebody decides it should have one.
 *
 * `add-pet` was on this list and should not have been: `AddPetScreen` takes no
 * id prop at all, so an `add-pet:<uuid>` target would have stashed a pet
 * nothing on that screen reads and handed it to whatever opened next — the
 * exact hazard the list exists to prevent. No writer emits that target today;
 * removed so none can.
 */
const ID_BEARING: readonly ScreenKey[] = [
  "pet-detail",
  "pet-care",
  "ai-chat",
  "business-detail",
  /* `my-cases:<violation id>` opens the list with that case expanded.
   * `handleNavigate` stashes it in `selectedCaseId`, NOT in `selectedPetId` —
   * adding a screen here without giving `handleNavigate` a branch for it is the
   * exact hazard the `add-pet` note below records. */
  "my-cases",
]

/**
 * Screens that REQUIRE an id — the ones whose whole subject is the id, which
 * therefore cannot answer honestly without one. A target naming one of these
 * with no id resolves to `null`, so the alert renders NO button.
 *
 * This is a strict subset of `ID_BEARING`, and the difference is the point.
 *
 * `pet-detail` is here because `usePet(undefined)` falls back to `pets[0]`
 * (`lib/data/live.ts:335`). `/api/care/reminders/run` wrote `pet-detail` with
 * no id while naming the pet in the title, so "Rabies has expired for Sadie"
 * opened whichever pet sorted first — and six of the seven such rows live on
 * production belong to owners with two or three pets. The writer is fixed, but
 * those seven rows are real data that will not rewrite themselves, so the
 * CLIENT has to be the thing that refuses. An honest absence beats a confident
 * wrong answer.
 *
 * `business-detail` is here because `usePublicBusiness(undefined)` never
 * queries and the screen renders "This business isn't available." — a button
 * that navigates to a dead end, which the plan rates no better than a toast.
 * No writer emits it today.
 *
 * The other two ID_BEARING screens are deliberately NOT here, and would be
 * wrong here:
 *   - `pet-care` is **157 of the 208** live rows and every one of them is
 *     bare. Its id is a care KIND, not a pet, and with none the tracker opens
 *     on the household's selected pet and its default tab — a correct answer.
 *     Requiring an id would silently delete the button on three quarters of
 *     the notifications in the database.
 *   - `ai-chat` with no id is a deliberate case: `handleNavigate` CLEARS
 *     `selectedPetId` for it, so the assistant opens unscoped rather than
 *     inheriting a pet from the previous screen.
 */
/* `my-cases` is deliberately NOT here. With no id the screen lists every case
 * against the resident, which is a correct and useful answer — the id only
 * chooses which one opens expanded. Requiring one would delete the button from
 * any notification written before this phase. */
const ID_REQUIRED: readonly ScreenKey[] = ["pet-detail", "business-detail"]

export interface ActionRoute {
  screen: ScreenKey
  /** Only ever set for a screen in `ID_BEARING`. */
  id?: string
}

/** Is this one of the screens the router knows how to render? */
export function isScreenKey(value: string): value is ScreenKey {
  return Object.prototype.hasOwnProperty.call(SCREEN_SURFACES, value)
}

/**
 * Turn a `notifications.action_target` into something `onNavigate` can use, or
 * `null` if this viewer cannot get there.
 *
 * `null` is returned for a target that is absent, empty, unknown to the router,
 * registered to the other surface, or naming an `ID_REQUIRED` screen with no
 * id. The caller must render NO control when it gets `null` — that is the
 * whole point of the function.
 *
 * The target grammar is `screen` or `screen:id`, which is what every writer
 * already emits: `'profile'` (`/api/manager/request-info:89`), `'pet-care'`
 * and `'pet-detail:<uuid>'` (`/api/care/reminders/run:171,261`), `'approvals'`
 * (`20260801000003:64`), `'services'` and `'pet-detail:<uuid>'`
 * (`lib/ai/suggestions/rules.ts`), and `'pet-detail:<uuid>' | 'profile'`
 * (`manager_advance_violation`, `manager_remind_fine`).
 */
export function resolveActionTarget(
  target: string | null | undefined,
  surface: Surface,
): ActionRoute | null {
  if (!target) return null

  const separator = target.indexOf(":")
  const screen = separator === -1 ? target : target.slice(0, separator)
  // An id may itself contain a colon; only the FIRST one separates.
  const rawId = separator === -1 ? "" : target.slice(separator + 1)

  if (!isScreenKey(screen)) return null
  if (!SCREEN_SURFACES[screen].includes(surface)) return null

  const id = rawId.trim()
  if (!id || !ID_BEARING.includes(screen)) {
    // A screen whose subject IS the id cannot be opened without one.
    if (ID_REQUIRED.includes(screen)) return null
    return { screen }
  }
  return { screen, id }
}
