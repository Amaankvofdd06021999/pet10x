# Phase 8 — Community

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Events, RSVP and Lost & Found become real; pin becomes a manager act the database enforces; share stops lying about what it copied. This is the first user-generated content on Pet10x that other users read, so the phase's real deliverable is one authorisation grammar across five community tables, not five features.

**Architecture:** `community_posts`, `post_comments`, `post_reactions`, `events`, `event_rsvps` and `lost_found` all exist with RLS on, and all six are **empty** — 0 rows each, measured 2026-08-23. The feed reads live (`lib/data/live.ts:1229`); `useEvents()` and `useLostFound()` are `resolved([])` stubs in `lib/data/hooks.ts:78-84`. Four controls on `components/screens/community-screen.tsx` are `toast()` calls and a fifth (Search, `:171`) is a `<span>` shaped like an input.

The three tables carry **three different and mutually inconsistent authorisation models**, two of which are holes and one of which is a wall. That is this phase's spine, and Task 1 is the whole of it.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Supabase Postgres 17, `sonner`, `lucide-react`, pnpm 9 via corepack.

**Spec:** [`docs/superpowers/specs/2026-08-21-completing-manager-resident-flows-design.md`](../specs/2026-08-21-completing-manager-resident-flows-design.md) — the audit at `:18`, Migration G at `:415`, AD-1 at `:97`.

---

## The measurement this phase turns on

Everything in this section was run against `Pet10x` (`ekgejmxgnlmdomkpblki`) on **2026-08-23**, read-only or inside `begin; … rollback;`. Re-run any of it before trusting it; none of it was taken from the spec.

### Nobody can post. Not "a handful" — nobody.

```sql
-- posts_insert = (author_id = auth.uid() AND is_resident_of(building_id) AND is_premium(auth.uid()))
profiles 47 | premium 1 | approved_residents 24 | managers 4 | admins 2
can_post_today = 0
```

The one premium account on the platform is a **super-admin with no resident link**, and `posts_insert` has no `is_admin()` disjunct either. The intersection of "premium" and "approved resident of some building" is the empty set. Proven, not inferred:

```
begin; set local role authenticated;
set local request.jwt.claims = '{"sub":"8b666cc4-…","role":"authenticated"}';
insert into public.community_posts …  →  ERROR 42501
rollback;
```

That account is a real, approved, unsuspended resident of Maple Court Residences.

### Meanwhile, events and lost & found are wide open

Same resident, same rolled-back transaction, both succeeded:

| Probe | Result |
| --- | --- |
| `insert into lost_found (building_id = 'b5000000-…-0003')` — **Harbour View Towers**, a building they have no relationship with | **inserted** |
| `insert into lost_found (building_id = null)` | **inserted**, and `lost_found_select` is `building_id IS NULL OR …` so it is visible to **every user on the platform** |
| `insert into events (building_id = 'b5000000-…-0003')` | **inserted** |

`lost_found_insert` is `with check (reporter_id = auth.uid())` — no building predicate of any kind. `events_write` is `FOR ALL` with `(created_by = auth.uid()) OR manages_building(building_id) OR is_admin()`, and that first disjunct is **self-authorising**: set `created_by` to yourself and the policy passes for any building, or for none.

### Attendance is uncountable, by policy

`event_rsvps` has exactly one policy — `rsvps_self`, `FOR ALL`, `profile_id = auth.uid()`. With two RSVPs seeded on one event, the resident sees **1**:

```
select count(*) from event_rsvps where event_id = '1111…'   →  1   (two rows exist)
```

A manager sees the same 1. So the screen's `{event.attendees}/{event.maxAttendees} going` at `community-screen.tsx:372` can never be true, and **Migration G's claim that "event attendance is counted from `event_rsvps`" is impossible under the live policy.** `post_reactions` got a building-scoped `reactions_select` alongside its `reactions_self`; `event_rsvps` did not. That asymmetry is the bug.

### What the premium gate actually gates

| Write path | Premium required? | Building scope on write? |
| --- | --- | --- |
| `community_posts` insert | **yes** | yes |
| `post_comments` insert | no | **no** (`author_id = auth.uid()` only) |
| `post_reactions` insert | no | **no** (`profile_id = auth.uid()` only) |
| `events` insert | no | **no** |
| `lost_found` insert | no | **no** |

One of five write paths is gated. A non-premium resident cannot start a thread but can already write unlimited text into someone else's thread, because `comments_insert` has no premium conjunct. **The gate gates nothing; it only decides who is allowed to go first.**

---

## The decision on the premium gate

**Remove `is_premium(auth.uid())` from `posts_insert` and replace the whole predicate with a role grammar.** Argued:

1. **It is not a monetisation control, it is an outage.** Zero of 47 accounts can use it, and `community_posts` has never held a row. Nothing is being protected because nothing has ever existed to protect.
2. **It is not consistent with itself.** If community were a paid feature, the gate would sit on reads or on all writes. Sitting on one of five writes, while comments and reactions and events and lost-pet reports are free, is the signature of a policy written once and never revisited — not of a product decision.
3. **A manager cannot announce anything to their own building, and an admin cannot moderate.** Both of those are defects on any reading of the intent, and both are fixed by the same statement.
4. **The failure mode is a `42501` surfaced as a toast.** `createCommunityPost` at `live.ts:1325` already pattern-matches the words "row-level security" to guess it means "buy a plan". Guessing a business rule from a Postgres error code is not a paywall.

The replacement:

```sql
-- posts_insert (new)
author_id = auth.uid()
and (
  public.is_resident_of(building_id)
  or public.manages_building(building_id)
  or public.is_admin()
)
```

All three helpers already exclude suspended profiles internally (`is_resident_of` and `manages_building` join `profiles` and test `not p.is_suspended`; `is_admin()` is `is_super_admin and not is_suspended`), so suspension needs no fourth conjunct — **verify that is still true before relying on it.**

**This is reversible in one statement, and the plan says so out loud** because it is a revenue decision the human partner may want back. Task 1 Step 6 writes the exact restore statement into the migration as a comment.

**If premium gating of community is genuinely wanted, this is not where it goes.** The right shape is a *quota* — N posts per rolling period — enforced inside a `SECURITY DEFINER` RPC that can return `{ok:false, error:'quota_exceeded', upgrade:true}` and let the UI say something a person can act on. That is named here so it is not rediscovered, and it is **out of scope for this phase.**

---

## The other product decisions, made

**Can a resident of one building read another building's feed?** No, and after Task 1 they cannot write into one either. Every community table's `building_id` becomes `NOT NULL` and every write predicate names the building. The `building_id IS NULL` escape hatch in `events_select` and `lost_found_select` is a platform-wide broadcast channel available to any authenticated user, and it is removed.

**What happens to a post when its author leaves the building?** `leave_my_building_link()` flips `resident_links.status`, so `is_resident_of` goes false and the ex-resident loses read access to the feed — including to their own post. The post itself stays, attributed, because it was addressed to the building and the building's record of what was said should not be editable by departure. Nothing changes here; it is stated so it is a choice. Separately, `community_posts_author_id_fkey` is `ON DELETE SET NULL`, so deleting a *profile* anonymises the post rather than destroying the thread — correct, and `mapPost` already falls back to `"Resident"`.

