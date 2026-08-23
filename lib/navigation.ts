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
 * Three planned phases write targets for screens that do not exist yet:
 * Phase 5 retargets `manager_advance_violation` and `manager_remind_fine` at
 * `my-cases:<violation-id>`, Phase 6's rule-publish notification sets
 * `building-rules`, and Phase 7's accommodation decisions set
 * `accommodations`. None of those three should have to come back and edit
 * `alerts-screen.tsx` — and none of them should ship a dead button in the
 * window before their screen lands.
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
  "my-bookings": BOTH,
  // Rendered in both blocks: managers have no Alerts tab, but the dashboard
  // bell routes here.
  alerts: BOTH,

  // Resident block.
  home: RESIDENT,
  community: RESIDENT,
  services: RESIDENT,
  profile: RESIDENT,

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
 * Screens that read the second half of a `screen:id` target.
 *
 * `handleNavigate` (`app/app/page.tsx:130`) stashes any id it is handed into
 * `selectedPetId` unless the screen is `business-detail` or `pet-care`. Handing
 * it an id for a screen that does not consume one therefore leaves a stale pet
 * selected for the NEXT screen that does. Naming the screens that take an id,
 * rather than denying the ones that do not, means a screen added later gets no
 * id until somebody decides it should have one.
 */
const ID_BEARING: readonly ScreenKey[] = ["pet-detail", "add-pet", "pet-care", "ai-chat", "business-detail"]

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
 * or registered to the other surface. The caller must render NO control when it
 * gets `null` — that is the whole point of the function.
 *
 * The target grammar is `screen` or `screen:id`, which is what every writer
 * already emits: `'profile'` (`/api/manager/request-info:89`), `'pet-care'`
 * and `'pet-detail'` (`/api/care/reminders/run:171,261`), `'approvals'`
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
  if (!id || !ID_BEARING.includes(screen)) return { screen }
  return { screen, id }
}
