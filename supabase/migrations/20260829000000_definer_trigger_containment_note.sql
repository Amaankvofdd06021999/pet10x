-- Pet10x — pre-merge sweep: what actually contains a SECURITY DEFINER trigger
-- function, and it is not `0A000`.
--
-- COMMENTS ONLY. No function body changes, no policy changes, no grants. Three
-- `comment on function` statements and nothing else.
--
-- WHAT WAS WRONG. `20260827000007` promoted `accommodation_requests_freeze` to
-- SECURITY DEFINER — correctly; under invoker rights its three `not exists`
-- probes measured the caller's eyesight rather than the database, and a manager
-- could erase a link to a pet she merely could not see. The header justified the
-- promotion like this:
--
--     "PostgreSQL refuses to call a `returns trigger` function from SQL
--      (`0A000: trigger functions can only be called as triggers`), so there is
--      nothing new to invoke and nothing new to grant."
--
-- The first clause is true and the conclusion does not follow. A trigger
-- function does not have to be CALLED to be driven — it has to be ATTACHED, and
-- attaching one needs a table you own, not a schema you can create in.
--
-- MEASURED ON PRODUCTION, IN A ROLLED-BACK TRANSACTION, ENTIRELY AS
-- `authenticated`:
--
--   set local role authenticated;
--   create temp table oracle_probe (id uuid primary key, resident_id uuid,
--     building_id uuid, created_at timestamptz, status text, decision_note text,
--     decided_at timestamptz, submitted_at timestamptz, withdrawn_at timestamptz,
--     decided_by uuid, animal_desc text, type text, pet_id uuid, unit_id uuid);
--   create trigger t_probe before update on oracle_probe
--     for each row execute function public.accommodation_requests_freeze();
--   -- resident_id random and status 'pending', so v_owner is false and the
--   -- content branch is the one that answers:
--   update oracle_probe set pet_id = null where pet_id = 'c5000000-…-21'; -> 42501
--   update oracle_probe set pet_id = null where pet_id = 'deadbeef-…';    -> ADMITTED
--
--   has_database_privilege('authenticated', current_database(), 'TEMP')  -> true
--   has_schema_privilege ('authenticated', <every schema>,      'CREATE')-> false
--   as the caller: select count(*) from public.pets where id='c5000000-…-21' -> 0
--
-- The pet is live and INVISIBLE to that caller, which is the whole point: under
-- SECURITY INVOKER both updates would have been ADMITTED and the probe would
-- have reported eyesight. Under definer it reports the database. That is a
-- working existence oracle over `pets`, `units` and `profiles`, and it exists
-- only because of the promotion.
--
-- WHY THE DESIGN STILL STANDS. The oracle answers exactly one question — "is
-- there a row with this uuid" — which is precisely the power the rejected
-- `public.pet_exists(uuid)` helper would have granted. The promotion therefore
-- adds no power that alternative did not; what it changes is the price. The
-- helper costs one `POST /rpc/pet_exists`. This costs `create temp table` plus
-- `create trigger`, and no client role can issue either: `anon` and
-- `authenticated` are both NOLOGIN, so nothing holds a connection that could,
-- and PostgREST's vocabulary is tables, views and `/rpc/` over functions it may
-- see — there is no DDL verb in it and no `exec_sql`-shaped RPC granted to
-- `authenticated` (the only name-match is `extensions.pgrst_ddl_watch`, an
-- event-trigger function, uncallable).
--
-- SO THE CONTAINMENT IS POSTGREST'S SURFACE, NOT AN ERROR CODE. That is a real
-- boundary and a stronger one than the sentence it replaces — but it lives in
-- the API layer, so it is something to RE-CHECK before the next promotion rather
-- than something the database guarantees.
--
-- AND THE COROLLARY, WHICH IS WHY TWO COMMUNITY GUARDS ARE TOUCHED HERE TOO.
-- `community_posts_guard` and `community_freeze_attribution` both carry
-- `search_path = public, pg_temp`. Harmless today: both are SECURITY INVOKER, so
-- a caller who attached them to their own temp table would only be running their
-- own rights against their own row. Promote either one and `pg_temp` sitting in
-- the search path becomes the CVE-2018-1058 shape — the attacker owns the temp
-- schema, the temp schema is searched first, and any unqualified reference in
-- the body resolves to something they wrote. Both bodies happen to qualify
-- everything (`public.manages_building`, `public.is_admin`, `auth.uid`,
-- `pg_catalog.format`), so the exposure today is zero; that is a property of the
-- current text and not a guarantee, and it is exactly the kind of accident the
-- next edit removes without noticing. Neither is being altered here — an
-- invoker guard with a fully-qualified body is not a defect to fix — but the
-- note now travels with the function, so promoting one without pinning
-- `search_path = ''` first requires ignoring its own comment.

