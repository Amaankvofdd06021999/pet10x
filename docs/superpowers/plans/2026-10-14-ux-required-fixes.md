# UX Required Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every Critical and High finding from the 2026-10-14 UX audit, so that each Pet10x user type can finish its core flow without losing work, being misled, or destroying data by accident.

**Architecture:** Seven phases, each shippable on its own. Each fix's decision logic goes into a small pure module under `lib/` with a vitest test (the suite runs in Node with no DOM). The screens then call that module. Database changes are new migrations, each covered by a SQL check in `supabase/tests/part-g.sql`, bundled with `supabase/bundles/build.sh` and applied through the SQL Editor (dry run first). They go out before the phase's code.

**Tech Stack:** Next.js 16 App Router (client components), React 19, Supabase (Postgres RLS + SECURITY DEFINER RPCs), Tailwind 4, Radix UI (`components/ui`), vitest 3, pnpm 9.15.9.

**Spec:** The audit at https://claude.ai/artifact/UFk4KtZVwTuJXBfDWqxBRJ (local copy in the session scratchpad, `pet10x-ux-audit.html`). Finding IDs (PO-, BM-, AD-, BZ-, CU-, VC-, GX-, XC-) are cited on every task; the audit has the evidence lines.

## Global Constraints

- pnpm is not on PATH: prefix commands with `PATH="$HOME/.corepack-bin:$PATH"`. Do not upgrade pnpm.
- Green gate for every task: `pnpm test`, `npx tsc --noEmit -p .`, `pnpm lint` (0 errors), and `pnpm build` once per phase.
- Validate with a positive grammar: state what is allowed (an allow-list or regex of valid values), never a denylist.
- Never `supabase db push`. New migrations are named `2026101500NNNN_<what>.sql` (phase order), and `supabase/bundles/build.sh` picks up everything from `20261007` on. That is safe because the bundle's `insert … on conflict do nothing` skips versions already recorded. Change the build script's first-migration cutoff to `20261015` before bundling, so already-applied migrations are not re-run.
- Every SQL check goes in `supabase/tests/part-g.sql` (one transaction that ends in ROLLBACK, actors picked from live data, RAISE on failure). Add `part-g` to the list in `build.sh`.
- Copy rules: sentence case; second person; say what happens ("Remove from building", then the toast "Removed from building"). Use the audit's terminology table words in any copy you touch: Notifications, Ask Pet10x, Building rules, Bylaw notices, "your building's management", Appeal / Uphold / Overturn, First fine / Second fine, Suspend / Unsuspend.
- One implementer at a time on this tree (memory: sdd-two-implementer-rule). Reviewers may run in parallel.
- Confirmations use the new `ConfirmDialog` (Task 0.1), never `window.confirm`, `window.alert` or `window.prompt`, in any file a task touches.
- Do not touch the live database outside the bundle flow. Browser QA writes to the live DB (memory: browser-qa-writes-to-live-db).

## Review Focus

1. **Deep links from emails into the new URL scheme:** `/app?target=pet-detail:<id>` must still open the pet, and must not leave both `target=` and `screen=` in the address bar. Pinned in Task 1.1 (`fromLegacyTarget`) and Task 1.2 step 4.
2. **Back from the first screen after a cold load** (opened from a link, no in-app history): it must go to the tab root, not out of the app. Pinned in Task 1.1 (`backTarget` with `depth 0`).
3. **Weight input with a comma decimal or units typed in the field** ("12,5", "70 lbs", "32kg"): parse correctly or refuse, never silently mis-scale. Pinned in Task 2.2.
4. **A reason field of only spaces:** must count as empty wherever a reason is required. Pinned in Task 0.1 (`validateReason`).
5. **Manager with zero or one building:** building scoping and the Building column must behave exactly as today. Pinned in Task 3.6 (`scopeToBuilding` with `activeBuildingId === null`).

---

## Phase 0 — Shared building blocks

### Task 0.1: ConfirmDialog and reason validation

**Files:**
- Create: `lib/reason.ts`, `lib/reason.test.ts`, `components/ui/confirm-dialog.tsx`

**Interfaces:**
- Produces: `validateReason(text: string, opts: { required: boolean; max?: number }): { ok: true; value: string | null } | { ok: false; error: "required" | "too_long" }`
- Produces: `<ConfirmDialog open onOpenChange title description confirmLabel tone="danger"|"default" reason?={ label, required, placeholder } onConfirm={(reason: string | null) => Promise<{ error: string | null }>} />`. The dialog shows the error inline, keeps itself open on error, disables the button while busy, and closes on success.

- [ ] **Step 1: Write the failing test**

```ts
// lib/reason.test.ts
import { describe, expect, it } from "vitest"
import { validateReason } from "./reason"

describe("validateReason", () => {
  it("treats whitespace-only as empty", () => {
    expect(validateReason("   \n ", { required: true })).toEqual({ ok: false, error: "required" })
    expect(validateReason("   ", { required: false })).toEqual({ ok: true, value: null })
  })
  it("trims and accepts", () => {
    expect(validateReason("  Dog was leashed ", { required: true })).toEqual({ ok: true, value: "Dog was leashed" })
  })
  it("enforces max length after trimming (default 2000)", () => {
    expect(validateReason("a".repeat(2001), { required: true })).toEqual({ ok: false, error: "too_long" })
    expect(validateReason("a".repeat(5), { required: true, max: 4 })).toEqual({ ok: false, error: "too_long" })
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.** `PATH="$HOME/.corepack-bin:$PATH" pnpm vitest run lib/reason.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// lib/reason.ts
export type ReasonResult = { ok: true; value: string | null } | { ok: false; error: "required" | "too_long" }

/** A reason a person types before a consequential action. Whitespace is not a reason. */
export function validateReason(text: string, opts: { required: boolean; max?: number }): ReasonResult {
  const value = text.trim()
  if (value.length === 0) return opts.required ? { ok: false, error: "required" } : { ok: true, value: null }
  if (value.length > (opts.max ?? 2000)) return { ok: false, error: "too_long" }
  return { ok: true, value }
}
```

Build `components/ui/confirm-dialog.tsx` on `components/ui/alert-dialog.tsx` (Radix gives focus trap, Escape and focus return). Use a labelled `<textarea id="confirm-reason">` when `reason` is set. Errors from `validateReason` read "Add a reason — the person affected will see it." and "Keep it under 2000 characters." Put the error and server errors in `<p role="alert">`. A danger tone uses `bg-destructive text-white`.

- [ ] **Step 4: Run the test and confirm it passes.**
- [ ] **Step 5: Commit** `git commit -m "ConfirmDialog and validateReason: one confirmation pattern with an optional required reason"`

---

## Phase 1 — Back, refresh and links work (XC-1, XC-2, PO-1, BM-23, XC-9)

### Task 1.1: Route state ↔ URL

**Files:**
- Create: `lib/app-route.ts`, `lib/app-route.test.ts`

**Interfaces:**
- Consumes: `SCREEN_SURFACES`, `ScreenKey`, `resolveActionTarget`, `readTargetParam` from `lib/navigation.ts`
- Produces:
  - `type AppRoute = { screen: ScreenKey; id?: string; petId?: string; tab?: string }`
  - `routeToSearch(r: AppRoute): string` (returns `""` for a bare tab root, otherwise `?screen=…&id=…&pet=…&tab=…`, omitting empty keys)
  - `searchToRoute(search: string, surface: Surface): AppRoute | null` (null when the screen is unknown or not rendered for this surface, or an id fails the grammar)
  - `fromLegacyTarget(search: string, surface: Surface): AppRoute | null` (wraps `readTargetParam` + `resolveActionTarget`)
  - `backTarget(depth: number, activeTab: ScreenKey): "history" | AppRoute` (depth > 0 → `"history"`; otherwise the tab root)
  - `ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`; `TAB_RE = /^[a-z][a-z-]{0,31}$/`; `CARE_KIND_RE = /^[a-z_]{1,24}$/` (the `pet-care` id is a care kind, not a uuid)

- [ ] **Step 1: Write the failing test**

```ts
// lib/app-route.test.ts
import { describe, expect, it } from "vitest"
import { backTarget, fromLegacyTarget, routeToSearch, searchToRoute } from "./app-route"

