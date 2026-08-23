-- Pet10x — what `anon` and `authenticated` may do to a table, stated once.
--
-- WHAT WAS MEASURED, AND IT IS NOT HYPOTHETICAL. Phase 6's reviewer, running a
-- five-actor matrix as `resident1@pet10x.com` — an ORDINARY SIGNED-IN RESIDENT,
-- not a manager, not an admin — ran `truncate public.building_rules` against
-- live production. It SUCCEEDED and wiped all three seed rows. The review had
-- to re-seed the table to finish.
--
-- So the statement is: **any signed-in resident could erase every house rule on
-- the platform in one statement** — and every violation, every ledger event,
-- every fine and every appeal alongside them. Confirmed independently on
-- `violation_disputes`, a table designed to be unwritable from a client (no
-- INSERT, UPDATE or DELETE policy exists on it; both RPCs that write it are
-- SECURITY DEFINER):
--
--     begin;
--     set local role authenticated;
--     truncate public.violation_disputes;   -- SUCCEEDED. 1 row -> 0 rows.
--     rollback;
--
-- and the same for `violations`, `violation_events`, `fines` and 49 other
-- tables, for `anon` as well as `authenticated`.
--
-- WHY RLS DID NOT STOP IT. **TRUNCATE IS NOT A DML COMMAND.** Row-level
-- security governs SELECT, INSERT, UPDATE and DELETE — it is defined in terms
-- of rows, and TRUNCATE does not visit rows. `relacl` read
-- `anon=arwdDxtm/postgres` on 53 of 55 tables: `a`=INSERT, `r`=SELECT,
-- `w`=UPDATE, `d`=DELETE — the four RLS polices — plus `D`=TRUNCATE, `x`=
-- REFERENCES, `t`=TRIGGER and `m`=MAINTAIN, which it does not police at all.
-- The four RLS covers were the only ones anybody had thought about.
--
-- WHERE THE GRANT CAME FROM. Nobody wrote it. Supabase ships
--
--     alter default privileges in schema public grant all on tables
--       to anon, authenticated, service_role;
--
-- so every `create table` in every migration this project has ever run arrived
-- carrying it. It is the same mechanism as the `anon=X` execute grant Phase 5
-- caught on `dispute_violation` — an object appearing with a privilege nobody
-- decided on. Fixing the function and not the tables fixed one instance of a
-- default, not the default.
--
-- WHY THIS IS PROJECT-WIDE AND NOT A PATCH ON FOUR TABLES. The grant is
-- uniform, so a per-table patch would leave 49 tables holding it and the next
-- `create table` would reintroduce it on the fiftieth. `pet_documents`,
-- `pet_vaccinations`, `incident_reports` and `profiles` are evidentiary too;
-- `payments`, `payouts` and `subscriptions` are financial. There is no table in
-- this schema for which "any browser session may erase every row" is the
-- intended answer.
--
-- THE GRAMMAR, POSITIVE. Not "revoke TRUNCATE" — that fixes the verb that was
-- noticed and leaves REFERENCES, TRIGGER and MAINTAIN, which were not. The
-- statement is:
--
--   anon, authenticated  hold EXACTLY {SELECT, INSERT, UPDATE, DELETE} on the
--                        tables they touch: the four verbs row-level security
--                        polices, and nothing outside its reach. RLS remains
--                        the only thing deciding WHICH rows.
--   service_role         unchanged, deliberately. It is the trusted server
--                        identity, it bypasses RLS by design, and it already
--                        holds DELETE on every row of every table — taking
--                        TRUNCATE away would remove a capability it can
--                        reproduce in one statement. Recorded as a decision so
--                        the next reader does not mistake it for an oversight.
--   postgres, and the
--   supabase_* roles     untouched. They own the schema.
--
-- WHAT IS NOT CHANGED, AND WHY THIS IS NOT A SECOND SPELLING. No table gains a
-- role it did not already have. The loop only resets a role on a table where
-- that role ALREADY appears in `relacl`, so a decision somebody made to keep a
-- role out entirely is stronger than this one and survives it:
--
--   building_rules    `20260825000000` already did `revoke all ... from anon`,
--                     by name rather than `from public` — the same reasoning
--                     this file uses, arrived at independently one phase later.
--                     `anon` is absent from its `relacl` and STAYS absent: the
--                     loop never touches a role it does not find. What Phase 6
--                     could not have known is that `authenticated` still held
--                     `arwdDxtm` there, which is the exact grant its own
--                     reviewer then used to wipe the table. This migration is
--                     the general form of that revoke, not a competitor to it —
--                     `building_rules` comes out `authenticated=arwd`.
--   pending_signups   postgres and service_role only. Untouched.
--
-- Every existing DML path is preserved byte for byte.
--
-- REACHABILITY — AND WHY THAT IS THE WRONG QUESTION. It is true that PostgREST
-- exposes no TRUNCATE verb, so a browser holding the anon key cannot send this
-- statement today. That is a fact about the TRANSPORT, not about the grant, and
-- the grant is what this migration is about: Phase 6's reviewer reached it with
-- an ordinary resident login and a SQL connection, and any future path that
-- accepts SQL — a psql session, a connection-pooler URL, a Supabase dashboard
-- login, a migration tool, a leaked pooler credential — carries it with them.
-- RLS is not a second line of defence here, because TRUNCATE never consults it.
-- The `anon=X` execute grant Phase 5 fixed an hour earlier was unreachable
-- through PostgREST too, and it was still worth removing for the same reason.

-- 1. Every table that exists today.
do $$
declare
  r record;
  n_pairs int := 0;
begin
  for r in
    select c.oid::regclass::text as tbl, g.rolname as grantee
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) as g(rolname)
     where ns.nspname = 'public'
       and c.relkind = 'r'
       -- Only where the role is already present. See "WHAT IS NOT CHANGED".
       and exists (
             select 1 from aclexplode(c.relacl) a
              where a.grantee = g.rolname::regrole
           )
  loop
    execute format('revoke all on %s from %I', r.tbl, r.grantee);
    execute format('grant select, insert, update, delete on %s to %I', r.tbl, r.grantee);
    n_pairs := n_pairs + 1;
  end loop;
  raise notice 'client-role table grants reset on % (table, role) pairs', n_pairs;
end $$;

-- 2. Every table created from here on.
--
-- This is the half that makes the decision durable rather than a one-off sweep.
-- Without it the next `create table` in the next phase arrives holding TRUNCATE
-- again and somebody has to notice a second time. It is also what makes a
-- from-scratch replay of these migrations come out right: step 1 above cannot
-- see tables created by LATER files (`20260825000*` created `building_rules`
-- after this version number), and step 2 covers exactly those.
--
-- Scoped `for role postgres` because that is the role migrations run as and
-- therefore the default ACL that applies to tables they create. The parallel
-- default ACL owned by `supabase_admin` covers objects SUPABASE creates, which
-- is its own machinery and not ours to redefine; `postgres` cannot alter it in
-- any case.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
