-- The two tables the grammar never reached, and the moderation a author could undo.
--
-- ---------------------------------------------------------------------------
-- THE RED, MEASURED ON PRODUCTION 2026-08-23 INSIDE `begin; … rollback;`
--
-- 20260826000000 called itself "one authorisation grammar for six community
-- tables". It governs FOUR. post_comments' insert check was `author_id =
-- auth.uid()` and post_reactions' only write policy was reactions_self, a
-- FOR ALL on `profile_id = auth.uid()`. Neither names a building, so neither
-- asks the one question the whole file exists to ask.
--
--   (a) AN OUTSIDER WRITES INTO A FEED THEY CANNOT READ.
--       A Harbour View Towers resident, against a Maple Court Residences post:
--         select the post                       -> 0 rows
--         insert community_posts into Maple Ct  -> DENY 42501
--         INSERT post_comments on the post      -> ALLOW
--         INSERT post_reactions on the post     -> ALLOW
--         like_count / comment_count afterwards -> 1 / 1
--       Phase 8's own SECURITY DEFINER counter triggers carried the outsider's
--       writes onto the post, and comments_select scopes on the POST's
--       building rather than the WRITER's, so the comment then renders in the
--       Maple Court feed for every Maple Court resident: measured, 1 row.
--
--   (b) A BUILDING THAT REMOVED SOMEBODY COULD NOT STOP THEM WRITING.
--       Priya Raman, resident_links.status = 'left' on Maple Court, no other
--       link and no manager row — a real ex-resident, not a fixture:
--         read the post   -> 0 rows
--         post            -> DENY 42501
--         comment         -> ALLOW
--         react           -> ALLOW
--       The plan's product decision — "the ex-resident loses read access to the
--       feed" — was enforced on the two paths that were re-read and not on the
--       two that were not.
--
--   (c) A MODERATED POST WAS NOT MODERATED.
--       manager calls moderate_community_post -> {"ok": true}, deleted_at set,
--       1 audit_log row. Then the AUTHOR runs
--       `update community_posts set deleted_at = null` -> 1 ROW, deleted_at
--       NULL, audit rows still 1. The removal is reversible by the person it
--       was aimed at and the reversal is not recorded. community_posts_guard
--       let deleted_at through on purpose, because the author's own "Remove my
--       post" needs it; it never distinguished REMOVING from RESTORING.
--
--   (d) AN AUTHOR REWROTE THE BODY AFTER THE BADGE.
--       manager sets is_official = true, is_pinned = true; author then sets
--       content -> 1 row, final state `official=true pinned=true content='
--       ARBITRARY TEXT UNDER THE MANAGEMENT BADGE'`. The guard protects the
--       badge from the author and the content from the manager, and nothing
--       tied the badge to the words it was granted for.
--
--   (e) THE CONTENT RULE WAS HALF-APPLIED. 20260826000001 carried the
--       ATTRIBUTION freeze to events and lost_found and left the CONTENT rule
--       on community_posts. As the building's manager:
--         update lost_found set pet_name = 'NOT WHAT THE RESIDENT WROTE' -> 1 row,
--           still attributed to the resident
--         update events set title = 'REWRITTEN BY THE MANAGER'           -> 1 row, same
--
-- ---------------------------------------------------------------------------
-- AND THREE THE REVIEW DID NOT NAME, found by grepping the class rather than
-- the symptom, which is what "carry it everywhere it holds" means:
--
--   (f) A MANAGER REWROTE A RESIDENT'S COMMENT. comments_update
--       (20260826000001:305) admits `author_id = auth.uid() OR <manager of the
--       post's building> OR is_admin()`. post_comments has exactly one mutable
--       column, `content`, so the manager branch of that policy is ventriloquism
--       and NOTHING ELSE. Measured: 1 row, content replaced, author unchanged.
--       Seventh occurrence of the class in this run, on the table nobody
--       re-read.
--
--   (g) THE FOR-ALL ON post_reactions ADMITTED UPDATE, AND AN UPDATE DESERTS
--       THE COUNTERS. trg_post_reactions_count is AFTER INSERT OR DELETE.
--       Measured: like post A (A/B like_count = 1/0), then
--       `update post_reactions set post_id = B` -> 1 row; counters still 1/0
--       while the actual rows are 0/1. Both posts now lie, permanently, with
--       no trigger that will ever correct them. The same hole exists on
--       post_comments through comments_update's post_id.
--
--   (h) EVERY UGC TEXT COLUMN IN THE SIX TABLES IS UNBOUNDED AT THE DATABASE,
--       and lost_found_insert admits a DIRECT insert, so report_lost_found's
--       80 / 80 / 40 / 500 refusals are advisory. One rolled-back statement
--       stored comment=200000, post=500000, pet_name=5000, last_seen=50000,
--       ev_title=30000, ev_location=30000 characters. The phase bounded the
--       RPC and left the table open behind it.
--
-- All six community tables held 0 rows when this ran, which is what makes the
-- eight check constraints below free.

