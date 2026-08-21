# Completing the manager and resident flows

Design doc · 2026-08-21

## Why this exists

An audit of every action reachable from a manager or resident account found
that a large share of the controls do nothing, and a smaller share actively
misreport. The trigger was a specific report: a signed-in pet owner filing a
violation is never asked for evidence.

That symptom turned out to be one instance of a pattern, not a lone bug. This
document specifies the work to close all of it.

Everything below was verified against both the codebase and the live Supabase
project `Pet10x` (`ekgejmxgnlmdomkpblki`) on 2026-08-21.

## What the audit found

Three shapes account for every finding.

### Shape 1 — the screen lies about live data

The rows are real, the mutations exist, and the button calls `toast()`.

| Where | What |
| --- | --- |
| `manager/violations-screen.tsx` | All ten actions are toasts: Investigate, Issue Warning, Review Case, Escalate, Resolve, Send Reminder, Escalate to CRT, Export, Log a violation, Export CRT Package. `advanceViolation` / `resolveViolation` already work and the strata portal calls them correctly |
| `manager/violations-screen.tsx:26-31` | Tab counts hardcoded `5 / 3 / 2 / 8` above live lists |
| `manager/approvals-screen.tsx:202` | "Request Info" toasts *"messaging isn't built yet"* while `/api/manager/request-info` does exactly that for resident links |
| `lib/data/manager-queues.ts:207-212` | The accommodation document checklist is hardcoded `true` — a manager sees green ticks for documents nobody uploaded |
| `alerts-screen.tsx:145` | "Report an Incident" toasts *"coming soon"* while `/report` exists and Home already navigates to it |
| `alerts-screen.tsx:196` | Notification action buttons toast their own label instead of navigating to `notifications.action_target`, a column already populated |
| `community-screen.tsx` | Pin, share, more-options and RSVP are toasts |

### Shape 2 — the database is built, the write path is absent

RLS is already correct for all of these. Only the UI and the write path are
missing.

| Capability | DB state | UI state |
| --- | --- | --- |
| Incident evidence | `incident_reports.evidence_paths text[]`, `guest-evidence` bucket | 0 of 13 rows populated; bucket empty and policy-less |
| Resident sees own violations | `violations_select` permits `resident_id = auth.uid()` | No screen queries it |
| Resident sees own fines | `fines_select` permits `resident_id = auth.uid()` | No screen queries it |
| Accommodation intake | `accom_resident_insert`, `accommodation-docs` bucket | No form anywhere; manager queue can never fill |
| Events + RSVP | `events`, `event_rsvps`, full RLS | `useEvents()` returns `[]` |
| Lost & Found | `lost_found`, full RLS | `useLostFound()` returns `[]` |

### Shape 3 — two flows, one got the feature

`guest-report-screen.tsx` walks type → evidence → pet → summary.
`report/report-screen.tsx` (the signed-in resident) is a single flat form with
no evidence step, no GPS and no summary.

This duplication is the direct cause of the reported bug. Two components
implement one act; only one of them was ever extended.

### Latent defects found on the way

1. **The pet photo picker is blank for everyone.** `pet-media` has an
   owner-only SELECT policy, so `reportablePets` signs URLs for pets the
   reporter does not own and gets nothing back. Affects both report flows and
   the manager's incident thumbnails.
2. **Schema drift.** `submit_incident_report`, `escalate_incident_to_violation`,
   `incident_status_by_reference` and `resolve_building_code` exist only in the
   remote database. A fresh `supabase db reset` produces a broken app.
3. **A stale overload.** Two `submit_incident_report` functions coexist (6-arg
   and 7-arg).
4. **Three buckets with zero policies.** `guest-evidence`, `accommodation-docs`
   and `community-media` are unreadable and unwritable by any role.
5. **Guests have no session at all.** `signInGuest` is pure client state; the
   live project has zero anonymous auth users. Guest requests execute as `anon`
   with `auth.uid()` null. This constrains the evidence design (see below).

## Principles

- **A control that cannot act must not exist.** Where a feature is genuinely
  out of scope, remove the control or mark it unavailable — never a toast that
  claims success.
