# Phase 6 — Building rules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A building manager writes the building's house rules — the parking rule among them — and a resident opens their account and reads exactly that text. Nothing between the two rewrites it, truncates it or serves a stale copy without saying so. The same phase builds the editor for the **bylaw fine schedule**, which Phase 2's fine issuance depends on and which no surface in the app can currently set.

**Architecture:** Two separate things share one manager surface and one resident surface, and the whole phase turns on not confusing them.

- `buildings.pet_rules` (jsonb) holds *enforceable requirements* — six booleans that feed `computeCompliance`, the resident's missing-info card and every compliance percentage in the manager's portfolio. A machine checks them.
- A new `building_rules` table holds *authored text* — a category, a title, a body, written by a person. Nothing checks it; it is a statement, not a predicate.

AD-9 exists because merging them means a manager typing "no dogs over 25 kg" into a notice silently moves somebody's compliance score. The database keeps them apart, and the screens that show both say which is which.

The fine schedule is the third thing, and it is neither: it lives inside `pet_rules` by AD-5, it is bylaw data, and it is money. It gets its own write path, its own audit record, and a trigger that stops every other surface from moving it by accident.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Supabase Postgres 17, Tailwind 4, `sonner`, `lucide-react`, pnpm 9 via corepack.

**Spec:** [`docs/superpowers/specs/2026-08-21-completing-manager-resident-flows-design.md`](../specs/2026-08-21-completing-manager-resident-flows-design.md) — AD-5, AD-9, Migration H.

## Global Constraints

- **pnpm needs `PATH="$HOME/.corepack-bin:$PATH"`** (9.15.9 — do not upgrade).
- **No Supabase CLI, no Docker.** Migrations apply through the Supabase MCP `apply_migration`; assertions through `execute_sql`. Project `Pet10x`, ref `ekgejmxgnlmdomkpblki`. It is **live production** — every probe that writes is wrapped `begin; … rollback;`.
- **`pnpm lint` has never worked here.** `eslint` is in the script, is not a dependency, and has no config — on `main` too. Do not treat its failure as a regression, and do not add it to any gate.
- **vitest runs `environment: "node"` with no jsdom.** Only pure logic is unit-testable. Anything that renders is verified in a browser, not in a test.
- **The design document is not the schema.** Every column, table, RPC signature, enum value and policy named below was checked against `supabase/migrations/` and the live database on 2026-08-23. Where the spec and the schema disagree, the schema won and the divergence is recorded. If you find a further disagreement, the schema wins again — stop and record it rather than coding to the spec.
- **RLS is the floor, the query is the filter.** Every new read names its building explicitly.
- **Cross-user writes go through `SECURITY DEFINER`,** which re-checks scope by hand and returns a structured error rather than raising. `notifs_insert_own_assistant` admits only `kind = 'assistant'` for self, so a manager cannot notify a resident from the browser at all.
- **Validate with a positive grammar.** State the one shape a value is allowed to take. Never enumerate the shapes it may not.
- **Never edit an applied migration.**
- **Three defects on this project survived a clean `tsc`, a clean `pnpm build` and a green suite** and were caught only by opening the page — one a missing space in JSX, one a control rendered underneath the fixed tab bar. This phase is a rendering phase. The browser pass in Task 8 is a gate, not a formality.

---

## Ground truth, measured 2026-08-23

Read this before writing any SQL. Several things the spec asserts are not true of the live database.

### What exists

| Thing | State |
| --- | --- |
| `buildings.pet_rules` | `jsonb not null default '{}'` — **exists** |
| `buildings.rules` | **does not exist.** `PortfolioBuilding.rules` / `ManagerBuilding.rules` are TypeScript field names for `pet_rules` |
| `building_rules` table | **does not exist** |
| `building_rule_category` enum | **does not exist** |
| `notification_kind` | exists, and `'building'` is a member |
| `notifications` columns | `id, profile_id, kind, severity, title, body, action_label, action_target, building_id, read_at, created_at` |
| `audit_log` columns | `id, actor_id, actor_role, action, entity_type, entity_id, building_id, metadata, ip_hash, created_at` |
| `public.set_updated_at()` | exists — `trg_buildings_updated` uses it. Reuse it |
| `is_resident_of(b uuid)` | approved `resident_links` row **and** `not profiles.is_suspended` |
| `manages_building(b uuid)` | `building_managers` row **and** `not profiles.is_suspended` |
| `is_admin()` | `is_super_admin and not is_suspended` |
| `readFineSchedule` | exists at `lib/data/manager-queues.ts:965`, pure, untested, imported by two screens |

### The fine schedule

**Zero of six buildings carry `fine_1_cents`, `fine_2_cents` or `fine_currency`,** and nothing in the app can write them. So every fine issued today must carry a hand-typed amount, and AD-5's "bylaw default, overridable" behaviour is unreachable. Phase 2 shipped both the reader and the refusal (`no_fine_amount`); this phase ships the writer.

The RPC's accepting grammar is at `supabase/migrations/20260823000001_manager_advance_violation.sql:129-160`, and it is narrow on purpose:

- `v_rules -> (p_to_stage::text || '_cents')` — the key is `fine_1_cents` / `fine_2_cents` exactly.
- `jsonb_typeof(v_bylaw) = 'number'` — a **JSON number**. A string `"25000"`, a boolean, an object or an array is not an amount and is ignored, silently.
- `floor((v_bylaw #>> '{}')::numeric)::integer` — fractional cents are floored.
- `coalesce(v_amount, 0) <= 0` → `no_fine_amount`. Zero and negative are refused, not charged.
- `lower(coalesce(nullif(btrim(v_rules ->> 'fine_currency'), ''), 'CAD'))` — a **string**, folded to lower case to match `fines.currency`.

A schedule the RPC cannot parse is worse than none, because it looks configured. Task 3's writer must be incapable of producing one.

### Divergences from the design document

Record these; do not code to the spec where it disagrees.

1. **`buildings.rules` does not exist.** The brief for this phase, and `bylaws-editor.tsx:45`, both say `building.rules`. That is the TypeScript field. The column is `pet_rules`. Every migration in this phase names `pet_rules`.
2. **Migration H specifies `is_published boolean not null default true`.** This plan uses `default false` — see Decision 4. Saving text and publishing it are two acts; a default of `true` makes the first act perform the second.
3. **Migration H specifies `publish_building_rule(p_rule uuid)` which "flips `is_published`".** This plan takes `(p_rule uuid, p_published boolean default true, p_notify boolean default true)`. A flip is not idempotent: a double-tap publishes then unpublishes, and a manager cannot tell which state they left it in. A button that means "publish" must publish however many times it is pressed.
4. **Migration H specifies "full read and write for `manages_building(...) or is_admin()`".** This plan gives managers select/insert/update and gives **delete to admins only** — see Decision 6.
5. **`docs/RBAC_CAPABILITIES.md:113`** says "Splitting this row into three is Phase 6's job", attached to the footnote about `posts_insert` / community writes. Under the roadmap's numbering that row belongs to Community, which is a later phase, not to building rules. Leave the community rows alone; fix the stray reference in Task 8.
6. **`docs/RBAC_CAPABILITIES.md:89`** marks "Set the fine schedule" as *(Phase 4)*. Phase 2 as executed did not build it. This phase does; the marker moves.

