# Who may do what

Companion to `RBAC_PERSONAS.md`, which explains *why* the model is grant-derived.
This is the flat answer to *what is allowed*, and the recipe for checking it.

A persona is a view, never a permission. A row not marked *(Phase N)* names an
enforcer that exists in the database today — an RLS policy, or a
`SECURITY DEFINER` function that re-checks scope by hand because it bypasses
RLS. A marked row is a forward reference: nothing enforces it yet because
nothing implements it yet.

"anon (code only)" is a guest holding a building code and no session at all.
`signInGuest` sets client state; it creates no auth user.

## The enforcement ledger: what counts as an event, and what only audits

*Settled in Phase 3, 2026-08-23. Phase 2's exit criterion 3 said "every STAGE
CHANGE has a matching `violation_events` row", and opening a case is not a
stage change — yet Phase 2's own migration wrote a `(null → stage)` row for all
ten live cases, and `trg_violations_opening_event` writes one for every new
case. The code decided; this is the decision written down so the next phase
does not re-litigate it.*

**`violation_events` is the ladder's ledger. One row means one rung.**

| Act | `violation_events` | `audit_log` | Written by |
| --- | --- | --- | --- |
| A case is opened | ✅ `(null → stage)` | ✅ `violation.opened` | `trg_violations_opening_event` (AFTER INSERT), so the manager's composer, `escalate_incident_to_violation` and any future writer are all covered |
| A stage change | ✅ `(from → to)` | ✅ `violation.advanced` | `manager_advance_violation` |
| A fine reminder | ❌ | ✅ `violation.fine_reminded` | `manager_remind_fine` |
| A fine is settled — paid, waived, disputed, written off | ❌ | ✅ `fine.status_changed` | `trg_fines_settlement_event` (AFTER UPDATE OF status) |

The rule that generates that table, stated once:

1. **An opening IS an event.** `null` is a real "from" — it says the case
   started here, as distinct from having moved here. The alternative rule,
   "no event ⇒ it started at the default", stops being true the first time
   the default changes, and would make the ledger mean two different things
   depending on a row's age. It is also what the evidence export reads: a case
   with no opening row exports with a blank Event date, From, To and Note.
   *Consequence to rely on: no case created since 2026-08-23 can exist without
   an opening row, because the trigger is on the table rather than in any
   caller. Measured today, the eventless count is **3**, not 0 — see (3).*