**Is there a moderation path, and who holds it?** Today: none. There is no DELETE policy on `community_posts`, `post_comments` or `lost_found`, and `lost_found.status` can never be changed by anyone because there is no UPDATE policy either — `'active'` is permanent. Task 2 gives the author soft-removal of their own post and the manager/admin soft-removal of any post in their building, both audited, both via `deleted_at` rather than a `DELETE` (a deletion cascades to comments and reactions, and **a referential cascade is not subject to RLS** — Phase 2 learned that the expensive way).

**Share.** Removed from posts; made real, and different, on Lost & Found. There is no per-post route: the resident app is one client-side screen switcher at `/app` (`app/app/page.tsx:198`) and `app/emergency/[code]` is the only dynamic route in the project. A shareable post link would need a new **public** route serving building-scoped UGC, which is the last thing to build in the phase that first ships UGC. A lost-pet notice, by contrast, is *meant* to leave the building — so it shares as plain text via `navigator.share` with a clipboard fallback (`components/onboarding/onboarding-flow.tsx:72-75` already has the exact pattern). What it may contain: pet name, species, breed, colour, last-seen text, and the building **name**. What it must never contain: the building **code** (Phase 0 — a lobby code authorises `resolve_building_code` and the full pet roster), a unit, an owner name, or a signed storage URL (a signed URL carries the object path verbatim, and these paths embed auth uids).

---

## Global Constraints

- **pnpm needs `PATH="$HOME/.corepack-bin:$PATH"`** (9.15.9 — do not upgrade). `pnpm lint` **has never worked** here: `eslint` is in the script, is not a dependency, and has no config, on `main` too. Do not try to make it pass; do not count it as a gate.
- **vitest is `environment: "node"` with no jsdom** (`vitest.config.ts`). Only pure logic is unit-testable — mappers, formatters, grammar validators. No component rendering. Do not add jsdom in this phase.
- **No Supabase CLI, no Docker.** Migrations via MCP `apply_migration`; assertions via `execute_sql`. Live production: `select` only, and any write probe wrapped in `begin; … rollback;`.
- **Supabase project:** `Pet10x`, ref `ekgejmxgnlmdomkpblki`.
- **The design document is not the schema.** Every column, table, RPC signature, enum label, bucket and policy named below was read off the live database on 2026-08-23. Where the spec disagreed, the schema won and the divergence is listed at the end of this plan. If any of it has moved by the time you build, stop and report rather than adjusting the migration to fit.
- **Migration filenames start at `20260826000000`.** Phase 6 claims `20260823000006-8`, Phase 5 claims `20260824000000-2`, Phase 7 is being planned and will likely take `20260825…`. `ls supabase/migrations/ | tail -5` before creating a file; if the number is taken, move up, do not renumber anyone else. **Never edit an applied migration.**
- **Cross-user writes go through `SECURITY DEFINER`.** `notifs_insert_own_assistant` is the only INSERT policy on `notifications` and its check is `profile_id = auth.uid() and kind = 'assistant'`, so nothing in the browser can notify anybody else. Every such function re-checks scope **by hand**, returns a structured `{ok:false,error:…}` rather than raising, and is declared `set search_path = public, pg_temp`. `supabase/migrations/20260823000005_manager_remind_fine.sql` is the reference implementation — match it.
- **Positive grammar, never a denylist.** State what is allowed. This applies to storage paths, to `status` and `category` values, and to who may write.
- **Every new foreign key states its `on delete` action and why, in a comment.**
- **RLS impersonation is a required step, not a nicety.** Every new or changed policy is tested with `set local role authenticated` + `set local request.jwt.claims` against five subjects: a resident **of** the building, a resident of a **different** building, a manager of the building, an admin, and `anon`. Allowed cases allowed, denied cases denied, all inside a rolled-back transaction.
- **A control that cannot act must not exist.** If something cannot be made real in this phase, remove it.

### Phase 3 overlaps this file and must be reconciled

`docs/superpowers/plans/2026-08-21-phase-3-honest-cleanup.md` Task 3 removes Pin, More-options and Share from `community-screen.tsx` and leaves RSVP for this phase. **Phase 8 supersedes it.** If Phase 3 has already run, those controls are gone and Task 6 re-adds two of them as real (Pin, Share-on-lost-and-found) and leaves More-options removed. If Phase 3 has not run, **drop its Task 3** rather than removing and re-adding. Check `git log --oneline -- components/screens/community-screen.tsx` first and say which world you are in.

### Test subjects (verified live, 2026-08-23)

| Role | id | Notes |
| --- | --- | --- |
| Resident of Maple Court Residences | `8b666cc4-e124-476b-add7-0580cfd1c372` | approved, unsuspended, **not** premium |
| Second resident, same building | `7de39ae3-aeab-4731-aeb5-35dc2f52b2d9` | for the two-RSVP attendance probe |
| Manager | `a5000000-0000-4000-8000-000000000001` | in `building_managers` |
| Super-admin | `d0e80418-8916-4228-9cd9-f8b7abb91641` | the platform's only premium account |
| Maple Court Residences | `b41968f8-f45c-4a2b-a644-e94311100faf` | `MCR2026`, 10 pets |
| Harbour View Towers | `b5000000-0000-4000-8000-000000000003` | the "different building" |

Confirm each still holds before using it. A subject that has changed invalidates the probe, not the plan.

---

## Task 1: One authorisation grammar

**Files:**
- Create: `supabase/migrations/20260826000000_community_authorisation.sql`

**Interfaces:**
- Changes: `posts_insert`, `events_write`, `events_select`, `lost_found_insert`, `lost_found_select`, `rsvps_self`
- Produces: `events_insert`, `events_update`, `events_delete`, `lost_found_update`, `rsvps_read`, `rsvps_write`
- Produces: `events.building_id NOT NULL`, `lost_found.building_id NOT NULL`, `lost_found_status_check`, `community_posts_category_check`

This is the phase. Everything after it is surface.

- [ ] **Step 1: Prove all four holes first, and record the output**

All inside `begin; … rollback;`. This is the RED, and the numbers go in the commit message.

```sql
-- (a) nobody can post
with cap as (
  select p.id,
    public.resolve_entitlement(p.id) is not null as premium,
    exists(select 1 from public.resident_links rl
            where rl.profile_id=p.id and rl.status='approved') as resident,
    p.is_suspended
  from public.profiles p)
select count(*) filter (where premium and resident and not is_suspended) as can_post_today from cap;
-- expected: 0

-- (b) a resident writes into a building they have no relationship with
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"8b666cc4-e124-476b-add7-0580cfd1c372","role":"authenticated"}';
  insert into public.lost_found (building_id, reporter_id, kind, pet_name)
    values ('b5000000-0000-4000-8000-000000000003', auth.uid(), 'lost', 'CROSS PROBE');
  insert into public.events (building_id, created_by, title, starts_at)
    values ('b5000000-0000-4000-8000-000000000003', auth.uid(), 'CROSS EVENT', now());
  insert into public.lost_found (building_id, reporter_id, kind, pet_name)
    values (null, auth.uid(), 'found', 'GLOBAL PROBE');
  reset role;
  select count(*) from public.lost_found where pet_name like '%PROBE%';   -- expected: 2
  select count(*) from public.events where title = 'CROSS EVENT';         -- expected: 1
rollback;
```

