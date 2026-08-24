# Phase 7 — Accommodations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A resident asks their building to accommodate an assistance animal, attaches the letter that supports it, and a manager works a real checklist to a decision that the resident is told about and that changes something in the product. Nobody outside that pair ever sees the letter.

**Architecture:** `accommodation_requests` holds 4 live rows and has held them since July; `accommodation_documents` holds **0**, and nothing in the product has ever written one. There is no intake form anywhere, so the queue can only ever fill from SQL. The manager's checklist at `lib/data/manager-queues.ts:207-212` is four hardcoded booleans — `letterFromProvider: true` and `vaccination: true` are literals, so every manager sees green ticks for documents nobody uploaded. `decideAccommodation` is a bare `.update()` that stamps `status`, `decided_by`, `decided_at` and then toasts *"Decision logged for the audit trail"* — there is no audit row, no notification, and no note recording why.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Supabase Postgres 17, `sonner`, `lucide-react`, pnpm 9 via corepack.

**Spec:** [`docs/superpowers/specs/2026-08-21-completing-manager-resident-flows-design.md`](../specs/2026-08-21-completing-manager-resident-flows-design.md) — Migration G (`:415`), AD-1 (`:97`), the capability matrix (`:490`).

---

## Where the spec is wrong, and the schema wins

Verified against `supabase/migrations/` and against the live `Pet10x` project (`ekgejmxgnlmdomkpblki`) on 2026-08-22. **Every divergence below was measured, not inferred. The schema wins in each one.**

| The spec says | The database says | What this phase does |
| --- | --- | --- |
| Migration G is **"No DDL"** (`:417`) | `accommodation_documents` has six columns — `id, request_id, kind, status, storage_path, verified`. No `created_at`, no `uploaded_by`, no mime, no size, no `verified_by/at`. A checklist a manager works needs all of them | Task 1 adds them |
| Migration G: *"`useAccommodationsLive` reads real `accommodation_documents` rows in place of the hardcoded checklist"* | There are **zero** rows and no writer. Reading them changes four hardcoded `true`s into four permanent `false`s | Tasks 5–8 build the writer first; the read is the last step, not the first |
| Migration B: *"`accommodation-docs`: SELECT and INSERT for the resident owning the request, SELECT for managers of its building"* | Both policies exist and were applied (`20260821000001_storage_policies.sql:22-44`). Neither was reconciled by `20260821000003`, so neither carries the `case`-guarded positive grammar the other buckets got | Task 4 rewrites both — and **drops** the client INSERT |
| Capability matrix: *"Request an accommodation — resident ✅ — enforced by `accom_resident_insert`"* | `accom_resident_insert` is `with check (resident_id = auth.uid())` and **nothing else**. Measured: a resident of Maple Court Residences inserted a request into Harbour View Towers, a building they have no link to, and it was admitted | Task 2 adds `is_resident_of(building_id)` |
| Capability matrix: *"Decide an accommodation — enforced by `accom_manager_update`"* | That policy is `FOR UPDATE` over **every column**. Measured, in one statement, as a manager: `animal_desc` rewritten to `'REWRITTEN BY MANAGER'`, `status` set to `approved`, and `building_id` moved to a different building — which also relocates who may read the doctor's letter, since the storage read policy joins through `r.building_id` | Task 2 freezes the resident's columns and gates `status`; Task 3 makes an RPC the only writer |
| The matrix has no row for a manager destroying a document | `accomdoc_rw` is `FOR ALL`; its `USING` admits `manages_building(r.building_id)` while its `WITH CHECK` does not. `DELETE` consults only `USING`. Measured: a manager of the building **deleted the resident's document row** | Task 2 splits it per command |
| AD-1's flow signs upload URLs because *"a guest has no JWT"* | A resident **does** have a JWT, so the guest rationale does not carry. The reasons that do: `accommodation-docs` has `file_size_limit = null` and `allowed_mime_types = null`, and the INSERT policy constrains only path segment 2 — so a resident may today choose segment 1 and the filename | Task 4 sets the bucket limits and drops the client INSERT; Task 5 mints the URL server-side so the server composes the whole path |
| Migration G bundles accommodations with *"community reads"* | Events and Lost & Found are Phase 8 | Out of scope here |

Two more facts that are not divergences but shape every task:

- **`buildings.pet_rules` carries `max_pets_per_unit: 2` and `max_weight_kg: 25` at Maple Court Residences, and no code anywhere reads either.** `computeGaps` (`lib/data/completeness.ts:107-134`) checks vaccines, licence, insurance, spay/neuter and emergency contact — never a count, never a weight. So an approval **cannot** waive a pet limit, because no pet limit is enforced. Do not invent one to waive.
- **`accommodation_requests.legal_note` is readable by the resident.** `accom_select` admits `resident_id = auth.uid()`, and the seeded notes read like manager-only counsel — *"Seek legal advice before denying."* Nothing here changes that policy, so the manager's UI must never label `legal_note` as private. Task 8 labels it as shared.

---

## Global Constraints

- **pnpm needs `PATH="$HOME/.corepack-bin:$PATH"`** (9.15.9 — do not upgrade). No Supabase CLI, no Docker: migrations go through the Supabase MCP `apply_migration`, assertions through `execute_sql`. `supabase db reset` has never been run here.
- **`pnpm lint` has never worked** on this repository — `eslint` is in the script, is not a dependency and has no config, on `main` too. It is not a gate.
- **vitest is `environment: "node"` with no jsdom** (`vitest.config.ts`). Only pure logic is unit-testable. Every screen in this phase is verified in a browser, not by a test.
- **Supabase project:** `Pet10x`, ref `ekgejmxgnlmdomkpblki`. Applying migrations to it directly is authorised.
- **Migration filenames live in the `20260827000*` block, which is this phase's allocation.** The blocks are shared across parallel plans: `20260821000*`–`20260823000006` are already on disk, `20260824000*` is Phase 5 (disputes), `20260825000*` is Phase 6 (building rules), `20260826000*` is Phase 8 (community). Two collisions have already had to be caught by hand. `ls supabase/migrations/` is the ground truth for what exists — never assume a number is free because a spec used it.
- **Never edit an applied migration.**
- **A new enum value cannot be used in the transaction that added it.** `apply_migration` wraps each call in one transaction, and `20260727000000_ai_assistant.sql` already broke a reset this exact way (Phase 0 findings). So the two new `accommodation_status` values ship in their own migration, alone.
- **`prepareChatImage` (`lib/ai/image.ts:56`) downscales through a canvas and emits JPEG.** A PDF put through it is destroyed. Images are downscaled; PDFs are never touched.
- **The paper trail is the product.** Every decision writes `audit_log` before it notifies.
- **RLS is the floor, the query is the filter.**
- **Never verify a count as `postgres`.** Every claim in this document about what the database currently permits came from a query run in a rolled-back transaction under `set local role` — not from a migration's comment and not from the spec. Keep it that way. The spec's *"RLS is already correct for all of these"* was found to be **exactly backwards** for Phase 8's tables, and `event_rsvps` is the worked example of the quieter failure: `rsvps_self` is its only policy, so two seeded rows read as **1** to the resident *and* to the manager, with no error anywhere. Any total this phase shows a manager — the Accommodations tab count, the number of documents on a checklist, the count of outstanding requests — must be checked as the actor who sees it, because a `select count(*)` as the owner cannot reveal an under-report.

---

## The confidentiality contract

An accommodation request is disability information and a supporting document may be a doctor's letter. Phase 0 found `emergency_directory` returning `p.conditions` while its own header said *"Deliberately NOT returned: … medical history …"*. This phase does not get to ship the same contradiction, so the contract is decided here, written into the migration headers, and checked mechanically in Task 10.