2. **Money is not a rung.** A case at `fine_1` whose fine is paid is still at
   `fine_1`. Recording a settlement in `violation_events` would require
   inventing a `fine_1 → fine_1` self-transition — exactly the shape Phase 2
   made illegal. Money acts write to `audit_log` and nowhere else.
   *Consequence to rely on: the number of `violation_events` rows for a case
   equals 1 + the number of rungs it has moved, and nothing else.*

   *That consequence held on production and did NOT hold on a fresh
   `supabase db reset`, until the pre-merge sweep. `seed_strata.sql` seeded each
   case directly at its final stage, so the AFTER INSERT trigger gave it a
   `(null -> warning)` opening row saying it STARTED there — and case
   `…0002` also carried the explicit `open -> warning` row, so its ledger read
   "opened at warning, then moved from open to warning". The seed now opens every
   case at `open` and climbs the rungs with the `pet10x.stage_change` token, one
   rung per row, which is also the only stage a case can be opened at: the
   manager composer's INSERT policy is `manages_building(building_id) and
   stage = 'open'`, and `escalate_incident_to_violation` hardcodes `'open'`.
   Simulated against production in a rolled-back transaction (there is no local
   CLI): all eight cases, opening row `(null -> open)`, events = 1 + rungs, and a
   second run of the same block writes nothing.*

3. **Three seeded cases predate the ladder and carry zero events.** Measured
   2026-08-23: exactly 3 of the 13 live violations have no `violation_events`
   row at all, and all three are `resolved` with `resolved_at` set. They are
   the known exception to (1) and always have been — Task 1's backfill covered
   the ten NON-terminal cases and deliberately left these. Any assertion of the
   form "every case has an opening row" must exclude terminal seed rows or be
   scoped to cases created after 2026-08-23; stated flatly it is false today
   and will read as a regression to whoever runs it next.

## What anon can already reach

The ❌ marks in the anon column are about the capabilities in the matrix. They
are not a claim that anon reads nothing. Several `SECURITY DEFINER` functions
are granted to `anon`, and some return data the caller did not supply. These
are the ones probed for this document — not a survey of what `anon` may
execute, which is larger:

| Function | As `anon`, no claims | Returns |
| --- | --- | --- |
| `resolve_building_code('MCR2026')` | `valid: true` | the building's `id` and `name` |
| `building_pets_for_report('MCR2026')` | `valid: true`, 10 pets | every non-deleted pet in that building: id, name, species, breed. Nine carried `photo: null`; one carried a real `pet-media` path |
| `search_buildings_public('map')` | 2 matches | name, address, city, region, postal code — **no id, no building code** |

`building_pets_for_report` is what the guest reporter flow calls
(`lib/data/incidents.ts:376`) so a guest can point at the pet they are
reporting instead of describing it. It withholds the unit, the owner and any
contact detail.

`search_buildings_public` needs no code at all — three characters of substring
is enough. Its migration
(`20260814000001_public_building_search.sql`) states the intent: it returns
"name and address ONLY. No id, no building_code… a match is confirmation the
building is on Pet10x — not a way to join or report." That reasoning holds, and
it is still a read of data the caller did not supply.

The same anon actor reading `public.pets` or `public.buildings` directly got 0
rows, so RLS itself is intact; these reads arrive through the functions.

### Out of scope: `emergency_directory(p_token)`

Token-gated rather than code-gated, so it sits outside this matrix's domain and
gets no row. Recorded here so a reader weighing anonymous reads knows it exists
and does not stop at `building_pets_for_report`. Given a token that
exists, is unrevoked and unexpired, it returns the building's name and address,
a per-floor unit list, and for each pet its name, species, presence, status,
notes and one emergency phone. It writes an `audit_log` row on every view and
deliberately returns no owner identity. Its own access model — token issue,
expiry and revocation — is where that should be reviewed, not here.

## Table-level grants: the four verbs RLS polices, and the four it does not

Every row above is about RLS. RLS decides WHICH ROWS a principal may touch, and
it is defined in terms of rows — so it governs `SELECT`, `INSERT`, `UPDATE` and
`DELETE` and **nothing else**. `TRUNCATE`, `REFERENCES`, `TRIGGER` and
`MAINTAIN` never consult a policy. A table-level grant of those four is a
capability no row in this matrix describes and no policy can withdraw.

Supabase's shipped `alter default privileges … grant all on tables to anon,
authenticated, service_role` handed exactly those four to both client roles on
every table created by every migration this project has run. `relacl` read
`anon=arwdDxtm/postgres` on 53 of 55 tables.

**Measured, not theorised.** Phase 6's review, running as
`resident1@pet10x.com` — an ordinary signed-in resident — ran
`truncate public.building_rules` on live production. It succeeded and erased all
three rows. Independently reproduced on `violation_disputes`, a table with no
client write policy at all: `set local role authenticated; truncate
public.violation_disputes;` took it from 1 row to 0.

`20260824000004_client_role_table_grants.sql` states the grammar positively:
**`anon` and `authenticated` hold exactly {SELECT, INSERT, UPDATE, DELETE} on
the tables they touch, and nothing outside RLS's reach.** It resets every
existing table and changes the default privileges so the next `create table`
inherits the decision. `service_role` is unchanged and that is a decision, not
an omission: it is the trusted server identity, it bypasses RLS by design, and
it already holds `DELETE` on every row.

| Verb | `anon` | `authenticated` | `service_role` | Policed by RLS? |
| --- | --- | --- | --- | --- |
| SELECT / INSERT / UPDATE / DELETE | ✅ where already granted | ✅ where already granted | ✅ | ✅ — every row above |
| TRUNCATE | ❌ 42501 | ❌ 42501 | ✅ | ❌ never |
| REFERENCES | ❌ | ❌ | ✅ | ❌ never |
| TRIGGER | ❌ | ❌ | ✅ | ❌ never |
| MAINTAIN | ❌ | ❌ | ✅ | ❌ never |

Verified after the migration across all 56 `public` tables: 0 hold TRUNCATE,
REFERENCES, TRIGGER or MAINTAIN for either client role, while `authenticated`
retains all four DML verbs on the 55 it had them on. `truncate` probed directly
as both roles against `violations`, `violation_events`, `fines`,
`violation_disputes`, `building_rules`, `audit_log`, `profiles` and `pets` —
**16 of 16 refused with 42501.**

Two tables keep narrower grants, and the migration preserves them rather than
levelling them up: `pending_signups` (postgres and `service_role` only) and
`building_rules`, where `20260825000000` had already revoked `anon` outright.

## The pet photo path

One observation, not a defect. Where a `photo` path *is* returned it is raw, and
`pet-media` paths are `{ownerUid}/{petId}/…` — the convention is set client-side
at `lib/supabase/storage.ts:36`, straight from `auth.uid()`. So a guest holding
a lobby code can derive that owner's auth uid. On today's data that is one pet
of ten; it scales with how many pets have photos.

**Signing does not close this.** A Supabase signed URL carries the object path
verbatim — `/storage/v1/object/sign/{bucket}/{path}?token=…` — and the client
already mints them from the raw path (`lib/supabase/storage.ts:49-58`). Phase 2's
AD-3 specifies a route that "calls the existing `building_pets_for_report` RPC
and signs the returned paths", so afterwards the guest still receives
`{ownerUid}/{petId}/…`, just wrapped. Signing relocates *who mints* the URL, not
*what the path reveals*. Actually closing it needs a different mechanism —
not deriving the path from `auth.uid()` in the first place, or proxying the
bytes so no path reaches the client. That is an open question for whoever owns
Phase 2, not something this document settles.

| Capability | anon (code only) | resident | manager of building | super-admin | Enforced by |
| --- | --- | --- | --- | --- | --- |
| File an incident | ✅ | ✅ | ✅ | ✅ | `submit_incident_report` |
| Upload evidence | ✅ | ✅ | ✅ | ✅ | signed upload URL, server-minted *(Phase 1)* |
| Read evidence | ❌ | ❌ | ✅ own buildings | ✅ | `guest-evidence manager read`, hardened in `20260821000003_storage_policy_reconciliation.sql` |
| Look up a report by reference | ✅ | ✅ | ✅ | ✅ | `incident_status_by_reference` |
| Triage an incident | ❌ | ❌ | ✅ | ✅ | `incidents_manager_update` |
| Escalate to a violation | ❌ | ❌ | ✅ | ✅ | `escalate_incident_to_violation` |
| Advance a violation degree | ❌ | ❌ | ✅ | ✅ | `manager_advance_violation` ² |
| Read own violations and fines | ❌ | ✅ own | ✅ building | ✅ | `violations_select`, `fines_select` |
| Dispute a violation | ❌ | ✅ own | ❌ | ❌ ⁴ | `dispute_violation` |
| Decide a dispute | ❌ | ❌ | ✅ | ✅ | `manager_resolve_dispute` |
| Read a dispute | ❌ | ✅ own | ✅ building | ✅ | `vdisputes_select` |
| Request an accommodation | ❌ | ✅ **own building only** | ❌ ⁸ | ❌ ⁸ | `accom_resident_insert` — **rewritten in Phase 7, see ⁸** |
| Read a **draft** accommodation request | ❌ | ✅ own | ❌ | ❌ | `accom_select` — the manager and admin arms are gated on `status <> 'draft'` |
| Read a **submitted** accommodation request | ❌ | ✅ own | ✅ | ✅ | `accom_select` |
| Submit or withdraw a request | ❌ | ✅ own | ❌ | ❌ | `submit_accommodation_request`, `withdraw_accommodation_request` |
| Decide an accommodation | ❌ | ❌ | ✅ | ✅ | `manager_decide_accommodation` + `accom_freeze_guard` — **not `accom_manager_update`, see ⁹** |
| Read an accommodation **document** (row and file) | ❌ | ✅ own | ✅ non-draft | ✅ non-draft | `accomdoc_select`, `accommodation-docs read` |
| Attach a document to a request | ❌ | ✅ own, pre-decision | ❌ | ❌ | `accomdoc_insert` + `record_accommodation_document`; the object needs a server-minted signed upload URL |
| Delete a document row | ❌ | ✅ own, pre-decision | ❌ ¹⁰ | ❌ | `accomdoc_delete` |
| Verify or reject a document | ❌ | ❌ | ✅ | ✅ | `manager_verify_accommodation_document` — there is **no** UPDATE policy on `accommodation_documents` at all |
| Change a request's `status` by direct UPDATE | ❌ | ❌ | ❌ | ❌ | `accom_freeze_guard` — a trigger, so `is_admin()` does not transcend it |
| Rewrite `animal_desc` after submission | ❌ | ❌ | ❌ | ❌ | `accom_freeze_guard` |
| Move a request between buildings | ❌ | ❌ | ❌ | ❌ | `accom_freeze_guard` — identity, refused for everyone |
| Set the fine schedule | ❌ | ❌ | ✅ | ✅ | `manager_set_fine_schedule` + `buildings_fine_schedule_guard` — see ⁵ |
| Read a PUBLISHED building rule | ❌ | ✅ own building | ✅ own buildings | ✅ | `building_rules_resident_read`, `building_rules_manager_read` |
| Read an UNPUBLISHED building rule | ❌ | ❌ | ✅ own buildings | ✅ | `building_rules_manager_read` — the resident policy requires `is_published` |
| Write a building rule | ❌ | ❌ | ✅ own buildings | ✅ | `manager_save_building_rule` (audited); `building_rules_manager_insert` / `_manager_update` |
| Publish or unpublish a building rule | ❌ | ❌ | ✅ own buildings | ✅ | `publish_building_rule` + `building_rules_publish_guard` — see ⁶ |
| Delete a building rule | ❌ | ❌ | ❌ | ✅ | `building_rules_admin_delete` — see ⁷ |
| Post to the community wall | ❌ | ✅ own building ¹ | ✅ own buildings ¹ | ✅ ¹ | `posts_insert` + `posts_select` |
| Create a community event | ❌ | ✅ own building ¹ | ✅ own buildings ¹ | ✅ ¹ | `events_insert` + `events_select` |
| Report to lost & found | ❌ | ✅ own building ¹ | ✅ own buildings ¹ | ✅ ¹ | `lost_found_insert` + `lost_found_select` |
| RSVP to a community event | ❌ | ✅ own building ¹ | ✅ own buildings ¹ | ❌ ¹ | `rsvps_write` + `rsvps_read` — the one community INSERT with no `is_admin()` arm |
| Upload and read community media | ❌ | ✅ own buildings | ✅ own buildings | ✅ read only ³ | `community-media building read`, `community-media uploader write`, `community-media uploader delete` |
| Read another resident's pet photo | ❌ | ❌ | ✅ own buildings | ✅ | `pet-media manager read`, as recreated in `20260821000002_fix_pet_media_manager_read.sql` |

Rows marked *(Phase N)* are specified but not yet built. The phase that builds
one removes its marker and adds its verification.

**"manager of building" means OF THAT BUILDING, and the table has no column for
the other kind.** Every ✅ in that column is scoped by `manages_building(...)`,
so a manager of a *different* building is a ❌ everywhere the column says ✅.
That distinction is not decorative — it is the one an unscoped RPC gets wrong —
so the six rows this phase touched were probed for it explicitly, as a fifth
actor (`stratamanager@pet10x.com`, who manages five buildings and not Maple
Court Residences). Reads returned only their own buildings' rules; all three
RPCs returned `{"ok":false,"error":"forbidden"}` and wrote nothing.

⁸ **THIS ROW RECORDED A HOLE AS A FEATURE, and the probe table below recorded
the evidence for it without noticing.** Until Phase 7, `accom_resident_insert`
was `with check (resident_id = auth.uid())` and **nothing else** — no building
test at all. So the three ✅s in this row were not "enforced by
`accom_resident_insert`"; they were the absence of enforcement. Measured on
production 2026-08-23, rolled back: `resident4@pet10x.com`, whose only
resident link is to Maple Court Residences and is `left`, inserted a request
into **Harbour View Towers** and it was admitted (`5728e918-…`).

The line at *Where the admin grant stopped* — "`insert into
public.accommodation_requests` naming themselves | admitted" — is the same hole
seen from the admin's side and written down as a result. It is now `42501`: a
super-admin who is not an approved resident of the building cannot file there
either, because the with-check is
`resident_id = auth.uid() and public.is_resident_of(building_id) and status = 'draft'`
and `is_resident_of` requires an **approved** link on a non-suspended profile.
A manager gets ❌ for the same reason unless they happen to also live there.

⁹ `accom_manager_update` is **no longer the control**, and was never an adequate
one: it is `FOR UPDATE` with no column list, so it authorised every column at
once. Measured, in ONE statement as `stratamanager@pet10x.com`: `animal_desc`
rewritten to `'REWRITTEN BY MANAGER'`, `status` set to `approved`, and
`building_id` moved to another building — which also **relocates who may read
the doctor's letter**, since `accommodation-docs read` joins through
`r.building_id`. The policy survives only so a manager can write `legal_note`.
What actually decides a request is `manager_decide_accommodation`, and what
stops everything else is `accom_freeze_guard`, a `BEFORE UPDATE` trigger holding
a single-use `pet10x.accom_write` token. **A trigger is not RLS**: `is_admin()`
transcends the policies and transcends nothing here, verified for the
super-admin as well as the manager.

¹⁰ `accomdoc_rw` was `FOR ALL`, and `DELETE` consults only `USING` — whose
manager arm belonged to a read. Measured: `manager@pet10x.com` **deleted the
resident's own document row**. It is now four per-command policies, and the
command nobody may run (UPDATE) has no policy at all.

¹ **THIS FOOTNOTE DESCRIBED THE PRE-PHASE-8 POLICY SET AS CURRENT FACT, and
every clause of it was wrong by the time this branch reached merge.** Phase 8
(`20260826000000_community_authorisation.sql` and its eight successors) rewrote
all six community tables onto ONE grammar. The one row above is now four,
because the four tables those rows name carry thirteen policies between them —
`community_posts` 3, `events` 4, `lost_found` 3, `event_rsvps` 3 — where this
footnote counted six across three of them and never counted `events` at all.
(The other two community tables, `post_comments` and
`post_reactions`, carry three each and are not in this matrix.) Re-measured on
production 2026-08-23 against `pg_policies`, and probed in a rolled-back
transaction; what follows is that measurement, not the plan.

**The grammar, which every community INSERT now spells the same way:** the
writer names themselves in the actor column, *and* stands in a stated
relationship to the building the row names —

    is_resident_of(building_id)   or   manages_building(building_id)   or   is_admin()

**`posts_insert`**, live text:
`((author_id = auth.uid()) AND (is_resident_of(building_id) OR manages_building(building_id) OR is_admin()))`.
It has the `manages_building` disjunct and the `is_admin()` disjunct this
footnote said it did not, and it no longer calls `is_premium` at all.
`community_posts` still has three policies — `posts_insert`, `posts_select`,
`posts_update_own` — of which this is the only INSERT.

Probed as `stratamanager@pet10x.com`, who manages Cedar Grove Estates and is not
a resident of it (`is_resident_of = false`, `manages_building = true`,
`is_premium = false`): the post into Cedar Grove was **admitted**, and the same
statement aimed at Maple Court Residences — neither lived in nor managed — got
`42501`. The disjunct widened the policy by exactly one relationship and not by
one building.

**`events_write` no longer exists.** It was a single `FOR ALL` policy whose
`created_by = auth.uid()` arm was self-authorising, so it admitted an event into
any building or into none. It is now three commands: `events_insert`,
`events_update`, `events_delete`, beside `events_select` — four policies on
`events`.

**`lost_found` has three policies, not two**, and `lost_found_insert` is not
`reporter_id`-only: it is
`((reporter_id = auth.uid()) AND (is_resident_of(building_id) OR manages_building(building_id) OR is_admin()))`.
The third is `lost_found_update`, which admits the reporter or a manager of the
building. `building_id` is now `NOT NULL` on this table; the old policy carried
no building test at all, and `lost_found_select` began `building_id IS NULL OR …`,
which made a NULL-building row a platform-wide broadcast.

**`event_rsvps` has three policies, not one**, and none of them is `rsvps_self`.
`rsvps_read` (SELECT) admits your own row *or* any row on an event in a building
you stand in a relationship to — that is what makes an attendance count
countable; the old `FOR ALL, profile_id = auth.uid()` meant every viewer counted
exactly the RSVPs they had made themselves. `rsvps_write` (INSERT) and
`rsvps_delete` (DELETE) are yours alone. There is no UPDATE policy: an RSVP is
made or unmade, never edited.

**One asymmetry, recorded and deliberately not changed.** `rsvps_write` is the
only community INSERT whose building test is
`is_resident_of(...) OR manages_building(...)` with **no `is_admin()`**. That is
why the RSVP row above carries ❌ in the admin column while its three siblings
carry ✅. Measured, not inferred: the super-admin (`is_admin() = true`,
`is_resident_of = false`, `manages_building = false` for the building) was
**admitted** on `lost_found_insert`, `posts_insert` and `events_insert` into
that building and got `42501` on `rsvps_write`. It is plausibly intentional —
attendance is a headcount, and a platform administrator adding themselves to a
building barbecue changes a number somebody will cater against — but nothing in
the migration says so, so it is written down here rather than "fixed" by
whoever notices it next.

**`is_premium` now gates nothing anywhere in the database.** This is the largest
silent product change on this branch and it was recorded only inside a migration
comment, so it belongs here, where "who can post?" is asked. The function is
still defined (`is_premium(p_user uuid)`, SECURITY DEFINER, `select
resolve_entitlement(p_user) is not null`) and execute on it is still revoked
from `anon` by `20260615073613_harden_security.sql` — but it appears in **zero
policies and zero function bodies in `public`**, and no TypeScript in this
repository calls it or `resolve_entitlement` outside the generated
`database.types.ts`. The subscription entitlement exists and decides nothing.

It was dropped from `posts_insert` because the conjunction it sat in was
unsatisfiable, not because entitlement was judged wrong: measured before Phase 8,
48 profiles held 1 premium account and 24 approved resident links, and the
intersection was **empty** — the only premium account was a super-admin whose
resident link was `pending`, and `posts_insert` had no `is_admin()` arm. So
`can_post_today = 0`, proven by an approved unsuspended resident getting `42501`
inserting into their own building. A paywall nobody can be on the paying side of
is not a paywall. `20260826000000` names the shape a real one should take — a
rolling-window quota inside a `SECURITY DEFINER` RPC that can return
`{ok:false, error:'quota_exceeded', upgrade:true}` — and carries the exact paste
that restores the old text. Neither is a decision this document makes; what it
records is that today the answer to "does a subscription grant anything?" is no.

(The sentence that used to close this footnote said splitting the row into three
"belongs to the Community phase, which owns `posts_insert` and its siblings".
That phase shipped, it did own them, and it split them. The row is split above.)

⁵ **The bare UPDATE policy is no longer the control.** `buildings_manager_update`
(`UPDATE`, `manages_building(id)`) and `buildings_admin_all` (`ALL`,
`is_admin()`) are still live and still column-unrestricted, so read alone they
say any manager may rewrite what a bylaw offence costs. Measured before Phase 6,
as `manager@pet10x.com` inside a rolled-back transaction: `update buildings set
pet_rules = pet_rules || '{"fine_1_cents": 999999999}'` **succeeded**, setting a
$9,999,999.99 first offence, and `audit_log` stayed at 35 rows. There is no
audit trail on a `buildings` update at all — `updated_at` moves for any field,
so it cannot tell a fine-schedule change from a postcode correction.

Phase 6 did not remove those policies, because three legitimate client surfaces
write the whole `pet_rules` object through them (both bylaw editors and the
strata portal's template BulkApply). Instead `buildings_fine_schedule_guard`
(BEFORE UPDATE, `20260825000003_fine_schedule.sql`) strips
`fine_1_cents` / `fine_2_cents` / `fine_currency` from any write that does not
carry the single-use `pet10x.fine_schedule` token, and puts the previous values
back. The trigger is not RLS: an ADMIN's direct update is restored exactly as a
manager's is. Verified. The only path that moves the schedule is
`manager_set_fine_schedule`, which re-checks scope by hand and writes an
`audit_log` row carrying BOTH the previous and the new triple.

That last sentence was false as first shipped, and the correction is worth
recording because the shape of the mistake is reusable. The trigger carries
`WHEN (old.pet_rules IS DISTINCT FROM new.pet_rules)`, and
`manager_set_fine_schedule` minted its token unconditionally. So a **re-set of
values the building already held** produced an UPDATE that changed nothing, the
WHEN clause was false, the guard was never entered, and the token was never
spent — leaving it live for the rest of the transaction. Measured on production
as a manager, rolled back: after a no-op re-set, a direct
`update buildings set pet_rules = pet_rules || '{"fine_1_cents": 999999999}'`
**succeeded**, writing a $9,999,999.99 first offence with no `audit_log` row. A
second direct update was refused, confirming the token really was single-use;
the defect was that on the no-op path nothing ever collected it.

`20260825000004_fine_schedule_token_spend.sql` closes it by making the RPC clear
its own token immediately after the guarded UPDATE, unconditionally. The rule
that generalises — and the one to apply to any future guard of this shape — is
that **a minter closes its own window**: the token must not outlive the function
that minted it, whether or not any trigger chose to run. Teaching the RPC to
predict the trigger's WHEN clause instead would duplicate the predicate in two
files free to drift, and drift is what produced the bug.

The other two tokens were checked rather than assumed, against `pg_proc` on
production so a function existing only in the database could not hide. The
census is exactly three mints and three spends. `pet10x.stage_change`
(`manager_advance_violation`) is safe because its ladder is a positive grammar
in which no branch lists its own stage, so a same-stage call is refused as
`illegal_transition` *before* the mint — verified live. `pet10x.rule_publish`
(`publish_building_rule`) is safe twice over: the mint is already conditional on
the publication state actually changing, and `trg_building_rules_publish_guard`
carries no WHEN clause at all, so the guard is entered on every write and
collects any token that exists. Only `fine_schedule` combined an unconditional
mint with a WHEN-gated guard.

That guard also closes a live data-loss hazard rather than only an audit gap: a
bylaw template saved before the schedule existed is a whole-`pet_rules`
snapshot with no fine keys, and applying it replaced the object — silently
deleting the target building's schedule.

⁶ `building_rules_manager_update` lets a manager write the table directly, so
without a guard `update building_rules set is_published = true` would publish a
rule with no notification and no audit record. `building_rules_publish_guard`
(BEFORE INSERT OR UPDATE) RAISES 42501 on any change to `is_published` — and on
any INSERT born published — that does not carry the single-use
`pet10x.rule_publish` token. It raises rather than restores, unlike ⁵, because
no legitimate client path sends `is_published` at all. Verified for a manager
and for a super-admin; both are refused.

⁷ Managers may not delete, by design. A published rule is a statement the
building's residents were notified of, and making it vanish without a trace is
not an edit — they unpublish, which `publish_building_rule` audits. There is no
manager DELETE policy on `building_rules`, so a manager's `DELETE` affects zero
rows (RLS filters rather than errors); measured for the manager of the building,
a manager of another building and a resident.

² **This footnote used to say the RPC "genuinely does not exist" and the row was
marked *(Phase 4)*. Both were true when written and neither is true now.** Phase
2 built `manager_advance_violation` (`20260823000001`, recreated with a sixth
argument by `20260824000002`) and Phase 5 taught it to refuse a case under
appeal. It is deployed, it is the only path that moves a stage, and the row
above no longer carries a phase marker because there is nothing left to wait
for.

What the footnote correctly warned about was the unguarded direct write beside
it: `violations_manager_write` was `FOR ALL` with `manages_building(building_id)
or is_admin()`, and a non-admin manager of Maple Court Residences moved all 5 of
that building's violations to a fine stage in a single `UPDATE`, with no
degree-ordering check and no `violation_events` row. That path is CLOSED.
Measured on the live database:

- The `FOR ALL` policy is gone. `violations` now carries three narrow policies —
  `violations_select` (read), `violations_manager_insert` (`INSERT` only, and
  its `WITH CHECK` pins `stage = 'open'`, so a case cannot be born mid-ladder),
  and `violations_manager_update` (`UPDATE` only).
- The remaining `UPDATE` cannot move a stage. `trg_violations_stage_guard`
  (`20260823000002`) is a `BEFORE UPDATE` that raises **42501** on any `stage`
  change not carrying the single-use `pet10x.stage_change` token, which only
  `manager_advance_violation` mints. Re-measured 2026-08-23 as the real building
  manager: a direct `UPDATE ... SET stage='fine_2'` raises `42501 violations.stage
  cannot be changed by a direct UPDATE`.

One caveat, recorded rather than hidden: the token is a transaction-local GUC,
so a caller who can execute arbitrary SQL can mint it by hand
(`set_config('pet10x.stage_change','ok',true)`) and then perform the `UPDATE`
directly — bypassing the transition table, the `dispute_open` refusal and the
event ledger. `set_config` lives in `pg_catalog`, which PostgREST cannot reach,
so this is not available to the app or to any browser session; it is available
to anyone holding a SQL connection. See the Phase 5 ledger for the measurement.

⁴ **The super-admin column on "Dispute a violation" was ✅ in the design spec
(`2026-08-21-completing-manager-resident-flows-design.md:475`) and Phase 5
deliberately shipped ❌.**

A dispute is a FIRST-PERSON STATEMENT. `violation_disputes.reason` is stored
verbatim, shown to the manager as the resident's own words, and is the document
a tribunal reads to decide whether the resident was heard. An admin filing one
puts words in a resident's mouth, in a record whose entire value is that it is
theirs. The ✅ came from the blanket admin column that produced Phase 2's
over-grant findings; it was not a considered grant.

`dispute_violation` therefore authorises on `violations.resident_id =
auth.uid()` and nothing else — no `manages_building` branch, no `is_admin()`
branch. Admins keep the READ (`vdisputes_select` admits `is_admin()`) and keep
`manager_resolve_dispute`. What they lose is the ability to author somebody
else's appeal.

Every cell of these three rows was verified by impersonation on 2026-08-23,
allowed AND denied, with a delta check across `violation_disputes`,
`violation_events`, `fines`, `notifications` and `audit_log` after each refusal:

| Actor | `dispute_violation` | `manager_resolve_dispute` | `violation_disputes` SELECT |
| --- | --- | --- | --- |
| the case's own resident | `ok:true` | `forbidden` | 1 row |
| a different resident, same building | `forbidden` | `forbidden` | 0 rows |
| a resident of another building | `forbidden` | `forbidden` | 0 rows |
| a manager of the building | `forbidden` | `ok:true` | 1 row |
| a manager of another building | `forbidden` | `forbidden` | 0 rows |
| super-admin | `forbidden` | `ok:true` | 1 row |
| `anon` | 42501, no grant | 42501, no grant | 0 rows |

Every refusal wrote zero rows to all five tables. `violation_disputes` has
exactly one policy, a SELECT: INSERT, UPDATE and DELETE were each attempted by
all seven actors — including one `UPDATE … FROM` and one unqualified
`DELETE FROM public.violation_disputes` as the manager and as the admin, which
is the shape that removed all 13 `violation_events` rows in Phase 2 — and every
one affected 0 rows or raised 42501.

³ The `community-media` policies are three, and only the read carries
`OR is_admin()`: `community-media building read` has it, `community-media
uploader write` and `community-media uploader delete` do not. Probed: a
super-admin who was neither resident nor manager of the building read a planted
object fine and got `42501` inserting one under that building.

## Where the admin grant stopped

Probed by impersonating a real super-admin, asserting `is_admin() = true` in
the same transaction, and attempting the write. These are individual measured
results, not a classification of the schema:

| Policy | The super-admin attempted | Result |
| --- | --- | --- |
| `posts_insert` **(pre-Phase-8 text)** | post to a building they neither live in nor manage | `42501` |
| `posts_insert` **(today)** | post to a building they neither live in nor manage | **admitted** |
| `events_insert` | create an event in that building | **admitted** |
| `lost_found_insert` | report a lost pet in that building | **admitted** |
| `rsvps_write` | RSVP to an event in that building | `42501` |
| `community-media uploader write` | upload under that building | `42501` |
| `accom_resident_insert` | file a request naming *another* resident | `42501` |
| `accom_resident_insert` | file a request naming **themselves**, same building | **admitted**, and `42501` since Phase 7 — see ⁸ |

The first two rows are the same statement run against two different policy
texts, and the pair is kept deliberately. Phase 8 gave every community INSERT an
`is_admin()` arm, so the admin grant now DOES reach a building the admin has no
relationship to — the older row is not a regression report, it is what this
table said before the grammar changed. Re-measured 2026-08-23 in a rolled-back
transaction, with `is_admin() = true`, `is_resident_of = false` and
`manages_building = false` asserted in the same transaction.

That last row is the one to read carefully. `accom_resident_insert` is
`WITH CHECK (resident_id = auth.uid())`. It does not block an admin; it blocks
acting *as someone else*. The admin got their own request in despite being
neither resident nor manager of that building.

**The two policies named here as sharing that shape no longer do, and both have
now been probed.** `rsvps_self` does not exist — `event_rsvps` carries
`rsvps_read` / `rsvps_write` / `rsvps_delete`, and `rsvps_write` is
`profile_id = auth.uid()` **AND** a building test, which is what refused the
admin above. `lost_found_insert` is no longer `reporter_id = auth.uid()` alone
either; it carries the full `is_resident_of OR manages_building OR is_admin`
disjunct, and the admin was admitted through the `is_admin()` arm rather than
through a missing test. Both changes are Phase 8's; see ¹.

`community-media uploader delete` carries no `is_admin()` in its text and was
not probed — see the note on `storage.objects` deletes under *How to verify a
row*.

`buildings_manager_update` carries no `is_admin()` either, but
`buildings_admin_all` (`FOR ALL`, `is_admin()`) sits beside it and permissive
policies OR together. Absence of `is_admin()` in one policy proves nothing on
its own; check the table's other policies for the same command first.

## What the storage rows depend on

Three of the rows above — read evidence, community media, another resident's
pet photo — are enforced against a *path*, not a foreign key, so the path
convention is load-bearing. `accommodation-docs` is listed with them because it
shares the mechanism.

| Bucket | Path | Segment that decides access |
| --- | --- | --- |
| `guest-evidence` | `{buildingId}/{draftId}/{n}.{ext}` — *intended, see below* | 1 — the building |
| `community-media` | `{buildingId}/{uploaderUid}/{filename}` | 1 to read, 1 **and** 2 to write, 2 alone to delete |
| `pet-media` | `{ownerUid}/{petId}/{filename}` | 1 for the owner, 2 for the manager |
| `accommodation-docs` | `{buildingId}/{requestId}/{kind}-{ms}.{ext}` | **1 and 2 and the filename** — all three pinned since Phase 7 |

The `guest-evidence` shape is a convention carried over from the Phase 1 spec,
not an observed one. Nothing has ever been written to that bucket — it holds 0
objects, no application code so much as names the string `guest-evidence`, and
its single policy is the SELECT above. The convention becomes real, or gets
corrected, when Phase 1 writes the first object.

Two things about these are worth knowing before touching them.

**A malformed segment must evaluate false, not raise.** The `::uuid` casts in
the `guest-evidence` and `community-media` read policies used to abort the
whole query with `22P02` when segment 1 was not a UUID — so one bad object
could take the bucket offline for readers, a super-admin included, since the
cast raises before `is_admin()` is reached.
`20260821000003_storage_policy_reconciliation.sql` wraps each cast in a `case`
that shape-checks the segment first. It is a `case` and not an `and` on
purpose: Postgres may reorder `AND` operands, so a flat chain can still reach
the cast. The same migration also closed the way in, by requiring
`community-media` uploads to land under a building the uploader actually
belongs to.

**`storage.objects.name` must stay fully qualified inside a subquery.**
`pet-media manager read` shipped inert in `20260821000001_storage_policies.sql`:
inside `exists (select 1 from public.pets p where … (storage.foldername(name))[2] …)`
the unqualified `name` bound to `pets.name`, not to the object path. It split
the pet's name ("Max") into path segments — `storage.foldername('Max')` returns
an empty array — and compared `null` to the pet id, so it could not match.
That is the blank pet picker the policy existed to fix.
`20260821000002_fix_pet_media_manager_read.sql` writes
`storage.foldername(storage.objects.name)` instead.

**That observation about `accommodation-docs` is now HISTORY, not a live
dependency.** It used to read: the sibling `accommodation-docs` policies use the
bare form and bind correctly only because `accommodation_requests` has no `name`
column to collide with — same code, different outcome, decided by the joined
table's columns. `20260827000004_accommodation_docs_storage.sql` rewrote that
policy with `storage.objects.name` fully qualified throughout, so the bucket no
longer depends on a coincidence in another table's column list. Do not
"simplify" the qualification away.

### `accommodation-docs`, as of Phase 7

- **Exactly one policy, and its command is `SELECT`.** Asserted from
  `pg_policies`: `accommodation-docs read :: SELECT` and nothing else. There is
  no INSERT, UPDATE or DELETE policy on the bucket for any client role.
  `accommodation-docs resident write` was **dropped**: an object can now only
  arrive through a signed upload URL minted by
  `app/api/accommodations/docs/sign/route.ts`, which composes the whole path
  from the database, so the path shape is a fact rather than a convention. The
  resident's own filename never reaches storage.
- **`file_size_limit = 10485760`** and a six-entry `allowed_mime_types`
  (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `image/heic`,
  `image/heif`). These mirror `MAX_BYTES` and `ALLOWED` in the sign route and
  must be changed together with them. The BUCKET is the enforcement point: a
  signed upload token binds path, upsert, scope and expiry — never Content-Type
  and never length.
- **The read pins every segment**, with an anchored regex requiring two uuids
  and a filename starting alphanumeric, and requires segment 1 to equal the
  request's own `building_id`. Measured: a planted object whose first segment
  was a different building returned **0 rows for every actor including the
  super-admin**, and a traversal-shaped name was rejected by the regex before
  any join ran. Before this, the same insert as the owning resident at
  `anything-at-all/{requestId}/../x.pdf` was **admitted**.
- **A draft's file is invisible to the building's own managers and to a
  super-admin**, by the same `r.status <> 'draft'` arm the table policies carry.

## The confidentiality contract for accommodations

An accommodation request is **disability information**, and a supporting
document may be a doctor's letter. Phase 0 found `emergency_directory`
documenting that medical history was withheld while its body returned
`p.conditions`. This is the contract that stops the same contradiction here, and
every row of it was verified by SQL impersonation for all six actors — allowed
**and** denied.

| | Resident who filed it | Another resident | Manager of the building | Manager of another building | Super-admin | `anon` |
| --- | --- | --- | --- | --- | --- | --- |
| That the request exists | ✅ | ❌ | ✅ once submitted | ❌ | ✅ once submitted | ❌ |
| A **draft** they have not submitted | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `type`, `animal_desc`, the pet, the unit | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| The document **file** (the letter) | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| The checklist and each document's verdict | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| `decision_note` | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| `review_note` (why a document was verified or rejected) | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| `legal_note` | ✅ (policy admits it; no UI calls it private) | ❌ | ✅ | ❌ | ✅ | ❌ |

**A manager reads the letter.** There is no honest way to decide an ESA request
without reading the provider's letter, and the storage policy permits exactly
that. It is a decision, written down rather than left implicit, and the viewer
that exercises it says so on screen every time: *"This document is confidential.
Only this building's managers, the resident who filed the request, and a Pet10x
administrator can open it."*

**That sentence used to be false, and this document reproduced it.** Until the
Phase 7 fix round both the viewer and the paragraph above read *"Only you, other
managers of this building, and the resident can see it"* — printed two lines
below the table on this page whose Super-admin column already marks the letter
✅. `accommodation-docs read` ends in `manages_building(r.building_id) OR
is_admin()`, and a super-admin who manages no building and lives in none reads
every submitted request's documents: measured on production, `3` of `3` objects
in the bucket. The policy is right; the enumeration was short by one reader.
This is the `emergency_directory` / `p.conditions` failure — a stated audience
narrower than the served one — reappearing in UI copy rather than in a function
body, and it is why the row of the table and the sentence under it must be
changed together or not at all.

**A super-admin gets what EVERY building's manager gets, and that is the
point.** The sentence that stood here — *"exactly what the building's manager
gets, and nothing more. No cross-building list, no export."* — was false, and it
was false FOUR LINES BELOW the paragraph this same fix round corrected for
exactly this defect. Measured on production in a rolled-back transaction, as
`7fcfe000` (Pet10x Admin, who manages no building and lives in none):

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"7fcfe000-...","role":"authenticated"}';
select count(*), count(distinct building_id)
  from public.accommodation_requests where status <> 'draft';
--  super-admin  -> 6 requests across 3 buildings
--  Rachel Torres (building_manager of b41968f8) -> 4 across 1
```

