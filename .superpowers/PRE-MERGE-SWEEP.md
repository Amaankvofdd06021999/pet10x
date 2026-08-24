# Pre-merge sweep — every open item, with its source

Nothing here is a data-exposure defect. Six are sentences, two are small code
changes. Run as ONE agent after Phase 8's fix round closes, then the
whole-branch review, then merge.

## From Phase 7's re-review (a87f3df4fe306a67a) — THREE Important

1. **`docs/RBAC_CAPABILITIES.md:571-573`** — "A super-admin gets exactly what
   the building's manager gets, and nothing more. No cross-building list, no
   export." FALSE, and it sits FOUR LINES BELOW the sentence this very fix
   round corrected for exactly this defect. Measured: 6 requests across 3
   buildings in one select. And it is not only policy-level --
   `useAccommodationsLive` applies `.neq("status","draft")` and NO BUILDING
   FILTER, feeding both approvals-screen and the strata Queue. So the
   super-admin's screen IS the cross-building list.
   A document just corrected for a narrow-audience claim must not still
   contain a second one.

2. **`app/api/accommodations/docs/purge/route.ts:182,197,234`** — pagination
   only HALF fixed, and the comment at :155 claims otherwise. The loop
   terminates on `page.length < ROWS`. If `pgrst.db_max_rows` is ever set
   below 1000, PostgREST caps each `.range(0,999)` the same way, returns 200
   with no error, and the loop exits on page one -- producing exactly the
   outcome the comment describes: page one of the letters looks like all of
   them, everything past it classifies as an orphan, AND DOCTORS' LETTERS ARE
   DELETED. The file moved the threshold from db_max_rows to
   min(db_max_rows, 1000); it did not remove the dependency.
   Fix: terminate on a ZERO-LENGTH page, or compare against an exact count.

3. **`20260827000007…sql:62-66`**, repeated in the function COMMENT and the
   ledger — "there is nothing new to invoke and nothing new to grant."
   DISPROVED. The reviewer created a temp table as `authenticated` (TEMP
   privilege is granted; CREATE on schemas is not), attached the promoted
   guard to it, and drove both branches: live pet -> 42501, non-existent uuid
   -> ADMITTED. That is a working existence oracle over pets, units and
   profiles, and it exists ONLY because of the promotion.
   The DESIGN still stands -- the oracle answers only "does this uuid exist",
   the same power the rejected helper would have had, and no client role
   reaches DDL through PostgREST. But the containment is POSTGREST'S SURFACE,
   NOT 0A000, and the header must say so.

## From Phase 6's re-review (aa3bd92d9018e3616) — three Minor
4. `lib/data/live.ts:545` docStatusFromExpiry boundary moved from
   `exp < now+30d` to `days <= 30`, so a document expiring in EXACTLY 30 days
   now badges `expiring`. Almost certainly intended; the doc-comment does not
   say the boundary moved.
5. `lib/data/manager-queues.ts:50` ageFrom() still does a bare new Date(dob)
   with no note, while ai/context.ts:249 carries an explicit "NOT the same
   defect". The next reader cannot tell "checked and left" from "missed".
6. `app/api/care/reminders/run/route.ts:197` `if (!nextKey) continue` fails
   QUIET where the old code threw, so a malformed dateKey re-notifies every
   run instead of erroring once.

## From Phase 7's re-review — two Minor
7. `app/api/account/delete/route.ts:52` says "the residual 3 fail at
   deleteUser itself". Six of the 21 fail there; 3 of those have rows to lose.
8. `community_posts_guard` and `community_freeze_attribution` carry
   `search_path=public, pg_temp`. Harmless while invoker; a real hazard if
   either is ever promoted -- which is precisely what just happened to the
   accommodation guard. Add the note.

## Controller's own, already fixed
`docs/superpowers/2026-08-23-migration-drift.md:41` printed a
whitespace-normalised md5 under the bare label `live_body_md5`. The hash was
right; the label made it unreproducible, and a reviewer flagged it as
unverifiable. Corrected in place, with the transform written beside it.
A hash is only evidence if the transform that produced it is next to it.

## Still open, owned by nobody — for the final report, NOT this sweep
  - 21 of 48 profiles cannot be deleted (20 NO-ACTION FKs to profiles).
    3 of them lose rows before being refused. audit_log blocks nobody.
    All 3 live bucket objects belong to one of the blocked accounts, so the
    PIPEDA path is unreachable for 100% of the documents that exist.
  - exportMyData omits accommodation data. Deliberate: accom_select returns
    `legal_note` to the resident and the product never renders it, so a
    `select *` export would silently undo that.
  - No phase owns fine_status transition rules: paid -> waived and
    waived -> issued are both permitted. The stage ladder has a guard; the
    money does not.
  - Co-resident profiles invisible outside community_identities(); a resident
    with two approved buildings gets four different answers; a manager of >1
    building cannot use the community screen.
  - 30 of 59 local migration files differ in content from what ran, and
    `supabase db reset` has never been run (no CLI, no Docker).
