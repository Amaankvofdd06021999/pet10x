# Phase 4 — Multi-pet care

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A household with more than one pet can see every pet's day, and can tell which pet anything on the screen belongs to. Today it cannot: `components/screens/home-screen.tsx:70` sets `primaryPet = pets[0]` and hands that one id to both care surfaces, so the second and third pets are absent from Home entirely.

**Architecture:** Nothing about the data is broken. `pet_care_tasks`, `care_targets`, `care_entries` and `pet_care_log` are all per-pet, RLS is owner-scoped, and a multi-pet `in (…)` read is already admitted by the existing policies — verified by impersonation below. This is a client-side phase: one shared "which pet" selection, one household-wide task query, and pet attribution on every row, sheet and toast that acts on one animal.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Supabase Postgres 17, `sonner`, `lucide-react`, pnpm 9 via corepack.

**Spec:** [`docs/superpowers/specs/2026-08-21-completing-manager-resident-flows-design.md`](../specs/2026-08-21-completing-manager-resident-flows-design.md) — AD-10, and "Multi-pet care — no DDL" at line 451.

---

## Ground truth

Everything below was read from `supabase/migrations/`, from the live `Pet10x`
database (`ekgejmxgnlmdomkpblki`), and from the components themselves before
this plan was written. Phase 2 lost a task to a brief that quoted a spec
migration block that had never been applied; nothing here is quoted from the
spec without being checked against the schema.

### The defect is real, and it is the majority case

`usePets` (`lib/data/live.ts:302`, loader at `:262-280`) selects
`owner_id = auth.uid()`, `deleted_at is null`, ordered `created_at ascending`.
So `pets[0]` is the **oldest** pet. Home passes only that id to
`TodayCareTiles` (`home-screen.tsx:316-320`) and `TodayScheduleStrip`
(`:321`), and writes only that name into the card's subtitle (`:309`).

Live distribution of pets per owner:

| Pets | Owners |
| --- | --- |
| 1 | 8 |
| 2 | 16 |
| 3 | 4 |

**20 of 28 households — 71% — have more than one pet, and none has more than
three.** Multi-pet is not the edge case this screen treats it as. Design for
one to three; make four not break.

### The collision AD-10 predicts already exists in production

Owner `1752d52b-f037-42ad-ac99-d90f6f916cfd` (Jiya Paul,
`jiyadeborupa@gmail.com`) owns two cats, **Jojo** (`e5faa383-…`, created
07:44:09) and **Mimo** (`2509435b-…`, created 07:45:03). Both carry the same
three tasks at the same three times:

| Label | Kind | Time | Jojo | Mimo |
| --- | --- | --- | --- | --- |
| Breakfast | `meal` | 08:00 | ✅ | ✅ |
| Playtime | `other` | 18:00 | ✅ | ✅ |
| Dinner | `meal` | 18:30 | ✅ | ✅ |

Both also carry the same three targets — food *Meals* 2 can/day, treat *Treats*
3 pieces/day, play *Playtime* 20 min/day. So today Jiya sees three of her six
tasks and one cat's three goals, with nothing on screen saying which cat. Widen
the strip naively and she sees "Breakfast, Breakfast, Playtime, Playtime,
Dinner, Dinner". This is the exact pair of failures AD-10 describes, and it is
live.

### Where the roadmap overstates, and where it understates

The roadmap says *"the home screen shows only `pets[0]`, so a second pet's
medication is invisible"*.

- **The mechanism is exactly right.** Every task belonging to any pet other
  than `pets[0]` is invisible on Home.
- **The medication instance is hypothetical.** `select kind, count(*) from
  pet_care_tasks group by kind` returns `meal` 8, `walk` 5, `other` 2,
  `grooming` 1 — **zero rows with `kind = 'medication'` exist anywhere in the
  database.** No live household is currently missing a dose. Do not repeat the
  medication claim as a statement of live fact.
- **It understates the goals half.** The roadmap frames this as tasks only. The
  care *tiles* are also locked to `pets[0]`, and because Jiya's two cats carry
  byte-identical targets, feeding Mimo moves nothing on her home screen and
  there is no clue why. A silently wrong number is worse than an absent one.

### The tables, as they actually are

Verified against `information_schema.columns`.

| Table | Columns this phase touches |
| --- | --- |
| `pets` | `id, owner_id, name, species (pet_species), image_url, deleted_at, created_at` |
| `pet_care_tasks` | `id, pet_id, label, detail, kind (care_kind), scheduled_at (time), days_of_week (smallint[]), is_active, remind_minutes_before, sort_order, recurrence (text), interval_days, next_due_on, starts_on, ends_on, dose, target_id, log_amount, time_label` |
| `pet_care_log` | `id, task_id, on_date, completed, completed_at` — **no `pet_id`**; the pet is reachable only through `task_id` |
| `care_targets` | `id, pet_id, kind (care_entry_kind), label, target_amount, unit, period, sort_order, is_active` |
| `care_entries` | `id, pet_id, kind (care_entry_kind), label, amount, unit, note, logged_at, logged_by, source_task_id` |

Two enums, not one, and they are different vocabularies:

- `care_kind` (tasks): `meal, medication, water, walk, grooming, other`. **No
  `play` and no `treat`** — which is why Jiya's "Playtime" task is stored as
  `other`.
- `care_entry_kind` (targets and entries): `food, water, treat, medicine, walk,
  play, outing, potty, weight, other`.

Do not map one onto the other. A task's `kind` is not a target's `kind`; the
link between them is `pet_care_tasks.target_id`, a real FK to `care_targets(id)`
with `on delete set null`.