`accom_select` ends in `(status <> 'draft') AND (manages_building(building_id)
OR is_admin())`, and `is_admin()` names no building. It is not only the policy
floor: `useAccommodationsLive` (`lib/data/accommodations-live.ts:154`) applies
`.neq("status", "draft")` and **no building filter**, and it feeds
`approvals-screen.tsx:66`, `violations-screen.tsx:284` and — through
`useWorkQueue` — the strata Queue, Buildings and Overview screens. **The
super-admin's screen IS the cross-building list.**

**That reach is intended, and it is written down here so it stays a decision
rather than an accident.** A platform administrator scoped to the buildings they
manage would see nothing at all, because this one manages none, and answering
for a building that cannot decide its own request is the reason the role exists.
The `is_admin()` disjunct is deliberate and identical in `accom_select`, in
`accom_manager_update` and in the `accommodation-docs` read policy. What was
never intended is this page describing the reach as narrower than it is: that is
the `emergency_directory` / `p.conditions` failure — a stated audience narrower
than the served one — appearing twice on one page, once in UI copy and once in
the paragraph that was supposed to be correcting it.

**Two limits are real, and they are the ones worth stating.** A super-admin sees
**zero** of a draft: the `status <> 'draft'` conjunct sits on the `is_admin()`
arm as well as the manager arm. Measured with a draft inserted in a rolled-back
transaction — 6 non-drafts visible, `0` drafts. And there is **no bulk export**:
nothing in the product renders accommodation data to CSV or to a report,
`exportMyData` omits accommodations deliberately (`accom_select` returns
`legal_note` to the resident and no screen renders it, so a `select *` export
would silently undo that), and the document viewer opens a letter in a sandboxed
`object` rather than downloading it. Those are limits. "No cross-building list"
was not one.