Do **not** use a `select … from public.buildings` subquery to pick the foreign building — `buildings` is itself under RLS for `authenticated` and will return no rows, and the insert then silently does nothing. Use the literal uuid. (This exact mistake produced a false negative while this plan was being written.)

- [ ] **Step 2: Confirm every community table is still empty**

```sql
select 'community_posts' t, count(*) from public.community_posts
union all select 'post_comments', count(*) from public.post_comments
union all select 'post_reactions', count(*) from public.post_reactions
union all select 'events', count(*) from public.events
union all select 'event_rsvps', count(*) from public.event_rsvps
union all select 'lost_found', count(*) from public.lost_found;
```

Expected: **0 for all six.** If any is non-zero, stop and report — `set not null` and the new check constraints are free only against an empty table, and a backfill is a different task with a different risk.

- [ ] **Step 3: Confirm the helpers still exclude suspended profiles**

```sql
select proname, pg_get_functiondef(oid) from pg_proc
 where pronamespace='public'::regnamespace
   and proname in ('is_resident_of','manages_building','is_admin');
```

Each must still test `not p.is_suspended` (or `not is_suspended`). If one no longer does, the new policies need an explicit suspension conjunct and this plan's predicates are wrong — report before proceeding.

- [ ] **Step 4: Close the `building_id is null` broadcast channel**

```sql
alter table public.events     alter column building_id set not null;
alter table public.lost_found alter column building_id set not null;
```

Both already carry `on delete cascade` to `buildings` — correct and unchanged: deleting a building should take its events and its lost-pet notices with it, and nothing else references them.

Then narrow both SELECT policies by dropping the `building_id IS NULL OR` disjunct:

```sql
-- events_select, lost_found_select (new)
public.is_resident_of(building_id) or public.manages_building(building_id) or public.is_admin()
```

- [ ] **Step 5: Split `events_write` into three, and kill the self-authorising disjunct**

`events_write` is `FOR ALL` and its `created_by = auth.uid()` disjunct authorises a write into any building. Replace with:

```sql
-- events_insert (with check)
created_by = auth.uid()
and (public.is_resident_of(building_id) or public.manages_building(building_id) or public.is_admin())

-- events_update, events_delete (using + with check)
(created_by = auth.uid() and public.is_resident_of(building_id))
or public.manages_building(building_id)
or public.is_admin()
```

**Product call, stated so it is a choice:** a resident may create an event **in their own building only**. The schema's `created_by` column and the old policy's shape both say residents were meant to organise meetups; the defect was the missing building conjunct, not the intent. A manager or admin may edit or remove any event in a building they hold. An ex-resident cannot edit their own past event, because `is_resident_of` has gone false — that is the same rule as posts and is deliberate.

`events.created_by` references `profiles(id)` with **no** `on delete` action, i.e. `NO ACTION` — so a profile with events cannot be deleted at all. Leave it. Changing it to `set null` would make `created_by = auth.uid()` unmatchable and orphan the event's edit rights; changing it to `cascade` would delete a building's event history when one organiser closes their account. State this in a comment; do not alter it.

- [ ] **Step 6: The premium gate**

```sql
drop policy posts_insert on public.community_posts;
create policy posts_insert on public.community_posts for insert
  with check (
    author_id = auth.uid()
    and (public.is_resident_of(building_id)
      or public.manages_building(building_id)
      or public.is_admin())
  );
```

Write into the migration, as a comment, the exact statement that restores the old behaviour, and the measurement that justified removing it (`can_post_today = 0` of 47 profiles, `community_posts` empty). A future reader must be able to reverse this in one paste and see why nobody did.

- [ ] **Step 7: Give lost & found a building, a lifecycle and a moderator**

```sql
-- lost_found_insert (new, with check)
reporter_id = auth.uid()
and (public.is_resident_of(building_id) or public.manages_building(building_id) or public.is_admin())

-- lost_found_update (new, using + with check)
(reporter_id = auth.uid() and public.is_resident_of(building_id))
or public.manages_building(building_id)
or public.is_admin()
```

`status` today is bare `text` defaulting to `'active'` with **no check constraint**, while `LostFoundItem.status` in `lib/data/types.ts:371` declares `"active" | "resolved"`. Add the constraint as a positive grammar:

```sql
alter table public.lost_found
  add constraint lost_found_status_check check (status in ('active','resolved'));
```

No DELETE policy is added: a lost-pet notice is resolved, not erased, and `status` is now the lifecycle. `lost_found.reporter_id` references `profiles(id)` with no `on delete` action — same reasoning as `events.created_by`; leave it and say so.

- [ ] **Step 8: Make attendance countable**

`event_rsvps` gets a building-scoped read, mirroring `reactions_select` on `post_reactions` — the policy that `event_rsvps` was evidently meant to have and does not:

```sql
-- rsvps_read (new, for select)
exists (select 1 from public.events e
         where e.id = event_rsvps.event_id
           and (public.is_resident_of(e.building_id)
             or public.manages_building(e.building_id)
             or public.is_admin()))

-- rsvps_write (new, replaces rsvps_self; for insert/delete)
profile_id = auth.uid()
and exists (select 1 from public.events e
             where e.id = event_rsvps.event_id
               and (public.is_resident_of(e.building_id)
                 or public.manages_building(e.building_id)))
```

There is no UPDATE path — an RSVP is a row that exists or does not. The primary key is already `(event_id, profile_id)`, so a double-RSVP is a duplicate-key error the client turns into a no-op.

**This makes every RSVP's identity visible to the building.** That is the point — "12 going" needs the rows, and an attendee list is what an organiser needs. It is stated here because it changes what a resident's RSVP discloses, and Task 6 must show them a name list, not a bare count, so the disclosure is visible rather than implied.

`event_rsvps.event_id` is `on delete cascade` and `profile_id` is `on delete cascade` — both correct: a deleted event has no attendees, a deleted profile attends nothing. Unchanged.

- [ ] **Step 9: Constrain `category` on both tables**

`community_posts.category` and `events.category` are free text, and `CATEGORY_COLORS` at `community-screen.tsx:45-53` is a `Record<string,string>` lookup that returns `undefined` for anything else — which React then renders as the literal class name `undefined`. Positive grammar, the seven names the screen actually knows:

```sql
alter table public.community_posts
  add constraint community_posts_category_check
  check (category in ('General','Recommendation','Warning','Question','Social','Health','Building'));
```

`events.category` is nullable; constrain it as `category is null or category in (…)`. Task 6 still adds a fallback in the lookup — a constraint and a fallback are not the same defence and the screen must not break if the list grows.

- [ ] **Step 10: Apply**

`apply_migration`, name `community_authorisation`.

- [ ] **Step 11: The impersonation matrix — every cell, in rolled-back transactions**

Five subjects × the write paths. Build the events/lost_found/rsvp fixtures inside the transaction as `postgres`, then `set local role authenticated` and probe.

