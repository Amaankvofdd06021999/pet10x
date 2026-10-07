# Part A — quick fixes and pet archiving

Date: 2026-10-07. Branch: `pet10x-gaps`.

## Context

The 2026-10-07 audit split the remaining non-payment work into six parts
(A quick fixes → B manager tools → C trust & legal → E vet completion →
D notifications → F admin & settings). Payments of every kind (Stripe,
subscriptions, checkout, payouts, fine payment) are out of scope for all six.

This spec covers Part A only.

## Goals

Every control in the owner flow either does what it says or is gone, unread
state behaves like unread state, and an owner can remove a pet without
damaging anyone else's records.

## Non-goals

- Push or email notifications (Part D).
- A favourites feature for services.
- Hard deletion of pets.
- Changing the mobile tab bar's five slots.

## 1. Notification read state

**Today:** `markNotificationRead` (`lib/data/live.ts`) has no caller. Each of
`useNotifications` / `useUnreadNotificationCount` fetches independently, so
the home bell, profile bell and sidebar badge never clear.

**Change:**
- Notifications are loaded once per signed-in session through a shared
  module-level store with subscribers, modelled on the existing `pets` cache in
  `live.ts`, and cleared on sign-out. `useNotifications` and
  `useUnreadNotificationCount` read from it.
- Opening a notification in Alerts (tapping the row or its action) marks it
  read, optimistically, then persists via `markNotificationRead`. A failure
  reverts the row and toasts the error.
- Alerts header gains **Mark all read** (shown only when unread > 0), backed by
  a new `markAllNotificationsRead()` that updates
  `read_at` where `profile_id = auth.uid() and read_at is null`.
- No migration: `notifs_update` already permits the owner to update their rows.

## 2. Home "Recent Activity"

`useHomeAlerts` is a stub returning `[]`, so the block never renders. Replace
its use with the latest three notifications from the shared store, mapped to
the existing card. Delete the `useHomeAlerts` and `useServiceProviders` stubs
and the `HomeAlert` / `ServiceProvider` types if nothing else uses them.

## 3. Profile menu destinations

- **Pet Profiles** — one pet: open `pet-detail` with its id. Several: open a pet
  picker sheet, then `pet-detail` with the chosen id. None: open `add-pet`.
- **Documents & Records** — same picker, then `pet-detail` with the chosen id,
  scrolled to its documents section.
- **Favorite Services** → renamed **My Bookings**, routes to `my-bookings`.
- The picker is one shared component; its selection logic (0 / 1 / many) is a
  pure function with unit tests.
- Navigating to `pet-detail` without an id must no longer be possible from the
  profile.

## 4. Navigation fixes

- Home "Pet Events" tile → `community` with the Events tab selected.
  `CommunityScreen` accepts an initial tab.
- Desktop manager sidebar gains **Incidents** (between Violations and
  Approvals). The mobile tab bar is unchanged.
- Delete `components/ai/ask-fab.tsx` (no importer) and the unreachable
  "Emergency QR generated" toast branch in
  `components/screens/manager/dashboard-screen.tsx`.

## 5. Guest session survives reload

`signInGuest` stores `{ buildingCode, buildingName }` in `sessionStorage`
(wrapped in try/catch). On load, the auth context restores it only when there
is no signed-in user. `signOut` and a successful real sign-in clear it.

## 6. Archiving a pet

### Owner experience
- Pet detail gains **Remove pet** (destructive, at the bottom of the edit area).
- A sheet asks for a reason — **Passed away**, **Rehomed**, **Added by
  mistake** — and confirms. On success the owner returns home and the pet is
  gone from every list.
- Pets archived as **Passed away** appear in an **In memory** section on the
  Profile screen: photo, name, and birth–archive years when a DOB exists.
  Read-only, no navigation. Other reasons do not appear anywhere.

### Database (one migration, next free number in `supabase/migrations/`)
- `pets.archived_reason text null`, check constraint
  `archived_reason in ('passed_away','rehomed','mistake')`, and a check that
  `archived_reason is null` exactly when `deleted_at is null`.
- `public.owner_archive_pet(p_pet_id uuid, p_reason text) returns void`,
  `SECURITY DEFINER`, `search_path = public, pg_temp`:
  1. Rejects (42501) unless `owner_id = auth.uid()` and `deleted_at is null`.
  2. Rejects invalid reasons (22023).
  3. Sets `deleted_at = now()`, `archived_reason = p_reason`.
  4. Sets `revoked_at = now()` on the pet's open `record_shares`.
  5. Sets `is_active = false` on the pet's `pet_care_tasks`.
  6. Writes an `audit_log` row.
  Granted to `authenticated` only; revoked from `public` and `anon`.

### Archived pets disappear from every read
Every query of `pets` that lists current pets must filter
`deleted_at is null` explicitly (RLS is the floor, the query is the filter).
The implementation plan enumerates each call site; known ones include
`lib/data/live.ts`, `manager.ts`, `manager-queues.ts`, `portfolio.ts`,
`completeness.ts`, `lib/ai/context.ts`, `lib/ai/suggestions/run.ts`,
`app/api/care/reminders/run/route.ts`, plus SQL functions that read pets
(`emergency_directory`, building pet counts, vet reminder generation,
`clinic_*` patient lists). Lookups that resolve a pet *by id for history* —
violation, incident and visit timelines — keep working and keep the name.

`lib/data/account.ts` (data export) includes archived pets, since they are
still the user's data.

## Testing

- Unit: pet-picker selection, archive-reason parsing/labels, notification
  store (mark one, mark all, revert on error).
- SQL, impersonated in a rolled-back transaction: owner archives (succeeds,
  shares revoked, tasks inactive); a different user and a manager are refused;
  a second archive is refused; invalid reason refused; the manager's registry
  query and `emergency_directory` no longer return the pet.
- `pnpm test`, `tsc --noEmit` and `pnpm build` pass.

## Dependency on the human partner

The Supabase MCP is not connected in this session. The migration is written to
`supabase/migrations/` either way; applying it to project `Pet10x`
(`ekgejmxgnlmdomkpblki`) needs the MCP authorised via `/mcp`, or the human
partner applies it. Until it is applied, the Remove pet flow will fail at the
RPC call, which surfaces as an error toast, not a silent success.