**Nobody gets a structured diagnosis.** This phase adds no `condition`,
`diagnosis` or `impairment` column, and never will. `animal_desc` stays free
text in the resident's own words, and the form offers no dropdown of conditions.
A column invites a report, and a report is how `emergency_directory` ended up
returning `p.conditions`.

**`review_note` is deliberately resident-readable.** A rejected letter whose
reason the resident cannot learn is a dead end they can only escape by guessing,
so the note a manager types when rejecting a document is stored where the
resident can read it — and the field is labelled *"Note (the resident can read
this)"* so the manager knows before they type.

**`legal_note` is labelled as SHARED, not private.** `accom_select` admits
`resident_id = auth.uid()` and returns the whole row, so the resident can read
that column today and Phase 7 did not change it. The manager's screen therefore
renders it as *"Guidance (the resident can read this)"*, and the resident's own
screen never renders it at all — putting *"Seek legal advice before denying"* in
front of the applicant is not the product. Calling it private would be the UI
making a false statement about the database.

**Three surfaces must never learn about this, and they do not:**

- **`audit_log`** carries the outcome and nothing clinical. No `decision_note`,
  no `animal_desc`, no filename — **and no `doc_kind`**, because the label
  `esa_letter` contains the word "letter" and would put the nature of the
  request into the one table the note was kept out of. Asserted over every row
  the phase created: `0` audit rows whose metadata matches any live
  `decision_note` or `animal_desc`, and `0` matching `%note%`, `%letter%`,
  `%esa%`, `%disab%` or `%.pdf%`.