-- ===========================================================================
-- 1. The grammar, on the two tables it never reached
-- ===========================================================================
-- The same disjunct as posts / events / lost_found / event_rsvps, resolved
-- through the post's building because that is where a comment and a reaction
-- are addressed:
--
--     is_resident_of(p.building_id) or manages_building(p.building_id) or is_admin()
--
-- `status = 'left'` is the case this must exclude, and is_resident_of is what
-- decides it: it tests `rl.status = 'approved'`, so a departed link fails the
-- whole disjunct. That is the ONLY thing standing between an ex-resident and
-- their old neighbours' feed — verified in both directions below the fix, not
-- assumed from the shape of the predicate.
--
-- ONE RULE, STATED ONCE, FOR ALL FOUR WRITE PATHS ADDED HERE:
--
--     STANDING IN THE BUILDING IS REQUIRED TO SPEAK, NEVER TO FALL SILENT.
--
-- So every INSERT carries the building disjunct and every DELETE of your own
-- row carries only `= auth.uid()`. An ex-resident may withdraw a like or a
-- comment they left while they lived there; they may not leave a new one. The
-- alternative — scope on delete too — traps a person's own words in a building
-- they no longer belong to and, for reactions, makes the counter
-- uncorrectable. comments_delete already had exactly this shape for its author
-- branch; rsvps_delete did not, and is corrected in section 5 for the same
-- reason.
--
-- `p.deleted_at is null` on the two INSERTs, NOT IN THE REVIEW'S PRESCRIPTION
-- and added deliberately: section 3 exists because a removed post that can
-- still be un-removed is not removed. A removed post that still accepts new
-- comments and new likes is not removed either, and both counters would move
-- on a row nobody can see. Withdrawal (DELETE) is deliberately NOT gated on
-- it — a post being taken down must not freeze your own like on it.

drop policy if exists comments_insert on public.post_comments;
create policy comments_insert on public.post_comments for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.community_posts p
      where p.id = post_comments.post_id
        and p.deleted_at is null
        and (
          public.is_resident_of(p.building_id)
          or public.manages_building(p.building_id)
          or public.is_admin()
        )
    )
  );

-- comments_delete is UNCHANGED and correct: `author_id = auth.uid()` OR a
-- manager of the post's building OR an admin. Removing a neighbour's comment
-- is the manager's real moderation lever on this table, and it is the one that
-- survives section 2 dropping comments_update.

-- DROPPED, NOT NARROWED. post_comments' only mutable column is `content`, so
-- an UPDATE policy on this table can express exactly two things: an author
-- editing their own comment — for which there is no UI, no call site anywhere
-- in lib/ or components/, and no row on the platform — and (f) above. It also
-- carries (g)'s counter desertion through post_id, which would need a third
-- freeze trigger to close.
--
-- A comment is written or it is removed. That is the same shape event_rsvps
-- was given in 20260826000000 ("an RSVP is a row that exists or does not") and
-- the same shape post_reactions is given below. If editing a comment is ever
-- wanted, it arrives as a deliberate policy WITH a freeze trigger on post_id
-- and author_id, not as a policy that was already here doing something else.
drop policy if exists comments_update on public.post_comments;