- **RLS is the floor, the query is the filter.** Continues the rule established
  in `docs/RBAC_PERSONAS.md`. Every new read names its scope explicitly.
- **One act, one component.** Shape 3 is a maintenance defect. Collapse the
  duplicate rather than patch both.
- **The paper trail is the product.** Strata enforcement ends up at a
  tribunal. Every decision writes a durable event before it notifies anyone.

## Architecture decisions

### AD-1 — Evidence uploads use server-minted signed upload URLs

Two constraints rule out the obvious approaches:

- A guest has no JWT, so no `auth.uid()`-scoped storage policy can ever admit
  their upload.
- Vercel caps a serverless request body at ~4.5 MB, so proxying phone photos
  through an API route fails on real files.

The design that satisfies both:

```
mount        client generates draftId (uuid v4)
pick files   downscale in-browser (reuse the canvas helper in lib/ai/image.ts)
             POST /api/incidents/evidence/sign { buildingCode, draftId, files[] }
               → validates code, mime, size, count ≤ 5
               → service role mints createSignedUploadUrl for
                 {buildingId}/{draftId}/{n}.{ext}
upload       browser uploadToSignedUrl — direct to storage, no body limit
submit       submit_incident_report(..., p_evidence_paths text[])
               → rejects any path not prefixed with its own buildingId
```

`guest-evidence` receives **exactly one** policy — SELECT for managers of the
building named by the first path segment. There is deliberately no client
INSERT policy, so an upload can only ever happen through a URL the server
minted. The "managers of that building only" contract is enforced structurally
rather than by convention.

Unclaimed drafts are purged after 24 hours by a cron route modelled on
`/api/care/reminders/run`.

### AD-2 — One incident composer

Extract `components/screens/report/incident-composer.tsx`, driven by whether
the building is already known:

- **Guest** — resolves the building from a code, then composes.
- **Resident** — building comes from `myBuildingCode()`, code step skipped.

Both get the same four steps and the same submit path. `guest-report-screen`
and `report-screen` become thin shells around it.

### AD-3 — Signed URLs are minted server-side, not in SQL

A `SECURITY DEFINER` function cannot produce a signed URL; signing is a Storage
API operation. So the blank photo picker is fixed by a thin route,
`GET /api/report/pets?code=…`, which calls the existing
`building_pets_for_report` RPC and signs the returned paths with the admin
client. The privacy contract is unchanged — the RPC still returns no unit, no
owner and no contact detail.

Managers are different: they hold a session, so they get a real `pet-media`
SELECT policy keyed on the second path segment (the path convention is
`{ownerUid}/{petId}/…`).

### AD-4 — The enforcement ladder becomes four states plus two terminals

Replacing the seven-value `violation_stage` enum:

```
  open        ← an escalated incident, or a manually logged case, lands here
    ↓
  warning     ← degree 1
    ↓
  fine_1      ← degree 2
    ↓
  fine_2      ← degree 3

  resolved / dismissed   ← terminal, reachable from any rung
```

Legal transitions are enforced in the database, not the client. A case cannot
skip from `open` to `fine_2`; `resolved` and `dismissed` are terminal, and
reopening means a new violation.

### AD-5 — Fine amounts are a building bylaw, overridable per case

`buildings.pet_rules` (jsonb, already holding the rule toggles) gains
`fine_1_cents`, `fine_2_cents` and `fine_currency`, edited in the Bylaws
editor. `manager_advance_violation` reads them as the default and accepts an
explicit override. Being jsonb, this needs no DDL — the keys are a convention
the RPC and the editor agree on, documented here.

Rationale: two residents fined differently for the same offence is the fact
that gets a fine overturned at the CRT. Making the schedule a building-level
setting makes consistency the default.

### AD-6 — Stage changes are one atomic RPC

Nothing currently writes `violation_events`, so the pipeline UI fabricates
history from the current stage alone. And the `notifications` insert policy
only admits `kind = 'assistant'` for self, so a manager cannot notify a
resident from the browser at all.

`manager_advance_violation` therefore does all of it in one transaction:
authorise → validate transition → update stage → insert `violation_events` →
insert a `fines` row when entering a fine degree → notify the resident → write
`audit_log`. This mirrors the existing `manager_decide_registration`.