- **`notifications`** carry a title and a target and never the reason: *"Your
  accommodation request was decided"* / *"Open Accommodation Requests to read
  the decision."* A push preview is readable on a lock screen. Asserted
  2026-08-23 over all 18 rows targeting `accommodations` or `approvals`: `0`
  match `esa`, `anxiety`, `disab`, `letter` or `service animal` in title or body.

  **Submitting now notifies the building's managers** — `20260829000001`. This
  paragraph used to say *"Submitting notifies nobody — a push saying a resident
  filed a disability accommodation names their disability status to whoever is
  looking at the phone"*, and the hazard in that sentence is real while the
  conclusion was not survivable: `withdraw_accommodation_request` already sent
  every manager *"An accommodation request was withdrawn"* through the same lock
  screen. One of the two had to change, and the silent one left residents filing
  into a queue nobody was told about. The wording carries no type, no
  `animal_desc`, no note, no document name and no resident: *"An accommodation
  request is waiting for review"* / *"A resident has sent a request to your
  queue."* It fires on `draft -> pending`, which is the transition that makes the
  row readable to those same managers under `accom_manager_read`, so it
  discloses nothing its addressees could not already open.

  **Withdrawing a DRAFT still notifies nobody**, because a draft is invisible to
  the building's managers and telling them one was withdrawn would announce a
  request that was never filed, through the one channel that bypasses RLS.

  Both manager-facing notifications target **`approvals`**, not
  `accommodations`. `accommodations` renders a viewer's OWN requests, so a
  manager holding no resident link landed on *"Join your building first"* under
  a button labelled *"Open approvals"* — the label and the target disagreed, and
  both were valid strings.
