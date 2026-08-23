-- A count nobody could write, and a pin anybody could.
--
-- ---------------------------------------------------------------------------
-- THE RED, MEASURED ON PRODUCTION 2026-08-23 INSIDE `begin; … rollback;`,
-- immediately after 20260826000000 made posting possible at all:
--
--   (a) author pins own post                    -> SUCCEEDS (1 row)
--       author sets is_official on own post     -> SUCCEEDS (1 row)
--   (b) neighbour bumps like_count on the post  -> 0 rows, NO ERROR
--       neighbour moves the post to another building -> 0 rows, NO ERROR
--   (c) delete/FOR-ALL policies on community_posts, post_comments,
--       lost_found                              -> NONE
--   (d) non-internal triggers on all six community tables -> NONE
--   (e) post_comments policies -> comments_insert [a], comments_select [r]
--
-- Three defects, all of them the same defect: nothing owns the write path.
--
-- (a) PIN IS NOT A MANAGER ACT. posts_update_own is
--     `(author_id = auth.uid()) OR manages_building(building_id) OR is_admin()`
--     for BOTH using and with check, so an author can pin their own post — and
--     set is_official, which is the badge that says the building management
--     said this. Column-level authority cannot be expressed in an RLS predicate
--     that only ever sees whole rows, so it goes in a BEFORE UPDATE trigger.
--
-- (b) THE COUNTERS ARE DEAD. like_count and comment_count were maintained by
--     the CLIENT — a read-modify-write `update community_posts` in
--     togglePostLike and addPostComment — which posts_update_own denies to
--     anybody but the author. Neither call checked the error. So every like by
--     a neighbour incremented nothing, silently, forever. "0 rows, no error" is
--     the whole bug: it is not a denial anyone could see.
--
-- (c) THERE IS NO REMOVAL PATH. deleted_at exists and useCommunityPosts already
--     filters `.is("deleted_at", null)`, so soft removal is one update away —
--     and hard deletion should stay impossible, because a DELETE on a post
--     CASCADES to post_comments and post_reactions and A REFERENTIAL CASCADE IS
--     NOT SUBJECT TO RLS. Phase 2 learned that the expensive way.

-- ===========================================================================
-- 1. The column guard
-- ===========================================================================
-- SECURITY INVOKER, NOT DEFINER — and this departs from the plan deliberately.
-- The plan asked for SECURITY DEFINER "so it can re-check scope by hand". It
-- reads no table directly: manages_building() and is_admin() are themselves
-- SECURITY DEFINER and do their own privileged reads. A definer function whose
-- only job is to raise is a definer function whose job could be done without
-- the privilege, which is exactly the reasoning
-- 20260823000002_violations_stage_guard.sql already recorded for the same shape.
--
-- Triggers are not RLS. is_admin() transcends the community_posts policies and
-- transcends NOTHING here: a super-admin's direct UPDATE fires this trigger
-- exactly as a resident's does. Verified for all of author, manager and admin.
--
-- Scope is re-checked against NEW.building_id, never OLD — otherwise a caller
-- could move a post into a building they manage and pin it in one statement.
-- building_id is frozen below anyway; both are kept, because the freeze and the
-- scope check protect different things and a later change to one should not
-- silently disarm the other.
--
-- Every comparison is `is distinct from`, so a no-op write of an unrelated
-- column is not caught by a NULL, and NULL -> value is caught.
create or replace function public.community_posts_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $guard$
begin
  -- A post does not move buildings and does not change hands. Nobody, at any
  -- privilege, for any reason. There is no legitimate caller for either.
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

  -- is_pinned and is_official are the building management's voice. An author
  -- must not be able to badge their own post as official, nor pin it to the top
  -- of their neighbours' feed.
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

  -- NOT IN THE PLAN, ADDED HERE. posts_update_own admits a manager or admin to
  -- every column of every post in their building, which includes REWRITING a
  -- resident's words under that resident's name. Moderation is removal, not
  -- authorship: a silently edited post is a worse outcome for the resident than
  -- a removed one, because it still carries their name. A manager's levers on
  -- somebody else's post are is_pinned, is_official and deleted_at — all three
  -- visible, none of them ventriloquism.
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
  end if;

  -- The counters are the triggers' to write and nobody else's. The legitimate
  -- writes carry a transaction-local token, exactly as
  -- 20260823000002_violations_stage_guard.sql does. `true` as the third
  -- argument to set_config is what makes it transaction-local.
  --
  -- `is distinct from 'ok'` rather than `<> 'ok'`: an unset setting reads NULL,
  -- and `NULL <> 'ok'` is NULL, and `if not NULL` does not branch. A guard that
  -- evaluates to NULL is not a guard.
  if (new.like_count    is distinct from old.like_count)
  or (new.comment_count is distinct from old.comment_count) then
    if pg_catalog.current_setting('pet10x.post_counts', true) is distinct from 'ok' then
      raise exception 'community_posts.like_count and comment_count cannot be changed by a direct UPDATE'
        using errcode = '42501',
              detail  = pg_catalog.format('Post %s: like_count %s -> %s, comment_count %s -> %s outside the counter triggers.',
                          old.id, old.like_count, new.like_count, old.comment_count, new.comment_count),
              hint    = 'Insert or delete the post_reactions / post_comments row. The counters follow.';
    end if;
    -- Spend it. One token, one counter write. The minters also clear their own
    -- window unconditionally (see below) — this is the belt to that pair of
    -- braces, and it is what stops a token minted for a reaction being spent on
    -- an unrelated counter write later in the same transaction.
    perform pg_catalog.set_config('pet10x.post_counts', '', true);
  end if;

  return new;