### The security trap Phase 0 recorded

`buildings_manager_update` (`UPDATE`, `manages_building(id)` in both `USING` and `WITH CHECK`) and `buildings_admin_all` (`ALL`, `is_admin()`) are both live. Neither restricts columns. The only triggers on `buildings` are `buildings_normalise_code` and `trg_buildings_updated`. **There is no audit trail on a `buildings` update at all** — `updated_at` moves for any field, so it cannot distinguish a fine-schedule change from a postcode correction.

Read carelessly, that says "the policy is ready, just add the keys". Shipping it that way hands every manager an unrecorded rewrite of what a bylaw offence costs. Phase 2's own reviews caught, on already-reviewed work, a manager writing another building's ledger and a manager rewriting a fine's amount *after* the resident had been notified of a different one. The same class of defect applies to the schedule those amounts default from, and it is worse, because the schedule is what makes two residents' fines comparable — the exact consistency AD-5 exists to protect.

**Decision: rewriting the fine schedule is audited.** It moves behind a `SECURITY DEFINER` RPC that writes `audit_log`, and a trigger stops any other write path from moving it. Task 3.

### Verified: a resident can already read `pet_rules`

`buildings_select` is `is_resident_of(id) or manages_building(id) or is_admin()`. Impersonating `resident1@pet10x.com` returned exactly 1 building and read the full `pet_rules` jsonb including the `quiet_hours` key. So once a fine schedule is written there, **residents can read it.** That is acceptable and arguably correct — a bylaw fine schedule is not a secret from the people it applies to — but it must be a deliberate choice, not a surprise. Do not put anything in `pet_rules` that residents should not see.

### Test fixtures

| Actor | id | Scope |
| --- | --- | --- |
| Manager of the building | `3aa088d5-05f9-49c4-9789-f64538405bba` (`manager@pet10x.com`) | Maple Court **Residences** only |
| Manager of a **different** building | `a5000000-0000-4000-8000-000000000001` (`stratamanager@pet10x.com`) | 5 buildings, **not** Maple Court Residences |
| Resident | `4b37d361-38dc-435c-9958-91f997167590` (`resident1@pet10x.com`) | approved at Maple Court Residences |
| Admin | `7fcfe000-e3ab-4ca0-9ace-c4c1faaca0d8` (`admin.pet10x@gmail.com`) | all |
| anon | no claims | — |

Maple Court Residences is `b41968f8-f45c-4a2b-a644-e94311100faf`, code `MCR2026`, **9 approved residents, none suspended** — so a publish notifies exactly 9.

**Trap:** "Maple Court" (`b5000000-0000-4000-8000-000000000002`, `MPL2026`) is a *different building* from "Maple Court Residences". Never select a fixture by name.

---

## Decisions this plan makes

These were open. They are now closed; do not re-litigate them mid-task.

**1. Rule text is plain text. Not markdown, not structured sections.**

The requirement is that what the manager typed is what the resident reads. A markdown renderer is a rewriter: it eats `#` and `*`, collapses single newlines, and mangles the characters a bylaw legitimately contains (`s. 3(4)`, `*see Schedule B*`, `2 * 25kg`). That is precisely the silent rewrite the phase must not ship. It would also mean a new dependency — the project has **no** markdown or sanitiser package today — and with it an HTML injection surface where there is currently none.

Bodies render as plain text with `white-space: pre-wrap`, so the manager's own paragraphs and line breaks survive exactly, and React escapes everything by construction. Structure comes from the row — category, title, body, order — not from syntax inside the body.

**2. Parking is a category, not a first-class section.**

The user named parking, but the spec already names noise, waste, common areas and pets, and a bespoke parking table would need a sibling the first time someone asks about noise. The closed `building_rule_category` enum gives a resident's screen the same predictable grouping in every building, which a free-text section name cannot. Parking gets no special code path — it gets a fixed position in the category order and a filter chip, so it is one tap away.

What this owes the user in return is proof: Task 8 requires authoring a parking rule as the Maple Court Residences manager and reading that exact text back as `resident1@pet10x.com`, in a browser.

**3. No truncation, no clamp, no "read more".**

A rules card renders its whole body. A collapsed bylaw is a bylaw a resident did not read, and a "show more" link is a truncation with a friendlier name. The screen scrolls; that is what screens do. The only length limit is a check constraint the editor surfaces as a live character counter, so a manager is told *before* saving rather than having text silently dropped after.

**4. Saving is not publishing.**

`is_published` defaults `false`. A manager writes a draft, reads it back, and publishes deliberately. Publishing is the act that notifies residents — that is what makes an update an update rather than a silent edit — so it must be separable from typing. Re-publishing an already-published rule notifies again by default (an amendment *is* an update), but the editor offers a "Notify residents" checkbox so a typo fix does not send nine notifications.

**5. What a resident sees when nothing is authored: an honest empty state, never inherited defaults.**

Inventing platform-default house rules and rendering them as *this building's* rules fabricates a statement nobody made. That is worse than blank.

But the screen is never blank, because it always has real content: the building's name, and the **compliance requirements** derived from `pet_rules` — which are real, already computed, and today reachable by a resident only as a hardcoded toast reading "One dog or one cat · leashed in common areas", the same string for every building on the platform. So the screen has two sections:

- **Requirements Pet10x checks** — the six `pet_rules` booleans, plus `max_weight_kg` and `max_pets_per_unit` where present. Machine-checked, tied to compliance, explicitly labelled as such.
- **House rules from your building manager** — the authored text. When there is none: "Your building manager hasn't published house rules here yet." One sentence, no fake content, and the requirements section above it is still full.

**6. How the two relate on screen: separate sections, different visual weight, and a sentence.**

The requirements section carries the compliance framing ("these affect your pet's compliance status"); the authored section carries the authorship ("published by your building manager on <date>"). They never interleave. A rule body must never be able to render as if it were a checked requirement, and a requirement must never render as if a manager wrote it this week.

Managers may not hard-delete a rule from the app; they unpublish it. A published rule is a statement nine residents were notified of, and making it vanish without a trace is not an edit. `DELETE` is admin-only at the policy level.