drop policy if exists reactions_self on public.post_reactions;

create policy reactions_insert on public.post_reactions for insert
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.community_posts p
      where p.id = post_reactions.post_id
        and p.deleted_at is null
        and (
          public.is_resident_of(p.building_id)
          or public.manages_building(p.building_id)
          or public.is_admin()
        )
    )
  );

create policy reactions_delete on public.post_reactions for delete
  using (profile_id = auth.uid());

-- NO UPDATE POLICY ON post_reactions, and its absence is the fix for (g).
-- post_reactions is (post_id, profile_id, created_at): there is no payload to
-- edit, so the only UPDATE reactions_self ever admitted was one that moves a
-- like between posts behind the back of an AFTER INSERT OR DELETE trigger.
-- reactions_select (20260826000001) already covers reading and is unchanged.

-- ===========================================================================
-- 2. Removing a post is not restoring one
-- ===========================================================================
-- THE PRODUCT DECISION, STATED PLAINLY BECAUSE THE REVIEW ASKED FOR IT:
--
--   * AN AUTHOR MAY REMOVE THEIR OWN POST. That control ships — the More sheet
--     reads "Remove my post" for the author — and removePost() (lib/data/live.ts)
--     does it as a plain `update … set deleted_at`, writing no audit row,
--     because a person taking down their own words is not a moderation act and
--     there is nobody to hold to account.
--
--   * AN AUTHOR MAY NOT REVERSE A REMOVAL. Clearing deleted_at is a manager's
--     or an admin's act.
--
-- THE REVIEW'S OWN PRESCRIPTION — "add deleted_at to the guard's manager-only
-- column set" — WOULD HAVE BEEN WRONG, and this is the difference it misses.
-- deleted_at is not one permission, it is two: NULL -> now() is removal and
-- now() -> NULL is restoration. Making the whole column manager-only would
-- have broken "Remove my post", which was built, browser-verified and
-- ledgered. Making it author-writable in both directions is the bug. The
-- guard therefore branches on the DIRECTION of the change, which is the only
-- reading under which both the shipped control and exit criterion 12 hold.
--
-- WHY THE AUTHOR CANNOT UNDO THEIR OWN REMOVAL EITHER: community_posts has no
-- `deleted_by`. The database cannot tell an author's own takedown from a
-- manager's, and neither can this trigger — so "the author may restore what
-- the author removed" is not expressible without a schema change and a second
-- audit surface. Removal is one-way for the author, which is also what the UI
-- already implies: useCommunityPosts filters `deleted_at is null`, so a
-- removed post is not on the author's screen for them to un-remove. If
-- restoration is ever wanted as a product, it is a manager RPC that audits the
-- restore the way moderate_community_post audits the removal, and it should
-- not be a bare UPDATE from a browser.

