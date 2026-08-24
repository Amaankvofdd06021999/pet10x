-- One authorisation grammar for six community tables.
--
-- ---------------------------------------------------------------------------
-- THE RED, MEASURED ON PRODUCTION 2026-08-23, ALL INSIDE `begin; … rollback;`
--
-- The three tables carried three mutually inconsistent models: one wall nobody
-- could pass, two doors with no lock, and a count nobody could take.
--
--   (a) NOBODY CAN POST.
--       posts_insert = author_id = auth.uid()
--                      AND is_resident_of(building_id)
--                      AND is_premium(auth.uid())
--
--       48 profiles | 1 premium | 24 approved residents | 4 managers | 2 admins
--       can_post_today = 0
--
--       The platform's only premium account is a super-admin whose resident
--       link is `pending`, and posts_insert has no is_admin() disjunct. The
--       intersection of "premium" and "approved resident" is EMPTY. Proven, not
--       inferred: an approved, unsuspended Maple Court resident inserting into
--       their own building got ERROR 42501.
--
--   (b) EVENTS AND LOST & FOUND WERE WIDE OPEN.
--       The same resident, in one rolled-back transaction, inserted
--         - a lost_found row into Harbour View Towers  (no relationship to it)
--         - an events row into Harbour View Towers
--         - a lost_found row with building_id = NULL
--       and all three were admitted: lf_probe = 2, ev_probe = 1.
--
--       lost_found_insert was `reporter_id = auth.uid()` with NO building
--       predicate of any kind. events_write was FOR ALL with
--       `created_by = auth.uid() OR manages_building(building_id) OR
--       is_admin()`, and that first disjunct is SELF-AUTHORISING: set
--       created_by to yourself and the policy passes for any building, or for
--       none. Both SELECT policies began `building_id IS NULL OR …`, so a NULL
--       row was a platform-wide broadcast channel readable by every
--       authenticated user on Pet10x.
--
--   (c) ATTENDANCE WAS UNCOUNTABLE.
--       event_rsvps had exactly one policy, rsvps_self (FOR ALL,
--       profile_id = auth.uid()). With two RSVPs seeded on one event the
--       resident counted 1, and so did the manager. post_reactions got a
--       building-scoped reactions_select; event_rsvps never did. That asymmetry
--       is the bug.
--
-- All six community tables held 0 rows when this ran, which is what makes the
-- two `set not null`s and the three check constraints free. If you are reading
-- this because a replay failed, the tables are no longer empty and a backfill
-- is a different task with a different risk.
--
-- ---------------------------------------------------------------------------
-- THE GRAMMAR, STATED ONCE
--
-- Every write into a community table names a building, and the caller must
-- stand in a stated relationship to THAT building:
--
--     public.is_resident_of(building_id)      -- approved, unsuspended resident
--  or public.manages_building(building_id)    -- unsuspended manager of it
--  or public.is_admin()                       -- unsuspended super-admin
--
-- Verified before relying on it (2026-08-23): is_resident_of joins profiles and
-- tests `not p.is_suspended`; manages_building does the same; is_admin() is
-- `is_super_admin and not is_suspended`. So suspension needs no fourth
-- conjunct anywhere below. If one of those three ever stops testing suspension,
-- every policy in this file silently widens — that is the coupling, named here
-- so it can be checked rather than discovered.

-- ===========================================================================
-- 1. Close the `building_id is null` broadcast channel
-- ===========================================================================
-- Both FKs are already `on delete cascade` to buildings — correct and
-- unchanged: deleting a building should take its events and its lost-pet
-- notices with it, and nothing else references either table.

alter table public.events     alter column building_id set not null;
alter table public.lost_found alter column building_id set not null;

-- NOT IN THE PLAN, ADDED HERE, and the reason is a defect the plan's own Task 5
-- would have shipped: `events.starts_at` was nullable, while Task 5's
-- useEvents() filters `starts_at >= now() - interval '1 day'`. A NULL start
-- fails that comparison (NULL, not true), so an event created without a time
-- would be accepted by the database and then be INVISIBLE in the very tab that
-- created it — with no error anywhere. Task 5's formatEventDate(startsAt:
-- string) has no null branch either. An event with no start is not an event.
-- Free today: the table is empty.
alter table public.events alter column starts_at set not null;

drop policy if exists events_select on public.events;
create policy events_select on public.events for select
  using (
    public.is_resident_of(building_id)
    or public.manages_building(building_id)
    or public.is_admin()
  );

