# Controls that still say "not available yet"

Written by Phase 3 (honest cleanup), 2026-08-23. Every control listed here is
**visibly disabled** in the app — no chevron, no highlight, no toast — and every
one is listed with the phase that owns it, or with an explicit statement that
nobody does.

The point of the file is to make **deliberate deferral distinguishable from
neglect**. A reader should be able to tell, for any greyed-out row, whether it
is waiting for a plan or waiting for someone to notice it.

The rule Phase 3 applied everywhere: **a control either does what it says, is
visibly disabled, or is gone.** Nothing toasts a promise.

---

## Deferred to a named phase

Each of these is kept, disabled, because a written plan builds it. Re-enabling
is deleting one flag and adding one line — the owning plan already says so.

| Control | File | Owner | Why not now |
| --- | --- | --- | --- |
| Profile → **Building Rules** | `components/screens/profile-screen.tsx:103` (`unbuilt: true`) | **Phase 6** — `plans/2026-08-22-phase-6-building-rules.md:658` | The screen does not exist. Phase 6 builds `building-rules`, routes this row to it, and its plan already instructs its implementer to re-enable a row it expects to find disabled. |
| Home → Quick Actions → **Building Rules** | `components/screens/home-screen.tsx:62` (`unbuilt: true`) | **Phase 6** — same plan, `:657` | Same screen. This tile was worse than a "coming soon": it toasted *"One dog or one cat · leashed in common areas"* as though that were the viewer's building's policy. It is one string for all six buildings and it is **wrong for the flagship one** — Maple Court Residences' `buildings.pet_rules` records `max_pets_per_unit: 2`. Fabricated data outranks an admitted gap. |
| Profile → **Accommodation Requests** | `components/screens/profile-screen.tsx:104` (`unbuilt: true`) | **Phase 7** — `plans/2026-08-22-phase-7-accommodations.md:569` | No resident intake form exists anywhere; `accommodation_documents` holds 0 rows and nothing has ever written one. Phase 7 builds the form, the RPCs and the storage path. |
| Community → **Pin post** | `components/screens/community-screen.tsx:266-274` | **Phase 8** — `plans/2026-08-22-phase-8-community.md:681` | `community_posts.is_pinned` exists and nothing sets it. Phase 8 adds a moderation migration and a column-level trigger, because `posts_update_own` currently lets an **author** pin their own post. Was `toast.success("Post pinned")` over no write at all. |
| Community → **More options** | `components/screens/community-screen.tsx:276-278` | **Phase 8** — same plan, `:682` | Becomes a real remove-post sheet. |
| Community → **Share** (on a post) | `components/screens/community-screen.tsx:320-322` | **Phase 8** — same plan, `:683`, disposition **remove** | There is no per-post route to copy: `/app` is one client-side screen switcher and `app/emergency/[code]` is the project's only dynamic route. Share becomes real on **Lost & Found** instead, as share *text*. Was `toast.success("Link copied")` with no clipboard call anywhere in the handler. |
| Community → **RSVP** | `components/screens/community-screen.tsx:452-457` | **Phase 8** — same plan, `:684` | `useEvents()` is a `resolved([])` stub and `events` holds 0 rows, so it has never rendered. Disabled anyway: an unreachable false claim is one grep away from being copied somewhere reachable. Phase 8 must also widen `event_rsvps`, whose only policy is `rsvps_self`, or the attendee count can never be true. |
| Community → **Search** field | `components/screens/community-screen.tsx:204-207` | **Phase 8** — same plan, `:685` | A `<span>` styled as a text input. Never typeable, no state, no handler. Left exactly as it is so Phase 8 replaces one thing rather than unpicking a cosmetic patch first. Neither of Phase 3's sweep greps can see it — it is not a toast and not an `onClick`. |

---

## Deferred with NO owning phase

These are honest gaps that no plan currently covers. They are disabled or
removed, and they are listed here **because nothing else will remember them**.

### The eleven manager settings rows — `components/screens/manager/settings-screen.tsx`

Staff & Access Control, Audit Log, Compliance Report, Subscription & Billing,
Security & Access, Language, Appearance, Help & FAQ, Terms & Privacy Policy —
plus Document Templates and Notification Rules, which are declared in `UNBUILT`
but sit in a section the render loop never maps, so they have never appeared on
screen at all.

They already read "Not available yet" and already toasted honestly. Phase 3
made them **disabled**, because a row that highlights, depresses and answers is
a control, and reading "This isn't built yet" is a worse way to learn that than
seeing it before you press. The spec lists the settings-menu stubs as
explicitly out of scope for every one of Phases 4–8.

### Terms & Privacy Policy, Help & FAQ, Rate Pet10x — REMOVED from the resident profile

Checked before removing, per the plan: `public/` holds no such document, the
project has ten page routes and none of them is `/terms`, `/privacy` or
`/help`, and no support URL exists in any config. Inventing
`pet10x.com/terms` would have been a worse lie than the toast.