-- ===========================================================================
-- 3. The guard, rewritten whole
-- ===========================================================================
-- CREATE OR REPLACE of the function only — trg_community_posts_guard already
-- points at this name and 20260826000001's DDL is not touched, per the
-- migration-drift rule (docs/superpowers/2026-08-23-migration-drift.md).
--
-- Changed from 20260826000001: the deleted_at branch (new), and the two lines
-- at the end of the content branch that clear the badge. Everything else is
-- verbatim, so a diff of the two functions is exactly the fix.
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

  -- REMOVAL vs RESTORATION. See section 2 for the decision; this is the whole
  -- of its enforcement.
  if new.deleted_at is distinct from old.deleted_at then
    if old.deleted_at is null then
      -- Taking a post down: its author, a manager of its building, or an admin.
      -- posts_update_own already admits exactly those three, so this is the
      -- belt to that policy's braces — a trigger is not RLS, and this file's
      -- own history is what a missing second check costs.
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
      -- Putting a removed post back, or rewriting when it was removed. A
      -- manager or an admin only: otherwise moderation is a suggestion the
      -- moderated party can decline, and nothing records that they did.
      if not (public.manages_building(new.building_id) or public.is_admin()) then
        raise exception 'only a manager of this building or an admin may restore a removed post'
          using errcode = '42501',
                detail  = pg_catalog.format('Post %s in building %s: deleted_at %s -> %s by %s.',
                            old.id, new.building_id, old.deleted_at, new.deleted_at, auth.uid()),
                hint    = 'An author may remove their own post and may not un-remove it: the row does not record who removed it, so this trigger cannot tell your takedown from a moderator''s.';
      end if;
    end if;
  end if;

  -- is_pinned and is_official are the building management's voice. An author
  -- must not be able to badge their own post as official, nor pin it to the top
  -- of their neighbours' feed.
  --
  -- THIS BLOCK RUNS BEFORE THE CONTENT BLOCK ON PURPOSE. It judges the values
  -- the caller actually proposed; the clear at the end of the content block
  -- then happens to a row this check has already passed on. Reversing the two
  -- would make the author's own content edit look like an author un-badging a
  -- post, which is a different act and would raise.
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

  -- posts_update_own admits a manager or admin to every column of every post in
  -- their building, which includes REWRITING a resident's words under that
  -- resident's name. Moderation is removal, not authorship: a silently edited
  -- post is a worse outcome for the resident than a removed one, because it
  -- still carries their name. A manager's levers on somebody else's post are
  -- is_pinned, is_official and deleted_at — all three visible, none of them
  -- ventriloquism.
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

    -- THE BADGE WAS GRANTED TO THE WORDS, NOT TO THE ROW.
    --
    -- Measured before this existed: a manager sets is_official and is_pinned,
    -- the author then rewrites content, and the final state is
    -- `official=true pinned=true` over text no manager ever saw — arbitrary
    -- prose under the management's badge, held at the top of every neighbour's
    -- feed. The two halves of the guard each held and the pair did not.
    --
    -- Both flags, not just is_official. is_official says "the management said
    -- this" and is_pinned says "the management put this in front of you"; a
    -- rewrite falsifies both claims equally, and the review's own sentence
    -- names both harms. It is a silent assignment rather than a raise because
    -- the author IS allowed to edit their own post — the edit succeeds and the
    -- endorsement lapses.
    --
    -- THE COST, NAMED: a typo fix by the author drops a manager's pin. Re-pinning
    -- is one tap on a feed the manager is already looking at, and the manager
    -- sees the corrected text before re-endorsing it, which is the point.
    -- The cheap alternative — only clear when content changes "a lot" — is a
    -- threshold nobody can defend, and every value of it is a rewrite budget.
    new.is_official := false;
    new.is_pinned   := false;
  end if;

  -- The counters are the triggers' to write and nobody else's. The legitimate
  -- writes carry a transaction-local token, exactly as
  -- 20260823000002_violations_stage_guard.sql does.
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
  'BEFORE UPDATE on community_posts. Freezes building_id and author_id for everyone; admits a removal (deleted_at NULL -> value) from the author, a manager of the building or an admin and a RESTORATION (value -> NULL, or one value to another) from a manager or an admin only; restricts is_pinned/is_official to a manager of NEW.building_id or an admin; restricts content/category/image_url to the author AND clears is_official and is_pinned when the author changes any of them, because the management''s badge and placement were granted to those words; and refuses any like_count/comment_count change that does not carry the single-use transaction-local pet10x.post_counts token minted by the counter triggers. SECURITY INVOKER on purpose — it reads no table of its own.';