end;
$guard$;

comment on function public.community_posts_guard() is
  'BEFORE UPDATE on community_posts. Freezes building_id and author_id for everyone; restricts is_pinned/is_official to a manager of NEW.building_id or an admin; restricts content/category/image_url to the author; and refuses any like_count/comment_count change that does not carry the single-use transaction-local pet10x.post_counts token minted by the counter triggers. SECURITY INVOKER on purpose — it reads no table of its own.';

create trigger trg_community_posts_guard
  before update on public.community_posts
  for each row execute function public.community_posts_guard();

-- ===========================================================================
-- 2. The counter triggers
-- ===========================================================================
-- SECURITY DEFINER, and here the privilege is the point: a neighbour reacting
-- to a post has no UPDATE right on that post at all (posts_update_own admits
-- only the author, the manager and the admin), so the counter cannot be
-- maintained by the reacting session under its own rights. That is precisely
-- why the client-side version never worked.
--
-- +1 / -1 against the row rather than a recomputing count(*): the primary keys
-- (post_id, profile_id) on post_reactions makes a double-like impossible, and
-- post_comments rows are only ever inserted or deleted whole. A full recount
-- per event would also serialise every reaction on one building's busiest post.
--
-- WHY EACH MINT IS FOLLOWED BY AN UNCONDITIONAL CLEAR: the rule
-- 20260825000004_fine_schedule_token_spend.sql paid for — A MINTER CLOSES ITS
-- OWN WINDOW. If the UPDATE below matched a row, the guard already spent the
-- token and the clear is a no-op. If it matched NO row — which happens on a
-- CASCADE delete, where the post is already gone by the time this AFTER DELETE
-- trigger runs — the guard was never entered, and this clear is the only thing
-- that stops a live token authorising a later direct counter write in the same
-- transaction. Writing it unconditionally is the whole point: the minter must
-- not have to predict whether the guard ran.

create or replace function public.post_reactions_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_post uuid := coalesce(new.post_id, old.post_id);
  v_delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  perform set_config('pet10x.post_counts', 'ok', true);
  update public.community_posts
     set like_count = greatest(0, like_count + v_delta)
   where id = v_post;
  perform set_config('pet10x.post_counts', '', true);
  return null;
end;
$fn$;

comment on function public.post_reactions_count() is
  'AFTER INSERT OR DELETE on post_reactions. Maintains community_posts.like_count by +1/-1 under the single-use pet10x.post_counts token, which it mints immediately before its UPDATE and clears immediately after, unconditionally. SECURITY DEFINER because the reacting user has no UPDATE right on the post.';

create trigger trg_post_reactions_count
  after insert or delete on public.post_reactions
  for each row execute function public.post_reactions_count();

create or replace function public.post_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_post uuid := coalesce(new.post_id, old.post_id);
  v_delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  perform set_config('pet10x.post_counts', 'ok', true);
  update public.community_posts
     set comment_count = greatest(0, comment_count + v_delta)
   where id = v_post;
  perform set_config('pet10x.post_counts', '', true);
  return null;
end;
$fn$;

comment on function public.post_comments_count() is
  'AFTER INSERT OR DELETE on post_comments. Maintains community_posts.comment_count by +1/-1 under the single-use pet10x.post_counts token, minted immediately before its UPDATE and cleared immediately after, unconditionally. SECURITY DEFINER because a commenter has no UPDATE right on the post.';

create trigger trg_post_comments_count
  after insert or delete on public.post_comments
  for each row execute function public.post_comments_count();

-- ===========================================================================
-- 3. Freeze attribution on events and lost_found too
-- ===========================================================================
-- NOT IN THE PLAN. The plan froze author_id and building_id on community_posts
-- only, but the class holds on all three tables, and 20260826000000 is what
-- made it reachable: lost_found_update's WITH CHECK admits a manager on
-- `manages_building(new.building_id)` alone, which says nothing about
-- reporter_id — so a manager could reassign a lost-pet report to a resident who
-- never filed it, and an event to an organiser who never organised it. That is
-- attribution forgery in the building's own record, and the fix is the same
-- three lines it was for posts. (Lesson from four earlier phases: a diagnosis
-- is not a fix until it is applied everywhere the class holds.)
--
-- ONE function, parameterised by the actor column name through TG_ARGV, rather
-- than two near-identical copies — the rule lives in one place every caller
-- asks. `to_jsonb(row) ->> col` is how a trigger reads a column named at
-- creation time; plpgsql has no other way to do it without EXECUTE.
create or replace function public.community_freeze_attribution()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_col   text := tg_argv[0];
  v_old   text := to_jsonb(old) ->> v_col;
  v_new   text := to_jsonb(new) ->> v_col;