| | Resident who filed it | Another resident | Manager of the building | Manager of another building | Super-admin | `anon` |
| --- | --- | --- | --- | --- | --- | --- |
| That the request exists | ✅ | ❌ | ✅ once submitted | ❌ | ✅ once submitted | ❌ |
| A **draft** they have not submitted | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `type`, `animal_desc`, the pet, the unit | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| The document **file** (the letter) | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| The checklist and each document's verdict | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| `decision_note` | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| `legal_note` | ✅ (policy admits it; the UI does not surface it as private) | ❌ | ✅ | ❌ | ✅ | ❌ |

**A manager reads the letter.** There is no honest way to decide an ESA request without reading the provider's letter, and the live policy already permits it. That is a decision, not an oversight, and it is written down rather than left implicit.

**A super-admin gets exactly what the building's manager gets, and nothing more.** No cross-building list, no export.

> **CORRECTED AFTER THE FACT — the half of that sentence before the full stop is
> false, and the plan is left standing so the correction has something to point
> at.** A super-admin sees every submitted request in every building: measured
> 6 across 3 as `7fcfe000`, against 4 across 1 for the manager of one of them,
> and `useAccommodationsLive` carries no building filter, so their Approvals and
> strata Queue screens ARE the cross-building list. The reach is intended and
> `is_admin()` in `accom_select` is deliberate; the sentence describing it was
> not. "No export" and "zero of a draft" are both still true. The standing
> statement is `docs/RBAC_CAPABILITIES.md`, "A super-admin gets what EVERY
> building's manager gets".

**Nobody gets a structured diagnosis.** This phase adds no `condition`, `diagnosis` or `impairment` column. `animal_desc` stays free text in the resident's own words. A column invites a report, and a report is how `emergency_directory` ended up returning `p.conditions`.

**Three surfaces must never learn about this.** `audit_log` metadata carries the outcome and never the note or `animal_desc`; `notifications` carry a title and a target and never the reason; there is no email path (unlike `/api/manager/request-info`, which does send one). Task 10 greps for all three.

---

## The ladder

"Real checklist" is the roadmap's phrase, not a specification. This is the specification.

```
  draft ──submit──▶ pending ◀──resubmit── info_requested
    │                 │  │                      │
    │                 │  └──needs more info─────┘
    │                 │
    │         ┌───────┴────────┐
    │         ▼                ▼
    │     approved          denied            (terminal)
    │
    └──────┬──── withdraw ────┬──────▶ withdrawn   (terminal)
       (from draft)   (from pending / info_requested)
```

| From | To | Who may move it |
| --- | --- | --- |
| `draft` | `pending` | the resident who owns it |
| `draft`, `pending`, `info_requested` | `withdrawn` | the resident who owns it |
| `pending`, `info_requested` | `approved`, `denied`, `info_requested` | a manager of the building, or a super-admin |
| `info_requested` | `pending` | the resident who owns it (resubmit) |
| `approved`, `denied`, `withdrawn` | nothing | terminal. A new request is a new row |

**Yes, it is enforced in the database, the same way Phase 2's is, and for the same reason.** `accom_manager_update` is `FOR UPDATE` over every column with no column list, so without a trigger the RPCs of Task 3 would be advice, not control — exactly the hole `20260823000002_violations_stage_guard.sql` was written to close for `violations`. This one goes further than Phase 2's, because it also freezes the resident-authored columns: a manager who can rewrite `animal_desc` after the fact can rewrite the request they denied.

`draft` exists because the storage policies key on the **request id** (`(storage.foldername(name))[2]`), so a request row has to exist before a document can attach to it. Phase 1's evidence used a client-minted `draftId` for the same problem; here a real row is simpler, makes the read policy work unchanged, and gives the resident a request they can come back to. The cost is a row a manager must never see, which the `accom_select` change in Task 2 handles.

---

## Document retention

A denied or withdrawn request still has a doctor's letter in the bucket. Deleting it the moment you deny someone is exactly wrong — a BC Human Rights Code complaint may be filed up to **one year** after the alleged contravention, and the letter is the complainant's own evidence. Keeping it forever is also wrong.

- **`RETENTION_DAYS = 400`** — thirteen months from the terminal timestamp (`decided_at` or `withdrawn_at`), one month past the filing limit. It applies to **every** terminal state including `approved`: the entitlement lives on the request row and on the pet, not in the PDF.
- **Abandoned drafts purge at 24 hours**, matching Phase 1's evidence window and its reasoning — an unsubmitted upload is also what a half-written request looks like from the sweep's point of view.
- **Orphans purge at 24 hours.** `accommodation_requests.resident_id` is `references profiles(id) on delete cascade` and `accommodation_documents.request_id` is `on delete cascade`, so a resident deleting their account through `app/api/account/delete/route.ts` erases both rows and **leaves the storage objects behind with nothing pointing at them, forever** — a PIPEDA delete that keeps the doctor's letter. Task 9 fixes the route and sweeps what is already orphaned.
- **The row survives the file.** Purging sets `storage_path = null` and stamps `purged_at`; it does not delete the `accommodation_documents` row and does not touch `status`. So *"an ESA letter was provided on 14 July and verified by Rachel Torres"* remains provable after the letter itself is gone.

**Reuse decision:** import `ageEligible`, `unclaimed`, `uploadedAt` and `EvidenceObject` from `lib/data/evidence-purge.ts` — its `CLAIMABLE_PATH` regex is `^UUID/UUID/[A-Za-z0-9][A-Za-z0-9._-]*$`, which `{buildingId}/{requestId}/{name}` matches exactly. Write the retention rule and the route separately. Do **not** extend `app/api/incidents/evidence/purge/route.ts`: it is hard-wired to one bucket and one claim table, and folding a second rule into it would make the deletion of a doctor's letter conditional inside the sweep that deletes incident photos, where a bug in either destroys the other's files.

**Age objects by `created_at`, never `updated_at`** — Phase 1 measured a storage trigger stamping `updated_at`, so an object that has been touched reads as new forever.

---

## What a decision obliges

An approved accommodation that leaves a row nobody reads is not a decision, it is a record of one.

**On `approved` with a non-null `pet_id`, the RPC also sets that pet's `registration_status` to `'approved'`.** That is the whole point of the request: the building has agreed the animal may live there. Concretely it removes the pet from the manager's Registrations queue and from the resident's missing-info card, both of which read `registration_status` today.

**On `approved`, the manager's Violations screen shows an accommodation badge** on any case whose `pet_id` matches an approved request, so a manager about to open an `unregistered_pet` or `excess_pets` case sees the exemption before they act.

**What approval does *not* do, deliberately:**

- It does not dismiss existing violations. A manager does that on purpose through `manager_advance_violation`, which writes the `violation_events` row that defends it. An automatic dismissal would leave the ledger with a state change nobody authored.
- It does not change `compliance_pct` or waive a vaccination requirement. An assistance animal still needs its rabies shot.
- It does not waive a pet count or weight limit, because — measured above — nothing enforces one.

---

## Task 1: The DDL the spec said was not needed

**Files:**
- Create: `supabase/migrations/20260827000000_accommodation_status_values.sql`
- Create: `supabase/migrations/20260827000001_accommodation_schema.sql`

Two files, not one, and this is not stylistic. `alter type … add value` cannot be followed by a use of that value in the same transaction, `apply_migration` wraps each call in one transaction, and `20260727000000_ai_assistant.sql` already broke `db reset` this exact way.

- [ ] **Step 1: Assert the starting shape**

```sql
select column_name, udt_name, is_nullable from information_schema.columns
 where table_schema='public' and table_name like 'accommodation%' order by table_name, ordinal_position;
select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder)
  from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace
 where n.nspname='public' and t.typname='accommodation_status' group by 1;
select status::text, count(*) from public.accommodation_requests group by 1;
select count(*) from public.accommodation_documents;
```

Expected, exactly: `accommodation_status` = `pending, approved, denied, info_requested`; `accommodation_documents` = the six columns named at the top of this document; requests `pending` 2, `info_requested` 2, total **4**; documents **0**. If any of these differ, stop and report rather than adjusting the plan to fit.

