# Part F — admin, manager settings, account deletion, housekeeping

Date: 2026-10-07. Branch: `pet10x-gaps`. Migration numbers: `20261012000001…`.

## 1. Manager Settings — build three rows, remove the rest

Decided 2026-10-07: build **Audit Log**, **Staff & Access**, **Compliance
Report**; remove the other unbuilt rows (Subscription & Billing — payments are
out of scope; Security & Access; Language; Appearance; Document Templates;
Notification Rules). Help & FAQ and Terms & Privacy were made real in Part C;
keep them.

- **Audit Log:** a screen listing `audit_log` rows for the active building
  (explicit `building_id` filter; RLS already permits managers), newest first,
  paginated 50 at a time, filter by area (violations, fines, rules,
  accommodations, incidents, community, emergency). Each `action` maps to a
  plain-English sentence via a pure `describeAuditEntry()` with tests; actor
  name from profiles where readable, else "A manager"/"System". Never render
  `ip_hash` or raw metadata JSON.
- **Staff & Access:** reuse `BuildingTeam` from
  `components/screens/strata/team-screen.tsx` for the active building (filter
  the team hook by building id; add a parameter rather than filtering on the
  client if the hook is unscoped). Invite/remove only for the primary manager,
  as strata does.
- **Compliance Report:** a screen summarising the building: pets registered /
  pending, pets fully compliant vs missing items (by item), vaccinations and
  documents expiring in 30 days or expired, open violations by stage. Uses the
  existing hooks and `computeCompliance`. **Download CSV** (per-pet rows, via
  `lib/csv.ts`) and **Print** (print stylesheet, so a browser "Save as PDF"
  produces a clean document). Remove the strata/manager duplication if a shared
  builder makes sense.
- Fix the render loop so no section silently drops rows.

## 2. Admin console

- **Users tab:** search profiles by name or email (server-side `ilike`,
  paginated), showing personas (resident, manager of N buildings, business,
  clinic staff, admin), joined date, suspended state. Actions: suspend /
  unsuspend (generalise `setManagerSuspended`), grant / revoke super-admin with
  a typed confirmation; an admin can never suspend or demote themselves (enforce
  in a definer RPC `admin_set_user_flags`, audit-logged, not only in the UI).
- **Overview tab:** platform counts from a new `admin_platform_stats()` definer
  RPC (`is_admin()` only): users, pets (active), buildings (active/archived),
  businesses by tier, incidents last 30 days, open violations, bookings last 30
  days, AI conversations last 30 days. Simple stat tiles; no charts needed.
- **Municipal reports tab:** list all reports with status, change status
  (acknowledged / closed) via existing admin policy.
- **Verification requests** already land in Part C's Businesses tab.

## 3. Account deletion that works for everyone

21 of 48 profiles cannot be deleted because of 20 NO ACTION foreign keys to
`profiles`.

- Migration: for actor/audit columns change to `ON DELETE SET NULL`:
  `building_managers.granted_by`, `resident_links.decided_by`,
  `pet_documents.verified_by`, `incident_reports.reporter_id`,
  `incident_reports.triaged_by`, `violations.opened_by`,
  `violation_events.actor_id`, `lost_found.reporter_id`, `events.created_by`,
  `fines.issued_by`, `emergency_access_tokens.issued_by`, `audit_log.actor_id`,
  `care_entries.logged_by`, `profiles.suspended_by`,
  `violation_disputes.decided_by`.
- Subject columns — the person a record is *about*: `violations.resident_id`,
  `fines.resident_id`, `payments.profile_id`, `service_bookings.customer_id`,
  `violation_disputes.filed_by`. Drop NOT NULL where present and set
  `ON DELETE SET NULL`, so enforcement and booking history is retained but
  de-identified (PIPEDA permits retention needed for legal obligations).
  **Before deleting**, the route refuses readably if the user has an open
  violation (not resolved/dismissed) or an outstanding fine: "You have an open
  bylaw case with <building>. It needs to be closed before the account can be
  deleted — contact your building manager." Check any screen that renders
  these rows copes with a null person ("Former resident").
- Check every trigger/guard on these tables (e.g. `fines_settle_only_guard`,
  violation stage guards) still permits the SET NULL cascade; adjust guards to
  allow a change that only nulls the person column during cascade.
- Storage: the delete route currently removes only accommodation documents.
  Extend it to the user's pet photos/documents, community media, incident
  evidence they uploaded as a resident, and AI media — reading bucket names and
  path grammars from `lib/supabase/storage.ts` and the purge routes.
- Update the route's long comment to the new truth.

## 4. Housekeeping

- **ESLint:** add `eslint@9` and `eslint-config-next` (v16) as devDependencies
  with `pnpm` (prefix PATH, do not upgrade pnpm), an `eslint.config.mjs` flat
  config (next core-web-vitals + typescript; ignore `.next`, `node_modules`,
  `supabase`, `backups`, `public`). Get `pnpm lint` to exit 0: fix real errors;
  downgrade a rule to `warn` only where the pattern is deliberate and
  widespread, with a comment saying why.
- **Docs:** rewrite `docs/superpowers/RESUME-HERE.md` to the state after Parts
  A–F (what shipped, which migrations exist and are unapplied, env vars
  needed, how to run `supabase/tests/*.sql`). Update
  `docs/superpowers/2026-08-21-deferred-controls.md` so every row reflects
  reality. Mark `.superpowers/PRE-MERGE-SWEEP.md` items 1–8 as resolved.

## Testing
- Unit: `describeAuditEntry`, compliance report row builder, persona labelling.
- SQL `supabase/tests/part-f.sql`: admin RPCs refuse non-admins and self-
  demotion; deleting a profile with closed history succeeds and nulls the
  person columns; audit log readable by the building's manager only.
- `pnpm test`, `tsc --noEmit`, `pnpm build`, `pnpm lint` green.