drop policy if exists lost_found_select on public.lost_found;
create policy lost_found_select on public.lost_found for select
  using (
    public.is_resident_of(building_id)
    or public.manages_building(building_id)
    or public.is_admin()
  );

-- ===========================================================================
-- 2. Split events_write into three, and kill the self-authorising disjunct
-- ===========================================================================
-- PRODUCT CALL, stated so it reads as a choice rather than an accident: a
-- resident may create an event IN THEIR OWN BUILDING ONLY. The `created_by`
-- column and the old policy's shape both say residents were meant to organise
-- meetups; the defect was the missing building conjunct, not the intent.
--
-- A manager or admin may edit or remove any event in a building they hold. An
-- EX-resident cannot edit their own past event, because is_resident_of has gone
-- false. That is the same rule as posts, and it is deliberate: the event was
-- addressed to the building, and the building's record of what was organised
-- should not be editable by departure.
--
-- events.created_by references profiles(id) with NO on-delete action (NO
-- ACTION), so a profile that has created events cannot be deleted at all. LEFT
-- AS IT IS. `set null` would make `created_by = auth.uid()` unmatchable and
-- orphan the event's edit rights; `cascade` would delete a building's whole
-- event history when one organiser closes their account. Neither is better than
-- a delete that refuses and says why.

drop policy if exists events_write on public.events;

create policy events_insert on public.events for insert
  with check (
    created_by = auth.uid()
    and (
      public.is_resident_of(building_id)
      or public.manages_building(building_id)
      or public.is_admin()
    )
  );

create policy events_update on public.events for update
  using (
    (created_by = auth.uid() and public.is_resident_of(building_id))
    or public.manages_building(building_id)
    or public.is_admin()
  )
  with check (
    (created_by = auth.uid() and public.is_resident_of(building_id))
    or public.manages_building(building_id)
    or public.is_admin()
  );

create policy events_delete on public.events for delete
  using (
    (created_by = auth.uid() and public.is_resident_of(building_id))
    or public.manages_building(building_id)
    or public.is_admin()
  );

-- ===========================================================================
-- 3. The premium gate
-- ===========================================================================
-- REMOVED, and this is a revenue decision, so it is written to be reversible in
-- one paste. The exact restore statement is at the bottom of this section.
--
-- Argued:
--
--  1. It is not a monetisation control, it is an OUTAGE. can_post_today = 0 of
--     48 accounts, and community_posts has never held a row. Nothing is being
--     protected, because nothing has ever existed to protect.
--
--  2. It is not consistent with itself. Of five community write paths, exactly
--     one was gated. post_comments' insert check is `author_id = auth.uid()`
--     and post_reactions' is `profile_id = auth.uid()` — no premium conjunct on
--     either — so a non-premium resident could already write unlimited text
--     into a neighbour's thread. The gate never gated community; it decided who
--     was allowed to go FIRST, on a table with no rows.
--
--  3. A manager could not announce anything to their own building and an admin
--     could not moderate, because the old predicate had neither disjunct. Both
--     are defects on any reading of the intent, and one statement fixes both.
--
--  4. The failure mode was a 42501 surfaced as a toast. createCommunityPost
--     pattern-matched the words "row-level security" in a Postgres error string
--     to guess it meant "buy a plan". Guessing a business rule from an error
--     code is not a paywall.
--
-- IF PREMIUM GATING OF COMMUNITY IS GENUINELY WANTED, THIS IS NOT WHERE IT
-- GOES. The right shape is a QUOTA — N posts per rolling period — inside a
-- SECURITY DEFINER RPC that can return {ok:false, error:'quota_exceeded',
-- upgrade:true} and let the UI say something a person can act on. Named here so
-- it is not rediscovered. Out of scope for this phase.
--
-- TO RESTORE THE OLD BEHAVIOUR EXACTLY, IN ONE PASTE:
--
--     drop policy posts_insert on public.community_posts;
--     create policy posts_insert on public.community_posts for insert
--       with check (
--         (author_id = auth.uid())
--         AND is_resident_of(building_id)
--         AND is_premium(auth.uid())
--       );
--
-- Doing so returns can_post_today to 0 until somebody sells a subscription to
-- an approved resident.

drop policy if exists posts_insert on public.community_posts;
create policy posts_insert on public.community_posts for insert
  with check (
    author_id = auth.uid()
    and (
      public.is_resident_of(building_id)
      or public.manages_building(building_id)
      or public.is_admin()
    )
  );