-- ===========================================================================
-- 4. The content rule, on the two tables it was not carried to
-- ===========================================================================
-- POSITIVE GRAMMAR, and this is the reason the rule is expressed as a list of
-- what a NON-AUTHOR MAY change rather than a list of the content columns they
-- may not. 20260826000001 named `content, category, image_url` on
-- community_posts; the same shape here would mean naming eight columns on
-- lost_found and five on events, and the ninth column somebody adds next year
-- would default to the manager's — which is exactly how the class got
-- half-applied the last five times. Here the default is the author's, and a
-- column the manager may touch has to be argued for, in this file, by name.
--
-- What a non-author may change:
--
--   events      NOTHING. An event has no moderation column at all. A manager's
--               lever on somebody else's event is events_delete — removal, the
--               same answer the rest of this phase gives. `title`, `starts_at`,
--               `location`, `category` and `max_attendees` are the organiser's
--               sentence about their own gathering.
--
--   lost_found  `status`, AND ONLY `status`. That is the lifecycle
--               ('active'|'resolved', constrained in 20260826000000), it is
--               what lost_found_update was widened for, and marking a found
--               pet found is a real act that is not authorship.
--               `markLostFoundResolved` (lib/data/live.ts) writes exactly this
--               one column, for the reporter and the manager alike.
--
-- "Author" is `auth.uid() = OLD.<actor column>`. A manager is not the author.
-- An ADMIN is not the author either, and gets the same restriction — the same
-- answer community_posts_guard already gives, for the same reason: a trigger
-- is not RLS and is_admin() transcends nothing here.
--
-- A caller with a NULL auth.uid() (service_role, a psql session) is not the
-- author of anything and is therefore held to the moderator columns. That
-- matches community_posts_guard's content branch exactly, and it is named here
-- so a future data fix expects it instead of discovering it.
create or replace function public.community_freeze_attribution()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_col       text   := tg_argv[0];
  -- TG_ARGV is 0-based; everything from 1 up is a column a non-author may
  -- change. A trigger created with one argument slices to the empty array,
  -- which is `events` and is correct rather than accidental.
  v_moderator text[] := coalesce(tg_argv[1:tg_nargs - 1], '{}'::text[]);
  v_old       jsonb  := to_jsonb(old);
  v_new       jsonb  := to_jsonb(new);
  v_actor     text   := v_old ->> v_col;
  k           text;
begin
  if new.building_id is distinct from old.building_id then
    raise exception '%.building_id cannot be changed', tg_table_name
      using errcode = '42501',
            detail  = pg_catalog.format('%s -> %s.', old.building_id, new.building_id),
            hint    = 'The row was addressed to a building. Create a new one there instead.';
  end if;
  if (v_new ->> v_col) is distinct from v_actor then
    raise exception '%.% cannot be changed', tg_table_name, v_col
      using errcode = '42501',
            detail  = pg_catalog.format('%s -> %s.', v_actor, v_new ->> v_col),
            hint    = 'Attribution is not transferable, by a manager or by anybody else.';
  end if;

  -- The author may change anything the policies let them reach.
  if v_actor is not distinct from (auth.uid())::text then
    return new;
  end if;

  -- Everybody else may change the moderator columns and nothing else.
  for k in select jsonb_object_keys(v_new)
  loop
    if (v_new -> k) is distinct from (v_old -> k) and not (k = any (v_moderator)) then
      raise exception 'only the author may change %.%', tg_table_name, k
        using errcode = '42501',
              detail  = pg_catalog.format('Row %s: %s %s -> %s attempted by %s, attributed to %s.',
                          v_old ->> 'id', k, v_old ->> k, v_new ->> k, auth.uid(), v_actor),
              hint    = pg_catalog.format(
                          'A manager or an admin may change only: %s. Rewriting text a resident wrote, under that resident''s name, is not a moderation act.',
                          case when cardinality(v_moderator) = 0 then '(nothing on this table — remove the row instead)'
                               else array_to_string(v_moderator, ', ') end);
    end if;
  end loop;

  return new;