**7. What happens to a resident reading the screen while a manager saves.**

Versioning and acknowledgement are out of scope by the roadmap and stay out. Within that:

- The resident screen fetches on mount and refetches on `visibilitychange` when the tab becomes visible. **No realtime subscription, no polling.** Text changing under a reader's eyes mid-sentence is worse for a legal document than being a minute stale.
- Every rule card carries "Updated <relative time>", so a reader can tell how current what they are holding is.
- A publish sends a notification. That is the mechanism that tells a resident to look again, and it is why publish must be a deliberate act (Decision 4).

**8. The fine schedule lives in the bylaws surface, with its own save button.**

It is bylaw data — a manager asking "what does a second offence cost here" looks under Bylaws, and a separate screen would bury it. But it is money, so it is a visually distinct block with its **own** save that calls its **own** RPC. Nobody changes what a fine costs as a side effect of toggling "rabies required".

There are two bylaw surfaces (the strata portal's `BuildingBylawsEditor` and the in-app manager's `BylawsSheet`, which is a near-duplicate carrying its own copy of `RULE_TOGGLES`). The schedule editor is **one component rendered in both**. Building it twice is how this project got the bug that started this work.

---

## Task 1: Migration H — the table

**Files:**
- Create: `supabase/migrations/20260825000000_building_rules.sql`

**Interfaces:**
- Produces: `public.building_rule_category` enum; `public.building_rules` table; five RLS policies.

- [ ] **Step 1: Assert the starting state**

```sql
select
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='building_rules') as tbl,
  (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace
     where n.nspname='public' and t.typname='building_rule_category') as enum_t;
```

Expected: `0, 0`. If either is non-zero, stop and report — something applied out of band.

- [ ] **Step 2: Write the migration**

```sql
create type public.building_rule_category as enum
  ('pets','parking','noise','waste','common_areas','other');

create table public.building_rules (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references public.buildings(id) on delete cascade,
  category     public.building_rule_category not null,
  title        text not null,
  body         text not null,
  is_published boolean not null default false,
  sort_order   integer not null default 0,
  created_by   uuid references public.profiles(id),
  updated_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint building_rules_title_present check (btrim(title) <> ''),
  constraint building_rules_body_present  check (btrim(body)  <> ''),
  constraint building_rules_title_len     check (char_length(title) <= 120),
  constraint building_rules_body_len      check (char_length(body)  <= 8000)
);
```

Notes that are load-bearing:

- `default false` on `is_published` — Decision 4, and a divergence from Migration H. Comment it in the migration.
- The length checks **reject**; they never truncate. 8000 characters is roughly three pages of bylaw text. The editor shows a live counter so the limit is hit in the composer, not at the database.
- `on delete cascade` from `buildings` is right: a deleted building has no rules. `created_by` / `updated_by` are plain references with no cascade — a departed manager must not erase the authorship of a published rule.
- Index: `create index building_rules_building_idx on public.building_rules (building_id, category, sort_order);` — every read is building-scoped and category-grouped.
- `create trigger trg_building_rules_updated before update on public.building_rules for each row execute function public.set_updated_at();` — confirm the function's schema qualification against `pg_get_triggerdef` for `trg_buildings_updated` before assuming `public.`.

RLS, stated as a positive grammar — five policies, each naming who **may**:

```sql
alter table public.building_rules enable row level security;

create policy building_rules_resident_read on public.building_rules
  for select using (is_published and public.is_resident_of(building_id));

create policy building_rules_manager_read on public.building_rules
  for select using (public.manages_building(building_id) or public.is_admin());

create policy building_rules_manager_insert on public.building_rules
  for insert with check (public.manages_building(building_id) or public.is_admin());

create policy building_rules_manager_update on public.building_rules
  for update using (public.manages_building(building_id) or public.is_admin())
          with check (public.manages_building(building_id) or public.is_admin());

create policy building_rules_admin_delete on public.building_rules
  for delete using (public.is_admin());
```

There is deliberately **no** grant of `DELETE` to a manager (Decision 6). The `WITH CHECK` on update is what stops a manager moving a rule to a building they do not manage.

- [ ] **Step 3: Apply**

`apply_migration`, name `building_rules`.

- [ ] **Step 4: Verify by impersonation — all five actors, all inside `begin; … rollback;`**

Seed two rows first (as the service role, inside the transaction): one published and one draft at Maple Court Residences (`b41968f8-…`), plus one published at Maple Court (`b5000000-…0002`).

For each actor, `set local role authenticated` + `set local request.jwt.claims = '{"sub":"<id>","role":"authenticated"}'` (anon: `set local role anon`, no claims), then record `select count(*) from public.building_rules` and the outcome of an insert into each building:

| Actor | Reads | Writes |
| --- | --- | --- |
| Manager of MCR (`3aa088d5…`) | both MCR rows, published **and** draft; **not** the Maple Court row | insert into MCR ✅; insert into Maple Court ❌ |
| Manager of a different building (`a5000000…0001`) | the Maple Court row only | insert into MCR ❌ |
| Resident of MCR (`4b37d361…`) | the published MCR row only — **the draft must not appear** | insert ❌ |
| Admin (`7fcfe000…`) | all three | insert ✅, delete ✅ |
| `anon` | **0 rows** | insert ❌ |

