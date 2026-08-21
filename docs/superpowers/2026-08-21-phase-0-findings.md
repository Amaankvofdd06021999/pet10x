# What Phase 0 found

Phase 0 set out to make the database reproducible from version control. It did
that. It also turned up a set of things nobody was looking for, and this is
where they live so the next phase does not rediscover them.

Everything below was measured against the live `Pet10x` project
(`ekgejmxgnlmdomkpblki`) on 2026-08-21, not inferred.

## Fixed in this phase

**Violations were being filed against the person who reported them.**
`escalate_incident_to_violation` set the new violation's `resident_id` from
`incident_reports.reporter_id`. Report a neighbour's dog under your own name
and the case opened against you. It had already happened: incident `IR-454B06`
identified the pet Simba, and the violation it produced named the reporter and
carried `pet_id = null` — discarding the one fact that identified the subject.
Fixed to derive the subject from the identified pet's owner, and the affected
row repaired.

**Three storage buckets had no policies at all** — `guest-evidence`,
`accommodation-docs`, `community-media` — so no role could read or write them.
A fourth, `pet-media`, was owner-only, which is why the pet-photo picker shown
to an incident reporter rendered no photos.

**A storage policy that could never match a row.** The first attempt at
`pet-media manager read` put an unqualified `name` inside
`exists (select 1 from public.pets p …)`, where Postgres binds it to
`pets.name` rather than the object path. The identical syntax one policy above
works, because `accommodation_requests` has no `name` column to capture it.
Same code, opposite outcome, decided by a collision.

**A self-service outage.** `community-media uploader write` validated only the
second path segment, and the read policies cast the first to `uuid`. Any
authenticated user could upload one object under a non-UUID first segment and
break *every* read of that bucket, for everyone including admins. Closed by
guarding the casts with `CASE` — not `AND`, because SQL does not promise
left-to-right evaluation and the planner may reorder past a guard.

**A latent `db reset` failure.** `20260727000000_ai_assistant.sql` added an
enum value and used it in the same transaction, which Postgres refuses. The
server had run the same work as three separate migrations. Replacing the local
file with those three makes a reset work.

## Open — security

**`revoke execute … from anon` is a no-op while PUBLIC holds the grant, and
this repo does it seven times.**

| Function | `anon` can execute |
| --- | --- |
| `is_premium(uuid)` | **yes** |
| `resolve_entitlement(uuid)` | **yes** |
| `request_building_link(text)` | **yes** |
| `my_building_link()` | **yes** |
| `leave_my_building_link()` | **yes** |

Every ACL reads `=X/postgres | postgres=X | authenticated=X | service_role=X`.
That leading `=X/postgres` is the PUBLIC grant, and `anon` inherits from
PUBLIC, so revoking an explicit `anon` entry that may never have existed
changed nothing.

The correct spelling is in the same repo, same week, same author:
`20260714185824:106`, `20260714191724:88-89`, `20260714191758:61` and
`20260714191904:84-85` all `revoke all … from public` first, and those hold.
Two spellings, one of which only looks like a control.

It composes with the item below: a building code yields a storage path
embedding an owner's auth uid, and that uid is exactly the argument
`is_premium` and `resolve_entitlement` take.

**A lobby building code is worth more than intake.** It authorises
`resolve_building_code` (building uuid and name) and
`building_pets_for_report` (every non-deleted pet in the building, with
storage paths of the form `{ownerUid}/{petId}/…`). The roster is deliberate —
a witness needs it to point at a pet, and unit, owner and contact are all
withheld. The owner uid in the path is not deliberate.

Signing does **not** close this. A Supabase signed URL carries the object path
verbatim, so Phase 2's server-side signing relocates who mints the URL, not
what the path reveals. Closing it means not deriving the path from `auth.uid()`
(`lib/supabase/storage.ts:36`) or proxying the bytes.

**`search_path` is pinned to `'public'` without `pg_temp`** on every
`SECURITY DEFINER` function in the repo, and `submit_incident_report` casts
`p_type::incident_type` with an unqualified type name — which is what
`pg_temp` is still searched for. Low exploitability; repo-wide.

## Open — product decisions

**Community posting requires a premium subscription, at the database layer.**
`posts_insert` is `author_id = auth.uid() and is_resident_of(building_id) and
is_premium(auth.uid())`. There is no `manages_building` disjunct, so a manager
cannot post to their own building's feed, and no `is_admin()` disjunct either —
a super-admin insert returns `42501`. Phase 8 was scoped assuming those tables
were usable.

**`emergency_directory` contradicts its own documentation.** The migration says
at `:10-11` "Deliberately NOT returned: owner identity, **medical history**,
billing, documents, compliance" and at `:71` returns `p.conditions`. Arguably
the code is right and the comment is stale — telling a first responder a dog is
diabetic is close to the point of an emergency directory, the token is 4-hour
and manager-issued, and every view is audit-logged. Either amend the comment or
strip the field; do not leave them disagreeing.

**`search_buildings_public` needs no code at all** — three characters of
substring returns building name, address, city, region and postal code, capped
at eight results, with no id and no building code. Judged acceptable: street
addresses are public information and a hit only confirms the building is on
Pet10x. Recorded so it is a choice rather than an accident.

## Open — repo hygiene

**30 of 59 local migration files differ in content from what actually ran.**
Phase 0 closed the gap where migrations were *missing* — 43 files against 61
applied, now 59 by file plus 2 verified as superseded. It did not close the gap
where they *disagree*: `init_schema` is 28078 bytes locally against 24750 on
the server, `functions_rls` 23130 against 20055, and 28 more. A reset replays
the local text, which for half these files is not what production ran.

**`supabase db reset` has never been run.** No Docker, no Supabase CLI on the
development machine. Ordering and every non-idempotent statement in the 18
captured files were traced by hand and no conflict found, but hand-tracing is
not execution. Installing the CLI would turn the largest untested claim in this
phase into a checked one.

**Migration filenames and remote versions do not correspond**, because
`apply_migration` mints wall-clock versions. `supabase migration list` will
report every local file as unapplied. Cosmetic, but it means replay order
differs from production order in three places — all verified benign, and worth
knowing before anyone renumbers.

**`pnpm lint` has never worked.** The script runs `eslint`, which is not a
dependency and has no config anywhere in the repo, on `main` too.

## Two claims a later phase should not misread

**A manager can already move violations without the Phase 4 RPC.**
`violations_manager_write` is `FOR ALL` with
`manages_building(building_id) or is_admin()`, so a single `UPDATE` moved all
five of a building's violations to `fine_issued` — no degree ordering, no
`violation_events` row. Phase 4 must close or supersede that path, not assume
it is shut.

**The fine schedule has policies but no column.** `buildings_manager_update`
and `buildings_admin_all` both exist and are live; `buildings` has no
fine-schedule column. Read carelessly that says "policy ready, just add the
column" — and shipping it that way gives any manager an unaudited rewrite of
the schedule.