const PET = "3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"

describe("app routes", () => {
  it("round-trips a pet on a tab", () => {
    const s = routeToSearch({ screen: "pet-detail", id: PET, tab: "documents" })
    expect(s).toBe(`?screen=pet-detail&id=${PET}&tab=documents`)
    expect(searchToRoute(s, "resident")).toEqual({ screen: "pet-detail", id: PET, tab: "documents" })
  })
  it("a tab root is the bare path", () => {
    expect(routeToSearch({ screen: "home" })).toBe("")
  })
  it("refuses screens the surface cannot render", () => {
    expect(searchToRoute("?screen=approvals", "resident")).toBeNull()
    expect(searchToRoute("?screen=dashboard", "manager")).toEqual({ screen: "dashboard" })
  })
  it("refuses unknown screens and malformed ids", () => {
    expect(searchToRoute("?screen=evil", "resident")).toBeNull()
    expect(searchToRoute("?screen=pet-detail&id=<script>", "resident")).toBeNull()
  })
  it("accepts a care kind as the pet-care id", () => {
    expect(searchToRoute(`?screen=pet-care&id=food&pet=${PET}`, "resident")).toEqual({ screen: "pet-care", id: "food", petId: PET })
  })
  it("reads legacy ?target= links", () => {
    expect(fromLegacyTarget(`?target=pet-detail:${PET}`, "resident")).toMatchObject({ screen: "pet-detail", id: PET })
  })
  it("back with no in-app history goes to the tab root, never out of the app", () => {
    expect(backTarget(0, "home")).toEqual({ screen: "home" })
    expect(backTarget(2, "home")).toBe("history")
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement** `lib/app-route.ts` exactly to the interfaces above, using `URLSearchParams`. `searchToRoute` returns null unless `SCREEN_SURFACES[screen]` includes the surface. For `pet-care`, `id` must match `CARE_KIND_RE`; for every other screen it must match `ID_RE`. `tab` must match `TAB_RE`, and `pet` must match `ID_RE`.
- [ ] **Step 4: Run the test and confirm it passes.**
- [ ] **Step 5: Commit** `"Route state round-trips through the URL, refusing screens a surface cannot render"`

### Task 1.2: Wire the app shell to history

**Files:**
- Modify: `app/app/page.tsx` (`handleNavigate` ~:162, deep-link effect ~:197-212, `handleTabChange` ~:262, `handleBack` ~:276)
- Modify: `components/screens/profile-screen.tsx:261` (remove the Back button on the tab root)

**Interfaces:**
- Consumes: Task 1.1 functions.

- [ ] **Step 1:** Add `const depth = useRef(0)`. In `handleNavigate`, after setting state, call `window.history.pushState({ pet10x: true, route }, "", "/app" + routeToSearch(route))` and `depth.current++`. In `handleTabChange` (but not for the `ai-chat` branch, which goes through `handleNavigate`), push `{ screen: tab }` the same way and reset `depth.current = 1`.
- [ ] **Step 2:** Add a `popstate` listener. If `event.state?.pet10x`, apply that route's setters without pushing again and decrement depth (floor 0). If there is no state, apply the tab root. Extract a shared `applyRoute(route)` that both use, so the setter logic lives in one place.
- [ ] **Step 3:** Change `handleBack` to `backTarget(depth.current, activeTab)`. Call `history.back()` when it returns `"history"`; otherwise call `applyRoute(tabRoot)` plus `history.replaceState`.
- [ ] **Step 4:** On first ready render, read `searchToRoute(location.search, surface) ?? fromLegacyTarget(location.search, surface)`. If a route is found, `applyRoute` it and `replaceState` the URL to `routeToSearch(route)`, so `target=` is dropped and the result is never both. Keep the existing onboarding and persona-ready gating.
- [ ] **Step 5:** Remove the Back control on the Profile tab root (XC-9).
- [ ] **Step 6:** Run `pnpm test && npx tsc --noEmit -p . && pnpm lint`. Manually: `pnpm dev`, then open Home → pet → Documents and press browser Back twice (expect Home, still in the app), refresh on the pet screen (expect the pet screen), and paste `/app?target=pet-detail:<id>` (expect the pet).
- [ ] **Step 7: Commit** `"Back, refresh and shared links work inside /app: screens live in the URL"`

### Task 1.3: Don't lose a half-filled form

**Files:**
- Create: `lib/unsaved.ts`, `lib/unsaved.test.ts`, `components/use-unsaved-guard.ts`
- Modify: `components/screens/add-pet-screen.tsx`, `components/screens/report/*` (the composer the Report screen renders), `components/screens/accommodation-request-screen.tsx`, `components/ios-tab-bar.tsx`, `app/app/page.tsx`

**Interfaces:**
- Produces: `isDirty(initial: Record<string, unknown>, current: Record<string, unknown>): boolean` (shallow compare; trims strings; `""`, `null` and `undefined` all count as empty)
- Produces: `useUnsavedGuard(dirty: boolean)`, which adds `beforeunload` while dirty and returns `confirmLeave(): Promise<boolean>`, opening a ConfirmDialog with "Discard this form? What you typed will be lost." and buttons "Keep editing" / "Discard".
- Produces: `FORM_SCREENS: ReadonlySet<ScreenKey> = new Set(["add-pet", "report", "accommodations"])`, exported from `lib/app-route.ts`.

- [ ] **Step 1: Failing test** for `isDirty`: unchanged → false; `{ name: " " }` vs `{ name: "" }` → false; changed field → true; `null` vs `""` → false.
- [ ] **Step 2–4:** Implement and make the test pass. The tab bar and sidebar hide when `FORM_SCREENS.has(currentScreen)` on mobile; the desktop sidebar stays. The forms' Cancel and nav-bar Back call `confirmLeave()` when dirty.
- [ ] **Step 5: Commit** `"Leaving a half-filled pet, report or accommodation form asks first"`

---

## Phase 2 — The first-time pet owner (PO-2…10, GX-2 entry points)

### Task 2.1: Every landing button goes to the right door

**Files:**
- Modify: `app/page.tsx` (CTAs at :214-238, :313, :408, :472, :533, :591-598; the persona cards section ~:444-540), `components/landing/landing-nav.tsx`, `components/screens/sign-in-screen.tsx:37`, `app/login/page.tsx`
- Create: `lib/auth/login-mode.ts`, `lib/auth/login-mode.test.ts`

**Interfaces:**
- Produces: `readLoginMode(search: string): "signin" | "signup"` (only the literal `mode=signup` returns signup)

- [ ] **Step 1: Failing test** for `readLoginMode`: `?mode=signup` → signup; `?mode=SIGNUP` → signin; `""` → signin; `?mode=signup&next=/app` → signup.
- [ ] **Step 2–4:** Implement. `SignInScreen` takes an `initialMode` prop, and `app/login/page.tsx` passes `readLoginMode(location.search)`. Change the hrefs:
  - "Get started" / "Get started free" / "Get the app" / "Start free trial" → `/login?mode=signup`
  - "Book a demo" → `/help#contact`
  - "List your business" → `/businessaccess`
  - "See how it works" → `/help#emergency-access`
  - Add a fourth persona card, "For vet clinics" ("Run appointments, records and reminders, and share records with owners."), with the CTA "Set up your clinic" → `/clinic`.
  - Check that `/help` has `id="contact"` and `id="emergency-access"` anchors; add them if missing.
- [ ] **Step 5:** Change the hero sub-copy for owners to "Keep your pet's care, records and building in one place." Leave the H1 alone.
- [ ] **Step 6: Commit** `"Landing buttons go to the door they name; Get started opens Sign up"`

### Task 2.2: Weight in kg or lb, parsed safely (PO-6)

**Files:**
- Create: `lib/units.ts`, `lib/units.test.ts`
- Modify: `components/screens/add-pet-screen.tsx:57, 71, 272`, `components/screens/pet-detail-screen.tsx:432`

**Interfaces:**
- Produces: `parseWeightKg(raw: string, unit: "kg" | "lb"): { ok: true; kg: number | null } | { ok: false }`. The grammar is `^\s*\d{1,3}([.,]\d{1,2})?\s*(kg|kgs|lb|lbs)?\s*$`, case-insensitive. A unit typed in the text overrides the toggle. Empty → `{ ok: true, kg: null }`. Result is rounded to 0.1 kg and must be ≤ 150.
- Produces: `defaultWeightUnit(locale: string): "kg" | "lb"` (`en-US` → lb, everything else → kg)

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest"
import { parseWeightKg } from "./units"
describe("parseWeightKg", () => {
  it("lb toggle", () => expect(parseWeightKg("70", "lb")).toEqual({ ok: true, kg: 31.8 }))
  it("unit in text wins", () => expect(parseWeightKg("70 lbs", "kg")).toEqual({ ok: true, kg: 31.8 }))
  it("comma decimal", () => expect(parseWeightKg("12,5", "kg")).toEqual({ ok: true, kg: 12.5 }))
  it("no space", () => expect(parseWeightKg("32kg", "lb")).toEqual({ ok: true, kg: 32 }))
  it("empty is allowed", () => expect(parseWeightKg("  ", "kg")).toEqual({ ok: true, kg: null }))
  it("refuses junk and absurd", () => {
    expect(parseWeightKg("about 30", "kg")).toEqual({ ok: false })
    expect(parseWeightKg("400", "kg")).toEqual({ ok: false })
  })
})
```

- [ ] **Step 2–4:** Implement (1 lb = 0.45359237 kg). In Add Pet: `inputMode="decimal"`, a two-segment kg/lb toggle next to the field (default from `defaultWeightUnit(navigator.language)`), and the inline error "Enter a weight like 12.5". Save is blocked while it's invalid. In the pet-detail edit form, show the stored kg value with the same toggle.
- [ ] **Step 5: Commit** `"Weight takes kg or lb: '70 lbs' is 31.8 kg, not 70"`

### Task 2.3: Vaccines from a list (PO-7)

**Files:**
- Create: `lib/data/vaccines.ts`, `lib/data/vaccines.test.ts`
- Modify: `lib/data/completeness.ts:108-117`, `components/screens/pet-detail-screen.tsx:517-547` (add form)

**Interfaces:**
- Produces: `VACCINES: Record<"dog" | "cat" | "other", { key: string; label: string }[]>`
  - dog: rabies "Rabies", dhpp "DHPP (distemper combo)", bordetella "Bordetella (kennel cough)", leptospirosis "Leptospirosis", lyme "Lyme"
  - cat: rabies "Rabies", fvrcp "FVRCP (feline combo)", felv "FeLV (feline leukemia)"
  - other: rabies "Rabies"
- Produces: `canonicalVaccineKey(name: string): string | null`. It matches `rabi(es|is|s)?`, `dhpp|da2pp|distemper`, `fvrcp`, `bordetella|kennel`, `lepto`, `lyme`, `felv|leuk` case-insensitively, and returns null for anything else.
- Produces: `hasRabies(vaccinationNames: string[]): boolean`, defined as `names.some(n => canonicalVaccineKey(n) === "rabies")`. completeness.ts uses it in place of `/rabies/i`.

- [ ] **Step 1: Failing test:** "Rabis" → rabies; "Rabies 3-year" → rabies; "DA2PP" → dhpp; "Bordetella" → bordetella; "Heartworm" → null; `hasRabies(["DHPP"])` → false.
- [ ] **Step 2–4:** Implement. The add form shows a vaccine picker (chips from `VACCINES[species]` plus "Other…", which reveals the free-text name). The stored name is the label, so existing rows keep working. Mark Name, Given on and Expires as required with a visible "Required" tag, and keep Save disabled until they're valid. Apply the same required tags and disabled Save to Contacts (Name, Phone) and Documents (Type and File, since a document now needs a file: PO-11).
- [ ] **Step 5: Commit** `"Vaccines come from a list per species; a typo no longer hides a rabies shot"`

### Task 2.4: Add Pet asks four things (PO-5, PO-18)

**Files:**
- Modify: `components/screens/add-pet-screen.tsx`

- [ ] **Step 1:** On screen: photo (optional), species tiles, name (required), breed (optional). Put everything else in a collapsed `<details>` titled "More details (optional)": birthday, weight (Task 2.2), gender, colour, microchip, size band and chart, height, restraints, spay/neuter. Restraint descriptions become visible helper text under each option instead of `title` tooltips.
- [ ] **Step 2:** Label the action "Add pet" in both the header and the footer. Show "Your building's management will review this pet." only when `user.building` is set; otherwise show nothing.
- [ ] **Step 3:** Fix "Add another pet": key the form on a counter so all state resets (PO-18).
- [ ] **Step 4:** Make spay/neuter a real `components/ui/switch.tsx` with a `<label htmlFor>`. Turn every field label into `<label htmlFor>` (PO-17 for this screen).
- [ ] **Step 5:** Run tsc and lint; check manually at 390px width.
- [ ] **Step 6: Commit** `"Add pet asks for photo, species, name and breed; the rest waits under More details"`

### Task 2.5: Onboarding ends with your pet (PO-3, PO-15)

**Files:**
- Modify: `components/onboarding/onboarding-flow.tsx`
- Consumes: `addPet` from `lib/data/live.ts` (same call `add-pet-screen.tsx` makes)

- [ ] **Step 1:** Add a final step, "Tell us about your pet": name (required), species tiles, optional photo, plus "Skip for now". It runs after "Request sent" or "You're all set", before Home. Only copy that's true may promise "add you and your pet".
- [ ] **Step 2:** The done screen shows the pet card and exactly one next step, the first unmet item from `useMyCompleteness` (for example "Add Max's emergency contact"), with buttons "Do it now" (navigates with the right tab, Task 2.6) and "Later".
- [ ] **Step 3:** On the unit step, add a Back button. "Continue" is disabled while the field is empty; "I don't know it yet" stays.
- [ ] **Step 4: Commit** `"Onboarding ends by adding your pet and one clear next step"`

### Task 2.6: An honest setup banner (PO-4)

**Files:**
- Modify: `lib/data/completeness.ts:88-133`, `components/screens/home/missing-info-card.tsx`
- Create: `lib/data/completeness.test.ts`

**Interfaces:**
- Produces: `type Gap = { key: string; label: string; target: { screen: ScreenKey; id?: string; tab?: string } }`, with `tab` taking one of `"vaccinations" | "documents" | "contacts"` for pet gaps
- Produces: `computeGaps(input: { linked: boolean; hasUnit: boolean; hasAddress: boolean; pets: { id: string; name: string; documentKinds: string[]; vaccinationNames: string[]; contacts: number }[]; requirements: string[] }): { heading: string; gaps: Gap[] }`
  - heading when linked: "Your building needs a few things"
  - heading when not linked: "Finish your pet's profile"
  - The address gap appears only when linked.

- [ ] **Step 1: Failing test:** unlinked with no pets → heading "Finish your pet's profile" and no address gap; linked with no unit → a unit gap targeting `{ screen: "profile" }`; a pet with no contact → a gap targeting `{ screen: "pet-detail", id, tab: "contacts" }`; missing rabies uses `hasRabies` and targets `tab: "vaccinations"`.
- [ ] **Step 2–4:** Implement by extracting the pure part of the current hook into `computeGaps`. The card renders one row per gap (a 44px tap target), each calling `onNavigate(target.screen, target.id, undefined, target.tab)`. The dismiss control becomes a 44px button labelled "Hide for now".
- [ ] **Step 5: Commit** `"Setup banner speaks to your situation and each row opens the exact place to fix it"`

### Task 2.7: Sign-up survives switching to Mail (PO-9)

**Files:**
- Create: `lib/auth/signup-draft.ts`, `lib/auth/signup-draft.test.ts`
- Modify: `components/screens/sign-in-screen.tsx:34-53, 162-295`, `components/ui/password-field.tsx:50, 120-127`

**Interfaces:**
- Produces: `saveDraft(storage: Pick<Storage, "setItem">, d: { email: string; name: string; view: "form" | "verify" }): void` (never stores a password, and the key is `pet10x.signup`)
- Produces: `loadDraft(storage: Pick<Storage, "getItem">, now: number): Draft | null`. It expires after 30 minutes and returns null on bad JSON or a missing field.
- Produces: `clearDraft(storage)`

- [ ] **Step 1: Failing test:** a round trip; a draft 31 minutes old → null; malformed JSON → null; a draft object containing `password` is ignored and never written. Use an in-memory fake storage.
- [ ] **Step 2–4:** Implement. On mount, a "verify" draft shows the code screen with the email filled in. If the in-memory password is gone, verifying asks for it again on that screen, under the label "Your password". Wrap every storage access in try/catch.
- [ ] **Step 5:** Password rules render inline below the field (no `absolute` pop-over). Label the name field "Your first name" with a visible `<label>`. The verify screen adds "Already have an account? We've emailed you a sign-in link instead."
- [ ] **Step 6:** Wrap both modes in `<form onSubmit>` so Enter submits. Errors go in `role="alert"` (XC-7 for this screen).
- [ ] **Step 7: Commit** `"Sign-up keeps your place when you switch apps for the code"`

### Task 2.8: A calm first Home (PO-10)

**Files:**
- Modify: `components/screens/home-screen.tsx`

- [ ] **Step 1:** While `usePets().isLoading`, render skeleton cards (`components/ui/skeleton.tsx`), never "Add your first pet".
- [ ] **Step 2:** With zero pets, render only the greeting, one large card ("Add your first pet", with a primary button) and a secondary "Link your building" row when unlinked. Hide Today's Care, AI suggestions, Recent activity, and the Building rules quick action unless linked.
- [ ] **Step 3:** Remove the duplicate Report quick action; Report stays in the nav bar.
- [ ] **Step 4: Commit** `"A new owner's Home shows one thing to do: add your pet"`

### Task 2.9: Building rules show what's met (PO-8)

**Files:**
- Modify: `components/screens/building-rules-screen.tsx:156-182`
- Consumes: `computeGaps` (Task 2.6)

- [ ] **Step 1:** For each requirement, per pet, show a green check when met, or an amber "Add" link to the gap's target when unmet. With no pets, use neutral bullets.
- [ ] **Step 2: Commit** `"Building rules show which requirements each pet meets"`

---

## Phase 3 — Building managers (BM-1…11)

### Task 3.1: Migration — reasons on registration and link decisions

**Files:**
- Create: `supabase/migrations/20261015000001_decision_reasons.sql`, `supabase/tests/part-g.sql`
- Modify: `supabase/bundles/build.sh` (cutoff `20261015`, add `part-g`)

- [ ] **Step 1:** In `part-g.sql`, write the checks first. A manager denying a registration with `p_note := 'Over the weight limit'` notifies the owner, and the notification body contains the note. A deny with a whitespace-only note raises `22023`. Approve with a null note is allowed. A non-manager is refused with `42501`.
- [ ] **Step 2:** Write the migration. `create or replace function public.manager_decide_registration(p_pet uuid, p_approve boolean, p_note text default null)` copies the current definition verbatim and adds:
  - When `not p_approve`, the trimmed `p_note` is required (`22023`) and at most 2000 characters.
  - The owner's notification body appends `'Reason: ' || note`.
  - The old 2-argument overload is dropped. Clients calling with 2 args still resolve, because of the default.

  Do the same for the resident-link decision RPC used by `decideLink` in `lib/data/live.ts` (find its name with `grep -n "rpc(" lib/data/live.ts | grep -i link`). There the reason is optional, and when present it goes into the resident's notification.
- [ ] **Step 3:** Run `bash supabase/bundles/build.sh` and confirm the bundle contains only `20261015…` migrations.
- [ ] **Step 4: Commit** `"Denying a pet registration requires a reason the owner reads"`

### Task 3.2: Confirm every destructive manager action (BM-1, BM-2, BM-5, BM-10, BM-9)

**Files:**
- Modify: `components/screens/manager/residents-screen.tsx:119-121, 163-169, 197, 238-245`; `components/screens/strata/building-detail.tsx:169-219, 310-317, 467-476`; `components/screens/manager/violations-table-screen.tsx:646-661, 1205, 1220-1245`; `components/screens/manager/approvals-screen.tsx:195-215`; `lib/data/manager-queues.ts:173` (`decideRegistration(petId, approve, note?)`)

- [ ] **Step 1: Residents.** Move "Remove from building" into the expanded panel as a labelled text button behind `ConfirmDialog` ("Remove {name} (Unit {unit}) from {building}? They lose access and must ask to rejoin.", danger). The pending card shows "Unit {unit ?? 'not given'} · requested {date}". Deny opens `ConfirmDialog` with an optional reason. Make the same three changes in the strata Building › Residents panel.
- [ ] **Step 2: Cases.** Dismiss and Mark resolved open `ConfirmDialog` with a required reason ("The resident reads this") and the line "This can't be undone." That reason replaces the fixed strings. Appeal "Uphold" / "Overturn" (renamed per glossary) open a ConfirmDialog; the reason is required for Uphold, optional for Overturn.
- [ ] **Step 3: Strata fine.** When the next stage is a fine stage, "Advance to …" opens the confirm block already at `building-detail.tsx:548-583`, pre-filled with the scheduled amount, plus a note field and a due date. Then it calls `advanceViolation` with those.
- [ ] **Step 4: Registrations.** Deny requires a reason (ConfirmDialog → `decideRegistration(id, false, reason)`). Both buttons are `disabled={busy}`. Use the species icon from `SpeciesIcon`, not always a cat.
- [ ] **Step 5:** Run tsc and lint, then check manually.
- [ ] **Step 6: Commit** `"Removing, dismissing, fining and denying each ask first and record why"`

### Task 3.3: Approvals shows what needs approving (BM-3, BM-18)

**Files:**
- Modify: `components/screens/manager/approvals-screen.tsx:62-76, 126-143, 259-264, 335-344`
- Create: `lib/data/approvals-view.ts`, `lib/data/approvals-view.test.ts`

**Interfaces:**
- Produces: `approvalsState<T>(q: { isLoading: boolean; error: string | null; data: T[] }): "loading" | "error" | "empty" | "ready"` (the error check comes before empty; loading wins over everything)
- Produces: `defaultApprovalsTab(counts: { registrations: number; documents: number; accommodations: number; incidents: number }): "registrations" | "documents" | "accommodations" | "incidents"` (the first with a count above 0, in that order, else "registrations")

- [ ] **Step 1: Failing tests** for both functions.
- [ ] **Step 2–4:** Implement. The Incidents tab lists `openIncidents` only, with the empty state "No open incidents. History is in Incident reports" and a link. Every tab renders Spinner / LoadError with Retry / EmptyState from `approvalsState`.
- [ ] **Step 5: Commit** `"Approvals opens on what needs a decision and never says 'Nothing pending' while loading"`

### Task 3.4: Bulk approve respects each building's weight limit (BM-6)

**Files:**
- Modify: `lib/data/work-queue.ts:104, 123`, `lib/data/manager-queues.ts:141`, `components/screens/strata/queue-screen.tsx:149-183`
- Test: `lib/data/work-queue.test.ts` (create)

**Interfaces:**
- Produces: `weightFlag(weightKg: number | null, maxWeightKg: number | null): string | null`, returning "Over this building's {max} kg limit" when both are set and weight > max; null otherwise (including no limit)

- [ ] **Step 1: Failing test:** (20, 15) → flag; (20, null) → null; (null, 15) → null; (15, 15) → null.
- [ ] **Step 2–4:** Implement and replace the hard-coded `> 25000` grams check in both places with the building's `pet_rules.max_weight_kg` (load it alongside the queue rows). "Approve N safe" opens a ConfirmDialog listing the items grouped by building name.
- [ ] **Step 5: Commit** `"'Safe to approve' uses each building's own weight limit, and bulk approve shows what it will approve"`

### Task 3.5: Inviting an existing account tells the truth (BM-7)

**Files:**
- Modify: `app/api/strata/invite/route.ts:57-76`, `components/screens/strata/team-screen.tsx:99-110`

- [ ] **Step 1:** The route returns `{ ok: true, existingAccount: true, emailSent: false }` for an existing account. It sends a short "You can now manage {building}" email through `lib/email.ts` when email is enabled, and sets `emailSent` accordingly.
- [ ] **Step 2:** In the UI: when `existingAccount`, the toast reads "{email} already had a Pet10x account and can now manage {building}." plus " We emailed them." only when `emailSent`.
- [ ] **Step 3: Commit** `"Inviting someone who already has an account says so, and emails them"`

### Task 3.6: One building at a time (BM-4)

**Files:**
- Create: `lib/data/building-scope.ts`, `lib/data/building-scope.test.ts`
- Modify: `components/screens/manager/residents-screen.tsx:24, 63-64`, `approvals-screen.tsx:66-69`, `violations-table-screen.tsx:66-68`, `incidents-screen.tsx:43-45`, `dashboard-screen.tsx:82-91`

**Interfaces:**
- Produces: `scopeToBuilding<T extends { buildingId: string | null }>(rows: T[], activeBuildingId: string | null): T[]` (null active means all rows, unchanged)
- Produces: `showBuildingColumn(managedCount: number): boolean` (true when count > 1)

- [ ] **Step 1: Failing tests:** null active → identity; filters by id; rows with a null `buildingId` are dropped when a building is active; `showBuildingColumn(1)` → false.
- [ ] **Step 2–4:** Implement and apply to every list. Make sure each row type carries `buildingId`; add it to the mapping in `lib/data/manager-queues.ts` / `live.ts` where missing. The nav bar shows the active building's name. A Building column or label appears when `showBuildingColumn`.
- [ ] **Step 5: Commit** `"Every manager screen follows the active building"`

### Task 3.7: Get your building ready (BM-8) and Community for managers (BM-11)

**Files:**
- Create: `components/screens/manager/setup-card.tsx`, `lib/data/building-setup.ts`, `lib/data/building-setup.test.ts`
- Modify: `components/screens/manager/dashboard-screen.tsx`, `app/app/page.tsx:341-363`, `components/app-sidebar.tsx:37-46`, `lib/navigation.ts` (`community` → BOTH)

**Interfaces:**
- Produces: `setupChecklist(b: { bylawsPublished: boolean; fineScheduleSet: boolean; houseRulesCount: number; staffCount: number }): { key: "bylaws" | "fines" | "rules" | "staff"; label: string; done: boolean; target: { screen: "settings"; tab: string } }[]`

- [ ] **Step 1: Failing test** for `setupChecklist` labels and done flags.
- [ ] **Step 2–4:** The setup card shows the building code in large type with Copy (`navigator.clipboard.writeText`, with a fallback that selects the text) and the four checklist rows. It's dismissible once all four are done. Render `CommunityScreen` in the manager block and add a Community item to the manager sidebar and a dashboard tile on mobile. Update `SCREEN_SURFACES.community` to BOTH and its comment.
- [ ] **Step 5: Commit** `"New managers get a setup checklist with their building code; managers moderate Community without switching persona"`

---

## Phase 4 — Admin console (AD-1…8)

### Task 4.1: Migration — guarded business deletion

**Files:**
- Create: `supabase/migrations/20261015000002_admin_delete_business.sql`; append checks to `supabase/tests/part-g.sql`
- Modify: `lib/data/admin.ts:253-258`, `app/admin/page.tsx:746-754, 852-859`

**Interfaces:**
- Produces (SQL): `admin_business_footprint(p_business uuid) returns jsonb`, giving `{patients, visits, invoices, staff, open_bookings, appointments}`. Admin only; anyone else gets `42501`.
- Produces (SQL): `admin_delete_business(p_business uuid, p_confirm_name text) returns jsonb`. It refuses `{error:'name_mismatch'}` unless the name matches exactly (after trim), and `{error:'has_records', footprint}` when patients, visits or invoices are above 0, or open bookings exist. Otherwise it deletes and writes `audit_log`.
- Revoke `delete` on `public.businesses` from `authenticated` for admins' direct path: replace the admin delete policy so only the definer function deletes. Find the policy with `select policyname from pg_policies where tablename='businesses' and cmd in ('DELETE','ALL')` and include the result in the migration header.
- Produces (TS): `deleteBusinessGuarded(id, confirmName): Promise<{ error: string | null; footprint?: Footprint }>` and `getBusinessFootprint(id)`

- [ ] **Step 1:** SQL checks: a non-admin calling footprint → 42501; a wrong name → name_mismatch; a business with a seeded `clinic_patients` row → has_records and the row survives; an empty test business → deleted. A direct `delete from businesses` as an admin client role matches 0 rows.
- [ ] **Step 2:** Write the migration.
- [ ] **Step 3:** UI: the trash icon becomes a labelled "Delete…" item that opens a ConfirmDialog showing the footprint counts and requiring the business name typed into the reason field (relabelled "Type {name} to confirm"). It offers "Set tier to Registered instead" as a secondary button. `has_records` shows "This business has clinic records. Set its tier to Registered instead."
- [ ] **Step 4: Commit** `"Deleting a business shows what it holds, needs its name typed, and refuses when clinic records exist"`

### Task 4.2: Verification with the facts (AD-2)

**Files:**
- Modify: `lib/data/clinic/verification.ts:46-52` and the clinic's request UI (`components/screens/clinic/verification-banner.tsx`), `lib/data/admin.ts:317`, `app/admin/page.tsx:822-833, 864-924`
- Create: `lib/data/verification-form.ts`, `lib/data/verification-form.test.ts`

**Interfaces:**
- Produces: `validateVerification(v: { licenceNumber: string; issuingBody: string; contactName: string; contactPhone: string }): { ok: true; value: {...trimmed} } | { ok: false; errors: Partial<Record<keyof typeof v, string>> }`. Licence number is required with grammar `^[A-Za-z0-9][A-Za-z0-9 ./-]{2,39}$`; issuing body is required (2–80 characters); contact phone is optional with grammar `^[+0-9 ()-]{7,20}$`.

- [ ] **Step 1: Failing test** for the validator.
- [ ] **Step 2–4:** The clinic's "Request verification" opens a form (licence number, issuing body, contact name and phone, optional document upload to the existing bucket path with `contentType`). The admin query selects `licence_number, issuing_body, contact_name, contact_phone, document_path`. The card shows them, plus the owner's name and email. Approve is disabled without a licence number and opens a ConfirmDialog. Add "Ask for info" (AD-13): it sets status `needs_info` with a required note, using the existing decide RPC if it accepts the status, else a direct update allowed by the admin policy.
- [ ] **Step 5: Commit** `"Verification requests carry the licence details the admin approves on"`

### Task 4.3: Tier, Freeze and archive confirmations (AD-3, AD-4, AD-7)

**Files:**
- Modify: `app/admin/page.tsx:570-579, 677-692, 722-730, 839-851, 410-445`; `lib/data/admin.ts:106-115, 361-376`

- [ ] **Step 1:** The tier select stages the choice and shows "Apply". A downgrade opens a ConfirmDialog with a required note ("The business sees this"), passed as `p_note`.
- [ ] **Step 2:** In the Managers tab, "Freeze/Restore" becomes "Suspend/Unsuspend", reusing the Users tab's confirmation copy and adding "every building they manage".
- [ ] **Step 3:** Keep `counts` in `AdminBuilding`. The card shows "{residents} residents · {pets} pets · {managers} managers · {open} open cases", and the archive confirmation repeats those numbers. If the history RPC errors, show "Couldn't load this building's history" rather than hiding Delete silently.
- [ ] **Step 4: Commit** `"Tier changes, suspensions and archives say what they'll do before doing it"`

### Task 4.4: Add an existing user as a manager (AD-5)

**Files:**
- Modify: `app/api/admin/invite/route.ts:46-81`, `app/admin/page.tsx:340-372`

- [ ] **Step 1:** The route looks up the email (service-role `auth.admin.listUsers` filtered, or a `profiles` lookup by email). If it exists, it inserts the `building_managers` link with `on conflict do nothing`, sends the "You can now manage {building}" email, and returns `{ ok, existingAccount: true }`. If it's new, it keeps the invite. Make the link insert idempotent so a retry after a partial failure succeeds.
- [ ] **Step 2:** The UI validates the email against `^[^\s@]+@[^\s@]+\.[^\s@]+$` before sending and shows the existing-account message. Every raw Supabase error is mapped to "Couldn't invite {email}. Try again, or check the address."
- [ ] **Step 3: Commit** `"Admins can add an existing account as a building's manager"`

### Task 4.5: Municipalities and Activity tabs (AD-6, AD-8)

**Files:**
- Modify: `app/admin/page.tsx:158-171`, `lib/data/admin.ts:196-217`
- Create: `lib/data/municipality-form.ts`, `lib/data/municipality-form.test.ts`

**Interfaces:**
- Produces: `parsePostalPrefixes(raw: string): { ok: true; value: string[] } | { ok: false; bad: string[] }`. Split on commas and whitespace, uppercase, each must match `^[A-Z][0-9][A-Z]$` (Canadian FSA), deduplicate.

- [ ] **Step 1: Failing test:** "v6b, V6C  v5k" → ["V6B","V6C","V5K"]; "V6B, 123" → bad ["123"]; "" → ok [].
- [ ] **Step 2–4:** The Municipalities tab lists rows, with an edit/create form for name, region, prefixes (via the parser), animal-control phone and URL, and active. It writes through the existing `municipalities_admin_write` policy. The Activity tab reuses `describeAuditEntry` from `lib/data/audit-log.ts`, unfiltered by building, 50 per page, with an entity-type filter.
- [ ] **Step 5:** Sync the admin tab to `?tab=` with `history.replaceState` (AD-15).
- [ ] **Step 6: Commit** `"Admins edit municipalities and read the platform activity log in the console"`

---

## Phase 5 — Businesses and their customers (BZ-1…5, CU-1…4)

### Task 5.1: Migration — contact details, cancellation notices, owner vet cancel, estimate decline

**Files:**
- Create: `supabase/migrations/20261015000003_bookings_contact_and_notices.sql`; append to `part-g.sql`

- [ ] **Step 1:** SQL checks:
  - `businesses.contact_phone` and `contact_email` exist, and the owner can update them.
  - A business cancelling a confirmed booking with `p_reason` notifies the customer, and the body contains the reason.
  - `business_booking_contact(p_booking)` returns the customer's email (and phone if a profile phone column exists) only to the booking's business owner and only when status is in (confirmed, in_progress, completed); otherwise it returns null fields.
  - `owner_cancel_appointment(p_appointment, p_reason)` works for the pet's owner when status is in (requested, booked) and the start is more than 2 hours away. It notifies clinic staff and refuses anyone else with `42501`.
  - `owner_decline_estimate(p_invoice, p_note)` sets the estimate's status to declined (add the enum value if missing) and notifies the clinic.
- [ ] **Step 2:** Write the migration:
  - Add the `businesses` columns, each with a grammar check constraint: phone `^[+0-9 ()-]{7,20}$`, email `^[^\s@]+@[^\s@]+\.[^\s@]+$`.
  - Add `business_cancel_booking(p_booking uuid, p_reason text)`, a definer function, with the reason required.
  - Extend `notify_customer_of_booking_status` (copy it verbatim from `20261012000009`) to include `cancelled` with "Cancelled by {business}: {reason}".
  - Add the contact RPC, `owner_cancel_appointment`, `owner_decline_estimate`.
  - Add appointment notification triggers (VC-3): on insert with status `requested`, notify the business's active staff with target `clinic:today`; on status change to booked, cancelled or no_show, notify the pet's owner with target `my-vets:appointments`.
- [ ] **Step 3: Commit** `"Bookings carry contact details, cancellations explain themselves, owners can cancel vet visits and decline estimates"`

### Task 5.2: One clear money model (BZ-1, BZ-4)

**Files:**
- Create: `lib/data/fees.ts`, `lib/data/fees.test.ts`
- Modify: `components/screens/business-detail-screen.tsx:345-347`, `components/screens/business/dashboard-tab.tsx:95, 132-134`, `earnings-tab.tsx:46-49, 87-110`, `bookings-tab.tsx:249-251`, `storefront-tab.tsx:304-305, 378-399`, `app/businessaccess/page.tsx:320-322`, `components/screens/my-bookings-screen.tsx:32`

**Interfaces:**
- Consumes: the commission rate constant in `lib/data/bookings.ts:18`
- Produces: `parsePriceCents(raw: string): { ok: true; cents: number } | { ok: false }` (grammar `^\s*\$?\s*\d{1,5}([.,]\d{1,2})?\s*$`, so "$85" → 8500 and negatives are refused)
- Produces: `youReceiveCents(priceCents: number): number` (price minus the commission rounded half up)

- [ ] **Step 1: Failing tests:** "$85" → 8500; "85.5" → 8550; "-5" → not ok; "85,50" → 8550; youReceive(10000) = 8500 at 15%.
- [ ] **Step 2–4:** The model is that the customer pays the business directly, and Pet10x bills the business its fee. Copy:
  - Customer request sheet: "You pay {business} directly after the service."
  - Business card: "Completed — collect {price}"
  - Dashboard: "{amount} earned after Pet10x fee"
  - Earnings: a "Pet10x fee owed" line, and remove the demo sentence
  - Signup and storefront: "Pet10x keeps 15% of each completed booking."
  - The price field uses `parsePriceCents`, with a currency prefix and a live "You receive {youReceive}" line.
  - Add an edit sheet per service (name, price, duration) using the existing `updateService`.
- [ ] **Step 5: Commit** `"One payment story everywhere: pay the business directly; the business sees its 15% fee up front"`

### Task 5.3: Cancellations, archived services, campaigns (BZ-2, BZ-3, BZ-5)

**Files:**
- Modify: `components/screens/business/bookings-tab.tsx:241-242`, `storefront-tab.tsx:328-334`, `promotions-tab.tsx:33-49`, `lib/data/bookings.ts`

- [ ] **Step 1:** Business "Cancel" opens a ConfirmDialog with a required reason → `business_cancel_booking`.
- [ ] **Step 2:** "Delete service" becomes "Archive". It sets the service inactive and hidden (the existing `is_active` column on `business_services`; check the name in `database.types.ts`), so booking history keeps the name. The confirmation says "Past bookings keep this service's name."
- [ ] **Step 3:** Before "Launch campaign", show "Free during beta". The button is disabled with the explanation "Add your location first" when lat/lng are missing, or "Campaigns start once you're verified" when unverified.
- [ ] **Step 4: Commit** `"Businesses confirm cancellations with a reason, archive services instead of erasing them, and see what a campaign needs"`

### Task 5.4: Contact and vet booking for owners (CU-1…4)

**Files:**
- Modify: `components/screens/business/storefront-tab.tsx` (contact fields), `business-detail-screen.tsx:51-122`, `components/screens/business/bookings-tab.tsx:172-179`, `components/screens/my-vets-screen.tsx:327-343, 392-431, 470-505, 640-765`, `lib/data/bookings.ts:427`
- Create: `lib/data/appointment-labels.ts`, `lib/data/appointment-labels.test.ts`

**Interfaces:**
- Produces: `appointmentLabel(status: string): string`, mapping requested → "Waiting for the clinic to confirm", booked → "Confirmed", checked_in → "Checked in", in_progress → "With the vet", completed → "Done", cancelled → "Cancelled", no_show → "Missed", and anything else → "Status unknown"

- [ ] **Step 1: Failing test** for `appointmentLabel`.
- [ ] **Step 2–4:**
  - The storefront gets phone and email fields. The business page and confirmed bookings show them, and "contact the business" errors link to them.
  - The business booking card shows the customer's contact via `business_booking_contact` once confirmed.
  - A clinic-type business's detail page shows "Book an appointment", which opens the My vets slot picker for that clinic.
  - The slot picker is two-step: tap a slot, then a summary card (practice, pet, reason, time, price, sharing off by default (CU-8), "Request appointment"), then a success state.
  - Appointments get "Cancel" (via `owner_cancel_appointment`, with a ConfirmDialog and optional reason) and use `appointmentLabel`.
  - Estimates awaiting approval show expanded line items, plus "Decline" (required note → `owner_decline_estimate`) beside Approve.
  - The My bookings empty-state copy reads: "Book groomers and walkers in Services. Vet appointments are under My vets."
- [ ] **Step 5: Commit** `"Owners can reach the business, book a vet in two clear steps, cancel it, and decline an estimate"`

---

## Phase 6 — Vet clinics (VC-1…8)

### Task 6.1: Migration — a new clinic can book on day one

**Files:**
- Create: `supabase/migrations/20261015000004_clinic_defaults.sql`; append to `part-g.sql`

- [ ] **Step 1:** SQL check: after `business_bootstrap()` for a new vet business, it has at least 3 active online-bookable `appointment_types` and Mon–Fri 09:00–17:00 `staff_availability` for the owner's staff row, and `clinic_available_slots` returns at least one slot for the next weekday.
- [ ] **Step 2:** Copy `business_bootstrap` verbatim and seed defaults by `business_kind`:
  - vet: "Wellness exam" 30 min, "Vaccination" 15 min, "Sick visit" 30 min
  - groomer: "Bath & brush" 60 min, "Full groom" 90 min
  - other: "Appointment" 30 min

  Prices are null. Add availability for Mon–Fri 09:00–17:00, and backfill every existing business that has zero appointment types.
- [ ] **Step 3: Commit** `"New clinics start with appointment types and weekday hours they can book against"`

### Task 6.2: Editors for types and hours; billing from visits (VC-2, VC-1, VC-6, VC-11)

**Files:**
- Modify: `components/screens/clinic/shop-screen.tsx:134-138`, `components/screens/clinic/team-screen.tsx` (hours per staff), `components/screens/clinic/patient-panel.tsx:222-374`, `billing-screen.tsx:37-39, 76-112`, `today-screen.tsx:158-166`, `lib/data/clinic/shop.ts:178, 225-236`
- Create: `lib/data/clinic/hours.ts`, `lib/data/clinic/hours.test.ts`

**Interfaces:**
- Produces: `validateHours(rows: { weekday: number; start: string; end: string }[]): { ok: true } | { ok: false; error: string }` (HH:MM grammar `^([01]\d|2[0-3]):[0-5]\d$`; end after start; no overlaps on a weekday)

- [ ] **Step 1: Failing test** for `validateHours`.
- [ ] **Step 2–4:**
  - "Services and prices" becomes an editable list (name, duration, price via `parsePriceCents`, online-bookable, active).
  - The Team screen gets a weekly hours editor per bookable clinician.
  - Visit cards with services get "Create estimate" and "Create invoice" (`invoiceFromVisit(v.id, kind)`), which open the draft in Billing. Billing gets "New invoice".
  - Estimates show "Convert to invoice" once approved, and never "Mark paid".
  - Invoices get "Record payment", a sheet with amount and method that calls `setInvoiceStatus` with `paidCents`, behind a confirmation. Add "Void".
  - Status pills are title-cased.
  - "Taken today" uses the payment date in the practice timezone.
  - Today's "Check out" opens the visit with "Create invoice".
  - Add a set-up checklist on Today: types, hours, team, verification.
- [ ] **Step 5: Commit** `"Clinics edit their services and hours, and bill straight from a visit"`

### Task 6.3: Clinic scheduling fixes (VC-4, VC-5, VC-7, VC-8)

**Files:**
- Modify: `components/screens/clinic/today-screen.tsx:59, 115-128`, `calendar-screen.tsx:43-47, 116, 179-195, 326`, `app/clinic/page.tsx:124-236`, `components/screens/clinic/clinic-onboarding.tsx:92-94`, `app/businessaccess/page.tsx:297-315`
- Create: `lib/data/clinic/calendar-columns.ts`, `lib/data/clinic/calendar-columns.test.ts`

**Interfaces:**
- Produces: `calendarColumns(staff: { id: string; name: string; bookable: boolean }[], appts: { staffId: string | null }[]): { id: string | null; name: string }[]` (bookable staff plus an "Unassigned" column whenever any appointment has a null `staffId`, or when nobody is bookable)

- [ ] **Step 1: Failing test** for `calendarColumns`.
- [ ] **Step 2–4:**
  - Decline becomes "Decline request" with a ConfirmDialog and required reason → `clinic_set_appointment_status(id, 'cancelled', reason)`. The owner sees "Declined by clinic: {reason}" via the Task 5.1 trigger. The Cancelled and No-show buttons in the calendar modal get the same confirmation.
  - Every `window.alert` in these files becomes a toast.
  - The mobile clinic header gets an account menu (email, Email & push, Help, Sign out).
  - Clinic and business sign-in get "Create an account" (to `/login?mode=signup&next=/clinic`, or `/businessaccess`) and "Forgot password?" (the existing reset flow used by `/login`).
- [ ] **Step 5: Commit** `"Clinics decline with a reason, never lose unassigned bookings, and can sign out on a phone"`

---

## Phase 7 — Everyone: safety, accessibility, honesty (GX-1, GX-3, XC-3…7)

### Task 7.1: Emergency page survives a bad connection (GX-1)

**Files:**
- Create: `lib/data/emergency-state.ts`, `lib/data/emergency-state.test.ts`
- Modify: `lib/data/emergency.ts:66-69`, `app/emergency/[code]/page.tsx:38-99`

**Interfaces:**
- Produces: the check result type `{ kind: "valid"; data } | { kind: "denied" } | { kind: "network" }`, so `emergency.ts` distinguishes an RPC/transport error from an explicit `valid:false`
- Produces: `nextEmergencyState(prev: { data: Data | null; stale: boolean; denied: boolean; lastOk: number | null }, result, now): same shape`
  - network with data → keep the data and set `stale: true`
  - network without data → `{ data: null, denied: false }`, so the page shows "Couldn't connect" with Retry
  - denied → wipe the data
  - valid → fresh data, `stale: false`, `lastOk: now`

- [ ] **Step 1: Failing test** covering all four transitions.
- [ ] **Step 2–4:** Implement. The page shows the banner "Couldn't refresh. Showing data from {hh:mm}." when stale, and a Retry button on a first-load network failure.
- [ ] **Step 5: Commit** `"Emergency floor list stays on screen through a dropped connection"`

### Task 7.2: Contrast and zoom (XC-3, XC-4)

**Files:**
- Modify: `app/globals.css:26-27` and the token block, `app/layout.tsx` viewport
- Create: `lib/contrast.ts`, `lib/contrast.test.ts`

**Interfaces:**
- Produces: `contrastRatio(hexA: string, hexB: string): number` (WCAG relative luminance)

- [ ] **Step 1: Failing test:** `contrastRatio("#FFFFFF", "#000000")` ≈ 21. Then assert the new tokens pass: `--primary` fill vs `--primary-foreground` ≥ 4.5, `--primary-text` on `--background` ≥ 4.5, `--success-strong` on `--background` ≥ 4.5. The test reads the hex values from `app/globals.css` with a regex, so it fails if someone regresses the tokens.
- [ ] **Step 2–4:** Add `--primary-strong: #B85A12` for button fills and `--primary-text: #A9520F` for orange text (adjust until the test passes). Add `--success-strong`. Keep `--primary #FD9340` for decorative surfaces only, switch `bg-primary` buttons to `bg-primary-strong`, and switch `text-primary` text to `text-primary-text` (grep both; leave icons). Remove `maximumScale` and `userScalable` from the viewport, and make inputs 16px.
- [ ] **Step 5: Commit** `"Buttons and links meet AA contrast; pinch-zoom works again"`

### Task 7.3: Keyboard-safe dialogs and forms (XC-6, XC-7)

**Files:**
- Modify: the 17 hand-built overlays (`grep -rln "fixed inset-0" components app | grep -v components/ui`), the auth screens `app/manager/page.tsx`, `app/businessaccess/page.tsx`, `app/admin/page.tsx:133-151`

- [ ] **Step 1:** Replace each overlay's wrapper with `components/ui/sheet.tsx` (bottom sheets) or `dialog.tsx` (centred), keeping the content. Do it one file per commit-sized step, running tsc after each.
- [ ] **Step 2:** On every auth screen, use `<form onSubmit>`, visible or `sr-only` `<label htmlFor>`, `role="alert"` errors, and `autoComplete` attributes (`email`, `current-password`, `new-password`, `one-time-code`).
- [ ] **Step 3:** Add `aria-label` to every icon-only button touched. Toggles get `role="switch" aria-checked`.
- [ ] **Step 4: Commit** `"Dialogs trap focus and close on Escape; sign-in forms submit on Enter and announce errors"`

### Task 7.4: Notification links for people with two roles (XC-5)

**Files:**
- Modify: `app/app/page.tsx:197-212`, `components/screens/alerts-screen.tsx:65, 201-214`, `app/clinic/page.tsx:70-78`, `app/login/page.tsx`
- Create: `lib/navigation-persona.ts`, `lib/navigation-persona.test.ts`

**Interfaces:**
- Produces: `personaForTarget(target: string, granted: Persona[]): Persona | null`, returning the persona whose surface renders the target, preferring the currently worn one, or null when no granted persona can render it

- [ ] **Step 1: Failing test:** a resident target while wearing manager, with pet-owner granted → "pet-owner"; a manager-only target with only pet-owner granted → null.
- [ ] **Step 2–4:**
  - When a deep link resolves to null for the worn persona but `personaForTarget` returns another persona, call `setActivePersona(that)` and then navigate.
  - In Notifications, items for the other persona show "Switch to {persona}" instead of nothing.
  - `/clinic` keeps `?target` until authenticated.
  - `/login` reads `auth_error=callback` and shows "That link has expired or was already used. Request a new one." with the reset action.
- [ ] **Step 5: Commit** `"Notification links switch to the right view instead of doing nothing"`

### Task 7.5: Honest pricing and a visible hero (GX-3, GX-5)

**Files:**
- Modify: `app/page.tsx:151-178, 207-278, 556-561`, `components/landing/reveal.tsx`

- [ ] **Step 1:** Change the pricing section's heading to "Pricing (coming soon)". Pet Basic: "Free for every pet owner today", with the limits removed. Pet Plus: label "Coming soon" and button "Get started free" → signup. Remove "Report incidents with evidence" from the paid list. Keep the building-sponsored sentence as "Planned."
- [ ] **Step 2:** `Reveal` takes an `immediate` prop that renders visible with no transition. The hero h1, sub-copy, CTAs and image use it.
- [ ] **Step 3: Commit** `"Pricing says what exists today; the hero is visible before scripts run"`

---

## Phase gates

After each phase:
1. `pnpm test && npx tsc --noEmit -p . && pnpm lint && pnpm build`, all green.
2. A phase with migrations (3, 4, 5, 6): run `bash supabase/bundles/build.sh`, then the user runs `dry-run.sql` in the SQL Editor, expecting `DRY RUN OK`. Then `apply.sql`, then verify with `list_migrations`.
3. Push the branch and check the Vercel preview (which shares the live DB: note and delete test rows), then fast-forward `main`.
4. Update `docs/superpowers/RESUME-HERE.md` with what shipped and which audit IDs closed.

## Not in this plan

Medium and Low findings are left for a follow-up polish plan, except where a task above fixes one in passing (each is marked with its ID). Specifically not here: three-tab pet profile (PO-11 beyond file-required), unified sign-in (GX-8), component-system consolidation (XC-11), bundle splitting (XC-15), the strata viewer role (BM-24), the guest report status page (GX-6).