Also assert, as the MCR manager: `update public.building_rules set building_id = 'b5000000-0000-4000-8000-000000000002'` on their own row is **refused** by the `WITH CHECK`, and `delete` on their own row is **refused**.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260825000000_building_rules.sql
git commit -m "A place for what a manager actually wrote"
```

---

## Task 2: The write path, and the guard that makes it the only one

**Files:**
- Create: `supabase/migrations/20260825000001_building_rule_rpcs.sql`

**Interfaces:**
- Produces:
  ```sql
  manager_save_building_rule(
    p_rule uuid, p_building uuid,
    p_category public.building_rule_category,
    p_title text, p_body text,
    p_sort_order integer default null
  ) returns jsonb   -- {ok:true, id, is_published} | {ok:false, error}

  publish_building_rule(
    p_rule uuid,
    p_published boolean default true,
    p_notify boolean default true
  ) returns jsonb   -- {ok:true, published, notified} | {ok:false, error}
  ```
- Produces: trigger `building_rules_publish_guard` on `building_rules` (BEFORE INSERT OR UPDATE).

Both functions are `SECURITY DEFINER`, `set search_path = public, pg_temp`, and **re-check scope by hand** — `manages_building(...) or is_admin()` — returning `{"ok":false,"error":"forbidden"}` rather than raising. They bypass RLS; the policies in Task 1 do not protect them.

**Why `publish_building_rule` must be `SECURITY DEFINER` and cannot be a client update:** `notifs_insert_own_assistant` admits only `kind = 'assistant'` for `profile_id = auth.uid()`. A manager cannot insert a notification for a resident from the browser under any circumstances. The same constraint that forces AD-6 forces this.

**The guard.** `building_rules_manager_update` lets a manager write the table directly, so `is_published` could be flipped with a plain `UPDATE`, publishing a rule with no notification and no audit record. Mirror Phase 2's proven pattern (`20260823000002_violations_stage_guard.sql`): `publish_building_rule` sets a transaction-local flag before its write —

```sql
perform set_config('pet10x.rule_publish', 'ok', true);
```

— and the trigger **raises** unless `current_setting('pet10x.rule_publish', true) = 'ok'` when `is_published` is changing (UPDATE) or is `true` (INSERT). It compares `old.is_published is distinct from new.is_published` on UPDATE and lets every other column through untouched, so `manager_save_building_rule` — which never touches `is_published` — passes without setting the flag.

Raising is correct here, unlike Task 3: no legitimate client path sends `is_published`, so there is no honest write to accommodate.

**Notification.** On a publish with `p_notify`, insert one `notifications` row per approved, non-suspended resident of the building. Re-derive that set by hand rather than calling `is_resident_of` (which answers about `auth.uid()`, not about a set):

```sql
insert into public.notifications (profile_id, kind, severity, title, body, action_target, building_id)
select rl.profile_id, 'building', 'info',
       'Building rules updated',
       v_rule.title,
       'building-rules',
       v_rule.building_id
  from public.resident_links rl
  join public.profiles p on p.id = rl.profile_id
 where rl.building_id = v_rule.building_id
   and rl.status = 'approved'
   and not p.is_suspended;
```

**`action_label` is left null, deliberately.** `components/screens/alerts-screen.tsx:196` currently renders any `action_label` as a button whose `onClick` is `toast.success(...)` — a control that cannot act. Phase 3 Task 1 wires that button to `action_target`. Setting a label now would ship a tenth dead button; setting the *target* now is correct data that Phase 3 will consume. Add `building-rules` to the note in Phase 3's Step 1 target list.

**Audit.** Both functions write `audit_log`: `building_rule.saved` and `building_rule.published`, `entity_type = 'building_rule'`, `entity_id = <rule id>`, `building_id` set, and `metadata` carrying `{category, published, notify_requested, notified}`. Follow the shape at `20260823000001_manager_advance_violation.sql:276-280`.

- [ ] **Step 1: Write the failing assertion**

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'
   and p.proname in ('manager_save_building_rule','publish_building_rule');
```

Expected: no rows.

- [ ] **Step 2: Write the migration**

`manager_save_building_rule` details worth stating:

- `p_rule is null` → insert, `created_by = updated_by = auth.uid()`, `is_published` left at its default, `sort_order = coalesce(p_sort_order, (select coalesce(max(sort_order),-1)+1 from building_rules where building_id = p_building and category = p_category))`.
- `p_rule is not null` → authorise against the **existing row's** `building_id`, and refuse when `p_building` differs from it (`{"ok":false,"error":"building_mismatch"}`). A rule does not move buildings.
- Trim `p_title` and `p_body`; refuse empty with `{"ok":false,"error":"empty"}` before the constraint has to. Do **not** normalise whitespace inside the body — the manager's line breaks are the content.
- Stamp `updated_by = auth.uid()`.

`publish_building_rule` returns `{"ok":false,"error":"not_found"}` for a missing id and `{"ok":false,"error":"forbidden"}` for the wrong building, in that order, without revealing which.

Grant `execute` to `authenticated` on both. Grant to **neither** `anon` nor `public` — and confirm afterwards, because `20260615073613_harden_security.sql` contains seven `revoke … from anon` statements that were measured as no-ops in Phase 0. Assert the grant list directly rather than trusting a revoke.

- [ ] **Step 3: Apply, then verify — all inside `begin; … rollback;`**