- [ ] **Step 2: The enum values, alone in their own migration**

```sql
alter type public.accommodation_status add value if not exists 'draft'     before 'pending';
alter type public.accommodation_status add value if not exists 'withdrawn' after  'info_requested';
```

Nothing else in this file. Not a comment block referencing them in a function body — nothing.

- [ ] **Step 3: The columns**

On `accommodation_requests`:

| Column | Type | Why |
| --- | --- | --- |
| `submitted_at` | `timestamptz` | when it entered the queue; `created_at` is when the draft was opened |
| `withdrawn_at` | `timestamptz` | the retention clock for a withdrawal |
| `decision_note` | `text` | *"The reasoning is what defends this at the CRT"* is already a comment at `manager-queues.ts:233`. Make it a column and then a constraint |
| `updated_at` | `timestamptz not null default now()` | there is none today |

On `accommodation_documents`:

| Column | Type | Why |
| --- | --- | --- |
| `label` | `text` | what the resident called it |
| `mime_type` | `text` | so the viewer knows whether to render a PDF or an image |
| `size_bytes` | `integer` | shown before a manager opens it |
| `uploaded_at` | `timestamptz not null default now()` | there is no timestamp on this table at all |
| `uploaded_by` | `uuid references public.profiles(id) on delete set null` | **`set null`, stated deliberately:** the document must survive its uploader's account deletion, because the request it supports does not (see Task 9), and a `cascade` here would silently destroy a manager's verified evidence |
| `verified_by` | `uuid references public.profiles(id) on delete set null` | same reasoning; mirrors `pet_documents.verified_by`, which also has no on-delete action stated — this one states it |
| `verified_at` | `timestamptz` | |
| `purged_at` | `timestamptz` | stamped when retention removes the file; the row stays |

Also: a unique index on `(request_id, kind)` — one letter of each kind per request. Re-uploading replaces.

- [ ] **Step 4: Backfill the four live rows**

They are already submitted, so `submitted_at := created_at` where `status in ('pending','info_requested')`. Do not touch `status`. Assert `4` rows updated.

Also record in the header that `accommodation_documents.status` still defaults to `'missing'` and that **this phase never writes that value** — a row exists if and only if a file was uploaded, and a missing kind is derived from its absence. The default is now dead and is left alone rather than changed, because changing a default on a live table for cosmetic reasons is not worth a migration.

- [ ] **Step 5: Verify**

Re-run Step 1's queries. Six new columns on documents, four on requests, six enum labels in the order `draft, pending, approved, denied, info_requested, withdrawn`, `submitted_at` non-null on exactly 4 rows, and **still 4 requests and 0 documents**.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260827000000_accommodation_status_values.sql supabase/migrations/20260827000001_accommodation_schema.sql
git commit -m "The spec said no DDL; the table said otherwise"
```

---

## Task 2: Close the three holes measured today

**Files:**
- Create: `supabase/migrations/20260827000002_accommodation_policies.sql`

Three separately measured defects, plus a fourth that `draft` introduces. All four close together because each one alone leaves a way round the others.

- [ ] **Step 1: Prove all four first — this is the RED**

Each in its own rolled-back transaction, with `set local role authenticated` and `set local request.jwt.claims`.

| # | Probe | Expected today |
| --- | --- | --- |
| 1 | As Tom Delaney (`5f3be749-9894-4862-a110-c6f8a98fa64b`, Maple Court Residences), `insert into accommodation_requests(building_id, resident_id, type, animal_desc)` naming **Harbour View Towers** (`b5000000-0000-4000-8000-000000000003`) | **admitted** — measured 2026-08-22 |
| 2 | As Dana Whitlock (`a5000000-0000-4000-8000-000000000001`), `update accommodation_requests set animal_desc='REWRITTEN BY MANAGER', status='approved', building_id='b5000000-0000-4000-8000-000000000002' where id='25000000-0000-4000-8000-000000000001'` | **1 row, all three changed** — measured |
| 3 | Insert a document row as the owning resident, then as Rachel Torres (`3aa088d5-05f9-49c4-9789-f64538405bba`, manager of that building) `delete from accommodation_documents where id=…` | **deleted** — measured |
| 4 | Set a request to `'draft'`, then select it as a manager of the building | 1 row — the manager sees a request nobody has filed |

Record each result. A probe that does not reproduce means the database moved under this plan; stop and report.

- [ ] **Step 2: Write the migration**

**`accom_resident_insert`** — replace. `with check (resident_id = auth.uid() and public.is_resident_of(building_id) and status = 'draft')`. Three conditions, each a positive statement of what is allowed: it is yours, you live there, and it starts at the bottom of the ladder. `is_resident_of` requires an **approved** link and a non-suspended profile — verified in its definition — so a pending link cannot file.

**`accom_select`** — replace. Keep `resident_id = auth.uid()` unconditional. Gate the manager and admin arms on `status <> 'draft'`, written so a null status could never open it:

```sql
using (
  resident_id = auth.uid()
  or (status <> 'draft' and (public.manages_building(building_id) or public.is_admin()))
)
```

**`accomdoc_rw`** — drop, and replace with four per-command policies. The `FOR ALL` form was the bug: `DELETE` consults only `USING`, so the manager arm that belongs in a read reached a destroy.

| Command | Who |
| --- | --- |
| `SELECT` | the owning resident, or (`manages_building` / `is_admin`) **and the parent request is not `draft`** |
| `INSERT` | the owning resident only, and only while the parent request is non-terminal |
| `UPDATE` | nobody. Verification goes through the RPC in Task 3, retention through the service role in Task 9 |
| `DELETE` | the owning resident, and only while the parent request is non-terminal |

**The freeze trigger.** `BEFORE UPDATE on public.accommodation_requests`. Model it on `public.violations_stage_guard` and carry across the lesson that migration's header spells out at length:

> the token is a single-use capability, not a mode. A GUC set inside a `SECURITY DEFINER` function survives that function's return and is readable two statements later in the same transaction. Left as a mode, one legitimate RPC call would license unlimited direct updates for the rest of the transaction.

So the guard **spends** the token: `perform pg_catalog.set_config('pet10x.accom_write','',true)` on the way through, and compares with `is distinct from` rather than `<>`, because an unset GUC reads NULL and `NULL <> 'ok'` is NULL — a guard that evaluates to NULL is not a guard.

What it refuses:

- any change to `status` without the token;
- any change to `resident_id`, `building_id`, `created_at` — **by anyone, token or not.** These are identity, not state. Probe 2 moved a request between buildings, and the storage read policy joins through `r.building_id`, so that single statement relocated who may read a doctor's letter;
- any change to `animal_desc`, `type`, `pet_id`, `unit_id` by anyone other than `resident_id = auth.uid()`, and only while the request is `draft` or `info_requested`. The resident may correct their own request while it is theirs to correct; a manager may never rewrite it, and nobody may rewrite it after a decision.

`SECURITY INVOKER`, `set search_path = ''`, fully-qualified `pg_catalog` calls, raising `42501` with a `hint` naming the RPC to call instead — all four matching `violations_stage_guard`. **A trigger is not RLS: `is_admin()` transcends the policies and transcends nothing here.** Assert that for a super-admin as well as a manager.

Add a `check` constraint: `decision_note` must be non-blank when `status = 'denied'`.

- [ ] **Step 3: Apply, then re-run every probe from Step 1**

All four must now be refused. Then the matching allowed cases, so the migration is not simply a wall:

- the same resident inserting a `draft` into **their own** building — admitted;
- a manager selecting a **submitted** request of their building — 1 row;
- the owning resident selecting their own `draft` — 1 row;
- a manager updating nothing but `legal_note` — still admitted (it is manager-authored guidance and not part of the freeze);
- a super-admin's direct `update … set status = 'approved'` — **refused**, same as the manager's.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260827000002_accommodation_policies.sql
git commit -m "A request you cannot rewrite, in a building you actually live in"
```

---

## Task 3: The four RPCs that move a request

