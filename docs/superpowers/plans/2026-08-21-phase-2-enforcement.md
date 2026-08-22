# Phase 2 — The enforcement ladder

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Every button on the manager's Violations screen does what it says. A case moves open → warning → fine → fine 2 through the database, leaves a record at each step, and tells the resident.

**Architecture:** Ten controls on `components/screens/manager/violations-screen.tsx` are `toast()` calls sitting over real rows — 13 violations and 4 fines exist, and `advanceViolation`/`resolveViolation` already work and are already called correctly by the strata portal. What is missing is a ladder the database enforces, a `violation_events` ledger that anything writes to, and a way for a manager to notify a resident at all — the `notifications` insert policy admits only `kind = 'assistant'` for self, so this cannot be done from the browser.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Supabase Postgres 17, `sonner`, `lucide-react`, pnpm 9 via corepack.

**Spec:** [`docs/superpowers/specs/2026-08-21-completing-manager-resident-flows-design.md`](../specs/2026-08-21-completing-manager-resident-flows-design.md) — AD-4, AD-5, AD-6, AD-8, Migrations D and F.

## Global Constraints

- **pnpm needs `PATH="$HOME/.corepack-bin:$PATH"`** (9.15.9). No Supabase CLI, no Docker — migrations via MCP `apply_migration`, assertions via `execute_sql`.
- **Supabase project:** `Pet10x`, ref `ekgejmxgnlmdomkpblki`.
- **The ladder is enforced in the database, not the client.** An illegal transition must be rejected by Postgres even if the UI would never offer it.
- **Every stage change writes a `violation_events` row before it notifies.** The paper trail is what defends a case at a tribunal.
- **Cross-user notification requires `SECURITY DEFINER`** and must re-check `manages_building(...) or is_admin()` by hand, returning a structured error rather than raising.
- **No payment surface.** `fines.stripe_payment_intent_id` stays empty; no Pay button. Residents dispute, they do not pay, in this phase.
- **A control that cannot act must not exist.** If something is out of scope, remove the control.
- **`violations_manager_write` is `FOR ALL`** with `manages_building(building_id) or is_admin()`, so a manager can already move `stage` with a plain `UPDATE` — one was measured moving all five of a building's violations to `fine_issued` in a single statement. This phase must close or supersede that path, not assume it is shut.
- **Never edit an applied migration.**

---

## Task 1: The four-state ladder

**Files:**
- Create: `supabase/migrations/20260823000000_violation_ladder.sql`

**Interfaces:**
- Produces: type `violation_stage_v2 as enum ('open','warning','fine_1','fine_2','resolved','dismissed')`, applied to `violations.stage`, `violation_events.from_stage`, `violation_events.to_stage`.

**Mapping of the 13 existing rows.** Verify these counts before migrating; if they differ, stop and report rather than adjusting the mapping to fit.

| Old | Rows | New |
| --- | --- | --- |
| `investigation` | 5 | `open` |
| `pending_review` | 1 | `open` |
| `verbal_warning` | 1 | `warning` |
| `written_warning` | 2 | `warning` |
| `fine_issued` | 1 | `fine_1` |
| `resolved` | 3 | `resolved` |
| `dismissed` | 0 | `dismissed` |

- [ ] **Step 1: Assert the starting distribution**

```sql
select stage, count(*) from public.violations group by stage order by 2 desc;
```

Expected: exactly the Old/Rows column above, 13 total.

- [ ] **Step 2: Write the migration**

Create the new enum. Convert each column with `using`, mapping old labels to new. Postgres cannot drop an enum value, so this is a new type and a swap, not an alter.

Order matters: drop the column defaults first, convert all three columns, then re-add `default 'open'` on `violations.stage`. Convert `violation_events` in the same transaction — it references the same type.

The verbal/written distinction does not survive. Rather than lose it, write one `violation_events` row per remapped violation recording what it was:

```sql
insert into public.violation_events (violation_id, from_stage, to_stage, note, occurred_on)
select v.id, null, v.stage, 'Migrated from ' || old.stage_text, current_date
from ...
```

Capture the old text before the conversion — once the column is converted the old label is gone.

Finally, update `escalate_incident_to_violation` to open cases at `'open'` instead of `'investigation'`. Use `create or replace` — the signature is unchanged, so no drop and no re-grant.

- [ ] **Step 3: Apply**

`apply_migration`, name `violation_ladder`.

- [ ] **Step 4: Verify**

```sql
select stage, count(*) from public.violations group by stage order by 1;
```

Expected: `open` 6, `warning` 3, `fine_1` 1, `resolved` 3. Total still **13** — no row created or destroyed.