- MCR manager saves a new rule → `{ok:true}`, one row, `is_published = false`, **zero** notifications inserted.
- MCR manager publishes it with `p_notify => true` → `{ok:true, published:true, notified:9}`, and `select count(*) from notifications where action_target='building-rules'` is exactly **9**. Confirm all nine `profile_id`s are approved MCR residents and none is the manager.
- Publishing the same rule again → still `ok`, `published:true` (idempotent, not flipped), notifies again.
- Publishing with `p_notify => false` → `{ok:true, notified:0}`, and the rule is published.
- `publish_building_rule(rule, p_published => false)` → unpublished, `notified:0`, and the resident's `select` no longer returns it.
- The **different-building** manager (`a5000000…0001`) calling either function on an MCR rule → `{"ok":false,"error":"forbidden"}`, and `building_rules`, `notifications` and `audit_log` counts are all unchanged.
- The resident (`4b37d361…`) calling either → `forbidden`, nothing written.
- `anon` calling either → the call is refused (no execute grant); record the exact error.
- **The guard:** as the MCR manager, a plain `update public.building_rules set is_published = true where id = <draft>` **raises**. A plain `update … set title = 'x'` still succeeds. A plain `insert … (is_published) values (true)` **raises**; the same insert with `false` succeeds.
- Every successful call left exactly one `audit_log` row naming the actor.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260825000001_building_rule_rpcs.sql
git commit -m "Publishing is an act, and the act leaves a record"
```

---

## Task 3: The fine schedule — a writer, a guard, and an audit trail

**Files:**
- Create: `supabase/migrations/20260825000002_fine_schedule.sql`

**Interfaces:**
- Produces:
  ```sql
  manager_set_fine_schedule(
    p_building uuid,
    p_fine_1_cents integer,
    p_fine_2_cents integer,
    p_currency text default 'CAD'
  ) returns jsonb   -- {ok:true, fine_1_cents, fine_2_cents, currency} | {ok:false, error}
  ```
- Produces: trigger `buildings_fine_schedule_guard` on `buildings` (BEFORE UPDATE).

This is the deliverable Phase 2 discovered and could not build. Without it, AD-5's "bylaw default, overridable" is unreachable and every fine carries a hand-typed amount.

**The writer's grammar — positive, and matched to what `manager_advance_violation` will accept:**

- Each amount is either `null` (meaning "no schedule for this degree", written by *removing* the key) or an integer `between 1 and 1000000` (one cent to ten thousand dollars). Anything else → `{"ok":false,"error":"bad_amount"}`. Zero is not "no schedule" — it is refused, because the RPC would refuse it later anyway and a zero in the jsonb looks like a decision somebody made.
- The amounts are written with `to_jsonb(p_fine_1_cents::integer)`, producing a JSON **number**. This is the single shape `jsonb_typeof(...) = 'number'` accepts. Never write a text cast.
- Currency is folded `upper(btrim(p_currency))` and must match `^[A-Z]{3}$` → else `{"ok":false,"error":"bad_currency"}`. It is stored upper-case; `manager_advance_violation` lower-cases it on read (`:159`), and `readFineSchedule` upper-cases it. Both survive either casing; store one consistently.
- Merge, never replace: `update buildings set pet_rules = (coalesce(pet_rules,'{}') - 'fine_1_cents' - 'fine_2_cents' - 'fine_currency') || v_new`. The compliance toggles in the same jsonb must come out untouched.

`SECURITY DEFINER`, re-checks `manages_building(p_building) or is_admin()` by hand, returns structured errors, writes `audit_log` with action `building.fine_schedule_set`, `entity_type = 'building'`, and `metadata` carrying **both** the previous and the new triple. The previous values are the point: an audit row that records only the new amount cannot answer "was this lowered between the two fines?".

**The guard, and why it restores rather than raises.**

Three surfaces write the whole `pet_rules` object today, and all three have a legitimate reason to:

- `components/screens/strata/bylaws-editor.tsx:53` → `updateMyBuildingRules` (whole object)
- `components/screens/manager/settings-screen.tsx` `BylawsSheet` → the same function
- `components/screens/strata/bylaws-screen.tsx:162` `BulkApply` → applies a **template** that is a whole `pet_rules` snapshot, held in `localStorage`

That third one is a live data-loss hazard the moment a schedule exists: a template saved today contains no fine keys, so applying it later replaces the object and **silently deletes the building's fine schedule**. Every subsequent fine then falls back to hand-typed amounts, with nothing to indicate why.

A raising trigger would turn that into a broken button on three screens. So the trigger **restores** instead: on any `BEFORE UPDATE` where `old.pet_rules is distinct from new.pet_rules` and `current_setting('pet10x.fine_schedule', true)` is not `'ok'`, it strips the three schedule keys from `NEW.pet_rules` and re-adds whichever of them `OLD.pet_rules` held:

```sql
v_sched := '{}'::jsonb;
if old.pet_rules ? 'fine_1_cents'  then v_sched := v_sched || jsonb_build_object('fine_1_cents',  old.pet_rules->'fine_1_cents');  end if;
if old.pet_rules ? 'fine_2_cents'  then v_sched := v_sched || jsonb_build_object('fine_2_cents',  old.pet_rules->'fine_2_cents');  end if;
if old.pet_rules ? 'fine_currency' then v_sched := v_sched || jsonb_build_object('fine_currency', old.pet_rules->'fine_currency'); end if;
new.pet_rules := (coalesce(new.pet_rules,'{}'::jsonb)
                  - 'fine_1_cents' - 'fine_2_cents' - 'fine_currency') || v_sched;
```

This makes the three bylaw surfaces *structurally incapable* of moving the schedule while leaving everything they actually meant to write intact, and it needs no client change to be safe. `manager_set_fine_schedule` sets the flag with `perform set_config('pet10x.fine_schedule','ok',true)` immediately before its update.

Restoring silently is normally a smell — it hides a caller's bug. It is right here because none of those callers *intends* to write the schedule; the keys are only along for the ride in a whole-object round-trip. Say so in a comment on the trigger, and make the RPC the only documented path.

- [ ] **Step 1: Prove the hole first**

Inside `begin; … rollback;`, as the MCR manager (`3aa088d5…`):

```sql
update public.buildings
   set pet_rules = pet_rules || '{"fine_1_cents": 999999999}'::jsonb
 where id = 'b41968f8-f45c-4a2b-a644-e94311100faf';
select pet_rules -> 'fine_1_cents' from public.buildings where id = 'b41968f8-…';
```

It succeeds, with no `audit_log` row. That is the RED. Record it.

- [ ] **Step 2: Write and apply the migration**

Both the function and the trigger land in one migration — a guard without its legitimate caller locks the schedule permanently.

- [ ] **Step 3: Verify — all inside `begin; … rollback;`**

- MCR manager calls `manager_set_fine_schedule('b41968f8-…', 25000, 50000, 'CAD')` → `{ok:true}`; `pet_rules->'fine_1_cents'` is `25000` with `jsonb_typeof = 'number'`; **every pre-existing key survives** (`requires_registry`, `quiet_hours`, `notes`, `breed_restrictions`, `designated_relief_area`, …) — compare the full key list before and after.
- One `audit_log` row, action `building.fine_schedule_set`, carrying the previous (absent) and new values.
- `manager_advance_violation` on a live MCR violation at `warning`, with **no** `p_amount_cents`, now inserts a fine of exactly `25000` — the reason this task exists. Use a real violation id; roll back.
- `p_fine_1_cents => 0`, `=> -1`, `=> 1000001` each return `bad_amount` and write nothing. `p_currency => 'dollars'` returns `bad_currency`.
- `p_fine_2_cents => null` **removes** the key rather than writing a JSON null; confirm `pet_rules ? 'fine_2_cents'` is false and `manager_advance_violation` into `fine_2` returns `no_fine_amount`.
- The **different-building** manager → `forbidden`, nothing written, no audit row. The resident → `forbidden`. `anon` → refused.
- **The guard:** after setting a schedule, run the Step 1 direct update again — it now succeeds as a statement but the schedule is **unchanged**, and the unrelated key it also set *is* changed. Then call `updateMyBuildingRules`'s exact statement shape (`update buildings set pet_rules = '<toggles only>'::jsonb`) and confirm the schedule survives while the toggles change. This is the `BulkApply` data-loss case; it must come out intact.
- Admin can set a schedule on a building they neither manage nor reside in.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260825000002_fine_schedule.sql
git commit -m "What a fine costs is a decision, and decisions get recorded"
```

---

## Task 4: The data layer

**Files:**
- Create: `lib/data/fine-schedule.ts` — pure
- Create: `lib/data/fine-schedule.test.ts`
- Create: `lib/data/building-rules.ts` — pure
- Create: `lib/data/building-rules.test.ts`
- Create: `lib/data/building-rules-live.ts` — `"use client"` hooks and mutations
- Modify: `lib/data/manager-queues.ts` — remove `readFineSchedule` / `FineSchedule`
- Modify: `components/screens/manager/violations-screen.tsx`, `components/screens/strata/building-detail.tsx` — import from the new module
- Modify: `lib/data/index.ts`
- Regenerate: `lib/supabase/database.types.ts`

**Regenerate the types first** (`mcp__supabase__generate_typescript_types`). Nothing here compiles against `building_rules` or the new enum until they are current, and Phase 2 found them already stale once.

