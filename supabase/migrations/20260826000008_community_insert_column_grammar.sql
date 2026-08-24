-- The columns a permitted statement was still allowed to carry.
--
-- ---------------------------------------------------------------------------
-- THE RED, MEASURED ON PRODUCTION 2026-08-23 INSIDE `begin; … rollback;`, as
-- Sofia Nguyen (a5000000-…-011), an ordinary APPROVED resident of Cedar Grove
-- Estates with no manager row anywhere. Verified in the same transaction:
-- manages_building = false, is_admin = false, is_resident_of = true.
--
--   R1  insert community_posts (is_official=true, is_pinned=true,
--         like_count=9999, comment_count=4242, created_at = now() - 400 days)
--                                                            -> ALLOW
--   R2  insert community_posts (deleted_at = now())           -> ALLOW
--   R3  update community_posts set created_at = now()-900d    -> 1 row
--   R4  insert lost_found (status='resolved', backdated)      -> ALLOW
--   R5  insert events (created_at = now() - 400 days)         -> ALLOW
--   R10 insert post_comments  (backdated)                     -> ALLOW
--   R11 insert post_reactions (backdated)                     -> ALLOW
--   R12 insert event_rsvps    (backdated)                     -> ALLOW
--   R13 update events     set created_at = now()-900d         -> 1 row
--   R14 update lost_found set created_at = now()-900d         -> 1 row
--
-- R1 is the one that matters and it is a Critical: ANY RESIDENT COULD PUBLISH
-- WHAT RENDERS AS A PINNED, OFFICIAL MANAGEMENT ANNOUNCEMENT TO THEIR WHOLE
-- BUILDING, with forged engagement and a backdated timestamp, without ever
-- issuing an UPDATE. `community_posts_guard` — whose own comment says "An
-- author must not be able to badge their own post as official, nor pin it to
-- the top of their neighbours' feed" — was BEFORE **UPDATE** only, and
-- `posts_insert`'s WITH CHECK constrains author_id and building_id and nothing
-- else. Every column the guard existed to protect was free on the way in.
--
-- WHY THIS SURVIVED THREE REVIEWS OF THIS TABLE, which is the part that must
-- not repeat:
--
--     A VERB MATRIX PROVES WHICH *STATEMENTS* ARE REFUSED. IT SAYS NOTHING
--     ABOUT WHICH *COLUMNS* A PERMITTED STATEMENT MAY CARRY.
--
-- The re-enumeration behind 20260826000006 was thorough — 62 acts x 6 actors,
-- every MERGE form, upsert, UPDATE…FROM, DELETE…USING, a cascade through a
-- parent — and its row 1 was "community_posts INSERT, self-attributed ->
-- ALLOW", never varied by column. Every guard this project has written
-- protects columns; every matrix it has written enumerated verbs.
--
-- SO THE FIX IS WRITTEN AS A POSITIVE GRAMMAR, and the grammar is stated in
-- one place per table: a registry of EVERY column, and a rule for each. A
-- column added later is in no class, so the tripwire refuses the write until
-- somebody classifies it by name. Closed by default, loudly, at the first
-- write after the ALTER — not silently, three reviews later.
--
-- WHY A TRIGGER RATHER THAN A `WITH CHECK` ON posts_insert, which was the
-- other shape on offer:
--   * a WITH CHECK cannot STAMP, and created_at wants stamping rather than
--     checking — there is then no value a caller can offer that survives;
--   * RLS is not consulted for a SECURITY DEFINER RPC or for any role with
--     BYPASSRLS, and this phase's own lesson was "the phase bounded the RPC
--     and left the table open behind it". A trigger fires for all of them;
--   * the column rules then live in ONE place per table instead of being
--     split between a policy and a trigger that must agree.
--
-- REPLAY DIVERGENCE, DECLARED. 20260829000000 (later in the sequence) carries
-- `comment on function community_posts_guard()` describing the pre-INSERT
-- behaviour. On production this file lands after it and its comment is the
-- live one; on a from-scratch replay 20260829000000 lands last and restores
-- the older text. The loss is confined to the description of the INSERT
-- branch — the search_path/CVE-2018-1058 warning that migration exists to
-- attach is repeated verbatim below, so a replay never loses that. Editing an
-- applied migration's DDL to fix this is not on the table.