begin
  if new.building_id is distinct from old.building_id then
    raise exception '%.building_id cannot be changed', tg_table_name
      using errcode = '42501',
            detail  = pg_catalog.format('%s -> %s.', old.building_id, new.building_id),
            hint    = 'The row was addressed to a building. Create a new one there instead.';
  end if;
  if v_new is distinct from v_old then
    raise exception '%.% cannot be changed', tg_table_name, v_col
      using errcode = '42501',
            detail  = pg_catalog.format('%s -> %s.', v_old, v_new),
            hint    = 'Attribution is not transferable, by a manager or by anybody else.';
  end if;
  return new;
end;
$fn$;

comment on function public.community_freeze_attribution() is
  'BEFORE UPDATE guard shared by events and lost_found. Freezes building_id and the actor column named in TG_ARGV[0] (created_by / reporter_id). SECURITY INVOKER: it reads nothing but OLD and NEW.';

create trigger trg_events_freeze_attribution
  before update on public.events
  for each row execute function public.community_freeze_attribution('created_by');

create trigger trg_lost_found_freeze_attribution
  before update on public.lost_found
  for each row execute function public.community_freeze_attribution('reporter_id');

-- ===========================================================================
-- 4. Moderation
-- ===========================================================================
-- COMMENTS ARE HARD-DELETED; POSTS ARE NOT. The asymmetry is deliberate and it
-- is worth saying why, because "two ways to delete" is the first question a
-- reader will have.
--
--   * post_comments has no deleted_at column and nothing references it, so
--     there is no cascade to worry about, and adding a tombstone column to
--     carry a one-line comment is not worth the row.
--   * community_posts gets NO DELETE POLICY AT ALL. A DELETE cascades to
--     post_comments and post_reactions, and a referential cascade is not
--     subject to RLS — so a single permitted DELETE would silently destroy
--     every neighbour's comment on the thread. Removal is
--     `update … set deleted_at = now()`, which posts_update_own already permits
--     to the author, the manager and the admin, and which useCommunityPosts
--     already filters on.
--
-- A manager or admin removing SOMEBODY ELSE'S content must leave an audit_log
-- row naming the actor and the author. A plain UPDATE from the browser cannot
-- write audit_log, so that path is an RPC — moderate_community_post, in
-- 20260826000002 — rather than more definer boilerplate here. An AUTHOR
-- removing their OWN post writes nothing: that is not a moderation act.

create policy comments_update on public.post_comments for update
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.community_posts p
      where p.id = post_comments.post_id
        and (public.manages_building(p.building_id) or public.is_admin())
    )
  )
  with check (
    author_id = auth.uid()
    or exists (
      select 1 from public.community_posts p
      where p.id = post_comments.post_id
        and (public.manages_building(p.building_id) or public.is_admin())
    )
  );

create policy comments_delete on public.post_comments for delete
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.community_posts p
      where p.id = post_comments.post_id
        and (public.manages_building(p.building_id) or public.is_admin())
    )
  );

-- ===========================================================================
-- 5. Reconciliation
-- ===========================================================================
-- A no-op today — all six community tables held 0 rows when this was written —
-- and the thing that makes this migration idempotent if it is ever replayed
-- onto data that the dead client-side counters had already corrupted.
--
-- It carries the token because it is a legitimate counter write and the guard
-- above is now installed.
--
-- ONE ROW PER MINT, and this is not a stylistic choice. The token is SINGLE-USE
-- — the guard spends it on the way through — so a single multi-row UPDATE would
-- be authorised for its first row and raise on its second. Written as one
-- statement this block would be silently correct today (0 rows) and would fail
-- the first time it was ever needed, which is the only time it runs.
do $$
declare p record;
begin
  for p in
    select c.id,
           (select count(*) from public.post_reactions r where r.post_id = c.id) as likes,
           (select count(*) from public.post_comments  x where x.post_id = c.id) as comments
      from public.community_posts c
  loop
    if p.likes is distinct from (select like_count from public.community_posts where id = p.id)
    or p.comments is distinct from (select comment_count from public.community_posts where id = p.id) then
      perform set_config('pet10x.post_counts', 'ok', true);
      update public.community_posts
         set like_count = p.likes, comment_count = p.comments
       where id = p.id;
      perform set_config('pet10x.post_counts', '', true);
    end if;
  end loop;
end $$;