Mirror the split Phase 2 established with `lib/data/violations.ts`: pure logic in a module with no `"use client"` and no Supabase import, so vitest can reach it under `environment: "node"`; hooks and mutations separately.

- [ ] **Step 1: Move `readFineSchedule` into a pure, tested module**

It is currently at `lib/data/manager-queues.ts:965`, inside a `"use client"` module full of React hooks — so it is untestable where it stands, and it is the function that decides whether a manager is shown a bylaw default at all. Move `FineSchedule` and `readFineSchedule` verbatim into `lib/data/fine-schedule.ts` and update the two importers (`violations-screen.tsx:58,62`, `building-detail.tsx:14`). No behaviour change.

Add the writer's half in the same module:

```ts
/** Dollars as typed by a manager → integer cents, or null for "no schedule". */
export function parseAmountToCents(input: string): number | null | "invalid"
```

Positive grammar: accept `""` (→ `null`) or `^\d{1,5}(\.\d{1,2})?$` after trimming and stripping a leading `$` and thousands separators; everything else is `"invalid"`. Round with `Math.round(dollars * 100)` and re-check the `1 … 1000000` range the RPC enforces, so the two agree.

- [ ] **Step 2: Write `lib/data/fine-schedule.test.ts`**

The load-bearing test is a **round trip**: for a table of inputs a manager can type, `parseAmountToCents` → the jsonb the RPC would store → `readFineSchedule` returns the same number back. A value the editor is willing to send must be a value the client is willing to display and the database is willing to charge.

Cover explicitly: `"250"`, `"250.00"`, `"$1,250.50"`, `"0"` → invalid, `"-5"` → invalid, `"1e3"` → invalid, `"12.345"` → invalid, `""` → null, `"10000.01"` → out of range.

- [ ] **Step 3: Write `lib/data/building-rules.ts` and its test**

```ts
export const CATEGORY_ORDER: BuildingRuleCategory[]   // from Constants.public.Enums.building_rule_category
export const CATEGORY_LABEL: Record<BuildingRuleCategory, string>
export function groupByCategory(rules: BuildingRule[]): { category; label; rules }[]
```

Derive the category list from `Constants.public.Enums.building_rule_category` in the generated types, not a retyped literal — the same trick `lib/data/violations.ts` uses, so a seventh category added in SQL fails the build rather than disappearing from the UI. `CATEGORY_ORDER` may impose a display order different from the enum's declaration order, but it must be a permutation of it; assert that in the test.

`groupByCategory` sorts within a category by `sort_order` then `created_at`, and **omits empty categories**. Test that, and test that a rule of every category survives the grouping.

- [ ] **Step 4: Write `lib/data/building-rules-live.ts`**

```ts
useMyBuildingRules(): LiveResult<BuildingRule[]>          // resident: published, own building
useManagerBuildingRules(buildingId): LiveResult<BuildingRule[]>  // manager: all, incl. drafts
saveBuildingRule(input): Promise<{ id: string | null; error: string | null }>
publishBuildingRule(id, published, notify): Promise<{ error: string | null; notified: number }>
setFineSchedule(buildingId, { fine1Cents, fine2Cents, currency }): Promise<{ error: string | null }>
```

- Every read filters by building id in the query (`.eq("building_id", id)`) and, for the resident hook, `.eq("is_published", true)`. RLS is the floor, not the filter. The resident's building id comes from `my_building_link` via the existing `useMyBuildingLink`.
- The mutations are thin wrappers over the three RPCs, mapping the structured `error` string to a sentence. `forbidden` → "You don't manage this building." `building_mismatch`, `bad_amount`, `bad_currency`, `empty`, `not_found` each get their own.
- `useMyBuildingRules` refetches on `visibilitychange` when `document.visibilityState === "visible"` (Decision 7). Nothing else — no interval, no realtime channel.

- [ ] **Step 5: Verify and commit**

`PATH="$HOME/.corepack-bin:$PATH" pnpm test` and `pnpm build` both clean. Confirm the two moved imports resolve by building, and confirm the violations screen still shows a bylaw default where one exists.

```bash
git add lib/data/fine-schedule.ts lib/data/fine-schedule.test.ts lib/data/building-rules.ts lib/data/building-rules.test.ts lib/data/building-rules-live.ts lib/data/manager-queues.ts lib/data/index.ts lib/supabase/database.types.ts components/screens/manager/violations-screen.tsx components/screens/strata/building-detail.tsx
git commit -m "One module that knows what a rule is, one that knows what a fine costs"
```

---

## Task 5: The manager writes the rules

**Files:**
- Create: `components/screens/manager/building-rules-editor.tsx`
- Modify: `components/screens/manager/settings-screen.tsx` — a "House Rules" row and sheet
- Modify: `components/screens/strata/bylaws-screen.tsx` — the same editor, per building

One component, mounted in both manager surfaces. Building it twice is the mistake that produced the bug this project started from.

The editor, per building:

| Element | Behaviour |
| --- | --- |
| Rule list | Grouped by category via `groupByCategory`, drafts visibly marked **Draft** |
| New rule | Category select (the six enum values, labelled), title, body `<textarea>` |
| Character counter | Live, on both title (120) and body (8000); the save button disables past the limit rather than the database rejecting it |
| Save | `saveBuildingRule` — creates or updates a draft. Never publishes |
| Publish | `publishBuildingRule(id, true, notify)` with a **"Notify residents"** checkbox, default on, and the recipient count shown: "Notifies 9 residents" |
| Unpublish | `publishBuildingRule(id, false, false)`. There is no Delete |
| Reorder | Up/down within a category, writing `sort_order` through `saveBuildingRule` |
| Preview | Renders the body exactly as the resident screen will — same `whitespace-pre-wrap`, same component if practical |

- [ ] **Step 1: Build the editor component**

The body `<textarea>` must not trim or normalise internal whitespace on the way in or out. Only the outermost trim, which the RPC also does.

- [ ] **Step 2: Mount it in the in-app manager settings**

`components/screens/manager/settings-screen.tsx` already has a "Building Configuration" section with `Building Profile`, `Pet Bylaws & Policies` and `Emergency QR Code`. Add `House Rules` with a detail line reading the real count — `"{n} published"` or `"None published"` — and open it as a fourth sheet. Follow the existing `Sheet` / `MenuRow` pattern in that file exactly.

- [ ] **Step 3: Mount it in the strata portal**

`components/screens/strata/bylaws-screen.tsx` renders `BuildingBylawsEditor` inside a per-building accordion. Add the rules editor beneath it in the same panel, under its own `SectionCard`-style heading, so a manager of five buildings edits each building's rules where they already edit its bylaws.

