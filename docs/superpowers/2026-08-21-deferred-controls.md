# Controls that once said "not available yet"

Written by Phase 3 (honest cleanup), 2026-08-23; brought up to date by Part F,
2026-10-07. Phase 3's rule still holds everywhere: **a control either does
what it says, is visibly disabled, or is gone.** Nothing toasts a promise.

The point of the file is to make **deliberate deferral distinguishable from
neglect**. Rows are kept after they are resolved, with what resolved them,
because a row that vanishes silently is indistinguishable from a row nobody
ever looked at again.

**As of Part F there is no disabled "not available yet" control left in the
app.** Every row below is either built, or removed with the reason recorded.

---

## Deferred to a named phase — all resolved

| Control | Was | Is now |
| --- | --- | --- |
| Profile → **Building Rules** | disabled (`unbuilt: true`), owner Phase 6 | **Built, Phase 6.** Opens `building-rules`. |
| Home → Quick Actions → **Building Rules** | disabled; before that it toasted one fabricated policy string for every building | **Built, Phase 6.** Same screen. |
| Profile → **Accommodation Requests** | disabled, owner Phase 7 | **Built, Phase 7.** The resident intake form, its RPCs and the `accommodation-docs` storage path. |
| Community → **Pin post**, **More options**, **Share**, **RSVP**, **Search** | toasts, then disabled, owner Phase 8 | **Built, Phase 8** (Share on a post removed; share text on Lost & Found instead). Details in the Phase 8 commits. |

---

## Deferred with no owning phase — resolved by Parts A–F

### The eleven manager settings rows — `components/screens/manager/settings-screen.tsx`

| Row | Resolution |
| --- | --- |
| Help & FAQ, Terms & Privacy Policy | **Built, Part C** — real `/help`, `/terms` and `/privacy` pages, linked from the Support section. |
| Notifications | **Built, Part D** — the Email & push sheet. |
| Audit Log | **Built, Part F** — the building's `audit_log` as sentences, filtered by area, 50 a page (`audit-log-screen.tsx`, `lib/data/audit-log.ts`). |
| Staff & Access Control | **Built, Part F** — the strata portal's `BuildingTeam` for the active building; invite/remove for the primary manager only. |
| Compliance Report | **Built, Part F** — registration, compliance by item, expiries, open cases by stage; Download CSV and Print (`compliance-report-screen.tsx`). |
| Subscription & Billing | **Removed, Part F.** Payments are out of scope; there is nothing to bill. |
| Security & Access, Language, Appearance | **Removed, Part F.** No preference store exists for any of them. |
| Document Templates, Notification Rules | **Removed, Part F.** They sat in a section the old render loop never mapped, so they had never appeared on screen. The loop that dropped them is gone too: each section is now written out. |

### Terms & Privacy Policy, Help & FAQ — resident profile

Removed by Phase 3 because no such pages existed. **Restored, Part C**: the
pages exist and the rows are links again ("Help & legal"). Rate Pet10x stays
removed — there is no store listing to rate.

### Approvals → **Request Info** on a pet registration — still REMOVED

Unchanged and deliberate. Asking a resident for details is built
(`RequestInfoButton` on Residents, `/api/manager/request-info`); this row is a
pet, not a link, and the shortcut would need the owner's link resolved first.
If someone wants it back: add `owner_id` to the `useRegistrationsLive` select,
resolve the owner's approved `resident_links` row for that building, and pass
the row's `flags` as `missing`. No phase owns it.

### Profile → **Compliance Status** — still REMOVED

Unchanged. Nothing computes a resident-facing compliance status; the records
behind it (vaccinations and documents with their badges) are two rows above in
the same menu.

### `deleteBuilding` — the admin console's building delete

**Resolved, Part B.** A building with any history is archived
(`setBuildingArchived`, `buildings_archive_guard`), not deleted; Delete is
offered only where `admin_building_history` counts nothing, and a late 23503
reads as advice rather than raw Postgres text.

### Account deletion — storage and blocked accounts

**Resolved, Part F.** `app/api/account/delete/route.ts` removes the account's
files from every bucket it owns objects in (pet-media, avatars,
accommodation-docs, community-media, guest-evidence), and
`20261012000001_account_deletion_set_null.sql` turns the 20 NO ACTION foreign
keys into SET NULL so every account can be deleted. An open case, an owed fine
or a business with open bookings refuses first, in one sentence.

### Business and clinic consoles had no in-app notifications

**Resolved, Part F.** Both consoles have an inbox (`ConsoleInbox`): unread
bell, list, mark read, and a button to the tab a notification names.

---

## Removed outright, with nothing deferred

Listed so nobody re-adds them thinking they were an oversight.

| Control | Was | Why it is gone |
| --- | --- | --- |
| Alerts → **Filter** | `toast("Filters — coming soon")` | The tab row beneath it already filters, built from the categories the viewer receives. |
| Home → **Customize** quick actions | a "coming soon" toast | No preference store exists anywhere. |
| Profile → **Achievements** | the fallback toast | Nothing computes an achievement. |
| Profile → **Subscription**, **Privacy & Security**, **Language**, **Appearance** | the fallback toast | No settings store. Language and Appearance displayed a preference that was never stored. (Notification Settings came back in Part D as the real Email & push sheet.) |
| Manager Settings → **Subscription & Billing**, **Security & Access**, **Language**, **Appearance**, **Document Templates**, **Notification Rules** | disabled rows | Part F — see above. |

---

## Not a control, same debt — all resolved

- Community `EmptyState` CTAs and `<Image src="">` — **fixed, Phase 8.**
- Account deletion orphaning bucket objects — **fixed, Phase 7** for
  accommodation documents and **Part F** for every other bucket.