end;
$fn$;

comment on function public.community_freeze_attribution() is
  'BEFORE UPDATE guard shared by events and lost_found. Freezes building_id and the actor column named in TG_ARGV[0] (created_by / reporter_id) for everyone, and restricts every OTHER column to that actor — a non-author may change only the columns named from TG_ARGV[1] onward (lost_found: status; events: none). Positive grammar on purpose: a column added later belongs to the author until somebody argues it into the moderator list by name. SECURITY INVOKER: it reads nothing but OLD, NEW and auth.uid().';

drop trigger if exists trg_events_freeze_attribution     on public.events;
drop trigger if exists trg_lost_found_freeze_attribution on public.lost_found;

create trigger trg_events_freeze_attribution
  before update on public.events
  for each row execute function public.community_freeze_attribution('created_by');

create trigger trg_lost_found_freeze_attribution
  before update on public.lost_found
  for each row execute function public.community_freeze_attribution('reporter_id', 'status');

-- ===========================================================================
-- 5. Cancelling your own RSVP after you move out
-- ===========================================================================
-- Same rule as section 1, applied where 20260826000000 put it the other way:
-- rsvps_delete required is_resident_of(e.building_id), so a resident who
-- leaves the building stays on the attendee list of every event they ever
-- RSVP'd to, and "12 going" counts a person who cannot cancel and cannot
-- attend. Standing is required to speak, never to fall silent.
--
-- rsvps_write (INSERT) keeps its scope, unchanged: joining is speaking.
drop policy if exists rsvps_delete on public.event_rsvps;
create policy rsvps_delete on public.event_rsvps for delete
  using (profile_id = auth.uid());

-- ===========================================================================
-- 6. Bounds on the text a resident types
-- ===========================================================================
-- report_lost_found REFUSES rather than truncating — deliberately, and it is
-- the right call — but lost_found_insert admits a direct INSERT, so those
-- refusals were a courtesy the table did not enforce. Measured above: 500,000
-- characters into community_posts.content in one statement.
--
-- The numbers are the ones already in the code, so there is exactly one bound
-- per field rather than a client one and a server one that drift:
--
--   pet_name  80   breed 80   color 40   last_seen 500   <- report_lost_found's own
--   title     120  location 120                          <- the event composer's maxLength
--   post      5000 comment 1000                          <- new; the two inputs get
--                                                           matching maxLength in this commit
--
-- The two `content` columns also get a NON-EMPTY floor. Both are NOT NULL and
-- both accepted '' or '   ', which renders as a post with no post in it; every
-- composer already guards with .trim() and the database did not. btrim's
-- second argument is spelled out because the default trims spaces only, and a
-- body of newlines is as empty as a body of spaces.
--
-- image_url on both tables is deliberately left unbounded: it is machine-
-- generated by uploadCommunityImage, no UI accepts it as typed text, and
-- report_lost_found already validates p_image_path against the community-media
-- path grammar. Recorded so its absence reads as a decision.

alter table public.community_posts
  add constraint community_posts_content_len
  check (length(btrim(content, E' \t\r\n')) between 1 and 5000);

alter table public.post_comments
  add constraint post_comments_content_len
  check (length(btrim(content, E' \t\r\n')) between 1 and 1000);

alter table public.events
  add constraint events_title_len    check (length(btrim(title, E' \t\r\n')) between 1 and 120);
alter table public.events
  add constraint events_location_len check (location is null or length(location) <= 120);

alter table public.lost_found
  add constraint lost_found_pet_name_len  check (pet_name  is null or length(pet_name)  <= 80);
alter table public.lost_found
  add constraint lost_found_breed_len     check (breed     is null or length(breed)     <= 80);
alter table public.lost_found
  add constraint lost_found_color_len     check (color     is null or length(color)     <= 40);
alter table public.lost_found
  add constraint lost_found_last_seen_len check (last_seen is null or length(last_seen) <= 500);