**This is a real product obligation, not just a menu row.** Pet10x holds pet
health records, home addresses and building affiliations. It should have a
privacy policy reachable from the app. Nothing plans one. It is written down
here so that removing the row does not quietly become "we decided we don't need
one".

### Approvals → **Request Info** on a pet registration — REMOVED

`components/screens/manager/approvals-screen.tsx:201`. It toasted *"Messaging
the resident isn't built yet"*, which was a claim about the product rather than
about the button: asking a resident for details **is** built and works —
`RequestInfoButton` on the Residents screen posts to
`/api/manager/request-info`, stamps `resident_links.info_requested_at`,
notifies in-app and sends email.

It could not be reused here without building something new. That endpoint is
keyed on `resident_links.id`; this row is a **pet** (`decideRegistration` takes
a pet id) and `useRegistrationsLive` selects no owner id and no link id, so
there is nothing to resolve a link from. Removed rather than disabled, because
the capability is not missing — only its shortcut, and it is two taps away.

**If someone wants it back:** add `owner_id` to the `useRegistrationsLive`
select, resolve the owner's approved `resident_links` row for that building,
and pass the row's existing `flags` as `missing`. Roughly twenty lines. No
phase owns it.

### Profile → **Compliance Status** — REMOVED

Phase 3's own plan said to route this to `pet-care`. That was checked and is
wrong: `pet-care` is the CareTracker — meals, walks, medication — with no
compliance in it. Routing there would have replaced a toast with a wrong
destination, which the plan's own global constraint forbids.

Measured instead: **nothing computes a resident-facing compliance status.**
`computeCompliance` (`lib/data/live.ts:53`) is reached only by
`useBuildingPets`, which is the manager's list; `useMyCompleteness` renders in
exactly one place, Home's dismissible `MissingInfoCard`; and
`ownerComplianceScore` is a literal `0` in a mock hook with no consumer. The
records behind the idea — vaccinations and documents, with their
current/expiring/expired badges — are already two rows above in the same menu.

### `deleteBuilding` — the admin console's building delete

`lib/data/admin.ts:169`. Not disabled, because it is not lying about being
unbuilt; its **doc line** was lying. It claimed to cascade to units,
resident_links and building_managers. Measured against the live schema: four
foreign keys into `buildings` are `NO ACTION` — `business_listings`, `fines`,
`notifications`, `payouts` — and since Phase 2, `violation_events` is
`ON DELETE RESTRICT`, so a building holding any enforcement case cannot be
deleted either. The call therefore fails on any building anyone has used, and
the admin sees raw Postgres 23503 text.

The doc line is now accurate. Deciding what "delete a building" should mean —
archive, transfer, or refuse with a readable reason — is a product question
**no phase owns**.

---

## Removed outright, with nothing deferred

Listed so nobody re-adds them thinking they were an oversight.

| Control | Was | Why it is gone |
| --- | --- | --- |
| Alerts → **Filter** | `toast("Filters — coming soon")` | The tab row directly beneath it already filters the list, and that row is built from the categories the viewer actually receives. There is nothing a filter sheet could offer that is not one tap away. |
| Home → **Customize** quick actions | `toast("Customise quick actions", { description: "Coming soon." })` | No preference store exists anywhere — not a table, not a column on `profiles`, not `localStorage` — and none is planned in Phases 4–8. |
| Profile → **Achievements** | fell through to `toast(label, { description: "Coming soon." })` | Nothing computes an achievement. No table, no column, no plan. |
| Profile → **Subscription**, **Notification Settings**, **Privacy & Security**, **Language**, **Appearance** | same fallback toast | No settings store exists and none is planned. Language and Appearance additionally *displayed* a stored preference ("English", "System") that was never stored anywhere. |

The `handleItem` fallback itself is gone. A row added to `MENU_SECTIONS`
without a branch is now **inert**, which is visible the first time it is
clicked, instead of sounding like a feature.

---

## Not a control, same debt — recorded for its owner

- `components/screens/community-screen.tsx` — the `EmptyState` CTA lines
  *"Report a lost or found pet"* and *"Suggest an event"* describe composers
  that do not exist. **Phase 8** Task 6 adds both, at which point they become
  true. They assert nothing about an action having been taken, so they were
  left alone rather than reworded and reworded back.
- `components/screens/community-screen.tsx` — a post whose author has no
  avatar renders `<Image src="">`, which Next warns re-downloads the whole
  page. Reproduced in the browser on a seeded post. Never fires today because
  `community_posts` is empty; **Phase 8** ships the first real posts and owns
  it. `profile-screen.tsx:192` already carries the fix for the same bug.
- `app/api/account/delete/route.ts` deletes rows and touches storage **zero**
  times, orphaning every bucket object belonging to the deleted account.
  **Phase 7** plans it. Not touched here.