- [ ] **Step 4: Offer to carry the legacy note text across**

Maple Court Residences already stores real prose inside the compliance jsonb: `pet_rules.notes` ("Standard Bylaw 3(4) as amended March 2025…"), `quiet_hours` ("22:00-07:00") and `designated_relief_area` ("Northwest lawn, off the P1 exit"). That is authored text living in the machine-checked object — exactly what AD-9 separates — and if this phase ignores it, the only real rules content on the platform stays stranded where no resident screen shows it.

When any of those three keys is non-empty and the building has no published rule, show one clearly-labelled block in the editor: *"This building has note text stored with its compliance settings. Copy it into a rule?"* — one button, which **prefills a draft** with the labelled lines concatenated. It writes nothing on its own, it does not remove the original keys, and the manager edits and publishes deliberately. No automatic migration, no silent display.

- [ ] **Step 5: Verify in a browser**

`PATH="$HOME/.corepack-bin:$PATH" pnpm dev`. Sign in as `manager@pet10x.com`, and in **both** surfaces: create a `parking` rule, save it, confirm it shows as a draft and that `select is_published from building_rules` is false; publish it; confirm the toast reports 9 residents and that `select count(*) from notifications where action_target='building-rules'` increased by 9. Then unpublish, and confirm no notification was sent.

Check the sheet's controls are not underneath the fixed tab bar — `IOSTabBar` is `fixed bottom-0 … h-16 md:hidden`, and screens clear it with `pb-24`. A control that renders under it is the exact defect this project shipped once already. Check at a 375px-wide viewport, not only on desktop.

```bash
git add components/screens/manager/building-rules-editor.tsx components/screens/manager/settings-screen.tsx components/screens/strata/bylaws-screen.tsx
git commit -m "Write the rule, read it back, then publish it"
```

---

## Task 6: The fine schedule editor

**Files:**
- Create: `components/screens/manager/fine-schedule-editor.tsx`
- Modify: `components/screens/strata/bylaws-editor.tsx`
- Modify: `components/screens/manager/settings-screen.tsx` — the `BylawsSheet`

One component, two mounts (Decision 8). It renders inside the bylaws surface but **below a divider, with its own save button**, calling `setFineSchedule` — never `updateMyBuildingRules`.

- [ ] **Step 1: Build it**

- Two currency inputs (first offence, second offence) and a currency field, prefilled from `readFineSchedule(building.rules)`.
- Empty means "no schedule for this degree", and the helper text says what that costs: *"With no amount set, a manager must type an amount on every fine."*
- `parseAmountToCents` validates on blur and disables save on `"invalid"`, with the reason shown inline.
- Display in dollars, store in cents. Never round-trip through a float in state — hold the typed string, convert only on save.
- After a successful save, refetch the building so the violations screen's amount sheet picks up the new default.
- Because the schedule is stored in `pet_rules`, which residents can read (see Ground truth), the block carries one line: *"Residents can see the fine schedule for their building."* State it rather than let a manager discover it.

- [ ] **Step 2: Mount it in both bylaw surfaces**

In `components/screens/strata/bylaws-editor.tsx`, below the impact preview and the "Save bylaws" button. In `settings-screen.tsx`'s `BylawsSheet`, below its toggle list. Neither existing save path changes: the toggles still go through `updateMyBuildingRules`, and Task 3's trigger now makes that call incapable of disturbing the schedule.

- [ ] **Step 3: Verify — the round trip that Phase 2 could not close**

In the browser as `manager@pet10x.com`:

1. Set Maple Court Residences' schedule to $250 / $500 CAD and save.
2. Open the Violations screen, escalate a case at `warning` to `fine_1`, and confirm the amount sheet **prefills $250** rather than empty.
3. Issue it, and confirm the `fines` row carries `amount_cents = 25000` and `currency = 'cad'`.
4. Go back to Bylaws, toggle "Liability insurance required" on and save the **toggles**, then re-open: the schedule is **still $250 / $500**. This is the `BulkApply` data-loss case; if it comes back empty, Task 3's trigger is wrong and this task stops.
5. In the strata portal, save a bylaw **template** from a building with a schedule and apply it to another building that has one — confirm neither building's schedule moved.

```bash
git add components/screens/manager/fine-schedule-editor.tsx components/screens/strata/bylaws-editor.tsx components/screens/manager/settings-screen.tsx
git commit -m "Give the fine schedule somewhere to be typed"
```

---

## Task 7: The resident reads them

**Files:**
- Create: `components/screens/building-rules-screen.tsx`
- Modify: `app/app/page.tsx` — route `building-rules`, add a `CONTENT_MAX` entry
- Modify: `components/screens/home-screen.tsx` — the Building Rules quick action
- Modify: `components/screens/profile-screen.tsx` — the Building Rules menu row

Today the quick action at `home-screen.tsx:103` fires `toast("Building pet rules", { description: "One dog or one cat · leashed in common areas." })` — one hardcoded string, identical for every building on the platform, true of none of them. The profile row says "coming soon". Both become this screen.

The screen, top to bottom:

1. `IOSNavBar` with the building's name and a `NavBackButton` (`onBack` → `handleBack`), matching `link-building-screen.tsx`.
2. **Requirements Pet10x checks** — the `pet_rules` booleans that are true, plus `max_weight_kg` and `max_pets_per_unit` where present. Labelled as machine-checked and tied to compliance. This is real data and is always present, so the screen is never empty.
3. **House rules from your building manager** — category filter chips (from `CATEGORY_ORDER`, only categories that have rules) and a card per rule: title, full body in `whitespace-pre-wrap`, category chip, and "Updated <relative>".
4. When there are no published rules: one sentence — *"Your building manager hasn't published house rules here yet."* No placeholder rules, no inherited defaults, no illustration pretending it is a feature.
5. When the resident has no approved building link at all: the existing "link your building" affordance, routed to `link-building`, not an empty rules screen.

- [ ] **Step 1: Build the screen**

`whitespace-pre-wrap` on the body, and nothing else that could alter the text — no `line-clamp`, no `truncate`, no `text-ellipsis` on a body. Grep your own file for those three before finishing.

Bodies are React text children, so they are escaped; do not reach for `dangerouslySetInnerHTML` under any circumstances.

- [ ] **Step 2: Route it**

Add `building-rules` to the shared (non-persona) branch of `app/app/page.tsx`'s router, beside `report` and `shop`, so a **manager can open it too** and see precisely what their residents see. Add `"building-rules": "max-w-2xl"` to `CONTENT_MAX` — without it the screen silently falls back and reads at a different width from every other resident screen.

- [ ] **Step 3: Wire both entry points**

