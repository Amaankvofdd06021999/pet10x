# Phase 5 — The resident's side of enforcement, and the dispute

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A resident can see every case opened against them — the type, the rung it sits on, the dated history of what a manager did and why, and any fine with its amount, due date and status — and can **dispute** one. The manager sees the appeal, reads the reason, and upholds or overturns it. Overturning dismisses the case and waives the money.

**Architecture:** Phase 2 built the half this depends on. `violation_stage_v2` is enforced by `manager_advance_violation` and a `BEFORE UPDATE` trigger that refuses any other stage write; `violation_events` is append-only with no client write policy; `fines` admits a client UPDATE of `status` and nothing else. `violations_select`, `vevents_select` and `fines_select` **already** admit `resident_id = auth.uid()` — so this phase's reads need no new RLS at all, and nothing has ever queried them. What is missing is the dispute record itself, two RPCs, and a resident-facing screen. There is no payment surface anywhere in this phase (AD-8).

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Supabase Postgres 17, `sonner`, `lucide-react`, pnpm 9 via corepack.

**Spec:** [`docs/superpowers/specs/2026-08-21-completing-manager-resident-flows-design.md`](../specs/2026-08-21-completing-manager-resident-flows-design.md) — AD-7, AD-8, Migration E, and the two `dispute_*` rows of the RBAC matrix.

---

## Global Constraints

- **pnpm needs `PATH="$HOME/.corepack-bin:$PATH"`** (9.15.9). No Supabase CLI, no Docker — migrations via MCP `apply_migration`, assertions via `execute_sql`. Project `Pet10x`, ref `ekgejmxgnlmdomkpblki`.
- **`pnpm lint` has never worked here.** Measured 2026-08-23: `sh: eslint: command not found`. It is not a gate. `pnpm test`, `pnpm build` and `npx tsc --noEmit` are.
- **vitest is `environment: "node"` with no jsdom** (`vitest.config.ts`). Only pure logic is unit-testable. Nothing that touches a component, a hook or a Supabase client can be tested here — which is why the ladder mirror lives in `lib/data/violations.ts` apart from `manager-queues.ts`, and why this phase's dispute rules go in `lib/data/disputes.ts` for the same reason.
- **Three defects this project shipped past a clean `tsc`, a clean `pnpm build` and a green suite were caught only by opening the page.** Every task that touches a `.tsx` file ends in the browser, signed in as a named actor, with the effect confirmed in SQL. That step is not optional and is not satisfied by a screenshot of a build log.
- **The design document is not the schema.** Every column, table, RPC signature, enum value and policy named below was verified against `supabase/migrations/` and the live database on 2026-08-23. See "What the spec says that the database does not" before writing any SQL. Where you find a further disagreement, **the schema wins and you record it** — do not adjust the database to match a document.
- **`SECURITY DEFINER` bypasses RLS**, so every definer function re-checks scope by hand, before it reads anything it would leak, and returns a structured `{ok:false, error}` rather than raising. This is the convention `manager_advance_violation` and `manager_remind_fine` already follow.
- **Positive grammar, never a denylist.** State the stages a dispute may be filed against, the statuses a fine may be moved between, the columns a row may differ in. A value added to an enum next year must be excluded until somebody decides it belongs — `manager_remind_fine`'s treatment of `fine_status` (`= 'issued'`, not `<> 'paid'`) is the pattern.
- **Every new foreign key states its `on delete` action and why.** A referential cascade is not subject to RLS: Phase 2 measured an admin erasing a building's entire enforcement history through a live UI button because `violations_building_id_fkey` is `ON DELETE CASCADE` and the cascade ran as the constraint owner. Reachability arguments about cascades cannot be settled by reading policies.
- **Never edit an applied migration.** Where an existing function must change, ship a new file with `create or replace` (or an explicit `drop function` + `create` + re-`grant` where the signature changes), and re-apply it. Phase 2's lesson: editing the file is half the job — the database still holds the old body until you re-apply.
- **Re-run before quoting.** Ten controller errors in Phase 2 came from numbers recalled from an earlier query. Every id, count and distribution in this plan is dated 2026-08-23; re-derive it yourself before you rely on it, and if it differs, stop and report rather than adjusting the work to fit.

---

## What the spec says that the database does not

Verified against the live database, 2026-08-23. Each row is a place where following the spec literally would produce a broken migration or a false claim.

| Spec says | Live schema | This plan does |
| --- | --- | --- |
| Migration E: `alter table violations add column disputed_at, dispute_reason, dispute_stage` (`:375`) | **None of the three columns exists.** `violations` has 13 columns and none is dispute-related. This was never applied; Phase 2's Task 4 lost a task to a brief that quoted it as fact. | **Does not add them.** Task 1 creates `violation_disputes` instead — see "The dispute-schema decision" below. |
| Migration E: `create type dispute_outcome as enum ('upheld','overturned')` | Does not exist. | Creates it in Task 1. Verified absent: `pg_type` has no `dispute_outcome`. |
| Migration F: `dispute_violation`, `manager_resolve_dispute` | Neither exists. `pg_proc` in `public` holds exactly `escalate_incident_to_violation`, `manager_advance_violation`, `manager_remind_fine`, and the two trigger functions. | Creates both, in Tasks 2 and 3. |
| AD-7: "the columns are cleared for the next degree" | There are no columns to clear. | Not applicable. A dispute row is never cleared; the uniqueness of `(violation_id, stage)` is what makes "once per degree" true, and the decided row stays as history. |
| AD-7: "Overturning dismisses the violation and waives any fine attached to the disputed degree" | `dismissed` is legal from `open`, `warning`, `fine_1` and `fine_2` — all four probed live in Phase 2. `waived` is a real `fine_status` label. | Both outcomes are moves the ladder already permits. **No ladder change is needed and none is planned.** |
| AD-5: fine schedule "edited in the Bylaws editor" | `components/screens/strata/bylaws-editor.tsx` holds only the boolean toggles. **Nothing anywhere writes `fine_1_cents` or `fine_2_cents`**, and 0 of 6 buildings have either key. Phase 2 put the amount override on the manager's Violations screen instead. | Not this phase's defect to fix, and recorded so it is not rediscovered. It **does** change one decision here: see the dispute window, below. |
| RBAC matrix `:475`: "Dispute a violation — super-admin ✅" | — | **Deliberately diverged.** `dispute_violation` authorises on `resident_id = auth.uid()` and nothing else. A dispute is a first-person statement; an admin filing one puts words in a resident's mouth, and the ✅ is the blanket admin column that produced Phase 2's over-grant findings. Admin keeps the read and keeps `manager_resolve_dispute`. Task 7 amends the matrix row and says why. |
| `manager_advance_violation` / `manager_remind_fine` comments: "the resident app has no violation screen, so a pet bylaw matter opens on the pet" | True until this phase. | Task 3 retargets both to the screen Task 5 builds. |