Then confirm: the old `violation_stage` type is gone or unreferenced; `violation_events` holds 4 migration rows naming `verbal_warning`/`written_warning`/`investigation`/`pending_review` appropriately; `escalate_incident_to_violation` writes `'open'`; and the enum rejects a bad label (`update ... set stage = 'investigation'` → error), inside a rolled-back transaction.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260823000000_violation_ladder.sql
git commit -m "Three degrees, and a state before the first"
```

---

## Task 2: One RPC that moves a case

**Files:**
- Create: `supabase/migrations/20260823000001_manager_advance_violation.sql`

**Interfaces:**
- Produces:
  ```sql
  manager_advance_violation(
    p_violation uuid,
    p_to_stage violation_stage_v2,
    p_note text default null,
    p_amount_cents integer default null,
    p_due_on date default null
  ) returns jsonb
  ```
  Returns `{ok:true, stage, fine_id?}` or `{ok:false, error}`.

`SECURITY DEFINER`, `set search_path = public, pg_temp`. It bypasses RLS, so it re-checks scope by hand and returns a structured error rather than raising — matching `escalate_incident_to_violation`, not the older raising convention.

In one transaction it must: authorise → validate the transition → update `stage` → insert `violation_events` → insert a `fines` row when entering `fine_1`/`fine_2` → notify the resident → write `audit_log`.

**Legal transitions.** Reject anything else with `{"ok":false,"error":"illegal_transition"}`:

| From | May go to |
| --- | --- |
| `open` | `warning`, `dismissed`, `resolved` |
| `warning` | `fine_1`, `resolved`, `dismissed` |
| `fine_1` | `fine_2`, `resolved`, `dismissed` |
| `fine_2` | `resolved`, `dismissed` |
| `resolved`, `dismissed` | nothing — terminal; reopening means a new violation |

**Fine amounts (AD-5).** On entering `fine_1` or `fine_2`, read the building's schedule from `buildings.pet_rules` — keys `fine_1_cents`, `fine_2_cents`, `fine_currency` (default `'CAD'`). `p_amount_cents` overrides. If neither the override nor the bylaw provides an amount, return `{"ok":false,"error":"no_fine_amount"}` rather than inserting a zero fine. `pet_rules` is jsonb, so this needs no DDL.

**Notification.** Insert one `notifications` row for `violations.resident_id` when it is non-null, `kind = 'building'`, with an `action_target` the alerts screen can navigate to. When `resident_id` is null — an unassigned case — skip the notification and say so in the return, do not fail.

- [ ] **Step 1: Write the failing assertions**

```sql
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='manager_advance_violation';
select count(*) from public.violation_events;
```

Expected failure: function count 0; note the current `violation_events` count for comparison.

- [ ] **Step 2: Write the migration**

- [ ] **Step 3: Apply, then verify against every rule**

All inside rolled-back transactions, impersonating a real manager (`set local role authenticated` + `request.jwt.claims`), and a real non-manager as the control:

- A manager advancing `open → warning` succeeds, writes exactly one `violation_events` row, and writes exactly one notification for that resident.
- The same call by a **non-manager, non-admin** returns `{"ok":false,"error":"forbidden"}` and writes nothing — check `violation_events` and `notifications` counts are unchanged.
- `open → fine_2` returns `illegal_transition`.
- `resolved → warning` returns `illegal_transition`.
- Entering `fine_1` with no bylaw schedule and no override returns `no_fine_amount` and inserts **no** fine.
- Entering `fine_1` with `p_amount_cents` inserts one `fines` row with that amount and links it to the violation.
- Entering `fine_1` with a bylaw schedule and no override uses the bylaw amount.
- A violation with `resident_id is null` advances and reports no notification, rather than failing.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260823000001_manager_advance_violation.sql
git commit -m "Move a case, leave a record, tell the resident"
```

---

## Task 3: Close the direct-update path

**Files:**
- Create: `supabase/migrations/20260823000002_violations_stage_guard.sql`

`violations_manager_write` is `FOR ALL`, so a manager can bypass the whole ladder with `update violations set stage = 'fine_2'` — no ordering, no event row, no notification. Task 2's RPC is worthless as a control while that stands.

Add a `BEFORE UPDATE` trigger on `violations` that rejects a `stage` change unless it came from `manager_advance_violation`. The RPC signals its own writes by setting a transaction-local flag:

```sql
perform set_config('pet10x.stage_change', 'ok', true);
```

and the trigger raises unless `current_setting('pet10x.stage_change', true) = 'ok'`. `true` as the third argument makes it transaction-local, so it cannot leak between statements.

Other columns stay freely updatable — the trigger must compare `old.stage is distinct from new.stage` and let everything else through untouched.

- [ ] **Step 1: Prove the hole first**

As a real manager, in a rolled-back transaction: `update public.violations set stage='fine_2' where building_id = <theirs>` and confirm it moves rows. Record the count. That is the RED.

- [ ] **Step 2: Write and apply the migration**

Add the `set_config` call to `manager_advance_violation` in the same migration — the trigger and its only legitimate caller must land together or the RPC breaks.

- [ ] **Step 3: Verify**