comment on function public.accommodation_requests_freeze() is
  'BEFORE UPDATE guard on accommodation_requests. Refuses identity changes (resident_id, building_id, created_at) outright; refuses ladder/decision changes without the single-use pet10x.accom_write token minted by the accommodation RPCs; refuses content changes (animal_desc, type, pet_id, unit_id) by anyone but the owning resident while draft or info_requested. Permits exactly one further thing: a reference column going NULL when the row it named no longer exists, which is what an `on delete set null` referential action does. SECURITY DEFINER, and load-bearing rather than incidental: under SECURITY INVOKER the three `not exists` probes ran beneath the caller''s own RLS, so a pet, unit or departed manager the caller merely could not SEE was indistinguishable from one that was gone, and the exemption could be used to erase a live link. Spends the token unconditionally on every pass. Raises 42501. A trigger is not RLS: is_admin() transcends the policies and transcends nothing here. WHAT THE PROMOTION COSTS, CORRECTED (20260829000000): the previous text said definer rights here "can only refuse, never widen". That is true of what this guard WRITES — it writes nothing and returns NEW on every path — and false of what it lets a caller LEARN. 0A000 stops this being CALLED from SQL; it does not stop it being ATTACHED. `authenticated` holds TEMP on the database and CREATE on no schema, which is enough to own a temp table and put this trigger on it, and the three probes then read back as an existence oracle over pets, units and profiles: measured on production, a live-but-invisible pet -> 42501, a non-existent uuid -> admitted. Accepted rather than overlooked — the oracle answers only "does this uuid exist", exactly what the rejected pet_exists(uuid) helper would have granted, and the containment is that no client role reaches DDL (anon and authenticated are NOLOGIN; PostgREST has no DDL verb), NOT the error code. Whoever promotes the next trigger function must re-check that surface and must pin search_path first: this one carries search_path = '''' and schema-qualifies every reference, so a pg_temp table cannot answer for public.pets.';

comment on function public.community_posts_guard() is
  'BEFORE UPDATE on community_posts. Freezes building_id and author_id for everyone; admits a removal (deleted_at NULL -> value) from the author, a manager of the building or an admin and a RESTORATION (value -> NULL, or one value to another) from a manager or an admin only; restricts is_pinned/is_official to a manager of NEW.building_id or an admin; restricts content/category/image_url to the author AND clears is_official and is_pinned when the author changes any of them, because the management''s badge and placement were granted to those words; and refuses any like_count/comment_count change that does not carry the single-use transaction-local pet10x.post_counts token minted by the counter triggers. SECURITY INVOKER on purpose — it reads no table of its own. BEFORE EVER PROMOTING THIS TO SECURITY DEFINER, PIN search_path = '''' FIRST (20260829000000). It carries search_path = "public, pg_temp", which is harmless under invoker rights and becomes the CVE-2018-1058 shape under definer rights: `authenticated` holds TEMP on the database, so an attacker owns the temp schema, the temp schema is searched first, and any unqualified reference in this body would resolve to something they wrote. Every reference here is qualified today (public.manages_building, public.is_admin, auth.uid, pg_catalog.format), so the exposure is zero — but that is a property of the current text, not a guarantee, and it is what accommodation_requests_freeze''s promotion taught this project the hard way.';

comment on function public.community_freeze_attribution() is
  'BEFORE UPDATE guard shared by events and lost_found. Freezes building_id and the actor column named in TG_ARGV[0] (created_by / reporter_id) for everyone, and restricts every OTHER column to that actor — a non-author may change only the columns named from TG_ARGV[1] onward (lost_found: status; events: none). Positive grammar on purpose: a column added later belongs to the author until somebody argues it into the moderator list by name. SECURITY INVOKER: it reads nothing but OLD, NEW and auth.uid(). BEFORE EVER PROMOTING THIS TO SECURITY DEFINER, PIN search_path = '''' FIRST (20260829000000). It carries search_path = "public, pg_temp", which is harmless under invoker rights and becomes the CVE-2018-1058 shape under definer rights: `authenticated` holds TEMP on the database, so an attacker owns the temp schema, the temp schema is searched first, and any unqualified reference in this body would resolve to something they wrote. Nothing here is unqualified today, which is a property of the current text and not a guarantee.';
