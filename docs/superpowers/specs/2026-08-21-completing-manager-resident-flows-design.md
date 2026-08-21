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
| `home-screen.tsx:103` | The "Rules" quick action toasts one hardcoded string — *"One dog or one cat · leashed in common areas"* — identical for every building on the platform |

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
6. **Home shows only one pet's care.** `home-screen.tsx:70` pins every care
   surface to `pets[0]`. In a multi-pet household the other pets' meals,
   medication and overdue tasks do not appear anywhere on the home screen. See
   AD-10.
7. **Escalation opens the violation against the reporter.** See AD-11. This has
   already occurred on production data.

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

### AD-9 — Building rules are authored text, kept apart from the compliance toggles

A manager needs to publish the building's actual house rules — parking, noise,
common areas, pets — and have a resident read them. Today the resident's
"Building Rules" quick action returns a hardcoded toast reading *"One dog or
one cat · leashed in common areas"*, the same string for every building on the
platform, and the Profile row of the same name says "coming soon".

A new `building_rules` table holds manager-authored entries, each with a
category, a title and a body. Managers write and publish; residents read what
is published. Publishing or amending one notifies the building's residents,
which is what makes an "update" an update rather than a silent edit.

**These must not merge with `buildings.pet_rules`.** The booleans in that jsonb
are *enforceable requirements* — they feed `computeGaps`, the resident's
missing-info card and the manager's compliance percentages. `building_rules`
text is *informational*. A manager typing "no dogs over 25 kg" into a notice
must not silently move anyone's compliance score, and a resident must be able
to tell which of the two they are looking at. One screen shows both; the screen
distinguishes them.

Categories ship as `pets`, `parking`, `noise`, `waste`, `common_areas`,
`other` — a closed set, so a resident's rules screen groups predictably across
buildings.

### AD-10 — Household tasks aggregate; per-pet goals do not

`home-screen.tsx:70` sets `primaryPet = pets[0]` and every care surface on Home
reads only that pet. In a household with three pets, two are invisible on the
home screen — including their overdue medication. This is a correctness defect,
not a presentation one.

Naively widening the strip to all pets would fail differently:
`TodayScheduleStrip` renders `t.label` with no attribution, so three pets on
morning meals produce three indistinguishable "Morning meal" rows. And summing
targets across pets is meaningless — "2 / 4 bowls" across two dogs is true when
one ate everything and the other ate nothing.

So split the surface by what actually aggregates:

- **Today's schedule → household-wide, pet-attributed.** One time-ordered list
  across every pet, each row carrying that pet's avatar and name. This is how a
  morning is actually run, and it is where the missed-dose risk lives.
- **Care tiles (progress against a target) → one pet, explicitly selected.**
  Keep the three-up strip; put a pet selector above it.

The selector is already half-built: `handleRailScroll` computes `activePet`
from the pet rail's scroll position and currently drives nothing but the dot
indicator. Wiring it to the care card means swiping to a pet shows that pet's
goals, and the switcher costs no new chrome. `pet-care-screen` already renders
explicit chips for the same choice; both surfaces read one remembered
selection.

Third, and cheapest: **name the pet wherever a per-pet sheet acts.**
`TargetSheet` takes a `petId`, displays no name, and confirms with "Target
saved". Every per-pet sheet header and every success toast names the pet.

### AD-11 — Escalation takes its subject from the identified pet, never the reporter

`escalate_incident_to_violation` currently opens the violation with
`resident_id = v_inc.reporter_id`. That column is the person who *filed* the
report. So filing a non-anonymous report about a neighbour's dog opens a case
against yourself.

It has already happened. Incident `IR-454B06` identified the pet **Simba**,
owned by `de3df834`; the violation it produced
(`5570be70-8a79-48f9-80bc-dd09d3a82e56`) names `830b348a` — the reporter — and
carries `pet_id = null`. The one fact that identifies the subject was
discarded, and the reporter substituted for it.

Both halves are wrong in the same statement, so both are fixed together. The
subject of a violation is the **owner of the identified pet**:

```sql
select p.owner_id, p.unit_id into v_owner, v_unit
from public.pets p
where p.id = v_inc.pet_id and p.deleted_at is null;

insert into public.violations (
  building_id, unit_id, resident_id, pet_id, origin_incident_id,
  type, stage, opened_by
) values (
  v_inc.building_id,
  coalesce(v_unit, v_inc.unit_id),
  v_owner,                 -- null when no pet was identified; the manager assigns
  v_inc.pet_id,            -- carried through, so the violation names the animal
  v_inc.id,
  coalesce(p_type, v_inc.type::text),
  'investigation',         -- becomes 'open' in Migration D; that enum value
                           -- does not exist yet when this ships in Phase 0
  auth.uid()
);
```

`reporter_id` is never read by this function again. Where no pet was
identified, `resident_id` stays null and the case sits at `open` until a
manager assigns it — which is the honest state, and what `open` is for.