### AD-7 — Disputes are a flag with a decision, not a thread

A resident disputes a specific degree once. The violation carries an open
dispute until a manager upholds or overturns it. Both outcomes are recorded as
`violation_events`, so the history survives even though the columns are
cleared for the next degree.

Overturning dismisses the violation and waives any fine attached to the
disputed degree.

### AD-8 — No payment surface

`fines.stripe_payment_intent_id` stays empty and no Pay button is built. A
resident sees the amount, the due date and the status, and can dispute. Payment
is a later phase.

## Data model

### Migration A — drift repair

- Capture `submit_incident_report` (7-arg), `escalate_incident_to_violation`,
  `incident_status_by_reference` and `resolve_building_code` verbatim from the
  live database into a migration.
- `drop function public.submit_incident_report(text,text,text,text,text,boolean)`
  — the stale 6-arg overload.

### Migration B — storage policies

| Bucket | Policy |
| --- | --- |
| `guest-evidence` | SELECT where `manages_building((storage.foldername(name))[1]::uuid) or is_admin()`. No client INSERT/UPDATE/DELETE |
| `accommodation-docs` | SELECT and INSERT for the resident owning the request, SELECT for managers of its building |
| `community-media` | SELECT for residents and managers of the building; INSERT scoped to the uploader |
| `pet-media` | Add a manager SELECT keyed on `(storage.foldername(name))[2]` resolving to a pet in a building they manage |

### Migration C — evidence parameter

```sql
create or replace function public.submit_incident_report(
  …existing args…,
  p_evidence_paths text[] default '{}'
) …
-- every element must start with v_building::text || '/', else reject
-- writes evidence_paths on insert
```

### Migration D — the new ladder

```sql
create type violation_stage_v2 as enum
  ('open','warning','fine_1','fine_2','resolved','dismissed');
```

Applied to `violations.stage`, `violation_events.from_stage` and
`violation_events.to_stage`. Mapping of the 13 existing rows:

| Old | Rows | New |
| --- | --- | --- |
| `investigation` | 5 | `open` |
| `pending_review` | 1 | `open` |
| `verbal_warning` | 1 | `warning` |
| `written_warning` | 2 | `warning` |
| `fine_issued` | 1 | `fine_1` |
| `resolved` | 3 | `resolved` |
| `dismissed` | 0 | `dismissed` |

The verbal/written distinction is not representable in the new ladder. Rather
than lose it, the migration writes one `violation_events` row per remapped
violation recording the original stage.

`escalate_incident_to_violation` is updated to open cases at `open`.

### Migration E — disputes

```sql
create type dispute_outcome as enum ('upheld','overturned');

alter table public.violations
  add column disputed_at    timestamptz,
  add column dispute_reason text,
  add column dispute_stage  violation_stage_v2;
```

`disputed_at is not null` means an open dispute awaiting a manager. The outcome
lives in `violation_events`, not on the row, so a later degree can be disputed
afresh without erasing the record.

### Migration F — the RPCs

```sql
manager_advance_violation(
  p_violation uuid,
  p_to_stage violation_stage_v2,
  p_note text default null,
  p_amount_cents integer default null,   -- overrides the bylaw default
  p_due_on date default null
) returns jsonb

dispute_violation(p_violation uuid, p_reason text) returns jsonb
  -- authorises on resident_id = auth.uid(); notifies managers

manager_resolve_dispute(
  p_violation uuid,
  p_outcome dispute_outcome,
  p_note text default null
) returns jsonb
  -- 'overturned' also dismisses the violation and waives the degree's fine
```

All three are `SECURITY DEFINER`, authorise explicitly, and write both
`violation_events` and `audit_log`.

### Migration G — accommodations and community reads

No DDL. `useAccommodationsLive` reads real `accommodation_documents` rows in
place of the hardcoded checklist; `useEvents` / `useLostFound` become live
queries; event attendance is counted from `event_rsvps`.

## RBAC

The persona model in `docs/RBAC_PERSONAS.md` is sound and does not change. A
persona stays a view, never a permission; grants stay the only source of
entitlement. What this work adds is a written capability matrix and the
storage-layer enforcement that was missing.