-- ===========================================================================
-- 1. community_posts: the column registry, and the way in
-- ===========================================================================
-- CREATE OR REPLACE of the body plus a re-created trigger, because the trigger
-- must now fire on INSERT as well. The UPDATE half is the text
-- 20260826000006 left, with exactly two changes, both marked NEW below.
create or replace function public.community_posts_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $guard$
declare
  -- THE REGISTRY. Every column of community_posts, and nothing else. This is
  -- the positive grammar: membership here is what makes a column governed at
  -- all, and the branches below say by whom. Add a column to the table without
  -- adding it here and every write to community_posts refuses until you do.
  k_known constant text[] := array[
    -- the author's, supplied on the way in; posts_insert already binds
    -- author_id to auth.uid() and building_id to a building they stand in
    'id', 'building_id', 'author_id', 'category', 'content', 'image_url',
    -- the building management's voice
    'is_official', 'is_pinned',
    -- the counter triggers'
    'like_count', 'comment_count',
    -- the system's
    'created_at',
    -- the moderation path's
    'deleted_at'
  ];
  v_stray text;
begin
  select t.col into v_stray
    from pg_catalog.jsonb_object_keys(to_jsonb(new)) as t(col)
   where t.col <> all (k_known)
   limit 1;
  if v_stray is not null then
    raise exception 'community_posts.% is not classified by community_posts_guard', v_stray
      using errcode = '42501',
            detail  = pg_catalog.format('%s on community_posts reached the guard in no column class.', v_stray),
            hint    = 'A new column on this table is closed until it is named in k_known and given a rule. Decide there whether an author may supply it, whether a manager may change it, and whether it is frozen after insert.';
  end if;

  -- -------------------------------------------------------------------------
  -- THE WAY IN. NEW here, and the whole reason for this migration.
  -- -------------------------------------------------------------------------
  if tg_op = 'INSERT' then
    -- is_official says "the building management said this" and is_pinned says
    -- "the management put this in front of you". Neither is the author's to
    -- claim, and an INSERT is a claim exactly as an UPDATE is. A MANAGER OF
    -- THE BUILDING MAY STILL OPEN A POST BADGED — that is a genuine official
    -- announcement, written and badged in one statement, and it must keep
    -- working.
    if new.is_official or new.is_pinned then
      if not (public.manages_building(new.building_id) or public.is_admin()) then
        raise exception 'only a manager of this building or an admin may publish a post as official or pinned'
          using errcode = '42501',
                detail  = pg_catalog.format('Building %s: is_official=%s, is_pinned=%s offered at INSERT by %s.',
                            new.building_id, new.is_official, new.is_pinned, auth.uid()),
                hint    = 'A resident''s post opens unbadged and unpinned. The badge is a manager''s act, before or after.';
      end if;
    end if;

    -- Engagement is earned, never declared — by ANYBODY, manager included.
    -- The counters belong to trg_post_reactions_count and trg_post_comments_count
    -- and there is nothing for them to have counted yet.
    if new.like_count <> 0 or new.comment_count <> 0 then
      raise exception 'community_posts opens with like_count = 0 and comment_count = 0'
        using errcode = '42501',
              detail  = pg_catalog.format('Offered like_count=%s, comment_count=%s at INSERT by %s.',
                          new.like_count, new.comment_count, auth.uid()),
              hint    = 'Insert the post_reactions / post_comments rows. The counters follow.';
    end if;

    -- A post opens visible. Opening one already removed would put a row into
    -- the building's record that no feed renders and no audit_log names.
    if new.deleted_at is not null then
      raise exception 'community_posts.deleted_at cannot be set at INSERT'
        using errcode = '42501',
              detail  = pg_catalog.format('Offered deleted_at=%s at INSERT by %s.', new.deleted_at, auth.uid()),
              hint    = 'Removal is an UPDATE, which this guard authorises and which moderate_community_post audits.';
    end if;

    -- STAMPED, NOT CHECKED, and for everyone including managers and admins.
    -- created_at is a system fact about when the building was told, not an
    -- input; a backdated post sorts into the feed above things that were
    -- actually said first. Checking it would need a tolerance and a clock
    -- argument; stamping it means there is no value a caller can offer that
    -- survives this line. No caller in this codebase sends it: neither
    -- createCommunityPost nor any RPC names the column.
    new.created_at := now();
    return new;
  end if;

  -- -------------------------------------------------------------------------
  -- THE WAY ON. 20260826000006's text, plus the created_at freeze.
  -- -------------------------------------------------------------------------
  if new.building_id is distinct from old.building_id then
    raise exception 'community_posts.building_id cannot be changed'
      using errcode = '42501',
            detail  = pg_catalog.format('Post %s: %s -> %s.', old.id, old.building_id, new.building_id),
            hint    = 'A post was addressed to a building. Remove it (deleted_at) and write a new one.';
  end if;
  if new.author_id is distinct from old.author_id then
    raise exception 'community_posts.author_id cannot be changed'
      using errcode = '42501',
            detail  = pg_catalog.format('Post %s: %s -> %s.', old.id, old.author_id, new.author_id),
            hint    = 'Attribution is not transferable. The only writer of this column is the FK''s ON DELETE SET NULL, which anonymises rather than reassigns.';
  end if;

  -- NEW. The mirror of the stamp above: if the timestamp cannot be chosen on
  -- the way in, it cannot be edited afterwards either, or the freeze is one
  -- extra statement away. Measured before this line: an author moved their own
  -- post's created_at back 900 days, 1 row, no error.
  if new.created_at is distinct from old.created_at then
    raise exception 'community_posts.created_at cannot be changed'
      using errcode = '42501',
            detail  = pg_catalog.format('Post %s: %s -> %s attempted by %s.',
                        old.id, old.created_at, new.created_at, auth.uid()),
            hint    = 'When the building was told is a fact about the past. It is stamped at INSERT and frozen here.';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    if old.deleted_at is null then
      if not (
        (new.author_id is not distinct from auth.uid())
        or public.manages_building(new.building_id)
        or public.is_admin()
      ) then
        raise exception 'only the author, a manager of this building or an admin may remove a post'
          using errcode = '42501',
                detail  = pg_catalog.format('Post %s in building %s: deleted_at NULL -> %s by %s.',
                            old.id, new.building_id, new.deleted_at, auth.uid()),
                hint    = 'A manager should remove somebody else''s post through moderate_community_post, which audits it.';
      end if;
    else
      if not (public.manages_building(new.building_id) or public.is_admin()) then
        raise exception 'only a manager of this building or an admin may restore a removed post'
          using errcode = '42501',
                detail  = pg_catalog.format('Post %s in building %s: deleted_at %s -> %s by %s.',
                            old.id, new.building_id, old.deleted_at, new.deleted_at, auth.uid()),
                hint    = 'An author may remove their own post and may not un-remove it: the row does not record who removed it, so this trigger cannot tell your takedown from a moderator''s.';
      end if;
    end if;
  end if;

  if (new.is_pinned   is distinct from old.is_pinned)
  or (new.is_official is distinct from old.is_official) then
    if not (public.manages_building(new.building_id) or public.is_admin()) then
      raise exception 'only a manager of this building or an admin may pin or mark a post official'
        using errcode = '42501',
              detail  = pg_catalog.format('Post %s in building %s: is_pinned %s -> %s, is_official %s -> %s.',
                          old.id, new.building_id, old.is_pinned, new.is_pinned,
                          old.is_official, new.is_official),
              hint    = 'posts_update_own admits the author for content edits; these two columns are not the author''s to set.';
    end if;
  end if;

  if (new.content   is distinct from old.content)
  or (new.category  is distinct from old.category)
  or (new.image_url is distinct from old.image_url) then
    if new.author_id is distinct from auth.uid() then
      raise exception 'only the author may change a post''s content'
        using errcode = '42501',
              detail  = pg_catalog.format('Post %s: attempted content/category/image edit by %s, authored by %s.',
                          old.id, auth.uid(), old.author_id),
              hint    = 'A manager removes a post (deleted_at) or pins it. Rewriting it under the author''s name is not a moderation act.';
    end if;
    -- NEW: the clear is conditioned on the editor's standing.
    --
    -- The rule it enforces is unchanged and still right — the management's
    -- badge and placement were granted to particular WORDS, so a resident who
    -- rewrites the words loses both, or a pinned "Lost cat, found, thanks all"
    -- becomes prose under the management's badge at the top of every
    -- neighbour's feed. But the clear fired on ANY author edit, and A MANAGER
    -- CAN BE THE AUTHOR: a manager fixing a typo in their own Official
    -- announcement silently de-badged and un-pinned it. Measured: badge own
    -- post -> official=true pinned=true; edit one word -> official=false
    -- pinned=false.
    --
    -- This also removes the silent-failure the clear caused for the obvious
    -- client fix. `set content='v2', is_official=true` used to land false,
    -- because the clear ran after the pin block and overwrote the caller's
    -- explicit assignment. For a manager the assignment now survives; for a
    -- resident the pin block above already raises 42501, which is an honest
    -- refusal rather than a value that quietly disagrees with the statement.
    --
    -- A manager who wants their own edited announcement de-badged clears it in
    -- the same statement, and now that means what it says.
    if not (public.manages_building(new.building_id) or public.is_admin()) then
      new.is_official := false;
      new.is_pinned   := false;
    end if;
  end if;

  if (new.like_count    is distinct from old.like_count)
  or (new.comment_count is distinct from old.comment_count) then
    if pg_catalog.current_setting('pet10x.post_counts', true) is distinct from 'ok' then
      raise exception 'community_posts.like_count and comment_count cannot be changed by a direct UPDATE'
        using errcode = '42501',
              detail  = pg_catalog.format('Post %s: like_count %s -> %s, comment_count %s -> %s outside the counter triggers.',
                          old.id, old.like_count, new.like_count, old.comment_count, new.comment_count),
              hint    = 'Insert or delete the post_reactions / post_comments row. The counters follow.';
    end if;
    perform pg_catalog.set_config('pet10x.post_counts', '', true);
  end if;

  return new;