Two further facts that shape the work:

1. **`fines.status = 'disputed'` is a value the client cannot reach.** `fines` has one write policy, `fines_manager_update` (`manages_building or is_admin`), and `trg_fines_settle_only` restricts any client UPDATE to `status`. A resident has no write path to `fines` at all. So the value that Phase 2 derived the `disputed` signal from could only ever have been set by a seed or by `service_role`. Exactly one live row carries it.
2. **A resident cannot read their manager's profile, and cannot read the originating incident.** `profiles_select` admits `id = auth.uid() or is_admin() or exists(resident_links rl where rl.profile_id = profiles.id and manages_building(rl.building_id))` — the last clause evaluates `manages_building` **as the caller**, so it is false for a resident. `incidents_select` admits `manages_building or is_admin or reporter_id = auth.uid()`, and the subject of a violation is the pet's owner, not the reporter (AD-11). Embedding `actor:profiles` on an event, or `incident_reports` on a case, returns silent nulls rather than an error. Task 5 must not embed either. This is deliberate, not a limitation to work around — see "What the resident sees".

---

## The dispute-schema decision

**AD-7's three columns on `violations` are not built. A `violation_disputes` table is built instead.** The reasoning, since this overrides the spec:

- **"A resident disputes a specific degree once" is a uniqueness constraint, and three nullable columns cannot express it.** Once `disputed_at` is cleared for the next degree, "has this degree already been disputed?" is answerable only by matching strings in `violation_events.note`. A table with `unique (violation_id, stage)` makes the rule the database's, not a convention.
- **The three columns are only meaningful together.** `disputed_at` set with `dispute_stage` null is a corrupt row that nothing prevents. On a table, one CHECK makes the decision atomic — outcome, decider and timestamp arrive together or not at all.
- **AD-7's own requirement that the history survive is what the columns cannot do.** It resolves this by putting the outcome in `violation_events`, which means the filing and its decision live in two places joined by prose. A dispute row holds both.
- **The write surface is identical either way.** `violation_disputes` gets **no client INSERT, UPDATE or DELETE policy at all** — the same shape Phase 2 landed on for `violation_events` after four review rounds. The two RPCs are the only writers. Structurally this is no weaker than columns on a table whose stage is already trigger-guarded.

**Cost, stated plainly:** the open-dispute signal becomes an embedded read (`disputes:violation_disputes(...)`) rather than a column test. The manager's query already embeds `fines`, so this is one more embed on a query that has one, not a new round trip.

**How the two signals compose, and what is retired.** Today `manager-queues.ts:388` derives `disputed` from `fines.some(f => f.status === 'disputed')`. After this phase:

- `violation_disputes` with `outcome is null` is **the** dispute signal. It is the only input to `tabFor`'s third argument, and it is the only thing the resident screen and the manager's Disputed tab read.
- `fines.status = 'disputed'` becomes a **consequence** written by `dispute_violation`, never an input. It exists so the money stays truthful: `manager_remind_fine` already refuses to chase anything but `status = 'issued'`, and `lib/data/portfolio.ts:150` already counts `disputed` as outstanding. Both keep working with no edit.
- The derivation is **retired**, not composed. Two sources feeding one boolean is how a warning-stage dispute — which has no fine row to carry the flag — became inexpressible in the first place. The migration backfills the one live `disputed` fine so the two agree at the moment of the change, and Task 1 asserts the invariant in both directions.

---

## What the resident sees, and what they do not

Phase 0 found `emergency_directory` returning medical data it documented itself as withholding. So this is decided here rather than left to the implementer's judgement at the keyboard.

**Shown:** the violation type, the stage and its label, the date opened, the pet named in the case (the resident owns it; `pets_select` admits `owner_id = auth.uid()`), the full `violation_events` ledger oldest-first with each row's date, its `from → to` stages and **the manager's note**, every `fines` row's amount, currency, due date and status, and the resident's own dispute with its outcome.

**Not shown, and no policy is written to make it visible:** the reporter's identity, the incident's free-text description, `evidence_paths` or any `guest-evidence` object, the reporting unit, the `audit_log`, the deciding manager's name, and any row belonging to another resident. A strata notice tells you what you are alleged to have done and what it costs. It does not hand you your neighbour's name and their photographs — that is a retaliation vector, and it is the reason complaints go to the strata rather than to the neighbour.

The manager's note **is** shown, because it is the reason the resident is being asked to accept or contest a finding, and a dispute against an unstated reason is not a dispute. Managers must be told this: Task 6 puts one line on the note field saying the resident reads it.

**"RLS is the floor, the query is the filter."** Every resident read carries `.eq("resident_id", user.id)` explicitly. Never rely on `violations_select` to narrow an unfiltered select.

---

## What a resident may dispute, and when

**Disputable stages: `warning`, `fine_1`, `fine_2`. Written as a positive grammar (`DISPUTABLE_STAGES`), not as "everything except".**

- `open` is not a finding against anyone — it is "we are looking into it", and 1 of the 13 live cases at `open` has no `resident_id` at all. There is nothing yet to contest.
- `resolved` and `dismissed` are terminal, and `dismissed` is already the outcome a dispute seeks.
- The backfilled legacy row (below) sits at `open`, which is why this rule lives in `dispute_violation` and **not** in a CHECK constraint: a CHECK cannot be conditional on a row's age, and the choice is between recording the truth about a legacy row and weakening the rule for new ones. The RPC is the only writer, so the enforcement point is the same.

**Window: 14 days from the event that entered the current stage.** Anchor is `coalesce(max(violation_events.created_at where to_stage = v.stage), v.created_at)`. Verified: all four live cases at a disputable stage have such an event (all four dated 2026-08-23 09:09:10 UTC, from the ladder migration), so this is exercisable against live data today; the `coalesce` covers a row whose stage predates any event.

**14 is a constant in the RPC, not a `buildings.pet_rules` key.** This reverses the obvious reading of AD-5's pattern, on measured evidence: `fine_1_cents` and `fine_2_cents` are a `pet_rules` convention with **no writer anywhere in the codebase** and 0 of 6 buildings carrying them. Adding a third unwritable key would repeat a defect this project has already shipped. A per-building window ships the day its editor does. The client mirrors the constant in `lib/data/disputes.ts` and Task 4 asserts the mirror against the deployed `prosrc`, the method Phase 2's Task 4 review used on `LEGAL_TRANSITIONS`.

**When the window has closed the control is replaced, not hidden** — by a sentence naming the date it closed and pointing at the strata. A control that vanishes lies about ever having existed.

## What the manager does