- The same direct `UPDATE` now raises.
- `manager_advance_violation` still succeeds.
- An update to a non-stage column (e.g. `resolution_outcome`) still succeeds.
- The strata portal's path still works — `components/screens/strata/building-detail.tsx` calls `advanceViolation`, which does a plain `.update()`. **It will break.** That is expected and Task 4 fixes it; confirm the breakage is a clean raise and note it.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260823000002_violations_stage_guard.sql
git commit -m "Make the ladder the only way up"
```

---

## Task 4: The data layer

**Files:**
- Modify: `lib/data/manager-queues.ts` — `advanceViolation`, `resolveViolation`, stage maps, `tabFor`
- Modify: `lib/data/types.ts` — `ViolationStage`, `ViolationTab`
- Regenerate: `lib/supabase/database.types.ts`

**Before writing any TypeScript, regenerate the types** (`mcp__supabase__generate_typescript_types`). They are already stale — they still declare an overload dropped two phases ago — and nothing here compiles against the new enum or RPC until they are current.

- [ ] **Step 1: Update the types**

`ViolationStage` becomes `"open" | "warning" | "fine_1" | "fine_2" | "resolved" | "dismissed"`. Add a `Dispute` tab to `ViolationTab`. Update `DB_STAGE_TO_APP`, `STAGE_LABEL` and `tabFor`: Active = `open`, Warnings = `warning`, Fines = `fine_1`+`fine_2`, Resolved = `resolved`+`dismissed`.

- [ ] **Step 2: Replace the mutations**

`advanceViolation` and `resolveViolation` both become thin wrappers over `manager_advance_violation`, returning its structured error mapped to a sentence. Add `issueFine(violationId, { amountCents?, dueOn?, note? })` as another wrapper. Delete the plain `.update()` calls — Task 3's trigger now rejects them.

- [ ] **Step 3: Fix the strata portal caller**

`components/screens/strata/building-detail.tsx` calls `advanceViolation` and `resolveViolation`. Because both now go through the RPC, it keeps working — but its `DB_LABEL` map and any stage list need the new enum. Update and verify by reading the file.

- [ ] **Step 4: Write tests for the pure logic**

`lib/data/violations.test.ts` covering `tabFor` and the legal-transition table as a client-side mirror. The database is the enforcement point; this test documents the same rules so a UI that offers an illegal action fails locally first.

- [ ] **Step 5: Verify and commit**

`pnpm test` and `pnpm build` both clean.

```bash
git add lib/data/manager-queues.ts lib/data/types.ts lib/supabase/database.types.ts lib/data/violations.test.ts components/screens/strata/building-detail.tsx
git commit -m "One way to move a violation, in the client too"
```

---

## Task 5: The manager's screen does what it says

**Files:**
- Modify: `components/screens/manager/violations-screen.tsx`

Ten controls become real, or go.

| Control | Becomes |
| --- | --- |
| Tab counts `5/3/2/8` (`:26-31`) | Derived from the live lists, like `approvals-screen.tsx:60-65` already does |
| Investigate | Removed — `open` *is* under investigation; the button asserted a state change that does not exist |
| Issue Warning | `manager_advance_violation(id, 'warning', note)` |
| Review Case | Removed — it toasted and navigated nowhere |
| Escalate (warning) | `→ 'fine_1'` with an amount sheet |
| Escalate (fine_1) | `→ 'fine_2'` with an amount sheet |
| Resolve | `→ 'resolved'` with an outcome note |
| Send Reminder | Re-notify the resident about an unpaid fine |
| Escalate to CRT | Removed — no CRT integration exists and none is planned this phase |
| Export / Export CRT Package | Real CSV via `toCsv`/`downloadCsv` extracted from `components/screens/strata/reports-screen.tsx` into `lib/csv.ts` |
| Log a violation (`:77`) | A composer: building, resident, pet, type; opens at `open` |

The amount sheet must show the building's bylaw default and let the manager override it, per AD-5 — so the schedule is the default and a deviation is deliberate.

Add a **Disputed** tab showing `disputed_at is not null`. It is where a manager acts on an appeal, and Phase 5 fills it.

- [ ] **Step 1: Extract the CSV helper**

`lib/csv.ts` with `toCsv` and `downloadCsv`, moved verbatim from the strata reports screen. Update that screen to import them. No behaviour change — verify its exports still produce identical output.

- [ ] **Step 2: Rewrite the screen**

- [ ] **Step 3: Verify in the running app**

`pnpm dev`, sign in as a manager, and for each remaining control confirm the row moves, an event row appears, and the resident gets a notification. Confirm no control calls `toast()` in place of a mutation:

```bash
grep -nE "onClick=\{\(\) => toast" components/screens/manager/violations-screen.tsx
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/screens/manager/violations-screen.tsx components/screens/strata/reports-screen.tsx lib/csv.ts
git commit -m "Ten buttons that do what they say"
```

---

## Phase 2 done when

1. `pnpm test` and `pnpm build` pass.
2. `grep -nE "onClick=\{\(\) => toast" components/screens/manager/violations-screen.tsx` returns nothing.
3. Every stage change in the database has a matching `violation_events` row — no orphans.
4. A direct `update violations set stage = …` raises, for a manager and for an admin.
5. Illegal transitions are rejected by Postgres, not merely hidden by the UI.
6. A resident whose violation advances receives a notification; a case with no resident advances without one.
7. Tab counts equal the lengths of the lists beneath them.