Existing rows are repaired in the same migration: any violation whose
`resident_id` equals its origin incident's `reporter_id` is recomputed from the
identified pet, and `pet_id` is backfilled from the origin incident.

## Data model

### Migration A — drift repair

- Capture `submit_incident_report` (7-arg), `escalate_incident_to_violation`,
  `incident_status_by_reference` and `resolve_building_code` verbatim from the
  live database into a migration.
- `drop function public.submit_incident_report(text,text,text,text,text,boolean)`
  — the stale 6-arg overload.
- Apply the AD-11 fix to `escalate_incident_to_violation` and repair the
  affected rows. This ships in Phase 0 rather than with the rest of the
  enforcement work: it is a live data-integrity defect, and every later
  migration would otherwise stack on top of wrong rows.

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

### Migration H — building rules

```sql
create type building_rule_category as enum
  ('pets','parking','noise','waste','common_areas','other');

create table public.building_rules (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references public.buildings(id) on delete cascade,
  category     building_rule_category not null,
  title        text not null,
  body         text not null,
  is_published boolean not null default true,
  sort_order   integer not null default 0,
  created_by   uuid references public.profiles(id),
  updated_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
```

RLS — read for `is_resident_of(building_id)` limited to `is_published`, full
read and write for `manages_building(building_id) or is_admin()`.

`publish_building_rule(p_rule uuid)` is `SECURITY DEFINER`: it flips
`is_published`, stamps `updated_by`, and inserts one `notifications` row per
approved resident of the building (`kind = 'building'`). The insert policy on
`notifications` admits only `kind = 'assistant'` for self, so a manager cannot
do this from the browser — the same constraint that forces AD-6.

### Multi-pet care — no DDL

AD-10 needs no schema change. `useCareTasks(petId)` gains a sibling,
`useHouseholdCareTasks(petIds)`, returning the same rows carrying `petName` and
`petImage`. `care_targets` and `care_entries` stay per-pet, which is what makes
the split in AD-10 correct.

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
| Write or publish a building rule | ❌ | ❌ | ✅ | ✅ | `building_rules` write policy, `publish_building_rule` |
| Read a building rule | ❌ | ✅ published, own building | ✅ all, own buildings | ✅ | `building_rules` select policy |
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
| 3 | Multi-pet care | Household schedule strip, per-pet goal selector, pet named in every sheet (AD-10) | — |
| 4 | Enforcement ladder | Migrations D + F, manager actions real, fine schedule in bylaws, derived tab counts, CSV export | 0 |
| 5 | Resident enforcement view | Own violations, events and fines; dispute (Migration E) | 4 |
| 6 | Building rules | Migration H, manager editor, resident rules screen (AD-9) | 0 |
| 7 | Accommodations | Resident intake + docs, real manager checklist (Migration G) | 0 |
| 8 | Community | Events, RSVP, Lost & Found, pin, share | 0 |
| 9 | Honest cleanup | Alerts CTA to `/report`, notification actions to `action_target`, dead controls removed | — |

Phase 3 sits early and depends on nothing: it is a correctness defect that
affects every multi-pet household today, and it touches none of the other
work.

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
- **Rule versioning and acknowledgement.** `building_rules` records who last
  edited and when, but keeps no revision history and does not ask a resident to
  confirm they have read a rule. `buildings.bylaw_version` already exists for
  the day that matters.
- **Household care assignment.** AD-10 shows every pet's tasks to the account
  holder. It does not add a second carer, task ownership, or "who fed the dog"
  between two people in one home.

## Verification

- **Migrations** — every function the app calls must appear in
  `supabase/migrations/`, checked by grep, and each migration must apply
  cleanly. Neither the Supabase CLI nor Docker is installed on the development
  machine, so `supabase db reset` is not the gate; migrations are applied and
  asserted through the Supabase MCP. Installing the CLI later would make a full
  reset the stronger check, and it should become one.
- **RLS and storage** — for each row of the capability matrix, impersonate the
  actor in SQL (`set local role` + `request.jwt.claims`) and assert allowed and
  denied, the method already used in `docs/RBAC_PERSONAS.md`. Guest cases run
  as `anon` with no claims.
- **Evidence** — a guest with no session uploads a file and the path lands in
  `evidence_paths`; a manager of another building gets zero rows from the same
  object; an unclaimed draft is gone after the purge runs.
- **Ladder** — every illegal transition is rejected by the database, not merely
  hidden by the UI.
- **Building rules** — a rule written by a manager of building A is invisible
  to a resident of building B and to a signed-out visitor; an unpublished rule
  is invisible to its own residents; publishing raises one notification per
  approved resident and none for anyone else.
- **Multi-pet care** — with three pets seeded, each holding one outstanding
  task, the home schedule lists three rows and names three different pets. The
  goal tiles change when the selected pet changes, and never sum across pets.
- **The audit re-run** — grep for `coming soon` and for `toast(` in an
  `onClick` returns only what this document lists as out of scope.