| Outcome | Stage | Fines | Ledger | Notification |
| --- | --- | --- | --- | --- |
| **Uphold** | unchanged | `disputed` → `issued` (so reminders resume) | one self-transition row, `from = to = current stage`, note `Dispute upheld: …` | one, from `manager_resolve_dispute` |
| **Overturn** | → `dismissed` via `manager_advance_violation` | `disputed` → `waived` | the `X → dismissed` row that RPC already writes | one, from `manager_resolve_dispute` |

Both are moves `LEGAL_TRANSITIONS` already permits — `dismissed` is legal from all four non-terminal rungs and uphold moves nothing. **No ladder change.**

**A dispute writes `violation_events`. Decided, having argued both sides.** Against: `to_stage` is `NOT NULL` and a dispute is not a stage change, so filing and upholding both produce self-transitions. For: "the paper trail is the product", a dispute is the single most tribunal-relevant thing a resident does, and AD-7 already requires the outcome in the ledger — recording the decision but not the filing yields "dispute upheld" with no record of when it was raised, which is precisely what a tribunal asks about. The objection is answered by the schema: a self-transition is already representable and already present (the `warning → warning` row from the verbal/written collapse), and Phase 2 deliberately added **no** validating constraint to keep it legal. Note the contrast with `manager_remind_fine`, which correctly writes no event — a reminder is communication about a case, a dispute is a party to the case making a formal statement in it.

---

## Task 1: The dispute record

**Files:**
- Create: `supabase/migrations/20260824000000_violation_disputes.sql`

**Interfaces:**
- Produces: type `dispute_outcome as enum ('upheld','overturned')`; table `public.violation_disputes`; policy `vdisputes_select`.

```sql
create type public.dispute_outcome as enum ('upheld','overturned');

create table public.violation_disputes (
  id           uuid primary key default gen_random_uuid(),
  violation_id uuid not null references public.violations(id) on delete restrict,
  stage        public.violation_stage_v2 not null,
  filed_by     uuid not null references public.profiles(id),
  reason       text not null,
  filed_at     timestamptz not null default now(),
  outcome      public.dispute_outcome,
  decided_by   uuid references public.profiles(id),
  decided_note text,
  decided_at   timestamptz,
  constraint violation_disputes_one_per_degree unique (violation_id, stage),
  constraint violation_disputes_decision_whole check (
    (outcome is null and decided_at is null and decided_by is null)
    or (outcome is not null and decided_at is not null and decided_by is not null)
  )
);
```

**Every foreign key, and why.**

- `violation_id → violations(id) **on delete restrict**`. Same standard `violation_events_violation_id_fkey` was raised to in Phase 2, for the same measured reason: `violations_building_id_fkey` is `ON DELETE CASCADE`, `buildings_admin_all` is `FOR ALL USING is_admin()`, `lib/data/admin.ts:145` `deleteBuilding()` is a live admin button, and **an RI cascade runs as the constraint owner and is not subject to RLS**. `NO ACTION` would be equivalent here in effect but `RESTRICT` is what the sibling table says; matching it means one sentence describes both. Erasure stays possible in two deliberate statements, which is the right friction for an evidentiary record.
- `filed_by → profiles(id)`, **`no action`** (the default, stated). A person cannot be deleted while a dispute they filed is on record — the same guarantee `violation_events_actor_id_fkey` gives.
- `decided_by → profiles(id)`, **`no action`**, same reason.

RLS mirrors `vevents_select` exactly — read for the case's managers, admins, and the resident the case is about — and there is **no INSERT, UPDATE or DELETE policy**:

```sql
alter table public.violation_disputes enable row level security;

create policy vdisputes_select on public.violation_disputes
  for select using (exists (
    select 1 from public.violations v
    where v.id = violation_id
      and (public.manages_building(v.building_id) or public.is_admin()
           or v.resident_id = auth.uid())
  ));
```

Add a partial index for the open-dispute lookup: `create index violation_disputes_open_idx on public.violation_disputes (violation_id) where outcome is null;`

- [ ] **Step 1: Assert the starting state**

```sql
select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
 where n.nspname='public' and t.typname='dispute_outcome';
select count(*) from information_schema.tables
 where table_schema='public' and table_name='violation_disputes';
select count(*) from information_schema.columns
 where table_schema='public' and table_name='violations' and column_name like 'dispute%';
select v.id, v.stage, v.resident_id, f.id as fine_id, f.status, f.created_at
  from public.violations v join public.fines f on f.violation_id = v.id
 where f.status = 'disputed';
```

Expected: 0, 0, 0 — and **exactly one** disputed fine. Recorded 2026-08-23 as violation `35000000-0000-4000-8000-000000000007` (The Wellington, stage `open`, resident `a5000000-0000-4000-8000-000000000020`, 20000¢). **Re-derive it from this query; do not paste that id.** If the count is not 1, stop and report.

- [ ] **Step 2: Write the migration, including the backfill**

Backfill one open dispute row per disputed fine found in Step 1, driven by that query rather than by a literal id:

```sql
insert into public.violation_disputes (violation_id, stage, filed_by, reason, filed_at)
select v.id, v.stage, v.resident_id,
       'Recorded from the fine''s disputed status, which predates this table. '
       'The reason as originally given was not captured.',
       min(f.created_at)
  from public.violations v join public.fines f on f.violation_id = v.id
 where f.status = 'disputed' and v.resident_id is not null
 group by v.id, v.stage, v.resident_id;
```

The reason text says what is and is not known. Inventing a plausible complaint would be fabricating evidence in an evidentiary record. Note this row's `stage` is `open`, which `dispute_violation` will refuse for new filings — that is why the rule is not a CHECK, and the migration says so in a comment.

- [ ] **Step 3: Apply**

`apply_migration`, name `violation_disputes`.

- [ ] **Step 4: Verify — the six-actor read matrix**

Every probe inside `begin; … rollback;`, each actor impersonated with `set local role authenticated` plus `set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'` (and `set local role anon` with no claims for the last). Re-derive each actor by query; the ids recorded here are dated 2026-08-23.

| Actor | Example | Must see |
| --- | --- | --- |
| The resident the case is about | `a5000000-…-0020` (The Wellington) | the backfilled row |
| A **different** resident, same building | any approved resident of `b5000000-…-0004` who is not `…0020` | 0 rows |
| A manager of the building | `a5000000-…-0001` (`stratamanager@pet10x.com`) | the row |
| A manager of a **different** building | `3aa088d5-…` (`manager@pet10x.com`, Maple Court Residences only) | 0 rows |
| An admin | `7fcfe000-e3ab-4ca0-9ace-c4c1faaca0d8` | the row |
| `anon` | no claims | 0 rows |

Then prove there is **no write path for anyone holding a JWT**. For each of the six actors, attempt `insert`, `update` and `delete` on `violation_disputes` — expect 0 rows affected or 42501 in all eighteen cells. Include one `UPDATE … FROM` and one unqualified `delete from public.violation_disputes` as the manager and as the admin: Phase 2's ledger hole was an unqualified delete that removed all 13 rows in one statement, and it was found only because someone tried it.