-- ===========================================================================
-- 4. Lost & found: a building, a lifecycle, and a moderator
-- ===========================================================================
-- lost_found.reporter_id references profiles(id) with no on-delete action —
-- same reasoning as events.created_by above. Left as it is.

drop policy if exists lost_found_insert on public.lost_found;
create policy lost_found_insert on public.lost_found for insert
  with check (
    reporter_id = auth.uid()
    and (
      public.is_resident_of(building_id)
      or public.manages_building(building_id)
      or public.is_admin()
    )
  );

create policy lost_found_update on public.lost_found for update
  using (
    (reporter_id = auth.uid() and public.is_resident_of(building_id))
    or public.manages_building(building_id)
    or public.is_admin()
  )
  with check (
    (reporter_id = auth.uid() and public.is_resident_of(building_id))
    or public.manages_building(building_id)
    or public.is_admin()
  );

-- NO DELETE POLICY. A lost-pet notice is RESOLVED, not erased, and `status` is
-- now the lifecycle. Before this migration there was no UPDATE policy either,
-- which meant 'active' was permanent for everyone including the reporter — the
-- notice could never be taken down.
--
-- POSITIVE GRAMMAR: name the two values that are allowed, so a third added
-- later is refused until somebody decides it belongs. LostFoundItem.status in
-- lib/data/types.ts already declared exactly these two; the column was bare
-- text with no constraint, so the type was an unenforced hope.
alter table public.lost_found
  add constraint lost_found_status_check check (status in ('active','resolved'));

-- ===========================================================================
-- 5. Make attendance countable
-- ===========================================================================
-- The policy event_rsvps was evidently meant to have and did not: a
-- building-scoped read, mirroring reactions_select on post_reactions.
--
-- THIS MAKES EVERY RSVP'S IDENTITY VISIBLE TO THE BUILDING. That is the point —
-- "12 going" needs the rows, and an attendee list is what an organiser needs.
-- It is written down because it changes what a resident's RSVP discloses, and
-- the screen shows the NAMES rather than a bare count so the disclosure is
-- visible rather than implied.
--
-- THREE POLICIES, NOT THE TWO THE PLAN NAMED. Postgres has no
-- `for insert, delete`, and a single FOR ALL policy would also admit UPDATE —
-- which this table has no path for. An RSVP is a row that exists or does not;
-- the primary key (event_id, profile_id) makes a double-RSVP a duplicate-key
-- error the client turns into a no-op.

drop policy if exists rsvps_self on public.event_rsvps;

create policy rsvps_read on public.event_rsvps for select
  using (
    exists (
      select 1 from public.events e
      where e.id = event_rsvps.event_id
        and (
          public.is_resident_of(e.building_id)
          or public.manages_building(e.building_id)
          or public.is_admin()
        )
    )
  );

-- No is_admin() disjunct on either write policy, deliberately: moderating a
-- feed is not attending a barbecue. An admin who is neither a resident nor a
-- manager of the building cannot RSVP to its events, and can still read the
-- list.
create policy rsvps_write on public.event_rsvps for insert
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_rsvps.event_id
        and (
          public.is_resident_of(e.building_id)
          or public.manages_building(e.building_id)
        )
    )
  );

create policy rsvps_delete on public.event_rsvps for delete
  using (
    profile_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_rsvps.event_id
        and (
          public.is_resident_of(e.building_id)
          or public.manages_building(e.building_id)
        )
    )
  );

-- event_rsvps.event_id and .profile_id are both `on delete cascade` — a deleted
-- event has no attendees, a deleted profile attends nothing. Both correct,
-- unchanged.

-- ===========================================================================
-- 6. Constrain `category` on both tables
-- ===========================================================================
-- CATEGORY_COLORS in components/screens/community-screen.tsx is a
-- Record<string,string>, so an unrecognised category returns undefined and
-- React renders the LITERAL CLASS NAME `undefined` into the DOM. Positive
-- grammar: the seven names the screen actually knows.
--
-- The screen also gains a categoryClass() fallback in the same phase. A
-- constraint and a fallback are not the same defence and neither replaces the
-- other: the constraint stops a bad value being stored, the fallback stops the
-- screen breaking if this list ever grows ahead of the client.

alter table public.community_posts
  add constraint community_posts_category_check
  check (category in ('General','Recommendation','Warning','Question','Social','Health','Building'));

-- events.category is nullable and stays so — an event without a category is a
-- legitimate event, and the screen renders no badge for it.
alter table public.events
  add constraint events_category_check
  check (category is null or category in ('General','Recommendation','Warning','Question','Social','Health','Building'));