**Files:**
- Create: `supabase/migrations/20260827000003_accommodation_rpcs.sql`

**Interfaces:**

```sql
submit_accommodation_request(p_request uuid) returns jsonb
  -- draft | info_requested -> pending. Authorises on resident_id = auth.uid().
  -- Refuses with 'checklist_incomplete' when a required document kind is absent.

withdraw_accommodation_request(p_request uuid, p_reason text default null) returns jsonb
  -- draft | pending | info_requested -> withdrawn. Resident only. Stamps withdrawn_at.

manager_decide_accommodation(
  p_request uuid,
  p_outcome public.accommodation_status,   -- approved | denied | info_requested
  p_note    text default null
) returns jsonb

manager_verify_accommodation_document(
  p_document uuid,
  p_verified boolean,
  p_note     text default null
) returns jsonb
  -- sets verified, verified_by, verified_at, and status to 'approved' | 'rejected'
```

All four are `SECURITY DEFINER`, `set search_path = public, pg_temp`, and **return a structured error rather than raising** — matching `manager_advance_violation`, not the older raising convention of `manager_decide_registration`. All four take `for update` on the row before reading its state, so two managers pressing Approve at the same moment do not both succeed. All four mint the single-use token immediately before their own `UPDATE` and never earlier.

**The required-document rule**, derived and written in one place so the resident's form and the manager's checklist cannot disagree:

| Request type | Required | Optional |
| --- | --- | --- |
| `esa` | `esa_letter` | `vaccination`, `other` |
| `service_animal` | `provider_license` | `esa_letter`, `vaccination`, `other` |

Plus, for both: `animal_desc` non-blank. Those `doc_kind` labels are live values — the enum is `vaccination, municipal_license, liability_insurance, building_registration, microchip_registration, esa_letter, provider_license, other`. Do not invent a label.

**On `approved`, the RPC also runs the consequence:** if `pet_id` is not null and that pet's `registration_status` is not already `'approved'`, set it. Report it back in the result (`pet_registration_approved: true|false`) so the UI can say so. If the pet has been soft-deleted (`deleted_at is not null`), skip it and say so — do not resurrect a deleted pet.

**Every one of them writes `audit_log`** with `action` in `accommodation.submitted | .withdrawn | .decided | .document_verified`, `entity_type = 'accommodation_request'` (or `'accommodation_document'`), the `building_id`, and metadata carrying **the outcome and nothing clinical** — no `decision_note`, no `animal_desc`, no filename.

**`manager_decide_accommodation` and `withdraw_…` notify.** The `notifications` insert policy admits only `kind = 'assistant'` for self, so a manager cannot notify a resident from the browser at all — the same constraint that forces AD-6. `kind = 'building'`, `severity = 'info'` on approve and `'warning'` otherwise, `action_target = 'accommodations'` (the plain screen names `action_target` already carries — see `/api/manager/request-info` using `'profile'`). Title and body name **no** reason: *"Your accommodation request was decided"* / *"Open Accommodation Requests to read the decision."* `withdraw_…` notifies the building's managers, not the resident.

**No email.** `/api/manager/request-info` sends one for registrations; this phase deliberately does not, because an email is the one channel whose contents leave the product's access control behind.

- [ ] **Step 1: Write the failing assertions**

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like '%accommodation%';
```

Expected: **no rows**. Record `select count(*) from public.audit_log` and `from public.notifications` for comparison.

- [ ] **Step 2: Write the migration**

- [ ] **Step 3: Apply and verify every rule**

All in rolled-back transactions, impersonating real accounts. Actors, verified live and fixed for the rest of this phase:

| Role | Who | id |
| --- | --- | --- |
| Requesting resident | Sarah Chen `resident1@pet10x.com`, MCR2026 | `4b37d361-38dc-435c-9958-91f997167590` |
| A **different** resident, same building | Marcus Webb `resident2@pet10x.com` | `768b992b-8a97-42e8-b1ce-5d7d477ea878` |
| Manager **of** the building | Rachel Torres `manager@pet10x.com`, MCR2026 | `3aa088d5-05f9-49c4-9789-f64538405bba` |
| Manager of a **different** building | Dana Whitlock `stratamanager@pet10x.com` — manages CDR/HVT/MPL/WEL/RIV, **not** MCR. Verified: she sees 0 MCR requests today | `a5000000-0000-4000-8000-000000000001` |
| Super-admin | `admin.pet10x@gmail.com` | resolve by email |
| `anon` | `set local role anon`, no claims | — |

Assertions:

- Resident submits their own `draft` with the required document present → `ok`, status `pending`, `submitted_at` stamped, exactly one `audit_log` row.
- Resident submits a `draft` with **no** `esa_letter` → `checklist_incomplete`, status unchanged, **zero** new `audit_log` and **zero** new `notifications`.
- The **different** resident submits it → `forbidden`, nothing written.
- Manager decides `pending → approved` → status moves, one `audit_log`, exactly one notification for the requesting resident and none for anyone else, and the named pet's `registration_status` becomes `approved`.
- Manager decides `→ denied` with a blank note → `note_required`; with a note → `ok`.
- Manager of a **different** building decides it → `forbidden`, nothing written.
- Super-admin decides it → `ok` (matrix says ✅).
- `approved → denied` → `illegal_transition`. `withdrawn → pending` → `illegal_transition`.
- Resident withdraws a `pending` request → `withdrawn`, `withdrawn_at` stamped, managers notified, resident not.
- Manager verifies a document → `verified`, `verified_by`, `verified_at` set, one `audit_log`. The **different** building's manager → `forbidden`.
- **Token hygiene:** in one transaction, call `manager_decide_accommodation` successfully and then attempt a plain `update accommodation_requests set status='approved'`. The second must be **refused** — the token was spent. This is the check Phase 2 nearly shipped without.
- `select count(*) from public.audit_log where metadata::text ilike '%'||(select decision_note from …)||'%'` → **0**. The note never reaches the audit trail.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260827000003_accommodation_rpcs.sql
git commit -m "Four ways a request may move, and no fifth"
```

---

## Task 4: The storage contract

**Files:**
- Create: `supabase/migrations/20260827000004_accommodation_docs_storage.sql`

Today: `accommodation-docs` is private with `file_size_limit = null` and `allowed_mime_types = null`, and carries exactly two policies, neither reconciled by `20260821000003`. Both key on `(storage.foldername(name))[2]` alone — **segment 1 and the filename are entirely unconstrained**, so a resident chooses both.

- [ ] **Step 1: Show what the bucket permits today**

```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='accommodation-docs';
select policyname, cmd, qual, with_check from pg_policies
 where schemaname='storage' and tablename='objects' and policyname like 'accommodation%';
select count(*) from storage.objects where bucket_id='accommodation-docs';
```

Expected: nulls for both limits, two policies, **0** objects. Then, as the owning resident, insert an object at `anything-at-all/{theirRequestId}/../x.pdf` and confirm it is **admitted** — that is the traversal shape Phase 1 measured, and the reason the fix must be a positive grammar and not a rejection of `..`.

- [ ] **Step 2: Set the bucket's limits**

```sql
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']
 where id = 'accommodation-docs';
```

10 MB, PDF plus the same image set the rest of the product uses. **The bucket is the enforcement point, not the route** — a signed upload token binds path, upsert, scope and expiry, never Content-Type and never length, so a client declaring 1 KB can PUT 500 MB through the URL. Say so in the header, and say that these two values mirror constants in Task 5's route and must be changed together with them, exactly as `20260822000001` says of `guest-evidence`.

- [ ] **Step 3: Drop the client INSERT policy, and pin every segment of the read**

**Drop `accommodation-docs resident write` entirely.** From here an upload can only happen through a URL the server minted, which is the structural guarantee `guest-evidence` already has and is what makes the path shape a fact rather than a convention.

Replace `accommodation-docs read` with a policy that states the whole grammar, and add nothing that denylists:

```sql
create policy "accommodation-docs read"
  on storage.objects for select
  using (
    bucket_id = 'accommodation-docs'
    and storage.objects.name ~
        ('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
      || '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
      || '/[A-Za-z0-9][A-Za-z0-9._-]*$')
    and exists (
      select 1 from public.accommodation_requests r
      where r.id::text = (storage.foldername(storage.objects.name))[2]
        and r.building_id::text = (storage.foldername(storage.objects.name))[1]
        and (
          r.resident_id = auth.uid()
          or (r.status <> 'draft' and (public.manages_building(r.building_id) or public.is_admin()))
        )
    )
  );
```

Four things about that, each learned from a specific defect in this repository:

1. **The regex is the guard, not the character class.** `20260822000001`'s header is explicit: `.` is a literal inside `[A-Za-z0-9._-]`, so `..` is a valid segment there and a three-segment pattern built from that class still admits `{building}/../evil.pdf`. What closes it is pinning both leading segments to shapes that **cannot be** `..` — two uuids — and requiring the filename to begin alphanumeric.
2. **Segment 1 must equal the request's own `building_id`.** Without it, segment 1 is decoration and the documented convention is a lie. With it, a request moved between buildings stops matching its own objects, which is a second lock on the hole Task 2's trigger closes.
3. **`storage.objects.name` stays fully qualified inside the subquery.** `pet-media manager read` shipped inert for exactly this: unqualified `name` bound to `pets.name`. The `accommodation-docs` policies get away with the bare form only because `accommodation_requests` has no `name` column — a collision, not a design. Do not rely on it.
4. **No `::uuid` cast appears anywhere in this policy.** The `case`-guards `20260821000003` added elsewhere exist because a cast on a malformed segment raises `22P02` and takes the whole bucket offline for every reader including a super-admin. Comparing `r.id::text` to the segment casts the *trusted* side and never the path, so the failure mode cannot arise.

Then re-run the Step 1 traversal insert. It must now be **refused** — there is no INSERT policy at all.

- [ ] **Step 4: Verify the read matrix against a planted object**

Plant one object with the service role at `{mcrBuildingId}/{sarahsRequestId}/letter.pdf`, then, each in a rolled-back transaction:

| Actor | Rows |
| --- | --- |
| Sarah Chen (owns the request) | 1 |
| Marcus Webb (different resident, same building) | 0 |
| Rachel Torres (manager of MCR), request `pending` | 1 |
| Rachel Torres, request set to `draft` | **0** |
| Dana Whitlock (manager of another building) | 0 |
| Super-admin | 1 |
| `anon` | 0 |

Then plant a second object at `{someOtherBuildingId}/{sarahsRequestId}/letter.pdf` and confirm **everyone gets 0**, including the super-admin — segment 1 no longer matches the request's building.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260827000004_accommodation_docs_storage.sql
git commit -m "One way into the bucket, and every segment of the path pinned"
```

---

## Task 5: The sign route

**Files:**
- Create: `app/api/accommodations/docs/sign/route.ts`
- Create: `lib/data/accommodation-docs.ts` — the browser half

Model on `app/api/incidents/evidence/sign/route.ts` and `lib/data/evidence.ts`, and read both before writing a line. The differences from Phase 1 matter and are the whole reason this is not a copy:

- **The caller has a session.** Authorise with `getSupabaseServerClient()` + `auth.getUser()`, then check `resident_id = auth.uid()` on the named request with the admin client — the same shape `/api/manager/request-info` uses. Possession of a building code authorises nothing here.
- **The request must exist and be non-terminal** (`draft`, `pending` or `info_requested`). Uploading to a decided request is `409`.
- **The path is `{request.building_id}/{request.id}/{kind}-{Date.now()}.{ext}`.** Every segment comes from the database or from a closed set. The resident's filename never reaches storage — it is attacker-shaped input and the kind plus the clock already make the name unique.
- **`kind` must be a member of the `doc_kind` labels this phase uses**, validated against a literal set in the route.
- **PDFs are not downscaled.** `prepareChatImage` renders through a canvas and emits JPEG; a PDF through it is destroyed. Images go through it, PDFs go up as-is under the 10 MB cap.

`MAX_BYTES = 10 * 1024 * 1024` and `ALLOWED = {application/pdf, image/jpeg, image/png, image/webp, image/heic, image/heif}` in the route, with a comment saying they mirror Task 4's bucket settings and must move together.

The browser half, `uploadAccommodationDoc`, mirrors `uploadEvidence` and carries its two hard-won details verbatim:

- **`{ contentType: file.type }` is not optional.** `uploadToSignedUrl` otherwise PUTs `text/plain;charset=UTF-8`; the token binds path, upsert, scope and expiry and never Content-Type, so the bucket's allow-list sees the header and rejects every upload with `415 invalid_mime_type` three layers from the symptom.
- **`fetch` rejects on offline/DNS/CORS rather than resolving with a bad status**, so the `try` must wrap the call and not just the `.json()`.

After a successful PUT it calls a small `record_accommodation_document(p_request, p_kind, p_path, p_label, p_mime, p_size)` RPC — because Task 4 leaves no client INSERT on storage and Task 2 leaves the resident an INSERT on the table, but the row and the object must agree, and the RPC is where that is checked. Put it in this task's migration if one is needed, or fold it into `20260827000003`; either is fine, but say which in the commit.

- [ ] **Step 1: Write the route**
- [ ] **Step 2: Write the browser half**
- [ ] **Step 3: Verify by curl, before any UI exists**

- No session → `401`. A session that does not own the request → `403`, and **nothing about the request in the body** — not its type, not its resident.
- A terminal request → `409`.
- `application/zip` → `400`. 12 MB declared → `400`.
- A valid call returns `{ok:true, upload:{path, token}}` and the path matches the Task 4 regex exactly. Check it with `select 'that/path' ~ '<the regex>'`.

- [ ] **Step 4: Commit**

```bash
git add app/api/accommodations/docs/sign/route.ts lib/data/accommodation-docs.ts
git commit -m "The server composes the path; the resident supplies only bytes"
```

---

## Task 6: The data layer

**Files:**
- Create: `lib/data/accommodations.ts` — pure
- Create: `lib/data/accommodations.test.ts`
- Create: `lib/data/accommodations-live.ts` — `"use client"` hooks and mutations
- Modify: `lib/data/manager-queues.ts` — delete `useAccommodationsLive` and `decideAccommodation`
- Modify: `lib/data/types.ts`, `lib/data/hooks.ts`, `lib/data/work-queue.ts`, `lib/data/index.ts`
- Regenerate: `lib/supabase/database.types.ts`

**Regenerate the types first** (`mcp__supabase__generate_typescript_types`). They currently declare `accommodation_status: "pending" | "approved" | "denied" | "info_requested"` at `:3466`, and nothing in this phase compiles against the new labels or RPCs until they are current.

- [ ] **Step 1: The pure module**

`REQUIRED_KINDS: Record<AccommodationType, DocKind[]>`, `OPTIONAL_KINDS`, `checklistFor(request, documents): ChecklistItem[]`, `legalMoves(status, actor): AccommodationStatus[]`, and `retentionDeadline(request)`. `ChecklistItem` carries `{ kind, label, required, state: "missing" | "provided" | "verified" | "rejected", documentId? }`.

`checklistFor` is where the four hardcoded booleans die. `animalDescription` was never a document — it is `animal_desc` on the request — so it becomes a checklist item sourced from the request, and the other three become real derivations.

- [ ] **Step 2: Tests**

`environment: "node"`, so this is the only thing in the phase a test can reach. Cover: an ESA request with no documents (one required item `missing`), with an unverified letter (`provided`), with a verified letter (`verified`), with a rejected one (`rejected`); a service-animal request requiring `provider_license` and **not** `esa_letter`; a blank `animal_desc`; `legalMoves` for each status and each actor, including both terminal states returning `[]`; `retentionDeadline` for `decided_at` and for `withdrawn_at`, and `null` for a request still open.

- [ ] **Step 3: The live module**

`useMyAccommodations()` (resident, own rows, drafts included), `useAccommodationsLive()` (manager, `status <> 'draft'`, explicitly filtered in the query — **RLS is the floor, the query is the filter**; the policy now also excludes drafts, and both are correct), `useAccommodationDocuments(requestId)`, plus thin wrappers over the four RPCs returning the structured error mapped to a sentence.

Signed download URLs are minted **in the browser** with `createSignedUrl` — the caller holds a session and Task 4 leaves them SELECT — so no second route is needed. Sixty-second expiry. Never `getPublicUrl`: the bucket is private and the call would return a URL that silently 400s.

- [ ] **Step 4: Move the callers**

`components/screens/strata/queue-screen.tsx:68-70` calls `decideAccommodation(item.refId, …)` for three actions and `lib/data/work-queue.ts:140-149` builds its queue rows from `useAccommodationsLive`. Both must move to the new module and the new RPC. `queue-screen`'s "Approve" now needs no note and "Deny" now **does** — either give it a note prompt or remove the Deny action from that surface and leave deciding to the approvals screen. Decide and say which in the commit message; do not leave a Deny button that returns `note_required`.

- [ ] **Step 5: Verify and commit**

`PATH="$HOME/.corepack-bin:$PATH" pnpm test` and `pnpm build` both exit 0.

```bash
git add lib/data/accommodations.ts lib/data/accommodations.test.ts lib/data/accommodations-live.ts lib/data/manager-queues.ts lib/data/types.ts lib/data/hooks.ts lib/data/work-queue.ts lib/data/index.ts lib/supabase/database.types.ts components/screens/strata/queue-screen.tsx
git commit -m "A checklist derived from documents that exist"
```

---

## Task 7: The resident asks

**Files:**
- Create: `components/screens/accommodation-request-screen.tsx`
- Modify: `app/app/page.tsx` — route `accommodations`, plus a `CONTENT_MAX` entry
- Modify: `components/screens/profile-screen.tsx` — the Accommodation Requests row

`profile-screen.tsx:55` lists `{ icon: FileText, label: "Accommodation Requests" }` and `:156` falls through to `toast(label, { description: "Coming soon." })`. Phase 3's plan lists this row as *"Leave as-is — Phase 7 builds this"*. This is that build. If Phase 3 has already run and disabled the row, re-enable it and note the change for whoever reconciles the two.

The screen, top to bottom:

1. `IOSNavBar` with a `NavBackButton` wired to `handleBack`, matching `link-building-screen.tsx`.
2. **Your requests** — a card per row: type, animal, status chip, submitted date. A `draft` says *"Not sent yet"* and opens the form; a decided one shows `decision_note`.
3. **New request** — type (ESA / Service animal), the pet from the resident's own pets (optional — an animal not yet registered is exactly what a request may be about), and `animal_desc` as a free-text field with an honest label: *"Describe the animal and why you need it. Your building manager will read this."* No dropdown of conditions, no diagnosis field.
4. **Documents** — the required kinds for the chosen type, each with an upload control, a size and a filename once uploaded, and a remove control while the request is not yet submitted. `accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"`.
5. **Submit** — disabled with a plain sentence naming what is still missing, never a silent no-op.
6. Never renders `legal_note` — it is manager-authored counsel that RLS happens to expose, and putting *"Seek legal advice before denying"* in front of the applicant is not the product.
7. A resident with no approved building link gets the existing link-your-building affordance routed to `link-building`, not an empty form.

