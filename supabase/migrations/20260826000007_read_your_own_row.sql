-- A DELETE policy cannot be broader than the SELECT policy.
--
-- ---------------------------------------------------------------------------
-- WHAT WENT WRONG IN 20260826000006, MEASURED
--
-- That file states a rule and section 1 spells it out:
--
--     STANDING IN THE BUILDING IS REQUIRED TO SPEAK, NEVER TO FALL SILENT.
--
-- and enforces it by writing `using (profile_id = auth.uid())` on
-- reactions_delete and rsvps_delete, with no building conjunct. Verifying the
-- claim rather than the predicate is what caught that IT DOES NOT HOLD:
--
--     auth.uid() inside the ex-resident session   2646695f-…   (correct)
--     rows they can SELECT of their own reaction  0
--     rows they can DELETE of their own reaction  0
--     the row, read as postgres                   1            (it is there)
--
-- The DELETE policy passes. The row is never offered to it. PostgreSQL applies
-- SELECT policies to the row-retrieval half of an UPDATE or DELETE that carries
-- a WHERE clause, so `reactions_select` — which scopes on the POST's building —
-- decides the question before `reactions_delete` is consulted at all. The
-- delete predicate was satisfied by a row the statement could not see.
--
-- THE GENERAL RULE, worth more than this fix: on a table with SELECT policies,
-- a DELETE (or UPDATE) policy is an INTERSECTION with the read policy, never a
-- union. Writing a broader USING clause does not widen anything; it just makes
-- the file claim something the database does not do. Two of this project's
-- policies already had that shape and nobody noticed, because a delete that
-- matches no rows looks exactly like a delete that was correctly refused —
-- the same "0 rows, no error" that 20260826000001 was written to end.
--
-- THIS ALSO CORRECTS A CLAIM IN THE PHASE 8 LEDGER. progress.md's matrix
-- records `post_comments — delete own | R(B) ALLOW`, which is true, and the
-- reasoning behind comments_delete's unscoped author branch — "your own words
-- are always yours to remove" — which was never true for anybody outside the
-- building. comments_delete has had no building conjunct since
-- 20260826000001; comments_select has always had one; so the author branch has
-- been dead for an ex-resident the whole time.
--
-- ---------------------------------------------------------------------------
-- THE FIX: YOU MAY ALWAYS READ YOUR OWN ROW
--
-- One disjunct, on the three read policies that gate a withdrawal. Each one
-- discloses to a person exactly one thing: a row they wrote, about themselves,
-- that they already knew about.
--
--   reactions_select  + profile_id = auth.uid()   (post_id, profile_id, created_at)
--   comments_select   + author_id  = auth.uid()   (their own comment text)
--   rsvps_read        + profile_id = auth.uid()   (that they said they were coming)
--
-- NOTHING ELSE WIDENS. None of the three exposes another person's row, another
-- building's rows, or any column that was not already the caller's. The
-- building scope on every other reader's view of these tables is untouched, and
-- a resident of a building still cannot see a neighbour's reaction, comment or
-- RSVP in a building they do not stand in.
--
-- THE TRAP THIS CLOSES, CONCRETELY: without it, a person who leaves a building
-- stays on the attendee list of every event they ever RSVP'd to — counted in
-- "12 going", listed by name to the organiser — and cannot cancel; and their
-- like sits on a neighbour's post permanently, counted, with no statement they
-- can issue that removes it. The building's own manager cannot remove it
-- either: post_reactions has no manager delete branch, deliberately, because a
-- reaction is not speech to moderate.
--
-- WHAT THIS DOES NOT CHANGE IN THE UI: nothing, today. An ex-resident cannot
-- reach the community screen at all — currentScope returns null for them — so
-- the withdrawal is an API-level capability, not a button. It is fixed anyway
-- because the alternative is a row a person can neither see, use, nor retract.

drop policy if exists reactions_select on public.post_reactions;
create policy reactions_select on public.post_reactions for select
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.community_posts p
      where p.id = post_reactions.post_id
        and (
          public.is_resident_of(p.building_id)
          or public.manages_building(p.building_id)
          or public.is_admin()
        )
    )
  );

drop policy if exists comments_select on public.post_comments;
create policy comments_select on public.post_comments for select
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.community_posts p
      where p.id = post_comments.post_id
        and (
          public.is_resident_of(p.building_id)
          or public.manages_building(p.building_id)
          or public.is_admin()
        )
    )
  );

drop policy if exists rsvps_read on public.event_rsvps;
create policy rsvps_read on public.event_rsvps for select
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = event_rsvps.event_id
        and (
          public.is_resident_of(e.building_id)
          or public.manages_building(e.building_id)
          or public.is_admin()
        )
    )
  );