Constraints worth knowing before writing a seed: `care_targets` has a unique
index on `(pet_id, kind, lower(btrim(label)))`; `pet_care_log` is unique on
`(task_id, on_date)`; `pet_care_tasks` has a check requiring
`recurrence = 'daily'` ⇒ `interval_days is null`, and `recurrence = 'interval'`
⇒ both `interval_days > 0` and `next_due_on not null`; `days_of_week` must be a
subset of `{0..6}` **as smallint** — cast array literals or the insert fails.

### RLS admits the multi-pet read already — measured, not assumed

All four care tables carry a single `FOR ALL` policy shaped
`exists (select 1 from pets p where p.id = <tbl>.pet_id and (p.owner_id = auth.uid() or …))`,
evaluated per row, so an `in (…)` list of the owner's own pets is fine. Proven
by impersonation inside a rolled-back transaction:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"1752d52b-f037-42ad-ac99-d90f6f916cfd","role":"authenticated"}';
select pet_id, count(*) from public.pet_care_tasks
 where pet_id in ('e5faa383-1bdb-43c7-8ee9-575d45787998','2509435b-e62f-4906-9ead-24c133b891de')
 group by pet_id;
rollback;
```

Returned 3 and 3. The same probe against `care_targets` returned 3 and 3.

**This phase needs no migration and no policy change.** That agrees with the
spec's own "Multi-pet care — no DDL". Any task in this plan that finds itself
reaching for `apply_migration` has taken a wrong turn — stop and report.

### Two places the spec is wrong about the code

1. **The spec says `useHouseholdCareTasks(petIds)` should return rows "carrying
   `petName` and `petImage`".** It must not carry `petImage`.
   `pets.image_url` holds a **storage path**, not a URL;
   `loadPetsInto` (`lib/data/live.ts:274-279`) signs those paths through
   `petFileSignedUrls` and caches the result. A hook that selects `image_url`
   itself would hand the strip an unsigned path and every avatar would 404. The
   strip resolves name *and* avatar by joining `ScheduledCareTask.petId`
   against `usePets()`, whose images are already signed and shared. This plan
   deliberately diverges from that sentence.
2. **The spec says to wire the pet rail's scroll position to the care card:**
   *"`handleRailScroll` computes `activePet` … Wiring it to the care card means
   swiping to a pet shows that pet's goals."* **Do not do this.** Reasons in
   the design section; the short version is that `handleRailScroll` cannot fire
   at `md` and above, where the rail becomes `md:grid md:grid-cols-2
   md:overflow-visible` and the dots are `md:hidden`
   (`home-screen.tsx:229-231, 277`). Selection derived from scroll would be
   frozen at `pets[0]` on every desktop — the same defect, re-introduced at a
   breakpoint.

### What the seed provides, and what it does not

`supabase/seed_strata.sql` (266 lines) seeds 17 demo auth users, 5 buildings,
40 units, and **34 pets across 15 residents** — of whom eleven own two pets and
four own three (`…0013`, `…0019`, `…0020`, `…0022`). It seeds vaccinations and
documents. It seeds **no `pet_care_tasks`, no `care_targets`, no
`care_entries`, no `pet_care_log`.** Confirmed in live data: every
`a5000000-…` owner has zero tasks and zero entries.

So there is no account this phase can be checked against. The only live
household with real multi-pet care data is Jiya Paul's, a genuine user whose
password nobody has. **The seed must be extended before any UI task can be
verified**, which is why that is Task 1.

The seed also contains **no single-pet resident at all** — all 15 own two or
more. The one-pet layout, which 8 of 28 live households see, has no fixture
either. Task 1 adds one.

### Smaller things found on the way, not in scope

- `care_entries` carries two byte-identical indexes,
  `care_entries_pet_kind_idx` and `care_entries_pet_kind_logged_idx`, both
  `(pet_id, kind, logged_at DESC)`. Pre-existing; do not fix here.
- `pets.compliance_pct` is `0` for every row in the database; compliance is
  computed client-side by `computeCompliance` (`lib/data/live.ts:53`). Relevant
  only because it means Task 1 cannot disturb it.

---

## Global constraints

- **pnpm needs `PATH="$HOME/.corepack-bin:$PATH"`** (9.15.9). Do not upgrade it.
- **`pnpm lint` has never worked in this repo** — `eslint` is in the script but
  is not a dependency and has no config, on `main` too. Do not treat its
  failure as a regression and do not try to fix it here.
- **vitest is `environment: "node"` with no jsdom** (`vitest.config.ts`).
  Component tests are impossible. Only pure functions can be unit-tested — so
  every task below that has testable logic states which *pure* function carries
  it, and pushes the logic out of the component to get it there.
- **No Supabase CLI, no Docker.** Migrations would go through the MCP
  `apply_migration`; assertions through `execute_sql`. This phase applies no
  migration. The seed additions are **DML and go through `execute_sql`, never
  `apply_migration`** — a seed must not land in `supabase_migrations`.
- **Supabase project:** `Pet10x`, ref `ekgejmxgnlmdomkpblki`. This is live
  production. Reads are free; every write is deliberate and named in a task.
- **A control that cannot act must not exist.** No `toast()` standing in for a
  mutation.
- **Never edit an applied migration.**
- **Three defects this project shipped past a clean `tsc`, a clean `pnpm
  build` and a fully green test suite were caught only by opening the page** —
  most recently a missing space in JSX that rendered "firstfine" in the
  manager's UI, and before that a control rendered underneath the fixed tab
  bar. This phase is almost entirely presentation. Tasks 3 through 7 below are
  **not verifiable by any command**; each names what to look at in a browser
  and with which account, and that step is not optional.

---

## The design

The user's complaint was *"the goal setting / today's care doesn't properly
specify the pet if we have multiple pets, think on how the UI can be
improved."* AD-10 sets the direction. What follows is the concrete shape, and
what was rejected.

### The split, and why the card shows it rather than implies it

Two things live in the "Today's Care" card and they aggregate differently:

- **A schedule aggregates.** Running a morning means doing everything due at
  08:00 for everyone. One time-ordered list across the household is how the
  morning actually happens, and it is where a missed dose hides.
- **A goal does not.** "2 / 4 cans" across two cats is true when one ate
  everything and the other ate nothing. Progress against a target is only ever
  about one animal.

So the card is restructured into two visibly separate blocks, **schedule first**
(it carries the risk), then a rule, then goals:

```
┌ Today's Care ─────────────────────────────────┐
│  ♥  Today's Care                          ›   │
│     Everyone's plan, and one pet's goals      │
│                                               │
│  Breakfast · 8:00 AM                          │
│    🐱 Jojo                                ○   │
│    🐱 Mimo                                ○   │
│  Playtime · 6:00 PM                           │
│    🐱 Jojo                                ○   │
│    🐱 Mimo                                ○   │
│  +2 more in the schedule                      │
│  ───────────────────────────────────────────  │
│  Goals      [🐱 Jojo] [🐱 Mimo]               │
│  ┌───────┬───────┬───────┐                    │
│  │ Food  │ Play  │ Meds  │                    │
│  │ 1 / 2 │  Done │Not yet│                    │
│  └───────┴───────┴───────┘                    │
└───────────────────────────────────────────────┘
```

Today the tiles sit above the strip. Reordering makes the aggregate/per-pet
split legible instead of something the reader has to infer.

### One pet, four pets, and the single-pet case

**With one pet the card must look exactly as it does today**, minus the bugs —
no chips, no avatars, no names on schedule rows, one row per task. 8 of 28
households are single-pet and none of this is information to them; a picker
with one option is noise. `PetContextSwitcher`
(`components/ai/pet-context-switcher.tsx:20`) already sets that precedent by
returning `null` below two pets, and the pet rail already collapses its
scroller at one pet (`home-screen.tsx:229`). Follow both.

**With two or three** — 20 of 28 households, and the whole of the live range —
chips fit on one line at phone width and every group in the schedule is at most
three rows deep.

**With four or more** the chip row scrolls horizontally using the existing
`no-scrollbar overflow-x-auto` pattern already in `pet-care-screen.tsx:53`. No
new mechanism, no wrapping, no truncated grid. Nothing in the design assumes an
upper bound.

### Naming the pet without a wall of names

AD-10's worry is three indistinguishable "Morning meal" rows. The instinct is
to prefix each with its pet, giving "Jojo · Breakfast / Mimo · Breakfast" — but
that repeats the *label*, which is the part that is the same, and buries the
name, which is the part that differs.

Invert it. **Group by `(label, scheduledAt)`. Write the label once as a group
header; give each pet its own row underneath, carrying avatar and name and its
own tick.** The repetition removed is the label. The new information — which
animal — is the whole content of each row, so it reads at a glance.

A task that no other pet shares is a group of one and renders inline on a
single line: `🐕 Max · Hh — 5:00 PM ○`. So a household with entirely
different routines never sees a header, and a household with identical routines
never sees a duplicated label.

**Ticking stays one write per task.** Merging a group into a single tick that
marks both pets was considered and rejected: `setCareTaskDone` also writes a
`care_entries` row when the task links a target, so a two-pet tick is two
multi-statement writes, and a half-failure would leave the UI unable to say
which cat was fed. A tick is a claim about one animal; it stays that.

### Selecting a pet, and remembering it

**Rejected: deriving the selection from the pet rail's scroll position**, which
is what AD-10 suggests. Three reasons, in order of severity:

1. **It is dead above `md`.** `handleRailScroll` is bound to a container that
   is `md:grid md:grid-cols-2 md:overflow-visible`, so it never fires on
   desktop, and the dots it feeds are `md:hidden`. Desktop selection would be
   permanently `pets[0]` — this defect, at a breakpoint.
2. **It is invisible.** The dots currently mean "you are looking at card 2 of
   3". Wiring them would silently make them also mean "the goals below are
   Mimo's", with no affordance saying so, and scrolling to *look* at a pet
   would change what the numbers underneath mean.
3. **It cannot persist.** A scroll offset is not a value you can store, so the
   selection would reset on every navigation.

**Chosen: an explicit chip row**, the same control `pet-care-screen.tsx:52-68`
already renders for the same choice, extracted into
`components/screens/home/pet-chips.tsx` so both surfaces use one component and
cannot drift. Chips carry the pet's avatar as well as its name, so the identity
is visual — matching the avatars on the schedule rows above.

**The selection is one remembered value shared by Home and the Trackers
screen**, as AD-10 requires. It lives in `lib/data/selected-pet.ts`: a
module-level store mirrored to `localStorage`, keyed by profile id — the
pattern `MissingInfoCard` already uses (`missing-info-card.tsx:26`), including
its `try/catch` so a private-mode browser degrades to session-only rather than
throwing.

Resolution is stated as a **positive grammar**, not a list of failure cases:

> The selected pet is the stored id **if and only if** that id names a pet in
> the current `pets` list. Otherwise it is `pets[0]`. With no pets it is
> `undefined`.

That single rule answers every lifecycle question, which is why it is written
this way rather than as a set of guards:

- **A pet is added** → the stored id is still in the list → selection does not
  move. Adding a second cat must not silently redirect your goals.
- **The selected pet is deleted** (soft-deleted, so it leaves `usePets`) → the
  stored id names nothing → falls back to `pets[0]`, and the store rewrites
  itself to match rather than holding a dangling id.
- **A different account signs in on the same device** → different key, no
  bleed. Sign-out clears it alongside `clearPetsCache()`.
- **Nothing stored yet** → `pets[0]`, which is today's behaviour, so a
  first-run household sees no change.

### Opening a pet from its task

A schedule row names a pet but currently cannot open it: the shell overloads
the second argument of `handleNavigate` for `pet-care` as a *care kind*, not a
pet (`app/app/page.tsx:134`), so there is no way to reach a specific pet's
tracker from Home. Tapping a row's label sets the shared selection to that pet
and opens the tracker on it — which is the same remembered value the goal tiles
read, so the two surfaces stay in agreement by construction.

### What this phase is not

No second carer, no task assignment, no "who fed the dog" between two people in
one home. The spec puts household care assignment out of scope and it stays
out. Every pet's tasks are shown to the account holder; that is all.

---

## Task 1: A household to test against

**Files:**
- Modify: `supabase/seed_strata.sql`

The seed has 34 pets and zero care rows, so nothing after this task can be
looked at. It also has no single-pet resident. This task fixes both.

Three fixtures, chosen to cover the live range (1, 2 and 3 pets) and to
reproduce the exact collision that motivated the phase:

| Resident | Login | Pets | Purpose |
| --- | --- | --- | --- |
| Isabella Fournier `a5000000-…0019` | `isabella.fournier@pet10x.com` | Buddy (dog), Lola (cat), Zoe (dog) | 3 pets. Identical labels at identical times → group headers. Lola alone gets a `medication` task → the case the roadmap names, which no live row currently covers. |
| Sofia Nguyen `a5000000-…0011` | `sofia.nguyen@pet10x.com` | Biscuit (dog), Mochi (cat) | 2 pets, the commonest household. Deliberately *different* routines → groups of one, inline rows, no headers. |
| Priya Raman `a5000000-…0026` *(new)* | `priya.raman@pet10x.com` | Nutmeg (dog) | 1 pet. The control: this card must look unchanged. |

All demo accounts use `Password123!`.

**Priya must have no building and no unit.** `pets.building_id` and
`pets.unit_id` are nullable and the app supports an unlinked resident (Home
renders its "Link your building" banner). Giving her a building would put a new
pet into an engineered compliance spread; giving her none makes it impossible
for this task to move any building's numbers at all.

- [ ] **Step 1: Record what must not change**

```sql
select b.name, count(p.id) as pets
from public.buildings b left join public.pets p
  on p.building_id = b.id and p.deleted_at is null