end;
$guard$;

comment on function public.community_posts_guard() is
  'BEFORE INSERT OR UPDATE on community_posts. Holds a REGISTRY of every column of the table and refuses any write once an unregistered column exists, so a column added later is closed until it is classified by name (20260826000008). ON INSERT: refuses is_official/is_pinned from anyone but a manager of NEW.building_id or an admin, refuses a non-zero like_count/comment_count from anyone at all, refuses a pre-set deleted_at, and STAMPS created_at = now() so no caller can choose it. ON UPDATE: freezes building_id, author_id and created_at for everyone; admits a removal (deleted_at NULL -> value) from the author, a manager of the building or an admin and a RESTORATION from a manager or an admin only; restricts is_pinned/is_official to a manager of NEW.building_id or an admin; restricts content/category/image_url to the author AND clears is_official and is_pinned when a NON-MANAGER author changes any of them, because the management''s badge and placement were granted to those words — a manager editing their own announcement keeps its badge; and refuses any like_count/comment_count change that does not carry the single-use transaction-local pet10x.post_counts token minted by the counter triggers. SECURITY INVOKER on purpose — it reads no table of its own. BEFORE EVER PROMOTING THIS TO SECURITY DEFINER, PIN search_path = '''' FIRST (20260829000000). It carries search_path = "public, pg_temp", which is harmless under invoker rights and becomes the CVE-2018-1058 shape under definer rights: `authenticated` holds TEMP on the database, so an attacker owns the temp schema, the temp schema is searched first, and any unqualified reference in this body would resolve to something they wrote. Every reference here is qualified today (public.manages_building, public.is_admin, auth.uid, pg_catalog.format, pg_catalog.jsonb_object_keys), so the exposure is zero — but that is a property of the current text, not a guarantee, and it is what accommodation_requests_freeze''s promotion taught this project the hard way.';

drop trigger if exists trg_community_posts_guard on public.community_posts;

create trigger trg_community_posts_guard
  before insert or update on public.community_posts
  for each row execute function public.community_posts_guard();

-- ===========================================================================
-- 2. The other five tables: one grammar, declared at each trigger
-- ===========================================================================
-- community_posts earns a bespoke guard because its rules are conditional on
-- who is asking. The other five do not: what they need is a registry, an
-- opening state, and a set of columns frozen after insert. So the grammar is
-- DATA — one JSON document per trigger — and the function is a reader of it.
-- Writing the rule at the CREATE TRIGGER is deliberate: the answer to "what
-- may a caller put in this column" is then in the same file as the table.
--
-- `community_freeze_attribution` IS DELIBERATELY LEFT ALONE. It already states
-- a positive grammar for the UPDATE path on events and lost_found — a
-- non-author may change only the moderator columns named in TG_ARGV — and it
-- is correct. It is BEFORE UPDATE and says nothing about the way in, and it
-- exempts the author from everything, which is how the author kept the ability
-- to backdate their own row. Both gaps are closed here, in a SECOND trigger,
-- rather than by rewriting text that is right about its own subject. BEFORE
-- ROW triggers fire in name order and both of these only raise or stamp, so
-- the order between them is immaterial; `…_freeze_attribution` sorts first.
--
-- SECURITY INVOKER, like every guard in this family: it reads no table, only
-- OLD, NEW and its own argument.
create or replace function public.community_row_opening()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_rule    jsonb  := tg_argv[0]::jsonb;
  v_known   text[];
  v_frozen  text[];
  v_new     jsonb  := to_jsonb(new);
  v_old     jsonb;
  v_stray   text;
  v_opens   record;
  k         text;
begin
  v_known  := array(select pg_catalog.jsonb_array_elements_text(v_rule -> 'columns'));
  v_frozen := array(select pg_catalog.jsonb_array_elements_text(coalesce(v_rule -> 'frozen', '[]'::jsonb)));

  -- The tripwire. Same shape as community_posts_guard's, same purpose: a
  -- column this grammar has never heard of closes the table until it is named.
  select t.col into v_stray
    from pg_catalog.jsonb_object_keys(v_new) as t(col)
   where t.col <> all (v_known)
   limit 1;
  if v_stray is not null then
    raise exception '%.% is not classified by this table''s row grammar', tg_table_name, v_stray
      using errcode = '42501',
            detail  = pg_catalog.format('%s reached trg_%s_row_opening in no column class.', v_stray, tg_table_name),
            hint    = 'Add the column to the "columns" list on the trigger, and decide there whether it is also frozen after insert.';
  end if;

  if tg_op = 'INSERT' then
    -- A row opens in its opening state. lost_found is the reason this exists:
    -- lost_found_insert's WITH CHECK binds reporter_id and building_id and
    -- says nothing about status, so a report could be filed already resolved —
    -- a notice that pages the whole building and then reads as closed.
    for v_opens in
      select key, value from pg_catalog.jsonb_each_text(coalesce(v_rule -> 'opens_as', '{}'::jsonb))
    loop
      if (v_new ->> v_opens.key) is distinct from v_opens.value then
        raise exception '%.% must be ''%'' at INSERT', tg_table_name, v_opens.key, v_opens.value
          using errcode = '42501',
                detail  = pg_catalog.format('Offered %L by %s.', v_new ->> v_opens.key, auth.uid()),
                hint    = 'A row opens in its opening state and is moved afterwards, through the policy that governs the move.';
      end if;
    end loop;

    -- Stamped, not checked, for the same reason as community_posts: there is
    -- then no value a caller can offer that survives. Every one of these five
    -- tables carries created_at, and no client or RPC in this codebase sends
    -- it.
    new.created_at := now();
    return new;
  end if;

  v_old := to_jsonb(old);
  foreach k in array v_frozen loop
    if (v_new -> k) is distinct from (v_old -> k) then
      raise exception '%.% cannot be changed', tg_table_name, k
        using errcode = '42501',
              detail  = pg_catalog.format('Row %s: %s %s -> %s attempted by %s.',
                          coalesce(v_old ->> 'id', '(composite key)'), k, v_old ->> k, v_new ->> k, auth.uid()),
              hint    = 'This column is settled at INSERT. Frozen for the author too, not only for a moderator.';
    end if;
  end loop;

  return new;
end;
$fn$;

comment on function public.community_row_opening() is
  'BEFORE INSERT OR UPDATE guard shared by events, lost_found, post_comments, post_reactions and event_rsvps. Its rule arrives as one JSON document in TG_ARGV[0]: "columns" is the registry of every column the table has (an unregistered column refuses every write, so a column added later is closed until classified), "opens_as" names columns that must hold a given value at INSERT, and "frozen" names columns that may not change afterwards by anybody, author included. Also stamps created_at = now() at INSERT on every one of the five. Complements rather than replaces community_freeze_attribution, which governs the UPDATE path on events and lost_found and is correct about it. SECURITY INVOKER: it reads nothing but OLD, NEW, auth.uid() and its own argument.';

drop trigger if exists trg_events_row_opening         on public.events;
drop trigger if exists trg_lost_found_row_opening     on public.lost_found;
drop trigger if exists trg_post_comments_row_opening  on public.post_comments;
drop trigger if exists trg_post_reactions_row_opening on public.post_reactions;
drop trigger if exists trg_event_rsvps_row_opening    on public.event_rsvps;

-- events. Nothing opens in a particular state; the freeze is identity plus the
-- timestamp. building_id and created_by are frozen by
-- community_freeze_attribution too — named again here because the two guards
-- protect different things and a later change to one must not silently disarm
-- the other, which is the reasoning 20260826000001 already recorded for
-- community_posts' building_id.
create trigger trg_events_row_opening
  before insert or update on public.events
  for each row execute function public.community_row_opening($rule${
    "columns": ["id","building_id","created_by","title","category","starts_at",
                "location","max_attendees","created_at"],
    "frozen":  ["id","building_id","created_by","created_at"]
  }$rule$);

-- lost_found. `kind` is frozen as well as the identity columns: report_lost_found
-- pages every resident of the building with wording chosen by kind ("Lost pet
-- in …" / "Found pet in …"), so a lost report edited into a found one is a
-- notice whose text no longer matches the record it points at.
create trigger trg_lost_found_row_opening
  before insert or update on public.lost_found
  for each row execute function public.community_row_opening($rule${
    "columns":  ["id","building_id","reporter_id","kind","pet_name","species","breed",
                 "color","last_seen","reward_cents","image_url","status","created_at"],
    "frozen":   ["id","building_id","reporter_id","kind","created_at"],
    "opens_as": {"status": "active"}
  }$rule$);

-- post_comments, post_reactions, event_rsvps have NO update policy at all —
-- 20260826000006 dropped comments_update on purpose, and the other two never
-- had one — so their UPDATE branch is unreachable from any client role today
-- and is written anyway, because "no policy" is a property of the policy set
-- and this is a property of the table. What each of them actually needed was
-- the stamp: all three admitted a backdated INSERT.
create trigger trg_post_comments_row_opening
  before insert or update on public.post_comments
  for each row execute function public.community_row_opening($rule${
    "columns": ["id","post_id","author_id","content","created_at"],
    "frozen":  ["id","post_id","author_id","created_at"]
  }$rule$);

create trigger trg_post_reactions_row_opening
  before insert or update on public.post_reactions
  for each row execute function public.community_row_opening($rule${
    "columns": ["post_id","profile_id","created_at"],
    "frozen":  ["post_id","profile_id","created_at"]
  }$rule$);

create trigger trg_event_rsvps_row_opening
  before insert or update on public.event_rsvps
  for each row execute function public.community_row_opening($rule${
    "columns": ["event_id","profile_id","created_at"],
    "frozen":  ["event_id","profile_id","created_at"]
  }$rule$);