- **Email.** There is no email path. `/api/manager/request-info` sends one for
  registrations; this phase deliberately does not, because email is the one
  channel whose contents leave the product's access control behind. Asserted:
  `grep -rn "animal_desc\|decision_note" app/api/ lib/email*` returns nothing.

## Two rules that keep this true

**RLS is the floor, the query is the filter.** A policy guarantees a query
cannot get *more* than it should. It does not narrow an unfiltered read. So a
read should name its scope explicitly: reading with no `WHERE` and trusting the
policy looks correct on an unprivileged account and can be silently wrong on a
privileged one, which is the case least likely to be tested. See the measured
example in `RBAC_PERSONAS.md`.

**A `SECURITY DEFINER` function bypasses RLS, so it re-checks scope by hand.**
Scanning `pg_proc` for `SECURITY DEFINER` functions whose body mentions
`manages_building` or `is_admin()` returned six. How they refuse is not
consistent. `escalate_incident_to_violation` returns a structured
`{"ok": false, "error": "forbidden"}`. `manager_decide_registration` and
`business_mark_booking_paid` `raise exception`. So do
`guard_business_verification`, `guard_profile_privilege` and
`guard_review_reply` — but those three return `trigger` and are trigger-
attached, and raising is the only refusal a trigger has. New RPCs should return
structured, and Phase 4 onward should convert the two callable ones as it
touches them; the guards stay as they are.