where b.id::text like 'b5000000%' group by b.name order by b.name;

select count(*) from public.pet_care_tasks;   -- expect 16
select count(*) from public.care_targets;     -- expect 30
```

Keep the building/pet counts. They must be identical at Step 4.

- [ ] **Step 2: Write the seed block**

Append a new numbered section to `supabase/seed_strata.sql`, after section 3.
The file declares itself idempotent and re-runnable; keep that true.

- Give every row an **explicit uuid** and `on conflict (id) do nothing` —
  neither `pet_care_tasks` nor `care_entries` has a natural unique key, so
  without this a second run doubles the schedule. Use `d6000000-…` for
  `care_targets` and `d7000000-…` for `pet_care_tasks`.
- **Insert targets before tasks.** `pet_care_tasks.target_id` is a real FK to
  `care_targets(id)`.
- **`days_of_week` is `smallint[]`.** Write `array[1,2,3,4,5]::smallint[]` or
  the check constraint rejects the row. Every-day is stored as `null`, not
  `{0,…,6}` — that is the representation `addCareTask`
  (`lib/data/care-schedule.ts:234`) and `taskRunsOn` (`:91`) both rely on.
- **`recurrence` must be `'daily'` with `interval_days` null**, per
  `pet_care_tasks_interval_shape_check`. Do not seed an interval task.
- Set `time_label` alongside `scheduled_at`; `addCareTask` keeps them
  consistent and something may still read it.
- Task `kind` comes from `care_kind` (`meal, medication, water, walk, grooming,
  other`) — there is **no `play`**, so a playtime task is `other`. Target
  `kind` comes from `care_entry_kind` (`food, water, treat, medicine, walk,
  play, outing, potty, weight, other`). They are different enums; do not reuse
  a value across them without checking it exists in both.

Isabella's three pets — the collision case:

| Pet | Task | Kind | Time | Days |
| --- | --- | --- | --- | --- |
| Buddy, Lola, Zoe | Breakfast | `meal` | 07:30 | every day |
| Buddy, Lola, Zoe | Dinner | `meal` | 18:00 | every day |
| Buddy, Zoe | Evening walk | `walk` | 17:00 | every day |
| Lola | Thyroid tablet | `medication` | 08:00 | every day, `dose = '1 tablet'` |

Targets must **differ per pet**, or the selector cannot be seen to work:
Buddy food *Kibble* 3 cup/day; Zoe food *Kibble* 2 cup/day; Lola food *Wet
food* 2 can/day plus medicine *Thyroid tablet* 1 dose/day. Link Buddy's,
Zoe's and Lola's Breakfast tasks to their food target with a `log_amount` of
half the daily figure, so ticking Breakfast visibly moves the tile to half.

Sofia's two pets — the no-collision case: Biscuit `walk` "Morning walk" 06:45
and `meal` "Dinner" 18:30; Mochi `grooming` "Brush" 20:00 and `meal` "Supper"
19:00. Four tasks, four distinct `(label, time)` pairs, so nothing groups.

Priya: one auth user (follow the existing `do $$` block's shape and
`handle_new_user` trigger, id `a5000000-0000-4000-8000-000000000026`), one pet
Nutmeg (dog, `building_id` and `unit_id` **null**, `registration_status`
`'draft'`), one `meal` task "Breakfast" 08:00 and one food target.

- [ ] **Step 3: Apply it**

Run the new block through `execute_sql`, **not** `apply_migration` — a seed is
DML and must not enter the migrations table. Run it **twice** and confirm the
second run inserts nothing.

- [ ] **Step 4: Verify**

```sql
select p.name, count(t.id) as tasks
from public.pets p left join public.pet_care_tasks t on t.pet_id = p.id
where p.owner_id in ('a5000000-0000-4000-8000-000000000019',
                     'a5000000-0000-4000-8000-000000000011',
                     'a5000000-0000-4000-8000-000000000026')
  and p.deleted_at is null