| Act | resident of B | resident of other | manager of B | admin | anon |
| --- | --- | --- | --- | --- | --- |
| insert `community_posts` into B | **allow** | deny | **allow** | **allow** | deny |
| insert `community_posts` with `author_id` ≠ self | deny | deny | deny | deny | deny |
| select B's posts | **allow** | deny | **allow** | **allow** | deny |
| insert `events` into B | **allow** | deny | **allow** | **allow** | deny |
| insert `events` with `building_id = null` | **error** (not-null) | error | error | error | error |
| update another resident's event in B | deny | deny | **allow** | **allow** | deny |
| insert `lost_found` into B | **allow** | deny | **allow** | **allow** | deny |
| update own `lost_found` status → `'resolved'` | **allow** | n/a | **allow** | **allow** | deny |
| update `lost_found.status` → `'archived'` | **error** (check) | — | error | error | — |
| insert `event_rsvps` for an event in B | **allow** | deny | **allow** | deny¹ | deny |
| count `event_rsvps` on an event in B (2 rows seeded) | **2** | 0 | **2** | **2** | 0 |

¹ an admin is not a resident and `rsvps_write` deliberately has no `is_admin()` disjunct — moderating a feed is not attending a barbecue. Confirm the denial rather than assuming it.

Re-run **Step 1's three probes** and confirm all three now fail. That is the GREEN.

- [ ] **Step 12: Commit**

```bash
git add supabase/migrations/20260826000000_community_authorisation.sql
git commit -m "A wall where nobody could pass, three doors with no lock"
```

---

## Task 2: Pin, moderation, and counters that are true

**Files:**
- Create: `supabase/migrations/20260826000001_community_posts_integrity.sql`

**Interfaces:**
- Produces: trigger `community_posts_guard` (BEFORE UPDATE), triggers maintaining `like_count` / `comment_count`
- Produces: `comments_update`, `comments_delete` policies

Three separate defects on `community_posts`, all fixed by owning the write path properly.

**(a) Pin is not a manager act.** `posts_update_own` is `(author_id = auth.uid()) OR manages_building(building_id) OR is_admin()` for both USING and WITH CHECK, so an **author can pin their own post** — and set `is_official` on it, which is the badge that says the building management said this. Column-level authority cannot be expressed in an RLS predicate that only sees whole rows, so it goes in a `BEFORE UPDATE` trigger.

**(b) The counters are dead.** There are **no triggers on any community table** (verified: `pg_trigger` where `not tgisinternal` returns zero rows for all six). `like_count` and `comment_count` are maintained by the *client*, in `togglePostLike` (`live.ts:1349-1360`) and `addPostComment` (`live.ts:1408-1411`), with a read-modify-write `update` on `community_posts` — which `posts_update_own` **denies to anybody but the author**. Neither call checks the error. So every like by a neighbour increments nothing, silently, forever. The counters move to triggers and the client stops touching them.

**(c) There is no removal path.** No DELETE policy exists on `community_posts` or `post_comments`. `deleted_at` exists and `useCommunityPosts` already filters `.is("deleted_at", null)` — so soft removal is one `update` away and hard deletion should stay impossible. A `DELETE` on a post **cascades** to `post_comments` and `post_reactions`, and a referential cascade is not subject to RLS.

- [ ] **Step 1: Prove (a) and (b) before fixing them**

Rolled back, as the resident subject: insert a post as yourself (Task 1 now permits it), then `update community_posts set is_pinned = true where id = <own>` — confirm it **succeeds**, which it must not. Then as the *second* resident, `update community_posts set like_count = like_count + 1 where id = <the first resident's post>` and confirm it reports **0 rows** rather than an error — that silence is the bug.

- [ ] **Step 2: The column guard**

`BEFORE UPDATE` on `community_posts`, `SECURITY DEFINER`, `set search_path = public, pg_temp`:

- `is_pinned` or `is_official` changed → raise unless `manages_building(new.building_id) or is_admin()`.
- `building_id` or `author_id` changed → raise, for everyone. A post does not move buildings and does not change hands.
- `like_count` or `comment_count` changed by anything other than the counter triggers → raise. Signal the legitimate writes with a transaction-local flag, exactly as `20260823000002_violations_stage_guard.sql` does:
  `perform set_config('pet10x.post_counts','ok',true);` and test `current_setting('pet10x.post_counts', true) = 'ok'`. The `true` third argument is what makes it transaction-local; without it the flag leaks between statements.
- `content`, `category`, `image_url`, `deleted_at` pass through untouched.

Compare with `is distinct from` on every column, so a no-op update of an unrelated field is not caught by a null.

The trigger bypasses RLS by virtue of being `SECURITY DEFINER`, so it re-checks scope by hand against `new.building_id` — never `old`, or a caller could move a post into a building they manage and pin it in the same statement. (`building_id` is frozen above, so this is belt and braces; keep both.)

- [ ] **Step 3: The counter triggers**

`AFTER INSERT OR DELETE` on `post_reactions` → `like_count`; `AFTER INSERT OR DELETE` on `post_comments` → `comment_count`. Each sets the flag from Step 2, updates the one post row, and is `SECURITY DEFINER` so it can write a post row the reacting user has no right to update.

Do **not** recompute with a full `count(*)` per event; `+1`/`-1` against the row is correct under the primary key `(post_id, profile_id)`, which makes a double-like impossible. Add a reconciliation statement at the end of the migration that sets both counters from the actual row counts — a no-op today (all tables empty), and the thing that makes the migration idempotent if it is ever replayed onto data.

- [ ] **Step 4: Moderation**

```sql
-- comments_update, comments_delete (new)
author_id = auth.uid()
or exists (select 1 from public.community_posts p
            where p.id = post_comments.post_id
              and (public.manages_building(p.building_id) or public.is_admin()))
```

Comments are hard-deleted — they have no `deleted_at` column and nothing references them, so there is no cascade to worry about and adding a column to carry a tombstone for a one-line comment is not worth it. **Posts are not**: no DELETE policy is added to `community_posts`, and removal is `update … set deleted_at = now()`, which `posts_update_own` already permits to the author, the manager and the admin. Say in a comment why the two differ.

Audit both: a manager or admin removing another person's content writes `audit_log` (`action` = `'community.post_removed'` / `'community.comment_removed'`, `entity_type`, `entity_id`, `building_id`, `metadata` carrying the author id). An author removing their own writes nothing — that is not a moderation act. Since a plain `update` cannot write `audit_log` from the browser, the moderation path needs an RPC: fold `moderate_community_post(p_post uuid, p_reason text)` into Task 3 rather than duplicating the definer boilerplate here, and have this migration only carry the policies and triggers.

- [ ] **Step 5: Apply and verify**

`apply_migration`, name `community_posts_integrity`. Then, rolled back and impersonating:

- author pins own post → **raises**; manager pins it → **succeeds**; admin pins it → **succeeds**; resident of another building → denied by RLS before the trigger is reached.
- author sets `is_official` → raises. Manager sets it → succeeds.
- any role sets `building_id` or `author_id` → raises.
- a direct `update … set like_count = 99` → raises, for author, manager **and** admin.
- second resident inserts a `post_reactions` row on the first resident's post → `like_count` becomes 1. Deletes it → back to 0. Two comments → `comment_count` 2; delete one → 1.
- author deletes own comment → succeeds. Second resident deletes the author's comment → denied. Manager deletes it → succeeds.
- `update … set deleted_at = now()` by the author, by the manager, by the admin → all succeed; by another resident → 0 rows.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260826000001_community_posts_integrity.sql
git commit -m "A count nobody could write, and a pin anybody could"
```

---

## Task 3: The three acts that cross users

**Files:**
- Create: `supabase/migrations/20260826000002_community_rpcs.sql`

**Interfaces:**
- Produces:
  ```sql
  report_lost_found(
    p_kind         text,                  -- 'lost' | 'found'
    p_pet_name     text default null,
    p_species      pet_species default null,
    p_breed        text default null,
    p_color        text default null,
    p_last_seen    text default null,
    p_reward_cents integer default null,
    p_image_path   text default null
  ) returns jsonb

  publish_building_event(p_event uuid, p_note text default null) returns jsonb

  moderate_community_post(p_post uuid, p_reason text default null) returns jsonb
  ```

All three `SECURITY DEFINER`, `set search_path = public, pg_temp`, all three re-check scope by hand and return `{ok:false,error:…}` rather than raising. `20260823000005_manager_remind_fine.sql` is the shape to copy, down to the `revoke execute … from public, anon` — note **`from public`, not `from anon`**: Phase 0 measured seven `revoke … from anon` statements in this repo that are no-ops because `anon` inherits the PUBLIC grant.

**`report_lost_found` takes no `building_id`.** It derives the building from the caller's single approved `resident_links` row. A parameter a caller controls is a parameter a caller can point at another building; removing it is stronger than validating it. If the caller has no approved link, return `{ok:false,error:'no_building'}`. If they somehow have more than one, return `{ok:false,error:'ambiguous_building'}` rather than picking — `my_building_link()` returns a single row and the app assumes one, so two is a state nobody has designed for and guessing is worse than saying so.

It then notifies every approved, unsuspended resident of that building — `kind = 'community'` (the enum has `compliance, incident, building, billing, community, system, assistant, care`; `community` is the right label and Phase 2 used `building` for enforcement, so they stay distinguishable), `severity = 'warning'` for `'lost'` and `'info'` for `'found'`, `action_target = 'community'` because that is the screen id `app/app/page.tsx:198` routes on. It excludes the reporter from its own broadcast.

**Rate limit, because this is a broadcast.** This is the first control on Pet10x that lets one resident put a notification in every neighbour's list. Bound it: at most **3** reports per profile per rolling 24 hours, counted from `lost_found` by `reporter_id`, returning `{ok:false,error:'rate_limited'}`. Count from the table itself rather than a new counter table — there is nothing to keep in sync and the row *is* the record.

**`publish_building_event`** notifies the building about an event that already exists, and is **manager/admin only** (`manages_building(e.building_id) or is_admin()`). A resident may create an event (Task 1) but may not broadcast it to everyone — that is the difference between organising something and announcing it, and it is the only thing keeping the notification list from becoming a second feed. The resident's event still appears in the Events tab for the whole building; it simply does not ring.

**`moderate_community_post`** sets `deleted_at`, requires `manages_building(p.building_id) or is_admin()`, and writes `audit_log`. It does not notify the author — a removal notice is a conversation, resident–manager messaging is explicitly out of scope, and a notification the author cannot reply to is worse than none.

All three write `audit_log` (`community.lost_found_reported`, `community.event_published`, `community.post_removed`).

- [ ] **Step 1: Write the failing assertions**

```sql
select proname, pg_get_function_identity_arguments(oid) from pg_proc
 where pronamespace='public'::regnamespace
   and proname in ('report_lost_found','publish_building_event','moderate_community_post');
```

Expected: **no rows.**

- [ ] **Step 2: Confirm the notification contract has not moved**

```sql
select polname, pg_get_expr(polwithcheck, polrelid) from pg_policy p
  join pg_class c on c.oid=p.polrelid where c.relname='notifications' and p.polcmd='a';
```

Expected: `notifs_insert_own_assistant` = `((profile_id = auth.uid()) AND (kind = 'assistant'::notification_kind))`. If that has changed, the definer requirement may have too — report before writing the migration.

- [ ] **Step 3: Write the migration**

Every parameter validated with a positive grammar: `p_kind` must be exactly `'lost'` or `'found'` (the table's `lost_found_kind_check` agrees, but failing in the RPC gives a sentence instead of a constraint name); `p_reward_cents` must be null or `> 0`; `p_image_path` must be null or match the exact path grammar Task 4 pins, and must be verified to actually exist in `storage.objects` under the caller's building — an unverified path is a claim, and a claim that renders as an image is a way to point a post at somebody else's object.

- [ ] **Step 4: Apply and verify every rule**

`apply_migration`, name `community_rpcs`. Then, impersonating and rolled back:

- Resident of Maple Court calls `report_lost_found('lost', 'Simba', 'cat')` → `{ok:true}`, exactly one `lost_found` row with `building_id` = Maple Court, one notification per **other** approved unsuspended resident of Maple Court and **none** for the reporter, zero notifications for any Harbour View resident, one `audit_log` row.
- A profile with no approved link → `no_building`, and **nothing written** — check `lost_found`, `notifications` and `audit_log` counts are unchanged.
- `p_kind = 'stolen'` → `invalid_kind`, nothing written.
- A fourth report within 24h → `rate_limited`, nothing written.
- `p_image_path` naming an object under a different building → rejected, nothing written.
- `publish_building_event` called by the event's **resident** creator → `forbidden`. By the building's manager → `{ok:true}` and one notification per approved resident. By a manager of a *different* building → `forbidden`.
- `moderate_community_post` by a resident → `forbidden`, `deleted_at` still null. By the manager → `{ok:true}`, `deleted_at` set, one `audit_log` row, and `useCommunityPosts`'s `.is("deleted_at", null)` filter now excludes it.
- `anon` calling any of the three → denied by the grant, not by the function body.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260826000002_community_rpcs.sql
git commit -m "Ring the whole building, but only three times a day"
```

---

## Task 4: Community media, minted by the server

**Files:**
- Create: `supabase/migrations/20260826000003_community_media_hardening.sql`
- Create: `app/api/community/media/sign/route.ts`

Read `supabase/migrations/20260821000001_storage_policies.sql:46-72` and `20260821000003_storage_policy_reconciliation.sql` **before writing anything.** The bucket's first policy set contained a self-service outage — the uploader policy validated only path segment 2 while the read policies cast segment 1 to `uuid`, so any authenticated user could upload one object under a non-uuid first segment and break every read of the bucket for everyone, admins included. It was closed by guarding the casts with `CASE`, not `AND`, because SQL does not promise left-to-right evaluation and the planner may reorder past a guard. **Keep the `CASE`.**

What the bucket permits today, read live:

| Policy | Predicate |
| --- | --- |
| `community-media building read` | `CASE WHEN seg1 ~ uuid THEN is_resident_of(seg1) OR manages_building(seg1) ELSE false END OR is_admin()` |
| `community-media uploader write` | `seg2 = auth.uid()::text AND CASE WHEN seg1 ~ uuid THEN is_resident_of(seg1) OR manages_building(seg1) ELSE false END` |
| `community-media uploader delete` | `seg2 = auth.uid()::text` — **no uuid guard, no manager or admin disjunct** |

And the bucket itself: `public = false`, `file_size_limit = null`, `allowed_mime_types = null`. Compare `guest-evidence`: 15 MB, five image types. `community-media` will accept a 2 GB executable from any resident.

There is no UPDATE policy, which means `createCommunityPost`'s `{ upsert: true }` at `live.ts:1312` cannot overwrite — it only appears to work because the path carries `Date.now()` and never collides.