- `home-screen.tsx` `handleQuickAction`: `if (label.includes("Rules")) onNavigate?.("building-rules")`. Delete the hardcoded toast entirely.
- `profile-screen.tsx`: route the `Building Rules` row through `handleItem` to `building-rules`. Phase 3's Task 2 lists this row as "leave as-is, Phase 6 builds this" — this is that build, so it now navigates. If Phase 3 has already run and disabled the row, re-enable it. Note the change for whoever runs Phase 3 after this.

- [ ] **Step 4: Verify in a browser — this is the phase's whole point**

Sign in as `resident1@pet10x.com`:

- Home → Building Rules → the parking rule published in Task 5 renders, **character for character**, including its line breaks. Compare against the editor's textarea content by eye, then confirm the DOM text equals `select body from building_rules where id = …`.
- The draft rule created in Task 5 is **not** visible.
- The requirements section shows Maple Court Residences' real toggles, not another building's.
- With the manager's rules all unpublished, the screen shows the requirements plus the one honest sentence, and does not look broken.
- Profile → Building Rules reaches the same screen.
- A resident of a **different** building (`a5000000-0000-4000-8000-000000000014`, Maple Court) sees none of Maple Court Residences' rules.
- At 375px wide: nothing sits under the fixed tab bar, no horizontal scroll, and a long rule body wraps rather than overflowing.
- Publish a second rule in another tab, return to this one, and confirm the list refreshes when the tab regains focus.

```bash
git add components/screens/building-rules-screen.tsx app/app/page.tsx components/screens/home-screen.tsx components/screens/profile-screen.tsx
git commit -m "The rule the manager wrote, in the resident's account"
```

---

## Task 8: Prove it, and write down who may do what

**Files:**
- Modify: `docs/RBAC_CAPABILITIES.md`

- [ ] **Step 1: Re-run the full impersonation matrix against the applied migrations**

Not the per-task rollbacks — one pass, in one session, over the finished state. Five actors × the three capabilities, allowed **and** denied each recorded with the SQL that produced it:

| Capability | anon | resident | manager of building | manager of another | admin |
| --- | --- | --- | --- | --- | --- |
| Read a published building rule | ❌ | ✅ own building | ✅ | ❌ | ✅ |
| Read an unpublished building rule | ❌ | ❌ | ✅ | ❌ | ✅ |
| Write or publish a building rule | ❌ | ❌ | ✅ | ❌ | ✅ |
| Delete a building rule | ❌ | ❌ | ❌ | ❌ | ✅ |
| Set the fine schedule | ❌ | ❌ | ✅ | ❌ | ✅ |

- [ ] **Step 2: Update `docs/RBAC_CAPABILITIES.md`**

- Remove the *(Phase 6)* markers from the two building-rule rows and replace the "Enforced by" cells with what actually enforces them, naming the guard triggers.
- Split "Read a building rule" into the published and unpublished rows above — the current single row hides the case that matters.
- Move "Set the fine schedule" off *(Phase 4)* and change its enforcer from `buildings_manager_update` to `manager_set_fine_schedule` + `buildings_fine_schedule_guard`, with a sentence saying the bare UPDATE policy is no longer the control.
- Fix the stray "Splitting this row into three is Phase 6's job" at `:113` — that footnote is about community writes and belongs to the Community phase.

- [ ] **Step 3: The end-to-end walk the user actually asked for**

In a browser, in one sitting, with no SQL:

1. As `manager@pet10x.com`, write a **parking** rule with a distinctive multi-paragraph body containing an apostrophe, a `#`, an asterisk and a blank line between paragraphs.
2. Publish it with notification on.
3. Sign in as `resident1@pet10x.com` in a second browser profile.
4. The alert appears in Alerts.
5. Home → Building Rules → the rule is under **Parking**, and the body matches the manager's text exactly — every character, both paragraphs, the blank line between them.
6. As the manager, amend the body and re-publish. As the resident, refocus the tab; the amended text appears.

Capture what the resident sees. If any character differs, that is the phase's central defect and nothing else matters until it is fixed.

- [ ] **Step 4: The honesty sweep**

```bash
grep -rn "coming soon" --include="*.tsx" components/screens/building-rules-screen.tsx components/screens/manager/building-rules-editor.tsx components/screens/manager/fine-schedule-editor.tsx
grep -n "leashed in common" components/screens/home-screen.tsx
grep -nE "line-clamp|truncate|text-ellipsis" components/screens/building-rules-screen.tsx
```

All three expected to return nothing. The third is the anti-truncation guarantee, checked mechanically.

- [ ] **Step 5: Commit**

```bash
git add docs/RBAC_CAPABILITIES.md
git commit -m "Say who may write a rule, and who may price a fine"
```

---

## Phase 6 done when

1. `PATH="$HOME/.corepack-bin:$PATH" pnpm test` and `pnpm build` both exit 0. (`pnpm lint` is excluded — it has never worked on this repository.)
2. `public.building_rules` and `public.building_rule_category` exist, and every object this phase created appears in `supabase/migrations/`.
3. A rule published by the manager of building A is readable by an approved resident of A, and returns **zero rows** for a resident of B, for a manager of B, and for `anon`.
4. An **unpublished** rule returns zero rows for its own building's residents.
5. `update building_rules set is_published = …` from a client session **raises**; `publish_building_rule` succeeds.
6. Publishing a rule at Maple Court Residences inserts exactly **9** notifications — one per approved, non-suspended resident — and none for the manager, and none for anyone in another building. Publishing with `p_notify => false` inserts zero.
7. Every successful `manager_save_building_rule`, `publish_building_rule` and `manager_set_fine_schedule` call left exactly one `audit_log` row naming its actor; every refused call left none.
8. `manager_set_fine_schedule` is the only path that changes `fine_1_cents` / `fine_2_cents` / `fine_currency`: a direct `update buildings set pet_rules = …` from a manager or an admin leaves them exactly as they were, and the bylaw toggles it *did* mean to change are saved.
9. A fine issued through `manager_advance_violation` with no `p_amount_cents` uses the schedule set through the editor — verified in the browser, on a real violation.
10. The resident's Building Rules screen renders a manager's published body **character for character**, including line breaks, with no clamp and no truncation.
11. With no published rules, the screen shows the building's real compliance requirements and one honest sentence — never placeholder or inherited rule text.
12. `home-screen.tsx` no longer contains the string "leashed in common", and neither entry point calls `toast()` in place of navigation.
13. Every row of the capability matrix this phase touches is verified by SQL impersonation for all five actors, allowed and denied, and `docs/RBAC_CAPABILITIES.md` carries no remaining *(Phase 6)* marker.
14. Every task's browser verification was performed at a 375px viewport as well as on desktop, and nothing renders beneath the fixed tab bar.
