# The orphan migration, and why it must NOT be restored as a file

Found by Phase 6's review. `supabase_migrations.schema_migrations` holds

    20260823135223  opening_event_current_date_fix

applied between `20260823134936 reminder_throttle_and_opening_event` and
`20260823142226 opening_event_actor`. **There is no file for it**, and the
local directory jumps `20260823000006` → `20260823000007`.

This is Phase 0's drift problem recurring, and the obvious repair — capture the
applied SQL into a file named after its version — **is wrong and would cause a
regression.** Recorded here so nobody performs it.

## Why it is safe to leave fileless

The orphan was a hotfix: `20260823000006` shipped `pg_catalog.current_date`,
which is a syntax error because `current_date` is an SQL *keyword*, not a
schema-qualified function. `create function` does not plan its body, so the
migration applied cleanly and raised `42P01` only on the first live INSERT —
which would have made opening any case fail. The hotfix replaced the body.

`20260823000007_opening_event_actor.sql` then replaced the whole function again,
for a different reason (attribution: `coalesce(auth.uid(), new.opened_by)`, so a
manager cannot sign a case as a colleague). That file carries the corrected
`current_date` as well.

So a replay from files reaches the right end state:

    000006  creates the function with the broken line   (applies; never called)
    000007  replaces it entirely, correct on both counts

Verified 2026-08-23 against the live database:

    live_body_md5   9a3594933846796ec4f343827a019582
    has_actor_fix   true
    still_broken    false

and `20260823000007` is what produces that body.

## Why restoring it WOULD break things

Migrations replay in filename order. `20260823135223` sorts **after**
`20260823000007`:

    20260823000006
    20260823000007
    20260823135223   <- would run last

The orphan's body carries `coalesce(new.opened_by, auth.uid())` — the
pre-attribution-fix order. Restoring it as a file would silently revert the
actor fix on every `db reset`, reopening the hole where a manager can attribute
a case they opened to a different manager, in both the ledger and the audit log.

## The residual, which is real but small

`20260823000006`'s text still contains the broken line. Anyone replaying to
exactly that point and then opening a case gets `42P01`. Nothing does that —
a reset runs every file before the seed — and the rule against editing an
applied migration's DDL is worth more here than closing a window nothing
occupies.

## The general lesson

Version stamps are minted by `apply_migration` from wall-clock time; filenames
are chosen by hand. **They do not sort the same way.** Any repair that adds a
file named after a wall-clock version drops it at the end of the replay order,
regardless of when it actually ran. Check what a filename would sort *after*
before creating it.
