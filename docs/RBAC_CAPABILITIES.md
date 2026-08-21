# Who may do what

Companion to `RBAC_PERSONAS.md`, which explains *why* the model is grant-derived.
This is the flat answer to *what is allowed*, and the recipe for checking it.

A persona is a view, never a permission. Every row below that is *not* marked
*(Phase N)* is enforced in the database — by an RLS policy, or by a
`SECURITY DEFINER` function that re-checks scope by hand because it bypasses
RLS. A marked row is a forward reference: nothing enforces it yet because
nothing implements it yet.

"anon (code only)" is a guest holding a building code and no session at all.
`signInGuest` sets client state; it creates no auth user.

**A code is not inert.** It authorises intake, and it authorises exactly one
read: the building's pet roster. `building_pets_for_report(p_code)` is
`SECURITY DEFINER` with no gate beyond matching the code, and the guest
reporter flow calls it (`lib/data/incidents.ts:376`) so a guest can point at
the pet they are reporting instead of describing it. Measured as `anon` with no
claims, `building_pets_for_report('MCR2026')` returned all 10 non-deleted pets
in that building — id, name, species, breed and a photo path. What it withholds
is the unit, the owner and any contact detail, and the same actor reading
`public.pets` directly gets 0 rows. So RLS is intact and this is a deliberate,
scoped hole punched through it, not a leak. Read every ❌ in the anon column
below as "beyond that roster".

One observation, not a defect: the `photo` value is a raw storage path, and
`pet-media` paths are `{ownerUid}/{petId}/…`, so a guest holding a lobby code
can also derive owner auth uids. Phase 2 plans to stop returning raw paths to
the client in favour of server-signed URLs, which closes this as a side effect.
Nothing should change ahead of that.

| Capability | anon (code only) | resident | manager of building | super-admin | Enforced by |
| --- | --- | --- | --- | --- | --- |
| File an incident | ✅ | ✅ | ✅ | ✅ | `submit_incident_report` |
| Upload evidence | ✅ | ✅ | ✅ | ✅ | signed upload URL, server-minted *(Phase 1)* |
| Read evidence | ❌ | ❌ | ✅ own buildings | ✅ | `guest-evidence manager read`, hardened in `20260821000003_storage_policy_reconciliation.sql` |
| Look up a report by reference | ✅ | ✅ | ✅ | ✅ | `incident_status_by_reference` |
| Triage an incident | ❌ | ❌ | ✅ | ✅ | `incidents_manager_update` |
| Escalate to a violation | ❌ | ❌ | ✅ | ✅ | `escalate_incident_to_violation` |
| Advance a violation degree | ❌ | ❌ | ✅ | ✅ | `manager_advance_violation` *(Phase 4)* — but see ² |
| Read own violations and fines | ❌ | ✅ own | ✅ building | ✅ | `violations_select`, `fines_select` |
| Dispute a violation | ❌ | ✅ own | ❌ | ✅ | `dispute_violation` *(Phase 5)* |
| Decide a dispute | ❌ | ❌ | ✅ | ✅ | `manager_resolve_dispute` *(Phase 5)* |
| Request an accommodation | ❌ | ✅ | ✅ | ✅ | `accom_resident_insert` |
| Decide an accommodation | ❌ | ❌ | ✅ | ✅ | `accom_manager_update` |
| Set the fine schedule | ❌ | ❌ | ✅ | ✅ | `buildings_manager_update` (manager), `buildings_admin_all` (admin) *(Phase 4)* |
| Write or publish a building rule | ❌ | ❌ | ✅ | ✅ | `publish_building_rule` *(Phase 6)* |
| Read a building rule | ❌ | ✅ published, own building | ✅ all, own buildings | ✅ | `building_rules` select *(Phase 6)* |
| Post, RSVP, report lost & found | ❌ | ✅ ¹ | ✅ ¹ | ✅ ¹ | `posts_insert`, `rsvps_self`, `lost_found_insert`, `events_write`, and `posts_select` / `lost_found_select` / `events_select` |
| Upload and read community media | ❌ | ✅ own buildings | ✅ own buildings | ✅ | `community-media building read`, `community-media uploader write`, `community-media uploader delete` |
| Read another resident's pet photo | ❌ | ❌ | ✅ own buildings | ✅ | `pet-media manager read`, as recreated in `20260821000002_fix_pet_media_manager_read.sql` |

Rows marked *(Phase N)* are specified but not yet built. The phase that builds
one removes its marker and adds its verification.

¹ The community row is the one place where no two ticks mean the same thing.
`posts_insert` is `author_id = auth.uid() AND is_resident_of(building_id) AND
is_premium(auth.uid())` — there is no `manages_building` disjunct and **no
`is_admin()` disjunct either**, and `community_posts` carries no admin-all
policy. So a manager who is not also a resident cannot post to their own
building's feed, a resident without an entitlement cannot post at all, and a
super-admin cannot post anywhere: verified by impersonating a real super-admin
(`is_admin() = true`) and getting `42501` on the insert. This is the only
capability in the matrix with no admin escape hatch, which is worth saying out
loud — every other ❌→✅ in the super-admin column is `is_admin()` doing the
work, and here there is nothing to do it. `events_write` does accept
`manages_building` and `is_admin`. `lost_found_insert` tests only
`reporter_id = auth.uid()`, with no building test at all on write — the
scoping for lost & found lives entirely in `lost_found_select`. RSVPs are one
`FOR ALL` policy, `rsvps_self` (`profile_id = auth.uid()`); there is no
`rsvps_select`. Splitting this row into three is Phase 6's job.

