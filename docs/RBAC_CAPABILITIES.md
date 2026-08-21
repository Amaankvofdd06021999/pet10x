# Who may do what

Companion to `RBAC_PERSONAS.md`, which explains *why* the model is grant-derived.
This is the flat answer to *what is allowed*, and the recipe for checking it.

A persona is a view, never a permission. Every row below is enforced in the
database — by an RLS policy, or by a `SECURITY DEFINER` function that
re-checks scope by hand because it bypasses RLS.

"anon (code only)" is a guest holding a building code and no session at all.
`signInGuest` sets client state; it creates no auth user. Possession of a code
authorises intake and nothing else — it never grants a read of stored data.

| Capability | anon (code only) | resident | manager of building | super-admin | Enforced by |
| --- | --- | --- | --- | --- | --- |
| File an incident | ✅ | ✅ | ✅ | ✅ | `submit_incident_report` |
| Upload evidence | ✅ | ✅ | ✅ | ✅ | signed upload URL, server-minted |
| Read evidence | ❌ | ❌ | ✅ own buildings | ✅ | `guest-evidence manager read`, hardened in `20260821000003_storage_policy_reconciliation.sql` |
| Look up a report by reference | ✅ | ✅ | ✅ | ✅ | `incident_status_by_reference` |
| Triage an incident | ❌ | ❌ | ✅ | ✅ | `incidents_manager_update` |
| Escalate to a violation | ❌ | ❌ | ✅ | ✅ | `escalate_incident_to_violation` |
| Advance a violation degree | ❌ | ❌ | ✅ | ✅ | `manager_advance_violation` *(Phase 4)* |
| Read own violations and fines | ❌ | ✅ own | ✅ building | ✅ | `violations_select`, `fines_select` |
| Dispute a violation | ❌ | ✅ own | ❌ | ✅ | `dispute_violation` *(Phase 5)* |
| Decide a dispute | ❌ | ❌ | ✅ | ✅ | `manager_resolve_dispute` *(Phase 5)* |
| Request an accommodation | ❌ | ✅ | ✅ | ✅ | `accom_resident_insert` |
| Decide an accommodation | ❌ | ❌ | ✅ | ✅ | `accom_manager_update` |
| Set the fine schedule | ❌ | ❌ | ✅ | ✅ | `buildings_manager_update` *(Phase 4)* |
| Write or publish a building rule | ❌ | ❌ | ✅ | ✅ | `publish_building_rule` *(Phase 6)* |
| Read a building rule | ❌ | ✅ published, own building | ✅ all, own buildings | ✅ | `building_rules` select *(Phase 6)* |
| Post, RSVP, report lost & found | ❌ | ✅ ¹ | ✅ ¹ | ✅ | `posts_insert`, `rsvps_self`, `lost_found_insert` and their `*_select` siblings |
| Upload and read community media | ❌ | ✅ own buildings | ✅ own buildings | ✅ | `community-media building read`, `community-media uploader write`, `community-media uploader delete` |
| Read another resident's pet photo | ❌ | ❌ | ✅ own buildings | ✅ | `pet-media manager read`, as recreated in `20260821000002_fix_pet_media_manager_read.sql` |

Rows marked *(Phase N)* are specified but not yet built. The phase that builds
one removes its marker and adds its verification.

¹ The community row is the one place where the three ticks are not the same
tick. `posts_insert` requires `is_resident_of(building_id)` **and**
`is_premium(auth.uid())`, so a manager who is not also a resident of that
building cannot post there, and neither can a resident with no entitlement.
`events_write` does accept `manages_building`. `lost_found_insert` tests only
`reporter_id = auth.uid()` — the building scoping for lost & found lives
entirely in `lost_found_select`. Splitting this into three rows is Phase 6's
job, when community gets its own pass.

## What the storage rows depend on

Three of the rows above — read evidence, community media, another resident's
pet photo — are enforced against a *path*, not a foreign key, so the path
convention is load-bearing. `accommodation-docs` is listed with them because it
shares the mechanism, though no row above turns on it yet:

| Bucket | Path | Segment that decides access |
| --- | --- | --- |
| `guest-evidence` | `{buildingId}/{draftId}/{n}.{ext}` | 1 — the building |
| `community-media` | `{buildingId}/{uploaderUid}/{filename}` | 1 to read, 1 **and** 2 to write |
| `pet-media` | `{ownerUid}/{petId}/{filename}` | 1 for the owner, 2 for the manager |
| `accommodation-docs` | `{buildingId}/{requestId}/{filename}` | 2 — the request |

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
Every one that gates a privileged action opens with
`manages_building(...) or is_admin()`, or the equivalent ownership test, and
returns a structured error rather than raising —
`escalate_incident_to_violation` returns `{"ok": false, "error": "forbidden"}`.
The three that are deliberately open to a guest —
`resolve_building_code`, `submit_incident_report`,
`incident_status_by_reference` — have no such gate by design, which is why each
returns only what the caller already supplied a code or a reference for, and
never a listing.

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
confirmed `is_admin() = false`. Planted storage objects were rolled back.

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