## How to verify a row

Impersonate the actor in SQL and assert both directions — that the allowed case
returns rows and the denied case returns none. Never assert only the happy path.

```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"<profile-uuid>","role":"authenticated"}';

select count(*) from public.violations;   -- expect: only their own / their buildings

rollback;
```

For a guest, use `set local role anon` and set no claims at all.

Run the denied case against a real id from a *different* building, not a
made-up uuid — a policy that fails open on a nonexistent row still fails open.

**The control actor must not be a super-admin.** Most policies here carry
`is_admin()` as a disjunct, and for those an admin control proves nothing.
Assert `public.is_admin()` is `false` in the same transaction rather than
assuming it. Some policies do not carry it — check the one you are testing
rather than the tendency, and see *Where the admin grant stopped*.

**`storage.objects` DELETE cannot be probed from SQL.** A trigger,
`storage.protect_delete()`, refuses direct deletion from storage tables
regardless of policy (`Direct deletion from storage tables is not allowed`). So
a delete policy such as `community-media uploader delete` can be read from
`pg_policy` but not exercised this way; it needs the Storage API. Do not report
a delete row as verified on the strength of the policy text alone.

**A row about an empty bucket is still verifiable.** Plant the object inside
the transaction before switching role, then roll back:

```sql
begin;
insert into storage.objects (bucket_id, name)
values ('guest-evidence', '<buildingId>/<draftId>/1.jpg');

set local role authenticated;
set local request.jwt.claims to '{"sub":"<manager-uuid>","role":"authenticated"}';
select count(*) from storage.objects where bucket_id = 'guest-evidence';

rollback;
```