² `manager_advance_violation` genuinely does not exist, but do not read that as
"no one can advance a violation yet". `violations_manager_write` is `FOR ALL`
with `manages_building(building_id) or is_admin()`, so a manager already has an
unguarded direct write to `violations.stage`. Measured: a non-admin manager of
Maple Court Residences moved all 5 of that building's violations from
`investigation` / `written_warning` / `resolved` to `fine_issued` in a single
`UPDATE`, with no degree-ordering check and no `violation_events` row written.
Phase 4 must close or supersede that write path, not just add the RPC beside
it.

## What the storage rows depend on

Three of the rows above — read evidence, community media, another resident's
pet photo — are enforced against a *path*, not a foreign key, so the path
convention is load-bearing. `accommodation-docs` is listed with them because it
shares the mechanism, though no row above turns on it yet:

| Bucket | Path | Segment that decides access |
| --- | --- | --- |
| `guest-evidence` | `{buildingId}/{draftId}/{n}.{ext}` — *intended, see below* | 1 — the building |
| `community-media` | `{buildingId}/{uploaderUid}/{filename}` | 1 to read, 1 **and** 2 to write, 2 alone to delete |
| `pet-media` | `{ownerUid}/{petId}/{filename}` | 1 for the owner, 2 for the manager |
| `accommodation-docs` | `{buildingId}/{requestId}/{filename}` | 2 — the request |

The `guest-evidence` shape is a convention carried over from the Phase 1 spec,
not an observed one. Nothing has ever been written to that bucket — it holds 0
objects, no application code so much as names the string `guest-evidence`, and
its single policy is the SELECT above. The convention becomes real, or gets
corrected, when Phase 1 writes the first object.

Two things about these are worth knowing before touching them.

**A malformed segment must evaluate false, not raise.** The `::uuid` casts in
the `guest-evidence` and `community-media` read policies used to abort the
whole query with `22P02` when segment 1 was not a UUID — which meant one bad
object could take the bucket offline for every reader, super-admins included.
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
an empty array — and compared `null` to the pet id. False for every row,
always, which is exactly the blank pet picker the policy existed to fix.
`20260821000002_fix_pet_media_manager_read.sql` writes
`storage.foldername(storage.objects.name)` instead. The sibling
`accommodation-docs` policies use the bare form and bind correctly only because
`accommodation_requests` happens to have no `name` column to collide with —
same code, different outcome, decided entirely by the joined table. Do not
"simplify" the qualification away.

## Two rules that keep this true

**RLS is the floor, the query is the filter.** A policy guarantees a query
cannot get *more* than it should. It does not narrow an unfiltered read. Every
read names its scope explicitly — reading with no `WHERE` and trusting the
policy is correct for unprivileged accounts and silently wrong for every
privileged one, which is the case least likely to be tested. See the measured
example in `RBAC_PERSONAS.md`.

**A `SECURITY DEFINER` function bypasses RLS, so it re-checks scope by hand.**
Every one that gates a privileged action does open with
`manages_building(...) or is_admin()`, or the equivalent ownership test. How it
*refuses* is not yet consistent. Of the six that carry such a check, only
`escalate_incident_to_violation` returns a structured
`{"ok": false, "error": "forbidden"}`; `manager_decide_registration` and
`business_mark_booking_paid` `raise exception`, as do the three `guard_*`
functions — though those three are triggers returning `trigger`, and raising is
the only refusal a trigger has. So the real split is two callable RPCs on the
old raising convention against one on the new structured one. New RPCs should
return structured, and Phase 4 onward should convert the two as it touches
them; the guards stay as they are.

**Four functions are deliberately open to a guest** — `resolve_building_code`,
`submit_incident_report`, `incident_status_by_reference` and
`building_pets_for_report`. The first three return only what the caller already
supplied a code or a reference for. The fourth is the exception described at
the top of this document: it does return a listing, of one building's pets,
because the guest reporter flow needs it.

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

**The control actor must not be a super-admin.** `is_admin()` is a disjunct in
almost every policy here, so an admin control proves nothing. Assert
`public.is_admin()` is `false` in the same transaction rather than assuming it.
The one policy where an admin control *would* have been meaningful is
`posts_insert`, which has no `is_admin()` disjunct at all — see ¹.

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

Impersonated in SQL against production, both directions, every control actor
confirmed `is_admin() = false` — with one deliberate exception, the
`posts_insert` probe below, where the whole point was to use a real
super-admin. Planted rows and objects were rolled back; nothing was written.

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

No reader saw the malformed object and no reader's query raised — that is the
`20260821000003` hardening doing its job. Before it, that third object would
have aborted every one of these reads with
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

**What a building code alone grants** — `building_pets_for_report`.
`set local role anon`, no claims:

| Probe | Result |
| --- | --- |
| `building_pets_for_report('MCR2026')` | `valid: true`, 10 pets — every non-deleted pet in the building, with id, name, species, breed and one raw `pet-media` path |
| `select count(*) from public.pets` (same actor) | 0 — RLS itself is intact; the roster comes only through the function |

**Nobody may post, not even an admin** — `posts_insert`. Impersonating
`admin.pet10x@gmail.com`, asserted `is_admin() = true` in the same transaction:
`insert into public.community_posts (building_id, author_id, content)` →
`ERROR 42501 new row violates row-level security policy`. The same actor's
`is_resident_of` and `is_premium` were both false, which is the whole reason —
`posts_insert` offers no third way in.

**A manager can already advance a violation** — `violations_manager_write`.
Non-admin manager of Maple Court Residences (`is_admin() = false`), one
`update public.violations set stage = 'fine_issued' where building_id = …`:
5 rows in scope moved from `investigation,resolved,written_warning` to
`fine_issued`. Rolled back. Context for ² above.
