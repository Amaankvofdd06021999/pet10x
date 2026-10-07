# Part B — manager tools

Date: 2026-10-07. Branch: `pet10x-gaps`. Migration numbers: `20261008000001…`.
Payments of every kind remain out of scope (no checkout, no Stripe). "Mark
paid" here records an offline payment the manager has received.

## 1. Fine actions in the routed violations screen

**Today:** the routed manager screen is
`components/screens/manager/violations-table-screen.tsx`. Its `CaseModal`
footer offers Dismiss / Mark resolved / Issue a notice. Fine reminders and
issuing a fine exist only in the orphaned
`components/screens/manager/violations-screen.tsx` (1,383 lines, imported
nowhere, duplicate export name). Mark paid / Waive exist only in the strata
Queue as a raw `fines.update({status})`.

**Change:**
- In `CaseModal`, when the case has an outstanding fine (`issued`,
  `partially_paid`), show **Send reminder** (`remindAboutFine`, surfacing the
  RPC's `reminded_recently` etc. as readable messages), **Mark paid** and
  **Waive** (each with a confirm and optional note).
- When the case's stage allows it, show **Issue fine** (`issueFine`, amount
  defaulting from the building fine schedule, as the orphaned screen did).
  Copy the orphaned screen's logic for which stages may be fined; do not
  re-derive it.
- Delete `components/screens/manager/violations-screen.tsx`. Move any helper it
  exported that something else imports.

**Fine status transitions (closes an open item no phase owned):** new
migration with `public.manager_set_fine_status(p_fine uuid, p_status
fine_status, p_note text default null) returns jsonb`, `SECURITY DEFINER`,
manager of the fine's building or admin. Allowed transitions only:
`issued|partially_paid|disputed → paid|waived`, `issued → disputed` is NOT
manager-settable (disputes have their own flow). Anything else →
`{ok:false, error:'illegal_transition'}`. Writes a `violation_events` row
before notifying the resident (`notifications`, kind `compliance`). Then
revoke direct UPDATE: drop `fines_manager_update` so the RPC is the only
write path. Update `lib/data/portfolio.ts setFineStatus` and the strata
queue to call the RPC. The existing settlement-audit trigger keeps firing.

## 2. Municipal reports for managers

`municipal_reports` has no `building_id`; reports are city-scoped by design and
Pet10x files nothing with the city. A building manager therefore sees reports
whose `municipality_id` matches their building's municipality (resolve the
building's municipality via `resolve_municipality` on its postal code / lat-lng,
or a stored column if one exists — check `buildings` columns first).

- New `SECURITY DEFINER` RPC `manager_municipal_reports(p_building uuid)`
  returning id, type, description, location_text, reference_code, status,
  created_at, and evidence paths count — **never** reporter identity or
  `ip_hash`. Manager of the building or admin only.
- Read-only list in the manager app: a **Municipal** tab on the Incidents
  screen (or a section, whichever matches that screen's structure), with type
  badge, date, location, description and the "Pet10x does not file with the
  city" disclosure. Strata building detail gets the same list.
- Admin may change `status` (acknowledged/closed) from the admin console via
  existing `municipal_reports_admin_write`; managers cannot.

## 3. Pet document verification

`pet_documents_rw` makes managers read-only, so the Approvals → Documents tab is
display-only.

- New RPC `manager_review_pet_document(p_doc uuid, p_verdict text, p_note text
  default null)`, verdict `approve|reject`, `SECURITY DEFINER`, manager of the
  pet's building or admin. Approve: `status='approved'`, `verified_by`,
  `verified_at`, `provenance='manager_verified'`. Reject: `status='rejected'`,
  notify the owner (kind `compliance`) with the note and an action target to
  the pet. Audit-log both. Model it on `manager_verify_accommodation_document`.
- Approvals → Documents rows gain **View** (signed URL, existing storage
  helpers), **Approve**, **Reject (with note)**. Approved docs leave the review
  list. The strata queue's "managers can't write pet_documents" note becomes
  the same actions.

## 4. Deleting a building

Four NO ACTION foreign keys (fines, payouts, notifications, business_listings)
make `deleteBuilding` fail on any used building with raw Postgres 23503 text.

- Migration: `buildings.archived_at timestamptz null`. Every function that
  resolves or lists buildings for joining/reporting excludes archived ones:
  `resolve_building_code`, `search_buildings_public`,
  `buildings_matching_my_address`, `request_building_link`,
  `submit_incident_report`, `targetable_buildings`, `report_lost_found`
  (create-or-replace from the LATEST definition, adding only the filter).
- Admin console: **Archive** (sets `archived_at`, confirm dialog explains
  residents can no longer join or report) and **Restore**. **Delete** stays,
  but is offered only for buildings with no history; if the delete returns
  23503, show "This building has history (fines, notifications…) and can't be
  deleted. Archive it instead." — never raw Postgres text.
- Archived buildings show an "Archived" badge in the admin list and are hidden
  from the strata portfolio.

## Testing
- Unit tests for any pure helpers (fine action availability by status/stage,
  error-code → message mapping).
- SQL tests in `supabase/tests/part-b.sql` (rolled-back, impersonated): fine
  transitions allowed/illegal, non-manager refused, direct UPDATE now refused;
  municipal RPC returns no reporter fields and refuses non-managers; document
  review approve/reject and refusal; archived building not resolvable by code.
- `pnpm test`, `tsc --noEmit`, `pnpm build` green.