The draft is created on first interaction (`insert … status='draft'`), because a document cannot attach to a request that does not exist — see the ladder section. Say so in a comment on the insert so the next reader does not "simplify" it into a submit-time insert and break every upload.

- [ ] **Step 1: Build the screen**

- [ ] **Step 2: Route it**

Add `accommodations` to the **shared, non-persona** branch of `app/app/page.tsx`'s router, beside `report` and `shop`, so a manager can open it and see what their residents see. Add `"accommodations": "max-w-2xl"` to `CONTENT_MAX` — without it the screen silently falls back to a different width from every other resident screen.

- [ ] **Step 3: Verify in a browser — a real upload, not a mock**

This step is not optional and cannot be replaced by a test. Three defects this project shipped past a clean `tsc`, a clean build and a green suite were caught only by opening the page: a control rendered underneath the fixed tab bar, a header hidden under the Dynamic Island, and a missing space in JSX. File upload is exactly this kind of feature.

`PATH="$HOME/.corepack-bin:$PATH" pnpm dev`, sign in as `resident1@pet10x.com` (Sarah Chen, MCR2026):

- Profile → Accommodation Requests reaches the screen.
- Create an ESA request. **Upload a real PDF from disk** and a real photo. Both appear with the right filename and size.
- Confirm in SQL: `select storage_path, mime_type, size_bytes from accommodation_documents where request_id = …` — two rows, `application/pdf` and an image type, sizes matching the files on disk. Then `select metadata->>'mimetype', metadata->>'size' from storage.objects where …` — **the same values**. A mismatch here is the `contentType` defect and nothing else matters until it is fixed.
- Remove the photo; the row and the object both go.
- Submit. Status becomes `pending`, the submit control is replaced by the status, and the request is no longer editable.
- Try to upload to the submitted request through the route directly (curl) → `409`.
- **At 375px wide:** the submit button is not under the fixed tab bar, the nav bar is not under the Dynamic Island, nothing scrolls horizontally, and a long `animal_desc` wraps.
- With no approved building link (`resident5@pet10x.com` has one; use a fresh account or temporarily unlink in SQL and roll back), the screen offers to link a building rather than a broken form.

- [ ] **Step 4: Commit**

```bash
git add components/screens/accommodation-request-screen.tsx app/app/page.tsx components/screens/profile-screen.tsx
git commit -m "Somewhere to ask, and somewhere for the letter to go"
```

---

## Task 8: The manager works the checklist

**Files:**
- Modify: `components/screens/manager/approvals-screen.tsx` — the Accommodations tab (`:215-315`)
- Create: `components/screens/manager/accommodation-document-viewer.tsx`
- Modify: `components/screens/manager/violations-screen.tsx` — the accommodation badge

Today the tab renders four booleans from `Object.entries(acc.documents)`, two of which are literals, and three buttons that fire a bare `.update()` under toasts claiming an audit trail that does not exist.

What it becomes:

| Control | Becomes |
| --- | --- |
| The four-tick documentation list | `checklistFor(...)`: required kinds first, each with its real state, and `animal_desc` as its own item |
| *(new)* Each provided document | Filename, size, when it was uploaded, an **Open** control that mints a 60-second signed URL, and Verify / Reject |
| Approve | `manager_decide_accommodation(id, 'approved', note)`. Refuses while a required document is unverified, and says which |
| Deny | Same RPC with `'denied'` — **a note is mandatory**, enforced by the check constraint and asked for by the sheet, not discovered as an error |
| Verify Docs | Renamed. It never verified anything; it set `info_requested`. It becomes **Request more information**, with a note |
| *(new)* A withdrawn request | Shown, greyed, with its `withdrawn_at`. Not silently dropped from the queue |
| Tab count (`:63`) | Already derived from `accommodations.length`; confirm it counts non-`draft` only |

The viewer opens a PDF and an image in a sheet. It must not download to disk by default, must not put the signed URL in the address bar, and must not log it. It carries one line of standing text: **"This document is confidential. Only this building's managers, the resident who filed the request, and a Pet10x administrator can open it."**

> **Corrected in the Phase 7 fix round.** This line originally specified *"Only you, other managers of this building, and the resident can see it"* and asserted it was "true because Task 4 makes it true, and Task 10 proves it". It was not true and Task 10 did not prove it. Task 4's storage policy ends in `manages_building(r.building_id) OR is_admin()`, so a super-admin who manages no building reads every submitted request's documents — measured, 3 of 3 objects. The plan specified a sentence narrower than the policy it also specified, and the implementation faithfully shipped the sentence. The enumeration now names the super-admin; see `docs/RBAC_CAPABILITIES.md`.