The insert runs as the connection's own role, before `set local role`, so it is
not itself subject to the policy under test. Plant a foreign-building path and a
malformed one alongside the good one: both extra objects should be invisible,
and the malformed one should be *invisible rather than fatal*.

## Verified

Impersonated in SQL against production, both directions. Each control actor
below was confirmed `is_admin() = false` in the same transaction; in the
*Where the admin grant stopped* probes, `is_admin() = true` was asserted
instead, since using a real super-admin was the point. Planted rows and objects
were rolled back; nothing was written.

**Read own violations and fines** — `violations_select`, `fines_select`.
13 violations and 4 fines exist in total.

| Actor | violations | fines | rows outside their scope |
| --- | --- | --- | --- |
| Resident of Cedar Grove | 1 | 1 | 0 |
| Resident of The Wellington (control) | 1 | 1 | 0 — sees none of the Cedar Grove resident's |
| Manager of Cedar Grove + Harbour View | 5 | — | 0 — sees none from The Wellington |

**Read evidence** — `guest-evidence manager read`. Three objects planted: one
under a building the permitted manager manages, one under a building they do
not, one under the literal path segment `not-a-building`.

| Actor | objects visible |
| --- | --- |
| Manager of Maple Court Residences | 1 — only their own building's |
| Manager of Cedar Grove (control) | 1 — only *their* building's, not the other |
| Resident of Maple Court Residences (control) | 0 — residency is not enough |
| `anon`, no claims (control) | 0 — run against the malformed object alone |

None of these four readers saw the malformed object, and none of their queries
raised — that is the `20260821000003` hardening doing its job. Before it, that
third object would have aborted these reads with
`invalid input syntax for type uuid: "not-a-building"`.

**Read another resident's pet photo** — `pet-media manager read`. Four objects
exist; two belong to a pet registered to Maple Court Residences.

| Actor | objects visible |
| --- | --- |
| Manager of Maple Court Residences | 2 — and 0 of them uploaded by them, so it is the manager policy and not `pet-media owner read` |
| Resident of the same building (control) | 0 |

**Upload and read community media** — the three `community-media` policies.

| Actor | outcome |
| --- | --- |
| Resident of Maple Court Residences, path `{thatBuilding}/{ownUid}/…` | insert admitted, object then readable |
| Same resident, path `{aBuildingTheyAreNotIn}/{ownUid}/…` | insert rejected, `42501` |
| Same resident, path `not-a-building/{ownUid}/…` | insert rejected, `42501` |
| Resident of The Wellington (control) | 0 objects visible |

**What anon reached.** `set local role anon`, no claims. Results tabulated
under *What anon can already reach* above; the two zeroes there
(`public.pets`, `public.buildings`) are the point — RLS held, and those reads
arrived through the functions.

**Where the admin grant stopped.** Impersonating `admin.pet10x@gmail.com`,
`is_admin() = true` asserted in the same transaction, and neither resident nor
manager of the target building:

| Attempt | Result |
| --- | --- |
| `insert into public.community_posts` | `42501` |
| `insert into storage.objects` at `{thatBuilding}/{ownUid}/flyer.jpg` in `community-media` | `42501` |
| `insert into public.accommodation_requests` naming another resident | `42501` |
| `insert into public.accommodation_requests` naming themselves | ~~admitted~~ → **`42501` since Phase 7** |
| `select` a planted `community-media` object | 1 row — the read policy does carry `is_admin()` |

The `community-media` insert is the clean comparison: a *resident* of that
building inserting the identical path shape under their own uid was admitted
(row above), so the refusal is the policy and not the statement.

**A manager can already advance a violation** — `violations_manager_write`.
Non-admin manager of Maple Court Residences (`is_admin() = false`), one
`update public.violations set stage = 'fine_issued' where building_id = …`:
5 rows in scope moved from `investigation,resolved,written_warning` to
`fine_issued`. Rolled back. Context for ² above.