group by p.name order by p.name;
```

Expected: Buddy 3, Lola 3, Zoe 3, Biscuit 2, Mochi 2, Nutmeg 1.

Then re-run Step 1's building/pet-count query and confirm it is **byte-for-byte
identical** to what was recorded — Priya's pet has no `building_id`, so no
building may have gained one. And confirm the second seed run was a no-op:
`pet_care_tasks` must total exactly `16 + 14 = 30`.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed_strata.sql
git commit -m "Three households, one pet each too many"
```

---

## Task 2: The remembered pet

**Files:**
- Create: `lib/data/selected-pet.ts`
- Create: `lib/data/selected-pet.test.ts`
- Modify: `lib/data/index.ts`
- Modify: `lib/data/live.ts` (clear the selection in `clearPetsCache`)

**Interfaces:**
- Produces: `resolveSelectedPet(storedId: string | null, pets: Pet[]): Pet | undefined` — pure.
- Produces: `useSelectedPet(): { pet: Pet | undefined; petId: string | undefined; select: (id: string) => void }`.
- Produces: `clearSelectedPet(): void`.

The whole rule, and the only rule:

> The selected pet is the stored id **if and only if** that id names a pet in
> the current list. Otherwise `pets[0]`. With no pets, `undefined`.

Stated positively on purpose — a denylist of failure cases ("if deleted…", "if
signed out…") is how the dangling-id bugs get in. One predicate covers add,
remove, sign-out, private mode and first run.

Storage key: `pet10x.selectedpet.${profileId}`, mirroring
`missing-info-card.tsx:26`. Every `localStorage` read and write is wrapped in
`try/catch`; a private-mode browser must degrade to a session-only selection,
never throw. Follow the module-store shape already in `live.ts:230-240`
(`petsSubs` + `notify`) so a change on Home is seen by the Trackers screen
without a prop.

- [ ] **Step 1: Write the failing test**

`lib/data/selected-pet.test.ts` against `resolveSelectedPet` alone — it is pure,
which is the only reason any of this is testable in a `node` vitest with no
jsdom. Cases: stored id present in list → that pet; stored id absent → `pets[0]`;
stored `null` → `pets[0]`; empty list → `undefined`; empty list with a stored id
→ `undefined`, not a throw.

`pnpm test` fails because the module does not exist. That is the expected
failure — record it.

- [ ] **Step 2: Implement**

Keep `resolveSelectedPet` exported and free of React, `window` and
`localStorage`. The hook composes it with `usePets()` and the store; the test
never touches the hook.

When the resolved pet differs from the stored id, **write the resolved id back**
so the store self-heals after a deletion instead of retrying a dangling id on
every render.

- [ ] **Step 3: Wire the lifecycle**

Export from `lib/data/index.ts`. Call `clearSelectedPet()` wherever
`clearPetsCache()` is called on sign-out, so the next account on the device does
not inherit a selection.

- [ ] **Step 4: Verify and commit**

`pnpm test` green (5 new tests) and `pnpm build` exits 0.

```bash
git add lib/data/selected-pet.ts lib/data/selected-pet.test.ts lib/data/index.ts lib/data/live.ts
git commit -m "One answer to 'which pet', and it survives the tab"
```

---

## Task 3: Household tasks, and the grouping that makes them readable

**Files:**
- Modify: `lib/data/care-schedule.ts`
- Create: `lib/data/care-schedule.test.ts`

**Interfaces:**
- Produces: `useHouseholdCareTasks(petIds: string[], dateKey?: string): ScheduledCareTaskResult`
- Produces:
  ```ts
  interface HouseholdTaskGroup {
    key: string                  // `${label}@${scheduledAt ?? "allday"}`
    label: string
    scheduledAt: string | null
    overdue: boolean
    tasks: ScheduledCareTask[]   // in petIds order
  }
  groupHouseholdTasks(
    tasks: ScheduledCareTask[],
    petIds: string[],
    nowMinutes: number,
  ): HouseholdTaskGroup[]
  ```

`useCareTasks` becomes a one-line wrapper over the same loader so there is one
query, not two that can drift.

**The trap in this task, stated up front.** `useCareTasks`'s `refetch` is a
`useCallback` with deps `[petId, dateKey]`, consumed by
`useEffect(..., [refetch])` (`care-schedule.ts:197-201`). Hand it an array built
inline — `pets.map(p => p.id)` — and the array has a new identity every render,
so the callback is new, so the effect fires, so `setState` runs, so it renders
again. **Infinite refetch loop, and it will not show up in `tsc`, in `pnpm
build`, or in any test in this repo.** Key the callback on a stable string:

```ts
const key = petIds.join(",")
const refetch = useCallback(async () => { /* … splits key back into ids … */ }, [key, dateKey])
```

The pet-side query becomes `.in("pet_id", ids)`; the completion query is already
`.in("task_id", ids)` and does not change. Both are admitted by existing RLS —
measured, see Ground truth. **An empty `petIds` must short-circuit to `[]` and
never issue `in ()`**, which Postgrest renders as a syntax error rather than an
empty result.

`groupHouseholdTasks` is pure and carries every rule that could be wrong:

- Group by `(label, scheduledAt)` exactly — trimmed and case-insensitive on the
  label, because these are typed by hand and "Breakfast" and "breakfast" are the
  same meal. The group displays the first member's label as typed.
- Groups sort by `minutesOfDay(scheduledAt) ?? 1e4`, so all-day sinks to the
  bottom, matching `today-schedule.tsx:65-67`. Ties break on label, so the order
  is stable across renders.
- Members sort by index in `petIds`, which is `usePets` order, which is
  `created_at`. Passing the order in is what keeps the function pure and
  testable.
- `overdue` is `scheduledAt != null && nowMinutes > minutesOfDay(scheduledAt)` —
  a property of the group, since a group shares one time.

- [ ] **Step 1: Write the failing tests**

`lib/data/care-schedule.test.ts` against `groupHouseholdTasks` only. Cases,
built from the Task 1 fixtures so the test and the screen agree:

- Three pets, same label, same time → **one** group, three tasks, in `petIds`
  order.
- Same label, different times → two groups, ordered by time.
- Different labels, same time → two groups, ordered by label.
- `"Breakfast"` and `" breakfast "` → one group.
- A task with `scheduledAt: null` sorts last regardless of label.
- `overdue` true only when `nowMinutes` is strictly past the group's time; an
  all-day group is never overdue.
- Empty input → `[]`.

- [ ] **Step 2: Implement**

Add `useHouseholdCareTasks` and `groupHouseholdTasks`; refactor `useCareTasks`
to delegate. Do not change `ScheduledCareTask` — it already carries `petId`,
which is all the strip needs to join against `usePets()`. **Do not add
`petImage`**: `pets.image_url` is a storage path and only the `usePets` cache
holds the signed URL (see Ground truth).

- [ ] **Step 3: Verify and commit**

`pnpm test` green (7 new tests), `pnpm build` exits 0. Then confirm no caller of
`useCareTasks` changed behaviour: `ScheduleTab` (`schedule-tab.tsx:102`) is the
only one and it still passes a single id.

```bash
git add lib/data/care-schedule.ts lib/data/care-schedule.test.ts
git commit -m "Ask for the household, not the eldest"
```

---

## Task 4: The schedule strip shows everyone, and says who

**Files:**
- Modify: `components/screens/home/today-schedule.tsx`
- Modify: `components/screens/home-screen.tsx`

`TodayScheduleStrip` takes `pets: Pet[]` instead of `petId?: string`, calls
`useHouseholdCareTasks`, and renders groups.

Rendering rules:

- **One pet** → identical to today: one row per task, `label`, time, tick. No
  avatar, no name, no header. This is the regression risk in the whole phase;
  8 of 28 households see only this.
- **Group of one** → one row: avatar, `{pet.name} · {label}`, time, tick.
- **Group of two or more** → a header line carrying `{label} · {time}`, then one
  indented row per pet carrying avatar, name and its own tick.
- Avatar is `pet.image` from `usePets()` — already signed. Fall back to the
  species icon (`Dog`/`Cat`/`PawPrint`, as `pet-context-switcher.tsx:54`) when
  `image` is `/placeholder.svg`, which is what an unphotographed pet gets.
- Overdue tinting stays `bg-destructive/10`, now applied to the group.
- Cap at **4 groups**; the overflow line keeps counting *tasks*, as it does
  today: `+{remainingTaskCount} more in the schedule`.
- "All done" collapses as it does now, but counts the household and names it:
  `All 8 tasks done today` — do not list every pet's name here, it is the one
  place a wall of names buys nothing.

**Two things that will be gotten wrong.**

1. **The tick's `aria-label` is currently `Mark ${t.label} done`.** In Isabella's
   household a screen reader would hear "Mark Breakfast done" three times with
   no way to tell them apart — a defect *created* by this fix. It must become
   `Mark ${t.label} done for ${pet.name}`.
2. **Every `{a} · {b}` and `{a} for {b}` in this file is a JSX concatenation.**
   The most recent defect this project shipped past a clean build was a missing
   space rendering "firstfine". Read the rendered text in the browser, not the
   source.

The success toast in `toggle` becomes `${t.label} done · ${pet.name}` when the
household has more than one pet, and stays `${t.label} done` when it has one.

In `home-screen.tsx`, pass `pets` and move the strip **above** the tiles inside
the card, with a hairline rule between the two blocks.

- [ ] **Step 1: Rewrite the strip**

- [ ] **Step 2: Verify in the browser — this cannot be verified any other way**

`PATH="$HOME/.corepack-bin:$PATH" pnpm dev`, then at `http://localhost:3000/login`:

- **`isabella.fournier@pet10x.com` / `Password123!`** → Home. Expect *Breakfast
  · 7:30 AM* as a header with Buddy, Lola and Zoe beneath it; *Thyroid tablet ·
  8:00 AM* as a single inline row reading "Lola · Thyroid tablet"; *Evening
  walk* with Buddy and Zoe only. **Lola's medication must be visible — before
  this change it was not, because Lola is not `pets[0]`.**
- Tick Buddy's Breakfast. Only Buddy's row completes. Reload: it is still done,
  and the others are not.
- **`sofia.nguyen@pet10x.com`** → four inline rows, each naming its pet, **no
  group headers anywhere**.
- **`priya.raman@pet10x.com`** → one row, no avatar, no name. Compare against
  `git stash` on this file if unsure; it must be indistinguishable.
- **Resize to desktop width.** The rail switches to `md:grid-cols-2` at that
  breakpoint; confirm the strip is unaffected and nothing overlaps.
- **Scroll to the bottom of Home on a phone viewport.** The fixed tab bar has
  eaten a control on this project before; confirm the last schedule row and the
  overflow line clear it.
- Read every composed string aloud: `Lola · Thyroid tablet`, not
  `Lola ·Thyroid tablet`.

- [ ] **Step 3: Commit**

```bash
git add components/screens/home/today-schedule.tsx components/screens/home-screen.tsx
git commit -m "Every pet's morning, and whose is whose"
```

---

## Task 5: Goals belong to a pet you chose

**Files:**
- Create: `components/screens/home/pet-chips.tsx`
- Modify: `components/screens/home/today-care-tiles.tsx`
- Modify: `components/screens/home-screen.tsx`
- Modify: `components/screens/pet-care-screen.tsx`

`PetChips` — `{ pets, selectedId, onSelect }` — returns `null` below two pets,
otherwise a horizontally scrolling row of avatar+name chips. Lifted from the
markup already at `pet-care-screen.tsx:52-68`, which then imports it instead of
keeping its own copy. Two implementations of one control is how the two surfaces
would come to disagree about the selection.

In `home-screen.tsx`:

- Delete `primaryPet`. Nothing may read `pets[0]` in this file after this task.
- Take the pet from `useSelectedPet()`.
- The goals block gets a heading row: `Goals` plus the chips at one pet or more
  than one; with exactly one pet the heading reads `{pet.name}'s goals` and no
  chips render.
- The card's subtitle (`:309`, currently `Log {primaryPet?.name}'s activities &
  meals`) becomes household-level — it now sits above a block that is not about
  one pet.
- `TodayCareTiles` receives the selected pet's `id` and `species`. Its
  species-driven tile set (`today-care-tiles.tsx:99-113`) already does the right
  thing per pet; switching from Buddy to Lola must switch the middle tile from
  Walk to Play, because `ACTIVITY_BY_SPECIES` says a cat has playtime.

In `pet-care-screen.tsx`, replace the local `activePetId` state
(`pet-care-screen.tsx:24-25`) with `useSelectedPet()`. The `key={pet.id}`
remount on `CareTracker` stays — the tracker holds per-pet draft state that must
not survive a switch.

- [ ] **Step 1: Extract `PetChips` and adopt it in `PetCareScreen`**

No behaviour change yet beyond the shared store. Verify the Trackers screen
still switches pets before touching Home.

- [ ] **Step 2: Restructure Home's care card**

- [ ] **Step 3: Verify in the browser — this cannot be verified any other way**

As `isabella.fournier@pet10x.com`:

- Three chips. Tap Lola: the tiles must change to Lola's numbers — Wet food
  2 can, and a **Meds** tile, which Buddy does not have. Tap Buddy: Kibble 3
  cup, and the activity tile is Walk, not Play.
- Open Trackers from the card header. **Lola must already be selected** — this
  is the shared-selection claim, and it is the only way to check it.
- Go back to Home, then to Profile, then back to Home. **Still Lola.**
- Kill the dev server, restart, sign in again. **Still Lola** — that is the
  `localStorage` half.
- Add a pet from Home. The selection must **not** jump to the new pet.
- As `priya.raman@pet10x.com`: no chips, heading reads "Nutmeg's goals", and
  the tile row is unchanged from before this phase.
- Desktop width: the chips must not collide with the card header, and the
  three-up tile grid must not reflow into something unreadable.

```bash
grep -n "pets\[0\]" components/screens/home-screen.tsx components/screens/pet-care-screen.tsx
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/screens/home/pet-chips.tsx components/screens/home/today-care-tiles.tsx components/screens/home-screen.tsx components/screens/pet-care-screen.tsx
git commit -m "A goal is one animal's, so pick the animal"
```

---

## Task 6: A task opens its own pet

**Files:**
- Modify: `app/app/page.tsx`
- Modify: `components/screens/pet-care-screen.tsx`
- Modify: `components/screens/home/today-schedule.tsx`

The shell overloads `handleNavigate`'s second argument for `pet-care` as a care
*kind* (`app/app/page.tsx:134`), so a pet cannot be carried through. Widen it:

```ts
const handleNavigate = (screen: string, id?: string, petId?: string) => { … }
```

A third **optional** parameter — every existing call site still compiles, and
only Home passes it. For `pet-care`, `id` stays the care kind and `petId` seeds
the selection. `PetCareScreen` gains `initialPetId?: string` and calls
`select(initialPetId)` once on mount when it is given, guarded by a ref so it
does not fight a chip tap on re-render — the same once-only pattern as
`ai-chat-screen.tsx:59-69`.

Tapping a schedule row's **label** navigates; tapping its **tick** does not.
Keep them separate hit targets — a tick that also navigates would make marking
Breakfast done throw you off the home screen.

- [ ] **Step 1: Widen the signature and thread the pet**

- [ ] **Step 2: Verify in the browser — this cannot be verified any other way**

As `isabella.fournier@pet10x.com`, with Buddy selected: tap the label on Lola's
*Thyroid tablet* row. The Trackers screen opens **with Lola selected**. Go back
to Home — the goal tiles are now Lola's, because there is one selection, not
two. Then tap a tick on a different pet's row and confirm you stay on Home.

- [ ] **Step 3: Commit**

```bash
git add app/app/page.tsx components/screens/pet-care-screen.tsx components/screens/home/today-schedule.tsx
git commit -m "Tap the cat, get the cat"
```

---

## Task 7: Every sheet and every toast names its pet

**Files:**
- Modify: `components/screens/care/care-tracker.tsx`
- Modify: `components/screens/care/schedule-tab.tsx`
- Modify: `components/screens/home/missing-info-card.tsx`

AD-10's third and cheapest half. A sheet that acts on one animal and does not
say which is a confirmation you cannot check.

The precedent is already set on the server: the care reminder writes
`${item.label} for ${item.petName}` (`app/api/care/reminders/run/route.ts:168`),
and every assistant suggestion rule names the pet
(`lib/ai/suggestions/rules.ts:73-76, 122, 185, 217`). The notification naming
the pet while the screen it links to does not is the inconsistency being closed.

| Where | Now | Becomes |
| --- | --- | --- |
| `care-tracker.tsx:465` `TargetSheet` | takes `petId`, shows no name | takes `petName` too; heading `{spec.targetLabel} · {petName}` |
| `care-tracker.tsx:509` sheet `aria-label` | `${spec.targetLabel} for ${spec.label}` — names the *kind* | `${spec.targetLabel} for ${petName}` |
| `care-tracker.tsx:555` | `"Target saved"` / `"N targets saved"` | `… for ${petName}` |
| `care-tracker.tsx:571` | `"Target removed"` | `Removed from ${petName}` |
| `care-tracker.tsx:176` | `${spec.label} logged` | `${spec.label} logged for ${pet.name}` |
| `care-tracker.tsx:188` | `"Entry removed"` | `Removed from ${pet.name}` |
| `care-tracker.tsx:701` `DietPlan` | `"Diet updated"` | `${pet.name}'s diet updated` |
| `schedule-tab.tsx:159` | `"Task updated"` / `"Added to the schedule"` | both name `petName`, which the component already receives (`:94`) |
| `schedule-tab.tsx:175` | `"Task removed"` | `Removed from ${petName}` |
| `missing-info-card.tsx:122` | `building.map(g => g.label).join(" · ")` | include `g.petName` |

That last row is the same defect class as AD-10, found while verifying this
phase and worth fixing here. `Gap` carries `petId` and `petName` for every
per-pet requirement (`lib/data/completeness.ts:114-132`), and `summariseGaps`
(`:232`) already renders `${g.label} (${g.petName})`. Only this card drops it —
so a two-pet household missing rabies on both reads **"Rabies vaccination ·
Rabies vaccination"**. Mirror `summariseGaps`.

`DietPlan` already holds the whole `pet`, and the tracker's "Today" hero already
reads `{spec.label} today · {pet?.name}` (`care-tracker.tsx:249`) — that one is
correct and is the model for the rest.

- [ ] **Step 1: Thread `petName` into `TargetSheet` and fix every string**

- [ ] **Step 2: Verify in the browser — this cannot be verified any other way**

As `isabella.fournier@pet10x.com`, on the Trackers screen with **Lola**
selected: open the Goals sheet and read its heading; save; read the toast. Every
one of those must contain "Lola". Repeat for Buddy — the strings must change.
Then open the Schedule tab, add a task, delete it, and read both toasts. Then
the Diet plan sheet on the Food tab.

Sonner toasts auto-dismiss; if a string goes by too fast, raise the `Toaster`
duration locally to read it and put it back.

Then, for the missing-info card, sign in as an account whose household is
missing the same requirement on two pets and confirm the row no longer repeats a
bare label.

```bash
grep -nE 'toast\.(success|error)?\("[^"]*"\)|toast\("[^"]*"\)' components/screens/care/care-tracker.tsx components/screens/care/schedule-tab.tsx
```

Every remaining literal-only toast must be one that genuinely concerns no
single pet. Justify each in the commit or fix it.

- [ ] **Step 3: Commit**

```bash
git add components/screens/care/care-tracker.tsx components/screens/care/schedule-tab.tsx components/screens/home/missing-info-card.tsx
git commit -m "Say whose target you just saved"
```

---

## Phase 4 done when

1. `PATH="$HOME/.corepack-bin:$PATH" pnpm test` passes, with 12 new tests
   (5 in `selected-pet.test.ts`, 7 in `care-schedule.test.ts`).
2. `PATH="$HOME/.corepack-bin:$PATH" pnpm build` exits 0.
   (`pnpm lint` is not a gate — it has never worked in this repo.)
3. `grep -rn --include='*.tsx' "pets\[0\]" components/screens/home-screen.tsx components/screens/pet-care-screen.tsx` returns nothing.
4. `git diff --stat main -- supabase/migrations/` shows **no new migration** —
   this phase changes no schema, and one appearing means a task took a wrong
   turn.
5. Signed in as `isabella.fournier@pet10x.com`, Home lists tasks for **all
   three** pets, including Lola's `medication` task, which is invisible before
   this phase because Lola is not `pets[0]`.
6. In that household, two pets sharing a label and a time render as **one**
   header with one row each — not two rows carrying the same label.
7. Signed in as `sofia.nguyen@pet10x.com`, whose four tasks share no
   `(label, time)` pair, **no group header renders at all**.
8. Signed in as `priya.raman@pet10x.com`, the Today's Care card is
   indistinguishable from its pre-phase self: no chips, no avatars, no names.
9. Selecting a pet on Home and opening Trackers shows the **same** pet; the
   choice survives navigation, a reload, and a restart of the dev server.
10. Adding a pet does not move the selection; soft-deleting the selected pet
    falls back to `pets[0]` rather than leaving the tiles blank.
11. Every per-pet sheet heading and every per-pet toast in `care-tracker.tsx`
    and `schedule-tab.tsx` contains a pet name, confirmed by reading them in
    the browser and not by reading the source.
12. Every tick control on the schedule strip has an `aria-label` that names its
    pet, so two identical tasks are distinguishable to a screen reader.
13. Re-running the Task 1 seed block a second time inserts nothing, and no
    building's pet count has changed from the figures recorded in Task 1
    Step 1.