The violations badge: for each case with a `pet_id`, if an `approved` accommodation names that pet, show it. It reads through the resident-safe fields only — type and status — never `animal_desc` and never a document.

- [ ] **Step 1: Rewrite the tab**

- [ ] **Step 2: The document viewer**

- [ ] **Step 3: The violations badge**

- [ ] **Step 4: Verify in a browser**

Sign in as `manager@pet10x.com` (Rachel Torres, MCR2026), against the request Task 7 filed:

- The checklist shows the ESA letter as **provided, not verified** — a real state, not a green tick.
- Approve is refused, or disabled with the reason named, until the letter is verified.
- Open the letter. The PDF renders. Confirm the URL expires: wait past 60 seconds and reload → the fetch fails.
- Verify it. `verified_by` and `verified_at` land, one `audit_log` row.
- Deny with a blank note → the sheet will not submit. With a note → the request moves and the resident gets **one** notification whose title and body name no reason.
- Approve a different request naming a pet whose `registration_status` is `pending` → the pet leaves the Registrations tab, and `select registration_status from pets where id=…` reads `approved`.
- Open Violations: a case naming that pet carries the accommodation badge.
- Sign in as `stratamanager@pet10x.com` (Dana Whitlock, manages five buildings, **not** MCR): the Accommodations tab shows **none** of MCR's requests.
- **The counts are the counts.** The tab badge equals the number of cards beneath it, and each card's document list equals the number of files actually attached. Then check the same two numbers in SQL *as Rachel Torres* — `set local role authenticated` with her claims — not as `postgres`. A policy that under-reports raises no error and produces no visible defect except a number that is quietly wrong; `event_rsvps` reads 2 rows as 1 to every actor on this database today for exactly that reason.
- At 375px: the document sheet's close control is reachable and nothing sits under the fixed tab bar.

- [ ] **Step 5: The honesty sweep on this file**

```bash
grep -nE "onClick=\{\(\) => toast" components/screens/manager/approvals-screen.tsx
grep -n "letterFromProvider\|providerLicense: r.type" components/screens/manager/approvals-screen.tsx lib/data/*.ts
```

Both expected to return nothing.

- [ ] **Step 6: Commit**

```bash
git add components/screens/manager/approvals-screen.tsx components/screens/manager/accommodation-document-viewer.tsx components/screens/manager/violations-screen.tsx
git commit -m "A checklist a manager actually works, and a decision that changes something"
```

---

## Task 9: Retention, orphans, and the delete that forgot

**Files:**
- Create: `lib/data/accommodation-docs-purge.ts` — pure
- Create: `lib/data/accommodation-docs-purge.test.ts`
- Create: `app/api/accommodations/docs/purge/route.ts`
- Modify: `vercel.json`
- Modify: `app/api/account/delete/route.ts`

- [ ] **Step 1: Show the leak first**

`app/api/account/delete/route.ts` deletes `businesses`, `resident_links` and `pets`, then the auth user. `accommodation_requests.resident_id` is `references profiles(id) on delete cascade` and `accommodation_documents.request_id` is `on delete cascade`, so both rows vanish. **A referential cascade is not subject to RLS**, and the storage object is not referential at all — it survives, unreferenced, forever.

Demonstrate it, rolled back: plant an object and its rows for a throwaway profile, `delete from public.profiles where id = …`, then confirm both rows are gone and `select count(*) from storage.objects where name like …` is still 1. That is the RED, and it is a privacy defect: a resident asked to be forgotten and the doctor's letter stayed.

While there: note that `accommodation_requests.decided_by references profiles(id)` carries **no** on-delete action, so deleting a *manager's* account who has decided a request raises a FK violation and `/api/account/delete` answers `400`. Report it; do not fix it in this phase unless it is a one-line `on delete set null` you can prove safe.

- [ ] **Step 2: The pure module**

Import `ageEligible`, `unclaimed`, `uploadedAt`, `CLAIMABLE_PATH` and `EvidenceObject` from `./evidence-purge` — the regex `^UUID/UUID/[A-Za-z0-9._-]…$` matches `{buildingId}/{requestId}/{name}` exactly, so it transfers unchanged and its "a path that cannot be claimed cannot be proven claimed, so leave it alone" property transfers with it.

Add `classify(objects, requests, now)` returning three disjoint lists with a reason on each:

| Reason | Rule |
| --- | --- |
| `abandoned_draft` | parent is `draft` and the object is older than 24 h |
| `retention_expired` | parent is terminal and `coalesce(decided_at, withdrawn_at)` is older than 400 days |
| `orphan` | segment 2 matches no request, and the object is older than 24 h |
| *(kept)* | everything else, including every undated object |

`RETENTION_DAYS = 400` and `MIN_AGE_HOURS = 24` are constants, not env vars — the same reasoning the evidence purge gives: the only interesting misconfiguration of either is a value near zero, which destroys live evidence.

**Age by `created_at`.** Phase 1 measured a storage trigger stamping `updated_at`, so an object that has been touched reads as new forever.

- [ ] **Step 3: Tests**

Every branch, plus: an object whose parent is terminal but decided 399 days ago is **kept**; an undated object is kept under every rule; a malformed path is never in any removal list; an object whose parent is `pending` for two years is kept.

- [ ] **Step 4: The route**

Model on `app/api/incidents/evidence/purge/route.ts`, including all of its safety properties, which are not optional here: `CRON_SECRET` bearer guard, `?dry=1` where any value but `0`/`false` means dry, the depth-limited recursive listing, a listing error aborting the whole run rather than becoming a delete list, batched removal, a re-check immediately before each batch, and a partial summary returned rather than thrown so an irreversible delete is never unaccounted for.

Two differences from that route, both stated in the header:

- Removal is followed by `update accommodation_documents set storage_path = null, purged_at = now()` for `retention_expired`, and by a row delete for `abandoned_draft`. **The row survives the file** for anything that reached a decision.
- `abandoned_draft` also deletes the `draft` request row itself once it has no documents left and is older than 24 h.

Add the cron to `vercel.json` at `0 5 * * *` — after the evidence sweep at `0 4`, so two storage sweeps never contend.

- [ ] **Step 5: Fix the account delete**

Before `admin.auth.admin.deleteUser(uid)`: list this resident's requests, remove their storage objects through the Storage API (not by deleting `storage.objects` rows, which orphans the underlying files), then let the cascade take the rows. Add a comment saying the purge sweep is the backstop and this is the primary — belt and braces, because a PIPEDA delete that half-works is worse than one that fails loudly.

- [ ] **Step 6: Verify**

- `pnpm test` covers the pure module.
- `POST /api/accommodations/docs/purge?dry=1` with the cron secret lists exactly the objects planted in Steps 1–2 under the right reasons, and **deletes nothing**.
- Without the secret → `401`.
- A real run removes them; a second run is a no-op; a `retention_expired` document row still exists with `storage_path` null and `purged_at` stamped.
- Delete the throwaway account through `/api/account/delete` and confirm `select count(*) from storage.objects where name like '<building>/<request>/%'` is **0**.

- [ ] **Step 7: Commit**

```bash
git add lib/data/accommodation-docs-purge.ts lib/data/accommodation-docs-purge.test.ts app/api/accommodations/docs/purge/route.ts vercel.json app/api/account/delete/route.ts
git commit -m "Keep the record, and let the letter go"
```

---

## Task 10: Prove it, and make the comments agree with the code

**Files:**
- Modify: `docs/RBAC_CAPABILITIES.md`

- [ ] **Step 1: One impersonation pass over the finished state**

Not the per-task rollbacks — one session, against the applied migrations, six actors, allowed **and** denied recorded with the SQL that produced each.

