# Phase 3 — Honest cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** No control in the app claims to do something it does not. Every "coming soon" toast either becomes the action it promised, or the control goes.

**Architecture:** Nothing here needs a migration. Several of these controls have a real destination that already exists and was never wired; the rest advertise features that do not exist, and the honest treatment is removal. The rule from the spec is the whole of it: *a control that cannot act must not exist.*

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, `sonner`, `lucide-react`, pnpm 9 via corepack.

**Spec:** [`docs/superpowers/specs/2026-08-21-completing-manager-resident-flows-design.md`](../specs/2026-08-21-completing-manager-resident-flows-design.md)

## Global Constraints

- **pnpm needs `PATH="$HOME/.corepack-bin:$PATH"`** (9.15.9).
- **A control that cannot act must not exist.** Removal is a valid, and often the correct, outcome.
- **Never replace one lie with another.** A control that navigates somewhere useless is no better than a toast.
- **No new database objects, no migrations.** If something appears to need one, it belongs to a later phase — report it.
- **Do not touch `components/screens/manager/violations-screen.tsx`** — Phase 2 owns that file entirely.

---

## Task 1: Wire what already has a destination

Four controls toast while the thing they promise already exists and works.

**Files:**
- Modify: `components/screens/alerts-screen.tsx`
- Modify: `components/screens/home-screen.tsx`

| Control | Current | Becomes |
| --- | --- | --- |
| `alerts-screen.tsx:145` "Report an Incident" | `toast("… coming soon")` | `onNavigate?.("report")` — the screen exists and Home already navigates to it |
| `alerts-screen.tsx:196` notification action button | `toast.success(alert.actionLabel)` | Navigate to `notifications.action_target`, a column already populated by `/api/manager/request-info` |
| `alerts-screen.tsx:110` Filters | `toast("Filters — coming soon")` | **Remove.** The tab row above it already filters by category |
| `home-screen.tsx:330` Customize quick actions | `toast("… Coming soon")` | **Remove.** No preference store exists |

The `action_target` wiring is the one with substance. Read `app/api/manager/request-info/route.ts:82-91` to see the shape being written (`action_label`, `action_target`), and `lib/data/live.ts`'s `useNotifications` for how it surfaces. Map the target string through the same `onNavigate` the rest of the screen uses; when `action_target` is null, render no button rather than a dead one.

- [ ] **Step 1: Confirm what targets actually occur**

```sql
select action_target, count(*) from public.notifications
where action_target is not null group by 1 order by 2 desc;
```

Every value must map to a real screen in `app/app/page.tsx`'s router. If one does not, report it — do not invent a destination.

- [ ] **Step 2: Make the changes**
- [ ] **Step 3: Verify in the running app** — click each, confirm it lands where it should, and confirm a notification with a null target shows no button.
- [ ] **Step 4: Commit**

```bash
git add components/screens/alerts-screen.tsx components/screens/home-screen.tsx
git commit -m "Send the buttons where they always meant to go"
```

---

## Task 2: The resident profile menu

**Files:**
- Modify: `components/screens/profile-screen.tsx`

`MENU_SECTIONS` (`:41-77`) lists 15 rows. `handleItem` (`:151-157`) routes three and toasts the rest — the fallback is `toast(label, { description: "Coming soon." })`, so every unhandled row silently claims a future.

| Row | Disposition |
| --- | --- |
| Pet Profiles, Documents & Records, Favorite Services | Already routed — leave |
| Compliance Status | Route to `pet-care`; the compliance data is real and already computed by `computeGaps` |
| Building Rules | **Leave as-is with an honest label** — Phase 6 builds this. Do not remove; do not fake it |
| Accommodation Requests | **Leave as-is** — Phase 7 builds this |
| Subscription, Notification Settings, Privacy & Security, Language, Appearance | **Remove.** No settings store exists and none is planned in any phase |
| Achievements | **Remove.** Nothing computes achievements |
| Help & FAQ, Rate Pet10x, Terms & Privacy Policy | **Remove**, unless a real URL exists — check `public/` and any config for one first |

For the two rows a later phase will build, replace the "Coming soon" toast with a disabled row and a `detail` of "Not available yet" — the same treatment `manager/settings-screen.tsx:150-160` already uses for its unbuilt rows, so the app is consistent about how it says no.

Delete the `else toast(label, …)` fallback entirely. After this, every remaining row either navigates or is visibly disabled; nothing falls through to a claim.

- [ ] **Step 1: Check for real support URLs** before removing Help/Terms.
- [ ] **Step 2: Make the changes**
- [ ] **Step 3: Verify** — every row either navigates or is visibly disabled. `grep -n "Coming soon" components/screens/profile-screen.tsx` returns nothing.
- [ ] **Step 4: Commit**

---

## Task 3: Community — remove what cannot act

**Files:**
- Modify: `components/screens/community-screen.tsx`

Phase 8 builds Events, RSVP and Lost & Found. This task does **not** build them — it stops the screen claiming things it cannot do.

| Control | Disposition |
| --- | --- |
| `:223` Pin post | **Remove.** `community_posts.is_pinned` exists but no policy permits a resident to set it, and `posts_update_own` covers only the author's own row |
| `:228` More options | **Remove** |
| `:257` Share → `toast.success("Link copied")` | Either a real `navigator.clipboard.writeText` with a working deep link, or **remove**. A toast claiming a copy that did not happen is the worst of the three |
| `:375` RSVP | **Leave** — Phase 8 wires it. The events list is empty today so the button never renders |

- [ ] **Step 1: Decide Share on evidence** — is there a deep link shape the app can route to? If not, remove.
- [ ] **Step 2–4: Change, verify, commit**

---

## Task 4: The sweep

**Files:** any remaining

- [ ] **Step 1: Find everything left**

```bash
grep -rn "coming soon\|Coming soon" app components lib --include=*.tsx --include=*.ts | grep -v node_modules
grep -rnE "onClick=\{\(\) => toast" app components | grep -v node_modules
```

- [ ] **Step 2: Account for every hit.** Each is wired, removed, or on a named phase's list with the phase named in a comment. Nothing is left unexplained.

- [ ] **Step 3: Record the residue**

Write `docs/superpowers/2026-08-21-deferred-controls.md`: every control still showing "not available yet", which phase owns it, and why it was not built now. A reader should be able to tell deliberate deferral from neglect.

- [ ] **Step 4: Verify and commit**

`pnpm test`, `pnpm build`, then the two greps above with every remaining hit explained in the commit message.

---

## Phase 3 done when

1. `pnpm test` and `pnpm build` pass.
2. No `toast()` stands in for a mutation anywhere outside `violations-screen.tsx` (Phase 2's file).
3. Every remaining "not available yet" control is disabled rather than clickable, and appears in the deferred-controls doc with an owning phase.
4. `grep -rn "coming soon" app components lib` returns only matches inside comments explaining history.