Then the constraints, each in its own rolled-back transaction as the table owner:

- A second row with the same `(violation_id, stage)` → unique violation.
- `outcome = 'upheld'` with `decided_at` null → check violation.
- `delete from public.violations where id = <the backfilled row's violation>` → 23503 naming `violation_disputes_violation_id_fkey`.

Finally the invariant, in both directions:

```sql
-- a disputed fine with no open dispute
select count(*) from public.fines f
 where f.status='disputed'
   and not exists (select 1 from public.violation_disputes d
                    where d.violation_id=f.violation_id and d.outcome is null);
-- an open dispute on a case whose fines are not disputed
select count(*) from public.violation_disputes d
 where d.outcome is null
   and exists (select 1 from public.fines f where f.violation_id=d.violation_id)
   and not exists (select 1 from public.fines f
                    where f.violation_id=d.violation_id and f.status='disputed');
```

Both must be 0. Confirm counts unchanged: violations 13, violation_events 13, fines 4 totalling 70000¢.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260824000000_violation_disputes.sql
git commit -m "A dispute is a row with a decision, not three nullable columns"
```

---

## Task 2: The resident files one

**Files:**
- Create: `supabase/migrations/20260824000001_dispute_violation.sql`

**Interfaces:**
- Produces: `dispute_violation(p_violation uuid, p_reason text) returns jsonb`, `SECURITY DEFINER`, `set search_path = public, pg_temp`. Returns `{ok:true, dispute_id, stage, fines_marked, managers_notified}` or `{ok:false, error}`.

Grant it exactly as `manager_advance_violation` is granted — `authenticated` and `service_role`, **not `anon`**. Verify with `select proacl from pg_proc where proname='dispute_violation'` and compare against `manager_advance_violation`'s, which reads `postgres=X | authenticated=X | service_role=X`.

**Authorised when, stated positively.** All of these hold, or the call is refused:

1. `v.resident_id = auth.uid()`. **No manager branch and no `is_admin()` branch** — see the RBAC divergence above.
2. `v.stage = any (array['warning','fine_1','fine_2']::public.violation_stage_v2[])`.
3. No row exists in `violation_disputes` for `(v.id, v.stage)`.
4. No row exists in `violation_disputes` for `v.id` with `outcome is null`.
5. `now() <= coalesce((select max(e.created_at) from public.violation_events e where e.violation_id = v.id and e.to_stage = v.stage), v.created_at) + interval '14 days'`.
6. `btrim(p_reason)` is non-empty and at most 2000 characters.

Error codes, one per failed condition: `not_found`, `forbidden`, `stage_not_disputable`, `already_disputed`, `dispute_open`, `window_closed`, `reason_required`, `reason_too_long`. Existence is checked before scope, matching `manager_advance_violation` and `escalate_incident_to_violation` — consistent with the codebase, and the leak is existence only.

**Writes, in one transaction, in this order.** Take `select … from public.violations where id = p_violation for update` first, exactly as `manager_advance_violation` does: two taps on a slow connection must not produce two disputes, and the unique constraint is the backstop rather than the plan.

1. `violation_disputes` row: `stage = v.stage`, `filed_by = auth.uid()`, `reason = btrim(p_reason)`.
2. One `violation_events` row: `from_stage = to_stage = v.stage`, `note = 'Dispute filed: ' || btrim(p_reason)`, `actor_id = auth.uid()`, `occurred_on = current_date`.
3. `update public.fines set status = 'disputed' where violation_id = v.id and status = 'issued'`. **`issued` only** — the one status that means "outstanding and uncontested". `partially_paid` is left alone: money already part-settled is not something this phase models an appeal over, and naming the one allowed source status means a `fine_status` label added later is excluded until somebody decides it belongs. This is a `status`-only change, which is exactly what `trg_fines_settle_only` permits — the trigger fires for definer functions too, so any attempt to touch another column here raises 42501.
4. One notification per manager, following `request_building_link`'s pattern verbatim (`20260801000003:53-66`): `insert … select bm.profile_id, 'building', 'warning', … from public.building_managers bm where bm.building_id = v.building_id`. `action_target = 'violations'`. **No managers is a valid state, not an error.**
5. One `audit_log` row: `action = 'dispute_violation'`, `entity_type = 'violation'`, `entity_id = v.id`, `building_id = v.building_id`, `metadata` carrying the stage and the dispute id.

The notification body must not quote the resident's reason. It says a case is under appeal and to open Violations. Reason text is resident-authored and lands in a manager's alert list; the case detail is where it is read, in context.

- [ ] **Step 1: Write the failing assertions**

```sql
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='dispute_violation';
select count(*) from public.violation_disputes;
select count(*) from public.violation_events;
select count(*) from public.notifications;
```

Expected: function 0. Record the other three; they are the deltas Step 3 checks against.

- [ ] **Step 2: Write the migration**

- [ ] **Step 3: Apply, then verify against every rule**

All inside rolled-back transactions. The subject case is a live one at a disputable stage — as of 2026-08-23, `35000000-…-0002` (Cedar Grove, `warning`, resident `a5000000-…-0013` / `emma.rossi@pet10x.com`, one fine at `issued:15000`). Re-derive it.

**The happy path.** As the resident: `ok:true`, exactly **one** new `violation_disputes` row, **one** new `violation_events` row whose `from_stage = to_stage = 'warning'`, the fine now `disputed`, **one** notification per manager of Cedar Grove (there are two; assert 2, not "some"), and one `audit_log` row. Assert the deltas numerically against Step 1's counts.

**The six-actor authorisation matrix**, each call followed by a delta check showing **zero** rows written to `violation_disputes`, `violation_events`, `fines`, `notifications` **and** `audit_log`:

| Actor | Expected |
| --- | --- |
| The resident themself | `ok:true` |
| A **different** resident of the same building | `forbidden` |
| A resident of a **different** building | `forbidden` |
| A manager of the building | `forbidden` |
| A manager of a **different** building | `forbidden` |
| The admin | `forbidden` |
| `anon` | cannot execute the function at all (no grant) |

**Every refusal path, each with a zero-delta check:**

- A case at `open` → `stage_not_disputable`. Use `35000000-…-0001`.
- A case at `resolved` → `stage_not_disputable`.
- A second dispute at the same stage → `already_disputed`.
- A dispute filed while another is open at a different stage → `dispute_open`. Construct by advancing the case inside the same transaction.
- A case whose anchor event is older than 14 days → `window_closed`. Construct by back-dating the anchor event's `created_at` inside the transaction.
- `p_reason` of `''`, `'   '` and `null` → `reason_required`. Phase 2's fix round found a null argument raising 23502 where it should have returned a structured error; check all three, and confirm nothing raises.
- A 2001-character reason → `reason_too_long`.
- A fabricated uuid → `not_found`.

**Atomicity, proven by breaking it** — the method Phase 2's Task 2 review used and the property that actually matters. Inside a rolled-back transaction add `alter table public.notifications add constraint tmp_fail check (false) not valid;` then run a legal dispute, and confirm the `violation_disputes` row, the `violation_events` row **and** the fine's status change all rolled back with it. A dispute must never be recorded without the record of why.

**The trigger interaction.** Confirm the `fines` update is permitted (status-only) and that a hand-written variant touching `amount_cents` alongside it raises 42501 — bundling must not smuggle.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260824000001_dispute_violation.sql
git commit -m "Let a resident say the finding is wrong"
```