| Capability | anon | resident (owner) | resident (other) | manager of building | manager of another | super-admin |
| --- | --- | --- | --- | --- | --- | --- |
| Create a draft request in own building | ❌ | ✅ | ✅ own | ❌ | ❌ | ✅ own |
| Create a request in **another** building | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Read a **draft** request | ❌ | ✅ own | ❌ | ❌ | ❌ | ❌ |
| Read a submitted request | ❌ | ✅ own | ❌ | ✅ | ❌ | ✅ |
| Submit / withdraw a request | ❌ | ✅ own | ❌ | ❌ | ❌ | ✅ own |
| Decide a request | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Change `status` by direct UPDATE | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Rewrite `animal_desc` after submission | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Move a request between buildings | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delete a document row | ❌ | ✅ own, pre-decision | ❌ | ❌ | ❌ | ❌ |
| Verify a document | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |

- [ ] **Step 2: The same matrix for `storage.objects`**

Against a planted object, all six actors, plus the two path probes from Task 4: a first segment that is not the request's building (everyone 0) and a traversal shape (rejected by the regex before any join runs). And confirm there is **no** INSERT, UPDATE or DELETE policy on the bucket at all:

```sql
select policyname, cmd from pg_policies
 where schemaname='storage' and tablename='objects' and policyname like 'accommodation%';
```

Expected: exactly one row, `SELECT`.

- [ ] **Step 3: Make the code and its comments agree — the Phase 0 test**

`emergency_directory` documents that medical history is withheld and returns `p.conditions`. Prove this phase did not repeat it:

```bash
# No accommodation field reaches the public or cross-building surfaces.
grep -rn "accommodation" supabase/migrations/*emergency* supabase/migrations/*incident* 2>/dev/null
grep -rn "accommodation" lib/data/emergency.ts lib/data/incidents.ts lib/csv.ts components/screens/strata/reports-screen.tsx
# No clinical text reaches the audit trail, a notification, or an email.
grep -rn "animal_desc\|decision_note" app/api/ lib/email* 2>/dev/null
```

All expected to return nothing. Then in SQL, over every row the phase created:

```sql
select count(*) from public.audit_log
 where action like 'accommodation.%'
   and (metadata::text ilike '%note%' or metadata::text ilike '%letter%');
select count(*) from public.notifications
 where action_target = 'accommodations'
   and (body ilike '%esa%' or body ilike '%anxiety%' or body ilike '%disab%');
```

Both **0**. Then read each migration header written in this phase against what the migration actually does, line by line. Any sentence the code does not support is corrected in the header, not left to be discovered by a later audit.

- [ ] **Step 4: Update `docs/RBAC_CAPABILITIES.md`**

- Replace the "Enforced by" cell for *Request an accommodation* — `accom_resident_insert` alone was never the control, and the doc's own probe table at `:345-346` reads *"insert … naming themselves | admitted"* for an admin who is neither resident nor manager of the target building. That row was recording a hole as a feature. Correct it and say so.
- Replace *Decide an accommodation* with `manager_decide_accommodation` + the freeze trigger, and add a sentence that the bare `accom_manager_update` policy is no longer the control.
- Add the rows this phase creates: read a draft, read a submitted request, read a document, verify a document, withdraw, delete a document.
- Update the storage table at `:172`: `accommodation-docs` now pins segments 1, 2 **and** the filename, has no INSERT policy, and carries a 10 MB / six-MIME bucket limit. Delete the sentence at `:164` saying *"no row above turns on it yet"* — several now do.
- Correct the note at `:203-205`: the `accommodation-docs` policies no longer use the bare `name` form, so the observation that they *"bind correctly only because `accommodation_requests` has no `name` column"* becomes history rather than a live dependency. Say which it is.
- Add the confidentiality contract from this document as a section.

- [ ] **Step 5: The end-to-end walk, in a browser, in one sitting, with no SQL**

1. As `resident1@pet10x.com`: Profile → Accommodation Requests → new ESA request, attach a real PDF, submit.
2. As `manager@pet10x.com` in a second browser profile: Approvals → Accommodations → the request is there with the letter **provided, not verified**.
3. Open the letter. It renders.
4. Verify it. Approve with a note.
5. As the resident: the alert appears in Alerts; opening the screen shows `approved` and the manager's note.
6. As `stratamanager@pet10x.com`: the request is nowhere in their Approvals, their queue, or their portfolio.

Capture what each account sees. If the third account sees anything at all, that is the phase's central defect and nothing else matters until it is fixed.

- [ ] **Step 6: Commit**

```bash
git add docs/RBAC_CAPABILITIES.md
git commit -m "Say who may read a doctor's letter, and prove nobody else can"
```

---

## Phase 7 done when

1. `PATH="$HOME/.corepack-bin:$PATH" pnpm test` and `pnpm build` both exit 0. (`pnpm lint` is excluded — it has never worked on this repository.)
2. Every object this phase created appears in `supabase/migrations/`, and the two new `accommodation_status` values live in a migration that contains nothing else.
3. A resident can file a request, attach a real PDF **and** a real photo from a browser, and both land in `accommodation-docs` with the mime type and byte size recorded on the row **matching `storage.objects.metadata`** — the `contentType` check.
4. `grep -n "letterFromProvider" lib/data/*.ts components/screens/manager/*.tsx` returns **only comment lines that quote the deleted code as history** — today exactly two, `lib/data/accommodations.ts:9` and `lib/data/accommodations.test.ts:46`, both of which exist to say what the hardcoded checklist used to be and why it was wrong. No line the compiler reads mentions the identifier, and no accommodation checklist value in the codebase is a literal `true`.

   *Corrected in the fix round.* As originally written this criterion said the grep "returns nothing", and it fails literally: those two comments are the record of the defect the phase was filed to remove, and deleting them to satisfy a grep would delete the explanation and keep the criterion. The criterion was wrong, not the comments — a criterion should name what is allowed, not forbid a string.
5. `insert into accommodation_requests` naming a building the caller has no approved link to is refused, for a resident, a manager and a super-admin alike.
6. `update accommodation_requests set status = …` from any client session **raises**; the four RPCs succeed; and a plain UPDATE attempted in the same transaction *after* a successful RPC call still raises — the token is spent, not a mode.
7. `animal_desc`, `resident_id` and `building_id` cannot be changed by a manager or a super-admin at all, and cannot be changed by the resident after submission.
8. A manager of the building cannot delete a resident's `accommodation_documents` row.
9. A `draft` request and its documents are invisible to the building's own managers and to a super-admin — in the table and in storage.
10. `pg_policies` shows exactly one policy on `storage.objects` named `accommodation-docs *`, and its command is `SELECT`. The bucket carries `file_size_limit = 10485760` and a six-entry `allowed_mime_types`.
11. An object whose first path segment is not its request's `building_id` returns zero rows for every actor including a super-admin.
12. Approving a request that names a pet sets that pet's `registration_status` to `approved`, and the pet leaves the manager's Registrations queue — verified in the browser, on a real request.
13. Denying without a note is refused by the database, not merely by the form.
14. Every successful RPC left exactly one `audit_log` row naming its actor; every refused call left none; and no `audit_log` row or `notifications` row created by this phase contains the decision note, `animal_desc`, or a filename.
15. A decided request's documents survive to 400 days and are gone after; an unsubmitted draft's documents are gone after 24 hours; and deleting a resident's account removes their storage objects, verified by counting objects after the call.
16. Every count a manager is shown — the Accommodations tab badge, the documents on a checklist — equals what the same query returns **impersonating that manager**, not what it returns as `postgres`.
17. Every row of both matrices in Task 10 is verified by SQL impersonation for all six actors — the requesting resident, a different resident, a manager of the building, a manager of a different building, a super-admin and `anon` — allowed **and** denied.
18. Every migration header written in this phase describes what the migration does, checked line by line against the code, and `docs/RBAC_CAPABILITIES.md` carries no claim this phase contradicted.
19. Every browser verification was performed at 375px as well as on desktop, and nothing renders beneath the fixed tab bar or under the Dynamic Island.