| Capability | anon (code only) | resident | manager of building | super-admin | Enforced by |
| --- | --- | --- | --- | --- | --- |
| File an incident | ✅ | ✅ | ✅ | ✅ | `submit_incident_report` (definer) |
| Upload evidence | ✅ | ✅ | ✅ | ✅ | signed upload URL, server-minted |
| Read evidence | ❌ | ❌ | ✅ own buildings | ✅ | `guest-evidence` SELECT policy |
| Look up a report by reference | ✅ | ✅ | ✅ | ✅ | `incident_status_by_reference` |
| Triage an incident | ❌ | ❌ | ✅ | ✅ | `incidents_manager_update` |
| Escalate to a violation | ❌ | ❌ | ✅ | ✅ | `escalate_incident_to_violation` |
| Advance a violation degree | ❌ | ❌ | ✅ | ✅ | `manager_advance_violation` |
| Read own violations and fines | ❌ | ✅ own | ✅ building | ✅ | `violations_select`, `fines_select` |
| Dispute a violation | ❌ | ✅ own | ❌ | ✅ | `dispute_violation` |
| Decide a dispute | ❌ | ❌ | ✅ | ✅ | `manager_resolve_dispute` |
| Request an accommodation | ❌ | ✅ | ✅ | ✅ | `accom_resident_insert` |
| Decide an accommodation | ❌ | ❌ | ✅ | ✅ | `accom_manager_update` |
| Set the fine schedule | ❌ | ❌ | ✅ | ✅ | `buildings` update policy |
| Post, RSVP, report lost & found | ❌ | ✅ | ✅ | ✅ | existing community RLS |

Guest rows read "code only": possession of a building code authorises intake
and nothing else. It never grants a read of anything already stored.

## Phases

Each phase is independently shippable. Later phases depend on earlier ones only
where noted.

| # | Phase | Delivers | Depends on |
| --- | --- | --- | --- |
| 0 | Foundation | Migrations A + B, capability matrix written to `docs/RBAC_CAPABILITIES.md` | — |
| 1 | Evidence end-to-end | Migration C, sign route, upload UI, manager display, purge cron | 0 |
| 2 | One composer | `IncidentComposer`, both shells, signed pet photos (AD-3) | 1 |
| 3 | Enforcement ladder | Migrations D + F, manager actions real, fine schedule in bylaws, derived tab counts, CSV export | 0 |
| 4 | Resident enforcement view | Own violations, events and fines; dispute (Migration E) | 3 |
| 5 | Accommodations | Resident intake + docs, real manager checklist (Migration G) | 0 |
| 6 | Community | Events, RSVP, Lost & Found, pin, share | 0 |
| 7 | Honest cleanup | Alerts CTA to `/report`, notification actions to `action_target`, dead controls removed | — |

## Out of scope

Named explicitly so the boundary is not rediscovered mid-build:

- **Fine payment.** No Stripe, no Pay button. Dispute only (AD-8).
- **Messaging.** No resident–manager thread. `request-info` and notifications
  remain the only channels.
- **Granular per-manager roles.** No concierge or board-member tier. Deferred
  in favour of formalising what exists.
- **The settings menus.** The 23 coming-soon rows across the resident profile
  and manager settings stay unbuilt. Phase 7 only makes their treatment
  consistent and honest.
- **Verbal vs written warning.** Collapsed into one `warning` degree per the
  three-degree ladder.

## Verification

- **Migrations** — `supabase db reset` against a scratch branch must produce a
  schema that the app boots against, proving the drift is repaired.
- **RLS and storage** — for each row of the capability matrix, impersonate the
  actor in SQL (`set local role` + `request.jwt.claims`) and assert allowed and
  denied, the method already used in `docs/RBAC_PERSONAS.md`. Guest cases run
  as `anon` with no claims.
- **Evidence** — a guest with no session uploads a file and the path lands in
  `evidence_paths`; a manager of another building gets zero rows from the same
  object; an unclaimed draft is gone after the purge runs.
- **Ladder** — every illegal transition is rejected by the database, not merely
  hidden by the UI.
- **The audit re-run** — grep for `coming soon` and for `toast(` in an
  `onClick` returns only what this document lists as out of scope.