---

## Task 3: The manager decides, and the ladder learns about appeals

**Files:**
- Create: `supabase/migrations/20260824000002_manager_resolve_dispute.sql`

This file does three things, and they must land together because the second is what makes the first safe.

**A. `manager_resolve_dispute(p_violation uuid, p_outcome public.dispute_outcome, p_note text default null) returns jsonb`**

`SECURITY DEFINER`, `set search_path = public, pg_temp`, granted `authenticated` + `service_role` only. Returns `{ok:true, outcome, stage, fines_waived|fines_restored, notified}` or `{ok:false, error}` from `not_found`, `forbidden`, `no_open_dispute`, `note_too_long`.

Authorised on `manages_building(v.building_id) or is_admin()`, checked by hand before anything is read, after the existence check. `select … for update` on the violation first.

Order of writes matters and is not negotiable:

1. Stamp the dispute: `outcome`, `decided_by = auth.uid()`, `decided_at = now()`, `decided_note = nullif(btrim(coalesce(p_note,'')),'')`. **This happens before anything else**, because step B below makes `manager_advance_violation` refuse to move a case with an open dispute — and the overturn path calls it.
2. Fines:
   - `upheld` → `update public.fines set status = 'issued' where violation_id = v.id and status = 'disputed'`. The fine stands and becomes chaseable again, so `manager_remind_fine` resumes working. This is exactly the inverse of Task 2's step 3, which is why that step only ever touches `issued` — the round trip is lossless.
   - `overturned` → `… set status = 'waived' where violation_id = v.id and status = 'disputed'`. AD-7: overturning waives the fine attached to the disputed degree.
3. Stage and ledger:
   - `upheld` → the case does not move. Write one `violation_events` row, `from_stage = to_stage = v.stage`, note `'Dispute upheld: ' || coalesce(note, 'no reason given')`.
   - `overturned` → call `public.manager_advance_violation(p_violation => p_violation, p_to_stage => 'dismissed', p_note => 'Dispute overturned: ' || …, p_notify => false)`. That function writes the `X → dismissed` event, sets `resolved_at` and `resolution_outcome`, mints the stage-change token the trigger requires, and writes its own audit row. **Do not reimplement any of it here.** `auth.uid()` is unchanged across a nested definer call, so its own scope check passes for the same caller.
   - If that nested call returns `ok:false`, **`raise exception`** rather than returning a structured error. The dispute is already stamped at that point; returning would commit a closed dispute on a case that was never dismissed. This is an assertion about an invariant the preconditions already guarantee (a disputable stage is by construction non-terminal, and `dismissed` is legal from all four), not a user-facing error path. Say so in a comment.
4. One notification to `v.resident_id`, `kind = 'building'`, severity `warning` for `upheld` and `success` for `overturned`, `action_target` per D below. Exactly one, in both branches — which is what `p_notify => false` buys.
5. One `audit_log` row, `action = 'manager_resolve_dispute'`.

**B. `manager_advance_violation` gains `p_notify` and refuses to move a disputed case**

Two changes to one function, shipped as `drop function public.manager_advance_violation(uuid, public.violation_stage_v2, text, integer, date);` then a full `create` of the six-argument form, then re-`grant execute` to `authenticated` and `service_role` and re-`comment on`. A `create or replace` cannot add a parameter — it would leave a five-argument overload behind, which is exactly the stale-overload defect Phase 0 was written to remove.

- New final parameter `p_notify boolean default true`. The notification block becomes conditional on it. Every existing caller passes arguments by name (`lib/data/manager-queues.ts:566-575`) and is unaffected.
- After the scope check and before the transition check: if an open dispute exists on the case, return `{"ok":false,"error":"dispute_open"}`. **A manager must not escalate a case while the resident's appeal is pending** — that is the procedural-fairness failure the ladder exists to prevent, and it is the fact a tribunal looks for first. The only way out of a disputed case is `manager_resolve_dispute`, which stamps the dispute closed before it calls this function. Positive grammar: a disputed case has exactly one legal next action.
- Copy the existing body verbatim from `20260823000002_violations_stage_guard.sql` — the ladder, the `FOR UPDATE`, the null-target `coalesce`, the fine-amount block, the token mint at `:245`, the five writes — and mark each of the three edits in place. Then prove you did: extract the deployed `prosrc` before and after, diff them, and confirm the only differences are the three marked edits. Phase 2's Task 1 review used exactly this check on `escalate_incident_to_violation` and it is what caught a lost scope check.

**C. `manager_advance_violation`'s error surface grows by one code.** `lib/data/manager-queues.ts`'s `advanceError` maps exactly four codes today, and Phase 2's review verified there was no fifth unmapped one. Task 4 adds the fifth; this task's verification records that the mapping is now incomplete until Task 4 lands.

**D. Both notification targets point at the screen that now exists**

`manager_advance_violation:292-296` and `manager_remind_fine:95-98` both compute `v_target` as `'pet-detail:' || pet_id` or `'profile'`, under a comment reading "the resident app has no violation screen". Task 5 builds one. Both become `'my-cases:' || v_vio.id`, matching the existing `screen:id` convention. **Be honest about what this does and does not do:** `components/screens/alerts-screen.tsx:196` still calls `toast(alert.actionLabel)` and navigates nowhere — wiring `action_target` is Phase 9's row of the roadmap. This step writes a correct value for Phase 9 to consume; it does not make the notification navigable, and no step here may claim it does.

- [ ] **Step 1: Write the failing assertions**

```sql
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='manager_resolve_dispute';
select p.proname, pg_get_function_identity_arguments(p.oid), array_to_string(p.proacl,' | ')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='manager_advance_violation';
```

Expected: 0, and exactly one `manager_advance_violation` with five arguments. Save its `prosrc` and its `proacl` for the diff and the grant comparison.

- [ ] **Step 2: Write the migration**

- [ ] **Step 3: Apply, then verify**

`manager_advance_violation` first, since everything else depends on it still working:

- `select count(*) from pg_proc … proname='manager_advance_violation'` is **1**, not 2. No overload survives.
- `proacl` matches what Step 1 saved.
- The saved-vs-deployed `prosrc` diff shows only the three marked edits.
- All 11 legal transitions still succeed and a representative sample of the 25 illegal ones still return `illegal_transition`. A direct `update violations set stage=…` still raises 42501 — the token mechanism must survive the rewrite, and it is the control that would test green while doing nothing if it did not.
- `p_notify => false` writes the event and the fine but **zero** notifications; the default still writes one.
- Advancing a case with an open dispute returns `dispute_open` with zero deltas everywhere. Advancing the same case after the dispute is decided succeeds.

Then `manager_resolve_dispute`, every probe rolled back:

**Uphold.** Stage unchanged, dispute stamped `upheld` with `decided_by` and `decided_at` both set, fine back to `issued`, exactly one new self-transition event, exactly one notification to the resident, one audit row. Then `manager_remind_fine` on the same case succeeds, where before the decision it returned `no_outstanding_fine` — the round trip is what proves the fine really came back.

**Overturn.** Stage now `dismissed`, `resolved_at` and `resolution_outcome` set, dispute stamped `overturned`, fine `waived`, exactly one new event (the `X → dismissed` row — assert **one**, not two: a second would mean the ladder logic was reimplemented), exactly **one** notification (assert 1 — two means `p_notify` is not doing its job), two audit rows (this function's and the nested advance's, which is correct and expected).

**The six-actor matrix**, each with zero deltas across `violation_disputes`, `violations`, `violation_events`, `fines`, `notifications` and `audit_log`:

| Actor | Expected |
| --- | --- |
| A manager of the building | `ok:true` |
| A manager of a **different** building | `forbidden` |
| The admin | `ok:true` |
| The resident the case is about | `forbidden` |
| A **different** resident | `forbidden` |
| `anon` | cannot execute (no grant) |

**Refusals:** a case with no dispute → `no_open_dispute`; a case whose dispute is already decided → `no_open_dispute`; a fabricated uuid → `not_found`; a null `p_outcome` → a structured error, not a 23502 raise.