- [ ] **Step 1: Configure the bucket**

Match `guest-evidence`, set in `20260822000001_evidence_path_hardening.sql`:

```sql
update storage.buckets
   set file_size_limit = 15728640,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
 where id = 'community-media';
```

- [ ] **Step 2: Pin the path with a positive grammar**

Today's predicates check segments 1 and 2 and say nothing about how many segments there are or what the filename looks like — `{building}/{uid}/a/b/../c` satisfies both. Replace the segment tests with one regex over the **whole** `name`, pinning every segment:

```
^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(post|lf)-[0-9a-f]{32}\.(jpg|png|webp|heic)$
```

Anchored at both ends, exactly three segments, no `.` or `/` admitted anywhere inside a segment, extension from a closed list. Then, and only then, the `CASE`-guarded `is_resident_of(seg1)` / `manages_building(seg1)` checks and `seg2 = auth.uid()::text`. State in a comment that the regex is the grammar and the `CASE` is the crash guard, and that removing either does not leave the other sufficient — Phase 1's lesson: enumerating the payload is not the same as characterising the class.

Give delete the same regex, plus `or is_admin()` and `or manages_building(seg1)` so a moderator can actually remove an image. Add no UPDATE policy; uploads are write-once and the filename carries 128 bits of randomness.

- [ ] **Step 3: The sign route**

Model on `app/api/incidents/evidence/sign/route.ts` — read it first. Differences:

- **The caller has a session.** Authorisation is `auth.uid()` and their approved building link, not a building code. Use the request's Supabase session; do **not** accept a `buildingId` in the body — derive it server-side, the same argument as `report_lost_found`.
- Accept `{ kind: "post" | "lf", contentType, size }` and return one `{ path, token }` from `createSignedUploadUrl`.
- The client's filename never reaches storage. Mint `(post|lf)-<32 hex>` server-side.
- Re-declare `MAX_BYTES` and `ALLOWED` to match Step 1 exactly, with the same comment the evidence route carries: these fail early with a readable sentence; the **bucket** is the enforcement point, and the two must be changed together.

- [ ] **Step 4: The `contentType` rule, in a comment and in the caller**

`uploadToSignedUrl` defaults the PUT to `text/plain;charset=UTF-8`, and a signed upload token binds path, upsert, scope and expiry — **never Content-Type.** With Step 1's allow-list in place, an uploader that omits `{ contentType: file.type }` gets `415 invalid_mime_type` from storage, three layers from the symptom. This cost real time in Phase 1. Task 5's caller passes it; this route's doc comment says why.

- [ ] **Step 5: Store the path, not the URL**

`createCommunityPost` currently stores a **365-day signed URL** in `community_posts.image_url` (`live.ts:1314-1315`). A signed URL in a column read forever is a dead link with a timer on it, and it embeds the object path — including an auth uid — in a row every neighbour can select. This migration does not change the column name (`image_url` stays; renaming it is churn), but Task 5 writes **paths** into it and signs at read time via `createSignedUrls`, the pattern `petFileSignedUrls` at `lib/supabase/storage.ts:49` already uses. `isStoragePath` at `:20` distinguishes a stored path from a legacy `/placeholder.jpg` — reuse it rather than writing a second predicate. Zero rows exist, so there is nothing to migrate.

- [ ] **Step 6: Apply and verify**

`apply_migration`, name `community_media_hardening`. Then, and **this one needs a real HTTP client, not SQL**:

- A resident uploads a JPEG via the route → object lands, and the *other* residents of that building can `createSignedUrl` it while a Harbour View resident cannot.
- The same resident PUTs to a token'd URL **without** `contentType` → storage returns `415`. Record the exact response; this is the assertion that proves Step 1 took effect.
- An object at `{building}/{uid}/../escape.jpg`, at `{building}/{uid}/x/y.jpg`, at `notauuid/{uid}/post-….jpg`, and at `{building}/{someone-elses-uid}/post-….jpg` → all four rejected by the INSERT policy.
- After a bad-first-segment upload attempt, `select` on a **good** object still works for a resident and for an admin — the outage regression test. Run it explicitly; this is the exact failure Phase 0 shipped and then caught.
- A manager deletes another resident's image → succeeds. A resident deletes a neighbour's → denied.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260826000003_community_media_hardening.sql app/api/community/media/sign/route.ts
git commit -m "Every segment named, and a bucket that finally says no"
```

---

## Task 5: The data layer

**Files:**
- Modify: `lib/data/live.ts` — community section, `:1195-1415`
- Modify: `lib/data/hooks.ts` — delete `useLostFound` and `useEvents` stubs at `:78-84`
- Modify: `lib/data/types.ts` — `LostFoundItem`, `CommunityEvent`, `CommunityPost`
- Create: `lib/data/community.ts` + `lib/data/community.test.ts` — the pure mappers
- Regenerate: `lib/supabase/database.types.ts`

- [ ] **Step 1: Regenerate the types first**

`mcp__supabase__generate_typescript_types`. Nothing below compiles against Task 1–3's policies, constraints and RPCs until they are current. Phase 2 lost a task to writing TypeScript against remembered SQL.

- [ ] **Step 2: Fix the type divergences**

Both are wrong today, and both will fail at runtime the moment a row exists:

| Type | Declares | Database | Fix |
| --- | --- | --- | --- |
| `LostFoundItem.id` (`types.ts:361`) | `number` | `uuid` | `string` |
| `CommunityEvent.id` (`types.ts:375`) | `number` | `uuid` | `string` |

`CommunityEvent` also needs `maxAttendees: number | null` — `events.max_attendees` is nullable, and the screen computes `(event.attendees / event.maxAttendees) * 100` at `community-screen.tsx:368`, which yields `Infinity` for a null cap and renders `width: Infinity%`. It has never fired because no event has ever existed.

`CommunityPost.unit` is populated by `mapPost` from a `myUnit` argument that `useCommunityPosts` passes as the empty string (`live.ts:1281`), so every post in the feed reads "Unit  · 3h ago". Either resolve the **author's** unit — which means joining `resident_links.unit_id` → `units`, and means deciding whether a neighbour's unit number should be on every post — or drop the field. **Decide: drop it.** A unit number is an address; publishing every author's address on every post is a disclosure nobody asked for, and the field has never displayed anything anyway. Remove `unit` from `CommunityPost` and the "Unit {post.unit} ·" fragment from the screen.

- [ ] **Step 3: The pure mappers, with tests**

`lib/data/community.ts` — no Supabase import, no React, so vitest's `environment: "node"` can reach all of it:

- `formatEventDate(startsAt: string): { day: string; date: string; time: string }` replacing the screen's `event.date.split(", ")[0]` / `.split(", ")[1]?.split(" ")[1]` string surgery at `:349-350`. That expression silently produces `undefined` for any date string that does not happen to contain `", "`, which is exactly the sort of thing a clean `tsc` and a green suite both wave through.
- `attendancePercent(going: number, cap: number | null): number | null` — `null` cap means no bar, not a full bar and not `Infinity`.
- `formatReward(cents: number | null): string | null` — `null` and `0` both mean no reward badge.
- `categoryClass(category: string | null): string` — falls back to the `General` class for anything unrecognised.
- `lostFoundShareText(item): string` — the share payload. **Its test is a security test**: assert the output contains the pet name, species, breed, colour, last-seen and the building name, and assert it contains **no** building code, no unit, no `http`, and no uuid. Write those as four explicit `expect(...).not.toMatch(...)` assertions, not one combined regex.

`lib/data/community.test.ts` covers each, including the null cap, the empty reward, the unknown category, and the share text.

- [ ] **Step 4: The live reads**

In `live.ts`, replacing the two stubs:

- `useEvents()` — `events` for the current building, `starts_at >= now() - interval '1 day'`, ordered ascending, plus a per-event `count` from `event_rsvps` (readable at last, thanks to `rsvps_read`) and a `mine` flag from the caller's own row. Name the building in the query: **RLS is the floor, the query is the filter.**
- `useLostFound()` — `lost_found` for the current building, `status = 'active'`, newest first, with `image_url` paths batch-signed through one `createSignedUrls` call.
- `useCommunityPosts()` — unchanged in shape; drop the `myUnit` argument, and batch-sign `image_url` the same way instead of trusting a stored URL.

`currentBuildingId()` at `live.ts:1222` calls `my_building_link()`, which is **resident-link based**. A manager with no resident link gets `null` and every community write refuses with "Link your building before posting" — while the screen shows them a "Post Official Announcement" CTA at `community-screen.tsx:183`. Extend it: fall back to the caller's `building_managers` row when there is no approved resident link, and return which of the two it was, so Task 6 can label the composer honestly.

- [ ] **Step 5: The mutations**

- `createCommunityPost` — plain insert (Task 1 now permits it); replace the direct `storage.upload` with the Task 4 sign route + `uploadToSignedUrl({ contentType: file.type })`; store the **path**; delete the `/row-level security/i` message-sniffing at `:1326-1328`, which now describes a rule that no longer exists.
- `togglePostLike` — delete the two read-modify-write `update community_posts` blocks entirely. They never worked and Task 2's trigger now raises on them. Insert or delete the `post_reactions` row and let the trigger count.
- `addPostComment` — same: drop the `comment_count` update.
- `rsvpToEvent(eventId, going)` — insert or delete one `event_rsvps` row; treat a duplicate-key error as success.
- `pinPost(postId, pinned)` — plain `update … set is_pinned` (Task 2's trigger authorises).
- `removePost(postId)` — the author's own removal is a plain `update … set deleted_at = now()`; a manager's goes through `moderate_community_post` so it is audited. Two paths, one function, chosen by whether `author_id` is the caller — and say so in a comment, because "why two ways to delete" is the first question a reader will have.
- `reportLostFound(...)` and `resolveLostFound(id)` — the RPC, and a plain `update … set status = 'resolved'`.
- `createEvent(...)` and `publishEvent(id)` — plain insert, and the RPC.

Every one returns `{ error: string | null }`, matching the existing convention in this file.

- [ ] **Step 6: Verify and commit**

`PATH="$HOME/.corepack-bin:$PATH" pnpm test` and `pnpm build` both clean. **`pnpm lint` is not a gate — it has never worked in this repo.**

```bash
git add lib/data/live.ts lib/data/hooks.ts lib/data/types.ts lib/data/community.ts lib/data/community.test.ts lib/supabase/database.types.ts
git commit -m "Two hooks that returned nothing, and a count the client was never allowed to write"
```

---

## Task 6: The screen does what it says

**Files:**
- Modify: `components/screens/community-screen.tsx`

| Control | Line | Becomes |
| --- | --- | --- |
| Pin → `toast.success("Post pinned")` | `:223` | `pinPost()`. Rendered only when the viewer manages **this** building — not on `user?.role`, which is a claim about the account, not about this feed |
| More options → `toast("More options — coming soon")` | `:228` | A real sheet: **Remove** for the author's own post and for a manager, **nothing else**. If that leaves it with one item for most viewers, show the one item; if a viewer can do nothing, do not render the button |
| Share → `toast.success("Link copied")` | `:257` | **Removed** from posts. There is no post route to share to, and a toast claiming a copy that did not happen is worse than no button |
| RSVP → `toast.success("RSVP confirmed")` | `:375` | `rsvpToEvent()`, toggling, with the live count from `rsvps_read` and the attendee names beside it |
| Search `<span>` | `:171-174` | It is a `<span>` styled as an input and has never been typeable. Make it a real client-side filter over the loaded list, or **remove it**. Do not leave it |
| `Unit {post.unit}` | `:219` | Removed with the field (Task 5 Step 2) |
| Empty-state CTAs | `:198`, `:274`, `:333` | Static `<p>` today. "Report a lost or found pet" and "Suggest an event" become buttons that open the new composers; "Be the first to share" opens the existing one |
| `<Image src={post.avatar}>` | `:209`, `:301`, `:452` | `avatar`/`image` are `""` when absent, and an empty `src` renders a broken image. Fall back to `/placeholder-user.jpg` and `/placeholder.jpg`, both of which exist in `public/` |
| `CATEGORY_COLORS[...]` | `:214`, `:343` | Through `categoryClass()` — the raw lookup renders the literal class `undefined` for an unknown category |

New: a **Lost & Found composer** (kind, pet name, species, breed, colour, last seen, optional reward, optional photo) calling `reportLostFound`, and an **event composer** (title, category, starts-at, location, optional cap) calling `createEvent`, with a **Publish** action visible only to a manager. A lost-pet card gets a **Share** button (`lostFoundShareText` → `navigator.share`, clipboard fallback, both guarded by `typeof navigator !== "undefined"` — copy `onboarding-flow.tsx:72-76`) and a **Mark resolved** action for its reporter.

- [ ] **Step 1: Reconcile with Phase 3**

`git log --oneline -- components/screens/community-screen.tsx`. Say in the commit message which world you are in — Phase 3 already ran and you are re-adding, or it has not and its Task 3 is now dead. Do not guess.

- [ ] **Step 2: Build it**

- [ ] **Step 3: Verify in a browser. This step is not optional.**

**Three defects this project shipped past a clean `tsc`, a clean build and a green suite were caught only by opening the page**: a control hidden under the fixed tab bar, a header sitting under the Dynamic Island, and a missing space in JSX. `PATH="$HOME/.corepack-bin:$PATH" pnpm dev`, then, signed in as the Maple Court resident:

- The Community tab is inside `IOSTabBar` (`app/app/page.tsx:207`), which is **fixed**. `main` carries `pb-24`. Every new composer, sheet and action row must clear it — scroll to the bottom of each tab and confirm the last control is fully tappable, not merely visible.
- The segmented control is `sticky top-16` (`:153`). Confirm the new composers open **above** it and that the sheet's own scroll does not fight the page's.
- At iPhone width, confirm no header sits under the notch and no card overflows horizontally.
- Post something. Have the **second** resident like and comment on it, and confirm the counters move — that is Task 2's trigger doing what the client could not.
- Report a lost pet as one resident; confirm the **other** resident's Alerts screen shows the notification and that the reporter's does not.
- Create an event as a resident; RSVP as both; confirm the count reads **2/N** and the names list shows both. Then confirm the resident sees **no** Publish button and the manager does.
- Sign in as the manager (persona-switch to resident to reach the Community tab — managers have no Community tab of their own, `ios-tab-bar.tsx:33-40`) and confirm Pin works and the composer no longer says "Link your building before posting". **That message is the current behaviour for every manager**, because `my_building_link()` is resident-only; Task 5 Step 4 is what fixes it and this is where you find out whether it did.
- Share a lost-pet card and **read the text that lands on the clipboard**. No building code, no unit, no URL, no uuid.

- [ ] **Step 4: The greps**

```bash
grep -nE "onClick=\{\(\) => toast" components/screens/community-screen.tsx
grep -rn "coming soon\|Coming soon" components/screens/community-screen.tsx
```

Both must return nothing outside a comment explaining history.

- [ ] **Step 5: Commit**

```bash
git add components/screens/community-screen.tsx
git commit -m "Four toasts, a fake search box, and a unit number nobody chose to publish"
```

---

## Phase 8 done when

1. `PATH="$HOME/.corepack-bin:$PATH" pnpm test` and `pnpm build` pass. (`pnpm lint` is not a gate and never has been.)
2. `grep -nE "onClick=\{\(\) => toast" components/screens/community-screen.tsx` returns nothing.
3. `can_post_today` — the count of accounts that can insert a `community_posts` row — is **24 residents + 4 managers + 2 admins**, not 0. Measured by the query in Task 1 Step 1, with the premium conjunct dropped.
4. A resident of Maple Court cannot insert, update or select a row in `community_posts`, `events`, `lost_found` or `event_rsvps` belonging to Harbour View Towers. Proven by impersonation, for all four tables, in both directions.
5. `events.building_id` and `lost_found.building_id` are `NOT NULL`, and no policy anywhere still contains `building_id IS NULL`.
6. Two RSVPs on one event read as **2** to a resident of that building, to its manager and to an admin, and as **0** to a resident of another building.
7. A direct `update community_posts set is_pinned = true` by the post's own author **raises**; by the building's manager, succeeds.
8. A direct `update community_posts set like_count = …` raises for author, manager and admin alike. Both counters equal the actual `post_reactions` / `post_comments` row counts for every post.
9. `community-media` has a `file_size_limit` and an `allowed_mime_types` list, its INSERT and DELETE policies are anchored regexes over the whole object name, and an upload attempt under a non-uuid first segment does not break reads for anyone. Verified after the attempt, not before.
10. No `image_url` in the database contains `http` — every one is a storage path, signed at read time.
11. Every `SECURITY DEFINER` function added by this phase re-checks scope by hand, is `set search_path = public, pg_temp`, and is `revoke execute … from public, anon` — **`from public`**, so the revoke is not one of the seven no-ops Phase 0 found.
12. A manager and an admin can remove any post in a building they hold, and every such removal has an `audit_log` row naming the actor and the author. An author removing their own has none.
13. The lost-and-found share text contains no building code, no unit, no URL and no uuid — asserted in `lib/data/community.test.ts`, not merely observed once.
14. Every control on the Community screen has been exercised in a browser at phone width, from both a resident and a manager account, and the bottom-most control of every tab is fully tappable above the fixed tab bar.
15. The Phase 3 overlap is resolved in one direction and the commit message says which.

---

## Where the spec disagreed with the live schema

Recorded so the next reader does not re-derive it. **The schema won every one of these.**

| # | The spec says | The database says |
| --- | --- | --- |
| 1 | `posts_insert` is on a table called **`posts`** (findings doc `:92`) | The table is **`community_posts`**. There is no `posts` table. The policy name `posts_insert` is real; the table name in the finding is not |
| 2 | Migration G `:415`: "`useEvents` / `useLostFound` become live queries; **event attendance is counted from `event_rsvps`**" | Impossible as written. `event_rsvps` has one policy, `rsvps_self`, `profile_id = auth.uid()`. A resident and a manager each see exactly their own row. Task 1 Step 8 adds the missing `rsvps_read` |
| 3 | Migration G: "**No DDL**" for the community half | Four DDL changes are unavoidable: two `set not null`, two check constraints — plus six policy replacements and three triggers. The community half of G is not a read-only change |
| 4 | Audit `:18`, Shape 2: Events + RSVP and Lost & Found have "**full RLS**", and "RLS is already correct for all of these. Only the UI and the write path are missing" | The opposite. `lost_found_insert` is `reporter_id = auth.uid()` with **no** building predicate; `events_write` has a self-authorising `created_by = auth.uid()` disjunct. Both were measured admitting a cross-building write and a platform-wide one. This is the single most consequential divergence in the phase |
| 5 | Audit `:18`: `community-screen.tsx` — "Pin, share, more-options and RSVP are toasts" | Correct, and **incomplete**: the Search field at `:171-174` is a `<span>`, not an input, and has never been typeable |
| 6 | `LostFoundItem.id: number`, `CommunityEvent.id: number` (`lib/data/types.ts:361,375`) | Both are `uuid` |
| 7 | `LostFoundItem.status: "active" \| "resolved"` | `lost_found.status` is bare `text` with **no check constraint**. The type is an unenforced hope |
| 8 | The screen treats `event.maxAttendees` as a number | `events.max_attendees` is **nullable**; the existing percentage expression yields `Infinity` |
| 9 | Phase 3's plan `:97`: "no policy permits a resident to set `is_pinned`" | `posts_update_own` is `(author_id = auth.uid()) OR …` for both USING and WITH CHECK, so an author **can** pin — and set `is_official` — on their own post |
| 10 | The findings doc frames the premium gate as the community blocker | It is one of two, and the smaller. The gate stops 0 people from doing something 0 people have ever done; the missing building predicates let 24 people write into buildings they have no relationship with |
| 11 | `community_posts.image_url` reads as a URL column | `createCommunityPost` writes a **365-day signed URL** into it — a dead link with a timer, embedding an auth uid in a row every neighbour can select |
| 12 | `like_count` / `comment_count` read as maintained counters | Nothing maintains them. There are **zero** triggers on all six community tables, and the client-side update path is denied by RLS to everyone but the post's author, silently, with the error unchecked |

## What changes this phase's scope

- **Task 1 was not in the roadmap line and is now most of the phase.** "Events, RSVP, Lost & Found, pin, share" assumed the tables were usable. Two of them are open and one is shut, and no UI on top of that is worth building. If time runs short, Task 1 alone is a shippable phase and Tasks 5–6 are not shippable without it.
- **Phase 3's Task 3 is superseded.** It removes Pin, More-options and Share from this file; this phase makes two of the three real. Whichever runs second wins — reconcile explicitly, and prefer dropping Phase 3's Task 3 if it has not yet run.
- **Resident-created events are in; resident-created *broadcasts* are out.** A resident may organise an event in their own building; only a manager may ring every neighbour about it. This was a judgement call, not a constraint.
- **Attendee identity becomes visible to the building.** `rsvps_read` is what makes "12 going" possible, and it necessarily discloses *who*. Task 6 shows the names rather than hiding them behind a number, so the disclosure is legible to the person making it.
- **Premium as a quota is named and deferred.** If community is to be monetised, the mechanism is a bounded quota inside an RPC that can explain itself, not an RLS denial surfacing as `42501`. Not built here.
- **Out of scope, named in the spec so it is not rediscovered:** resident–manager messaging (which is why a removal notice does not notify the author), granular per-manager roles, the 23 settings-menu stubs. Also out: any public route for a post, which is why Share is removed from the feed rather than wired.
