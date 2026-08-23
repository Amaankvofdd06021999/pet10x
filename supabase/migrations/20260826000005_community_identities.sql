-- A feed where everybody is called "Resident".
--
-- ---------------------------------------------------------------------------
-- FOUND BY OPENING THE PAGE, not by any gate. `pnpm test`, `pnpm build`, `tsc
-- --noEmit` and `pnpm check:jsx-spaces` were all clean over the screen this
-- fixes. Two residents of Maple Court Residences, both signed in, one post and
-- one event between them:
--
--     the author's name on a neighbour's post   -> "Resident"
--     the neighbour's avatar                    -> the placeholder
--     the RSVP list on a 2-person event         -> "Aubrey, A neighbour"
--
-- The cause is `profiles_select`:
--
--     (id = auth.uid())
--     OR is_admin()
--     OR EXISTS (select 1 from resident_links rl
--                 where rl.profile_id = profiles.id
--                   and manages_building(rl.building_id))
--
-- A resident may read their OWN profile and nobody else's. That was correct
-- while nothing showed one resident another resident's anything. Phase 8 ships
-- the first user-generated content on Pet10x, and it makes the community feed,
-- the comment thread and the attendee list all read as though the building had
-- one member.
--
-- ---------------------------------------------------------------------------
-- WHY NOT JUST WIDEN profiles_select
--
-- Because `profiles` is not a display record. It holds
--
--     email, phone, street_address, address_unit, city, region, postal_code,
--     latitude, longitude, location_label, is_suspended, plan_label, role
--
-- Adding "…or we share a building" to that policy publishes every neighbour's
-- HOME ADDRESS, PHONE NUMBER AND EXACT COORDINATES to every other neighbour, in
-- exchange for a display name. That is the same trade this phase already
-- refused when it deleted `CommunityPost.unit` rather than populating it.
--
-- So: a SECURITY DEFINER function that returns EXACTLY THREE COLUMNS —
-- id, full_name, avatar_url — and nothing else, ever. A positive grammar for a
-- disclosure: name what may be seen, not what may not.
--
-- ---------------------------------------------------------------------------
-- IT TAKES NO ARGUMENTS, and that is the security property.
--
-- The obvious shape is `community_identities(p_ids uuid[])`, resolving the ids
-- a caller saw in their feed. That makes the function an ORACLE: hand it any
-- uuid and learn whether it belongs to somebody in your building. This version
-- derives the set from the CALLER's own approved link (or managed building) and
-- returns the whole roster of that one building. A caller cannot ask about
-- anybody they were not already entitled to see, because they cannot ask about
-- anybody at all — the same argument that removed `p_building_id` from
-- `report_lost_found`.
--
-- WHO IS IN IT: every approved, unsuspended resident of the caller's building,
-- plus every unsuspended MANAGER of it (an official announcement has to be able
-- to say who signed it), plus the caller. A building holds tens of rows, so this
-- is one small round trip per feed load and no pagination.
--
-- WHAT THIS DISCLOSES, stated so it is a decision: your neighbours learn your
-- display name and your avatar. They already learn both the moment you post,
-- comment or RSVP; what changes is that they learn it for the roster rather
-- than one act at a time. It is the minimum that makes a community feed a
-- community feed, and it is strictly less than `profiles_select` would have
-- given them.

create or replace function public.community_identities()
returns table (id uuid, full_name text, avatar_url text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with scope as (
    -- The caller's own building, by the same two-step the client uses: an
    -- approved resident link first, then a managed building. A caller who is
    -- neither gets no rows, not an error.
    select rl.building_id
      from public.resident_links rl
      join public.profiles p on p.id = rl.profile_id
     where rl.profile_id = auth.uid()
       and rl.status = 'approved'
       and rl.left_at is null
       and not p.is_suspended
    union
    select bm.building_id
      from public.building_managers bm
      join public.profiles p on p.id = bm.profile_id
     where bm.profile_id = auth.uid()
       and not p.is_suspended
  )
  select distinct pr.id, pr.full_name, pr.avatar_url
    from public.profiles pr
   where not pr.is_suspended
     and (
       pr.id = auth.uid()
       or exists (
         select 1 from public.resident_links rl
          where rl.profile_id = pr.id
            and rl.status = 'approved'
            and rl.left_at is null
            and rl.building_id in (select building_id from scope)
       )
       or exists (
         select 1 from public.building_managers bm
          where bm.profile_id = pr.id
            and bm.building_id in (select building_id from scope)
       )
     );
$$;

comment on function public.community_identities() is
  'The display identity — id, full_name, avatar_url, and NOTHING ELSE — of everybody the caller shares a building with: approved unsuspended residents of their own building, its managers, and themselves. Takes no arguments on purpose: a p_ids parameter would make it an oracle for "does this uuid live in my building". Exists because profiles_select is `id = auth.uid()` for a resident, which rendered every neighbour in the community feed as "Resident", and because widening that policy would have published every neighbour''s address, phone and coordinates to buy a display name.';

-- `from public`, not `from anon`: anon INHERITS the PUBLIC grant, and revoking
-- from a member does not remove what the group grants. Phase 0 measured seven
-- `revoke … from anon` statements in this repo that are no-ops for that reason.
revoke execute on function public.community_identities() from public, anon;
grant  execute on function public.community_identities() to authenticated, service_role;