**Atomicity, proven by breaking it.** Inside a rolled-back transaction, add `check (false) not valid` to `notifications`, run an **overturn**, and confirm the dispute stamp, the fine waiver **and** the stage change all rolled back together. The overturn path spans two functions; this is the one test that proves the transaction spans them too.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260824000002_manager_resolve_dispute.sql
git commit -m "Uphold it or overturn it, and never escalate a case under appeal"
```

---

## Task 4: The data layer

**Files:**
- Create: `lib/data/disputes.ts`, `lib/data/disputes.test.ts`
- Modify: `lib/data/violations.ts` (the `tabFor` doc comment), `lib/data/violations.test.ts`, `lib/data/types.ts`, `lib/data/manager-queues.ts`
- Regenerate: `lib/supabase/database.types.ts`

**Regenerate the types before writing a line of TypeScript** (`mcp__supabase__generate_typescript_types`). Phase 2 recorded that `tsc --noEmit` exits 0 against a stale type file — the type layer lies rather than fails — and that regenerating is **necessary but not sufficient**: three of the five sites broken by the last enum change were invisible to `tsc` both before and after, because `Record<string, X>` keyed on what is really an enum is an opt-out of the type system at exactly the seam where schema meets app. Key every new map on a union type, never on `string`.

- [ ] **Step 1: `lib/data/disputes.ts` — the rules, mirrored once**

Pure functions only; this file must be importable under `environment: "node"`.

```ts
export const DISPUTABLE_STAGES = ["warning", "fine_1", "fine_2"] as const
export const DISPUTE_WINDOW_DAYS = 14
export type DisputeOutcome = Database["public"]["Enums"]["dispute_outcome"]
```

`DisputeOutcome` is a type alias over the generated enum, not two retyped string literals — the same rule `ViolationStage` follows at `types.ts:45`.

Then `isDisputableStage(stage)`, `disputeDeadline(anchorIso)` returning a `Date`, and `canDispute({ stage, anchorIso, hasOpenDispute, alreadyDisputedThisStage, now })` returning a discriminated result — `{ ok: true }` or `{ ok: false, reason: "stage" | "window" | "already" | "open" }` — so the screen renders a sentence per reason rather than a boolean and a guess. Add `describeWhyNot(reason, deadline)` composing that sentence, the same shape as `describeLegalMoves`.

The header comment states, as `violations.ts:24-36` does for the ladder, that the database is the enforcement point and this file exists so the UI does not offer a control the RPC will refuse.

- [ ] **Step 2: Add the dispute to the types and the queries**

`lib/data/types.ts`: a `Dispute` interface (`stage`, `reason`, `filedAt`, `outcome`, `decidedNote`, `decidedAt`) and a `ResidentCase` interface for Task 5. Delete `ResidentViolationSummary` and `Resident` (`types.ts:450`, `:462`) — Phase 2's review recorded them as dead mock shapes with no consumers, and this phase introduces the real ones beside them. Confirm by grep before deleting.

`lib/data/manager-queues.ts`:
- `useViolationsLive` embeds `disputes:violation_disputes ( stage, reason, filed_at, outcome, decided_note, decided_at )` and `:388` becomes `const disputed = disputes.some((d) => d.outcome === null)`. **Delete** the `fines.some(f => f.status === 'disputed')` derivation and its comment; replace the comment with why the fine status is now a consequence rather than a signal.
- `fetchCaseLedger` (`:866`) embeds the same, so the CSV export carries the dispute. A CRT package that omits the appeal is the wrong package.
- `advanceError` gains `dispute_open` → a sentence naming `manager_resolve_dispute` as the way out.
- New mutations: `resolveDispute(id, outcome, note?)` wrapping `manager_resolve_dispute`, with each of its four error codes mapped to a sentence. Same shape as `remindAboutFine` (`:655`), including `transportError(error)` so the RPC's `hint` reaches the manager.

`lib/data/violations.ts`: **only the doc comment on `tabFor` changes.** The signature still takes a boolean, so the blast radius is one paragraph — replace the "`violations.disputed_at` is specified in AD-7 but not yet migrated" sentence with what actually shipped. Do not change the ordering: terminal-before-disputed is a regression fix Phase 2 made and its test at `violations.test.ts:243` guards it.

- [ ] **Step 3: The resident's read**

Add `useMyCases()` to `lib/data/live.ts` (the resident data module). One query against `violations` carrying **`.eq("resident_id", user.id)` explicitly** — RLS is the floor, the query is the filter — embedding `pet:pets(name)`, `fines(amount_cents, currency, status, due_on)`, `violation_events(from_stage, to_stage, note, occurred_on, created_at)` and `disputes:violation_disputes(...)`, ordered by `created_at` descending.

**Embed nothing else.** In particular no `incident_reports` and no `actor:profiles` on the events: RLS denies a resident both, so they return silent nulls rather than an error, and the next hand to "fix" it writes a policy that leaks the reporter's identity. Put that sentence in the code, above the select.

Derive the anchor for `canDispute` from the embedded events — `max(created_at)` where `to_stage` equals the case's stage, falling back to the case's `created_at`.

- [ ] **Step 4: Tests**

`lib/data/disputes.test.ts`:
- `DISPUTABLE_STAGES` is a subset of `VIOLATION_STAGES`, and coverage is asserted **over `VIOLATION_STAGES` itself** so a seventh stage fails by name rather than silently defaulting — the method `violations.test.ts` already uses.
- Every stage not in `DISPUTABLE_STAGES` yields `{ ok: false, reason: "stage" }`.
- Window boundaries: 13 days 23:59 → ok; exactly 14 days → ok; 14 days plus one second → `"window"`.
- Precedence: an already-decided dispute at this stage beats the window; an open dispute at another stage beats both.
- `describeWhyNot` returns a distinct non-empty sentence for each of the four reasons.

Mutation-check the suite the way Phase 2 did: flip `DISPUTE_WINDOW_DAYS` to 15 and confirm tests go red. A test that passes under a changed constant is not testing the constant.

- [ ] **Step 5: Assert the mirror against the deployed function**

The client's `DISPUTE_WINDOW_DAYS` and `DISPUTABLE_STAGES` duplicate rules that live in `dispute_violation`. Read the deployed `prosrc` and confirm both, in both directions — the client offers nothing the database refuses, and hides nothing the database allows:

```sql
select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='dispute_violation';
```

Record the finding in the task report. This is the check that caught the `LEGAL_TRANSITIONS` drift.

- [ ] **Step 6: Verify and commit**

`pnpm test`, `pnpm build` and `npx tsc --noEmit` all clean. Test count goes up; record the before and after.

```bash
git add lib/data/disputes.ts lib/data/disputes.test.ts lib/data/violations.ts lib/data/violations.test.ts lib/data/types.ts lib/data/manager-queues.ts lib/data/live.ts lib/supabase/database.types.ts
git commit -m "One source for what a resident may contest"
```

---

## Task 5: The resident's screen

**Files:**
- Create: `components/screens/resident/my-cases-screen.tsx`
- Modify: `app/app/page.tsx` (route + `CONTENT_MAX`), `components/screens/profile-screen.tsx` (the entry point)

The screen key is `"my-cases"`, matching the `action_target` Task 3 writes.

**Entry point.** `profile-screen.tsx` — the Building section (`:52-58`) gains `{ icon: Scale, label: "Violations & Fines" }` and `handleItem` (`:151`) gains `else if (label.includes("Violations")) onNavigate?.("my-cases")`. Nothing else in that file changes; the remaining "coming soon" rows are Phase 9's and are explicitly out of scope here.

`app/app/page.tsx`: `"my-cases": "max-w-2xl"` in `CONTENT_MAX`, and a branch in the **resident** block (`:196-202`) rendering `<MyCasesScreen onBack={handleBack} />`. It is a resident surface; it does not go in the manager block.

**What the screen renders.** Two groups — live cases (`resolved_at` null) and closed cases — because `manager_advance_violation` sets `resolved_at` for both terminal stages (`20260823000002:249-250`), so that column is the honest split. Per case:

- Type humanised, the stage badge from `STAGE_LABEL`, the date opened, and the pet's name.
- **The ladder position stated in plain words,** not a progress bar. "This is a first warning. The next step, if it is not resolved, is a fine." The four rungs are strictly linear and the database enforces it, so this is a true statement rather than decoration.
- **The history**, oldest first: for each `violation_events` row, its date, `STAGE_LABEL[from] → STAGE_LABEL[to]` (or just the stage for a self-transition, which is what a dispute writes), and the note. A self-transition must not render as "Warning → Warning" — say what happened, from the note.
- **The money**, per fine: amount and currency, due date when `due_on` is non-null, and the status. **No Pay button, no Stripe, no payment link anywhere (AD-8).** State on screen how a fine is actually paid — through the strata, outside the app — so the absence reads as a fact rather than a missing feature.
- **The dispute**, in exactly one of four states: none and disputable (a "Dispute this" button plus the deadline); none and not disputable (`describeWhyNot`'s sentence, in place of the button, never a hidden control); open (filed date and the reason as the resident wrote it, "waiting on the strata"); decided (outcome, decided date, and the manager's note).

**The dispute sheet.** A `Portal`-based sheet matching the amount sheet in `violations-screen.tsx`: a required textarea, a live character count against the 2000-character limit, the stage being disputed named explicitly ("You are disputing the first fine of 2026-08-14"), and a submit that calls the RPC and maps every one of its eight error codes to a sentence. Empty or whitespace-only must be refused client-side **and** the server's `reason_required` still mapped — the client check is a courtesy, not the enforcement.

- [ ] **Step 1: Build the screen**

- [ ] **Step 2: Wire the route and the Profile entry**

- [ ] **Step 3: Verify in the browser — this step is the gate**

`PATH="$HOME/.corepack-bin:$PATH" pnpm dev`. Sign in as `emma.rossi@pet10x.com` (resident of Cedar Grove, subject of `35000000-…-0002` at `warning` with a 15000¢ fine — re-derive). Then:

- Profile → Violations & Fines opens the screen. The case is listed with its stage, its pet, its fine, and its history.
- File a dispute. Confirm in SQL: one `violation_disputes` row, one `violation_events` row, the fine now `disputed`, two manager notifications. Confirm on screen that the state flips to "open" without a reload.
- Confirm the button is now replaced by the open-dispute panel, not merely disabled.
- Sign in as a **different** resident and confirm the case does not appear.
- Sign in as a resident with **no** cases and confirm the empty state is a sentence, not a spinner and not a blank panel.
- Open a case at `open` and confirm the dispute control is absent and its replacement sentence names the reason.

**Then revert every mutation and confirm the counts return to baseline** (violations 13, violation_events 13, fines 4 / 70000¢, `violation_disputes` at its post-backfill count). Record the delta before the revert, as Phase 2's Task 5 did.

Three defects this project shipped past clean gates were found only here — one of them a JSX-eaten space rendering "what a firstfine should cost" in the manager's own UI. Read the rendered text, do not only click the buttons.

- [ ] **Step 4: Commit**

```bash
git add components/screens/resident/my-cases-screen.tsx app/app/page.tsx components/screens/profile-screen.tsx
git commit -m "Show a resident the case against them"
```

---

## Task 6: The Disputed tab decides

**Files:**
- Modify: `components/screens/manager/violations-screen.tsx`

The tab exists and is populated; Phase 2 built it as a live regression fix, not scaffolding. What it says today (`:467-478`) is *"Upholding or cancelling an appeal is not built yet — that arrives in Phase 5."* That sentence is now false, and a plan that leaves a false sentence on screen has not finished.

- [ ] **Step 1: Show the appeal**

Each card on the Disputed tab shows the stage disputed, the filing date, and **the resident's stated reason in full**. A manager deciding an appeal they cannot read is not deciding it. Truncating it behind a "more" control is acceptable; omitting it is not.

- [ ] **Step 2: Two controls, and only two**

**Uphold** and **Overturn**, both through `resolveDispute`, both opening a confirmation with an optional note. Each states its consequence before the press: uphold — "the case stays at *first fine* and the $150.00 becomes payable again"; overturn — "the case is dismissed and the $150.00 is waived". Both are irreversible; say so.

Do not add a per-stage button map. `actionsFor()` reads `LEGAL_TRANSITIONS`, and the whole point of a disputed case is that it has exactly one legal next action — so while a dispute is open, the ladder controls are **replaced** by the two decision controls, not shown alongside them. `manager_advance_violation` now returns `dispute_open` for anything else, so offering those buttons would be offering a move the database refuses. Verify by reading the rendered card, not by reading the code.

- [ ] **Step 3: Replace the Phase 5 copy**

The explainer becomes what is true: a case appears here while its resident has an open appeal; the ladder is paused until it is decided; reminders are withheld while the money is contested.

- [ ] **Step 4: Verify in the browser**

`pnpm dev`, sign in as `stratamanager@pet10x.com` (manages Cedar Grove and four other buildings — re-derive), with a dispute standing from Task 5's verification.

- The Disputed tab count equals the length of the list beneath it.
- The reason text renders in full.
- **Uphold**: stage unchanged, fine back to `issued`, one new event, the resident notified, the case leaves the Disputed tab. Then Send Reminder works on it, where it did not while the dispute was open.
- **Overturn** (on a fresh dispute): the case is dismissed, the fine `waived`, it appears under Resolved, and — the check that matters — **exactly one** notification reached the resident, not two.
- Sign in as `manager@pet10x.com` (Maple Court Residences only) and confirm the disputed Cedar Grove case is not visible at all.
- The gate still passes: `grep -nE "onClick=\{\(\) => toast" components/screens/manager/violations-screen.tsx` returns nothing.
- Revert every mutation; confirm baseline counts.

- [ ] **Step 5: Commit**

```bash
git add components/screens/manager/violations-screen.tsx
git commit -m "Decide the appeal, and stop promising it later"
```

---

## Task 7: Make the record agree

**Files:**
- Modify: `docs/RBAC_CAPABILITIES.md`, `supabase/seed_strata.sql`

- [ ] **Step 1: The capability matrix**

`docs/RBAC_CAPABILITIES.md:84-85` carries both dispute rows marked *(Phase 5)* — forward references to enforcers that did not exist. Drop the marks, and **verify each row by SQL impersonation before you do**, which is what the roadmap's definition of done requires. Amend the "Dispute a violation" row's super-admin column from ✅ to ❌ and add a sentence saying why: a dispute is a first-person statement, and the ✅ was the blanket admin column.

Add one row for the new table's read scope, in the matrix's existing shape:

| Read a dispute | ❌ | ✅ own | ✅ building | ✅ | `vdisputes_select` |

- [ ] **Step 2: The seed**

`supabase/seed_strata.sql:264` seeds the fine at `status='disputed'` that Task 1's backfill turns into a real dispute row. A fresh seed must produce the same shape as production, or the invariant Task 1 asserts fails on a clean database. Add the matching `violation_disputes` insert.

Phase 2 recorded one deliberate seed/production divergence already (a self-transition preserved as history in the live database, collapsed in the seed). If you find another here, record it in the progress ledger rather than silently reconciling it.

- [ ] **Step 3: Verify**

The seed's SQL is syntactically valid and its enum literals all exist: check every stage and status literal against `pg_enum`. Then run Task 1's two invariant queries once more against live data and confirm both are still 0.

- [ ] **Step 4: Commit**

```bash
git add docs/RBAC_CAPABILITIES.md supabase/seed_strata.sql
git commit -m "The matrix says what the database does"
```

---

## Phase 5 done when

1. `pnpm test`, `pnpm build` and `npx tsc --noEmit` all pass. (`pnpm lint` is not a gate — eslint is not installed.)
2. `select count(*) from information_schema.columns where table_schema='public' and table_name='violations' and column_name like 'dispute%'` returns **0** — AD-7's columns were considered and deliberately not built, and the plan's reasoning is recorded above.
3. `violation_disputes` has exactly one policy, a SELECT. For each of the six actors (the resident, a different resident, a manager of the building, a manager of another building, an admin, `anon`), every INSERT, UPDATE and DELETE attempt affects zero rows or raises 42501.
4. `dispute_violation` returns `forbidden` for every principal except the case's own resident — manager, other-building manager and admin included — and writes zero rows across `violation_disputes`, `violation_events`, `fines`, `notifications` and `audit_log` when it does.
5. `dispute_violation` refuses a case at `open`, at `resolved` and at `dismissed`; refuses a second dispute at the same stage; refuses one while another is open; refuses one outside the 14-day window; and refuses a blank or null reason. Every refusal writes nothing.
6. `select count(*) from pg_proc where proname='manager_advance_violation'` returns **1**, with six arguments, and its grants match what it had before.
7. `manager_advance_violation` returns `dispute_open` for every stage move on a case with an open dispute, and succeeds once the dispute is decided. A direct `update violations set stage = …` still raises 42501 for a manager and for an admin.
8. Upholding leaves the stage put, returns the fine to `issued`, and writes exactly one event and one notification. Overturning dismisses the case, waives the fine, and writes exactly **one** notification — verified by count, not by inspection.
9. Both invariant queries return 0: no `disputed` fine without an open dispute, and no open dispute on a fined case whose fines are not `disputed`.
10. Every stage change in the database still has a matching `violation_events` row — no orphans — and a resident's own events, fines and disputes are readable by them and by nobody else outside their building's managers and the admin.
11. The resident screen renders no data from `incident_reports`, no `evidence_paths`, no `audit_log` and no manager identity. `grep -n "incident_reports\|evidence_paths\|actor:profiles\|audit_log" components/screens/resident/my-cases-screen.tsx` returns nothing.
12. No payment control exists anywhere in the phase. `grep -rniE "stripe|pay now|pay fine|checkout" components/screens/resident/` returns nothing, and `fines.stripe_payment_intent_id` is still null on every row.
13. `grep -nE "onClick=\{\(\) => toast" components/screens/manager/violations-screen.tsx` returns nothing, and no screen touched by this phase claims a capability that arrives later.
14. `docs/RBAC_CAPABILITIES.md` carries no *(Phase 5)* marks, and each of its dispute rows was verified by impersonation, allowed and denied.
15. Live counts are back to baseline after every verification: violations 13, violation_events 13, fines 4 totalling 70000¢, plus exactly the rows this phase's migrations added.
