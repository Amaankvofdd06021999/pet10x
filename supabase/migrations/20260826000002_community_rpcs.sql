-- Ring the whole building, but only three times a day.
--
-- Three acts that cross users, and therefore three SECURITY DEFINER functions.
-- 20260823000005_manager_remind_fine.sql is the shape; this file matches it
-- down to the grant.
--
-- WHY DEFINER AT ALL, restated from the measurement rather than from memory
-- (checked again 2026-08-23, immediately before writing this):
--
--     notifs_insert_own_assistant is the ONLY insert policy on notifications,
--     and its check is
--         (profile_id = auth.uid()) AND (kind = 'assistant'::notification_kind)
--
-- Nothing in the browser can notify anybody but itself, of any kind but
-- 'assistant'. A lost-pet broadcast is therefore an RPC or it is nothing.
--
-- EVERY ONE OF THE THREE:
--   * is `set search_path = public, pg_temp`
--   * re-checks the caller's scope BY HAND, before it reads or writes anything
--   * returns {ok:false, error:'…'} rather than raising, so the UI gets a
--     sentence instead of a Postgres error code
--   * is `revoke execute … from public, anon` — FROM PUBLIC, not from anon:
--     Phase 0 measured seven `revoke … from anon` statements in this repo that
--     are no-ops, because anon INHERITS the PUBLIC grant and revoking from a
--     member does not remove what the group grants.

-- ===========================================================================
-- report_lost_found
-- ===========================================================================
-- TAKES NO building_id. It derives the building from the caller's own approved
-- resident_links row. A parameter the caller controls is a parameter the caller
-- can point at another building; removing it is stronger than validating it,
-- and 20260826000000 was written the same week to close exactly that hole on
-- the table itself.
--
-- THIS IS THE FIRST CONTROL ON PET10X THAT LETS ONE RESIDENT PUT A NOTIFICATION
-- IN EVERY NEIGHBOUR'S LIST. So it is bounded: at most 3 reports per profile per
-- rolling 24 hours, counted from lost_found itself by reporter_id. Counted from
-- the table rather than from a new counter table because there is nothing to
-- keep in sync — the row IS the record, and a row that was rolled back never
-- counted.
--
-- ON MORE THAN ONE APPROVED LINK: returns ambiguous_building rather than
-- picking. my_building_link() returns a single row and the whole app assumes
-- one, so two is a state nobody has designed for, and guessing which building a
-- resident meant to alarm is worse than saying so.
create or replace function public.report_lost_found(
  p_kind         text,
  p_pet_name     text default null,
  p_species      public.pet_species default null,
  p_breed        text default null,
  p_color        text default null,
  p_last_seen    text default null,
  p_reward_cents integer default null,
  p_image_path   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me        uuid := auth.uid();
  v_building  uuid;
  v_links     integer;
  v_recent    integer;
  v_id        uuid;
  v_notified  integer := 0;
  v_name      text;
  v_breed     text;
  v_color     text;
  v_seen      text;
  v_bname     text;
  -- MIRRORS THE STORAGE GRAMMAR PINNED IN 20260826000003. Both must change
  -- together: this one decides whether a path may be STORED, that one decides
  -- whether an object may EXIST. Anchored at both ends, exactly three segments,
  -- no '.' or '/' inside any segment, extension from a closed list.
  v_path_re   text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                   || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                   || '(post|lf)-[0-9a-f]{32}\.(jpg|png|webp|heic)$';
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  -- POSITIVE GRAMMAR. lost_found_kind_check agrees, but failing here gives a
  -- sentence instead of a constraint name three layers down.
  if p_kind is null or p_kind not in ('lost', 'found') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;

  select count(*), min(rl.building_id)
    into v_links, v_building
    from public.resident_links rl
    join public.profiles pr on pr.id = rl.profile_id
   where rl.profile_id = v_me
     and rl.status = 'approved'
     and rl.left_at is null
     and not pr.is_suspended;

  if v_links = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_building');
  end if;
  if v_links > 1 then
    return jsonb_build_object('ok', false, 'error', 'ambiguous_building');
  end if;

  -- The bound, and it is checked BEFORE anything is written, so a refused call
  -- leaves lost_found, notifications and audit_log all untouched.
  select count(*) into v_recent
    from public.lost_found lf
   where lf.reporter_id = v_me
     and lf.created_at > now() - interval '24 hours';
  if v_recent >= 3 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'limit', 3, 'window_hours', 24);
  end if;

  -- `~ '\S'` rather than btrim, because btrim strips only ASCII spaces: a field
  -- containing one non-breaking space is empty to a reader and non-empty to
  -- btrim. Name the thing that must be true — "has a non-space character".
  -- A field that is blank by that test becomes NULL, which is what the column
  -- already means by absent.
  v_name  := case when p_pet_name  ~ '\S' then p_pet_name  else null end;
  v_breed := case when p_breed     ~ '\S' then p_breed     else null end;
  v_color := case when p_color     ~ '\S' then p_color     else null end;
  v_seen  := case when p_last_seen ~ '\S' then p_last_seen else null end;

  -- REFUSED, NOT TRUNCATED. `left(x, 80)` would store something the resident
  -- did not write and report success for it — the same class of quiet lie as a
  -- toast over a write that did not happen. The caller is told which field and
  -- can fix it.
  --
  -- `length(NULL) > 80` is NULL and `if NULL then` does not branch, which is
  -- the intended reading here: an absent field has no length to bound. Written
  -- down because the same three-valued logic HAS been a hole elsewhere in this
  -- repo, and a reader should not have to work out which of the two it is.
  if length(v_name)  > 80  then return jsonb_build_object('ok', false, 'error', 'too_long', 'field', 'pet_name',  'max', 80);  end if;
  if length(v_breed) > 80  then return jsonb_build_object('ok', false, 'error', 'too_long', 'field', 'breed',     'max', 80);  end if;
  if length(v_color) > 40  then return jsonb_build_object('ok', false, 'error', 'too_long', 'field', 'color',     'max', 40);  end if;
  if length(v_seen)  > 500 then return jsonb_build_object('ok', false, 'error', 'too_long', 'field', 'last_seen', 'max', 500); end if;

  -- Null means "no reward". Zero does not: a literal 0 in the column looks like
  -- a decision somebody made rather than an absence, and the screen would badge
  -- it. Upper bound matches manager_set_fine_schedule's, for the same reason —
  -- an unbounded integer in a broadcast is a way to make a notification shout.
  -- Guarded with `is not null` first: `null < 1` is NULL and `if not (NULL)`
  -- does not branch.
  if p_reward_cents is not null and (p_reward_cents < 1 or p_reward_cents > 1000000) then
    return jsonb_build_object('ok', false, 'error', 'bad_reward');
  end if;

  -- AN UNVERIFIED PATH IS A CLAIM. A claim that renders as an image is a way to
  -- point a lost-pet notice at somebody else's object, so the path must match
  -- the grammar AND name an object that actually exists, under THIS caller's
  -- building and THIS caller's uid.
  if p_image_path is not null then
    if p_image_path !~ v_path_re then
      return jsonb_build_object('ok', false, 'error', 'bad_image_path');
    end if;
    if (storage.foldername(p_image_path))[1] is distinct from v_building::text
    or (storage.foldername(p_image_path))[2] is distinct from v_me::text then
      return jsonb_build_object('ok', false, 'error', 'bad_image_path');
    end if;
    if not exists (
      select 1 from storage.objects o
       where o.bucket_id = 'community-media' and o.name = p_image_path
    ) then
      return jsonb_build_object('ok', false, 'error', 'image_not_found');
    end if;
  end if;

  insert into public.lost_found
    (building_id, reporter_id, kind, pet_name, species, breed, color, last_seen,
     reward_cents, image_url, status)
  values
    (v_building, v_me, p_kind, v_name, p_species, v_breed, v_color, v_seen,
     p_reward_cents, p_image_path, 'active')
  returning id into v_id;

  select b.name into v_bname from public.buildings b where b.id = v_building;

  -- Every approved, unsuspended resident of the building EXCEPT the reporter.
  -- A notification telling you about your own report is noise, and it is the
  -- kind of noise that teaches people to ignore the channel.
  with recipients as (
    insert into public.notifications
      (profile_id, kind, severity, title, body, action_label, action_target, building_id)
    select rl.profile_id,
           'community',
           case when p_kind = 'lost' then 'warning' else 'info' end,
           case when p_kind = 'lost'
                then 'Lost pet in ' || coalesce(v_bname, 'your building')
                else 'Found pet in ' || coalesce(v_bname, 'your building') end,
           case when p_kind = 'lost'
                then coalesce(v_name, 'A pet') || ' is missing.'
                else coalesce(v_name, 'A pet') || ' was found.' end
           || coalesce(' Last seen: ' || v_seen || '.', '')
           || coalesce(' ' || v_breed, '')
           || coalesce(' (' || v_color || ')', ''),
           'Open Community',
           -- 'community' is the screen id app/app/page.tsx routes on.
           'community',
           v_building
      from public.resident_links rl
      join public.profiles pr on pr.id = rl.profile_id
     where rl.building_id = v_building
       and rl.status = 'approved'
       and rl.left_at is null
       and not pr.is_suspended
       and rl.profile_id <> v_me
    returning 1
  )
  select count(*) into v_notified from recipients;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (v_me, 'community.lost_found_reported', 'lost_found', v_id, v_building,
          jsonb_build_object('kind', p_kind, 'pet_name', v_name,
                             'has_image', p_image_path is not null,
                             'notified', v_notified));

  return jsonb_build_object('ok', true, 'id', v_id, 'building_id', v_building,
                            'notified', v_notified);
end;
$$;

comment on function public.report_lost_found(text, text, public.pet_species, text, text, text, integer, text) is
  'Files a lost/found pet notice in the caller''s OWN building — derived from their single approved resident_links row, never passed in — and notifies every other approved unsuspended resident of that building (kind=community, severity warning for lost / info for found, action_target=community). Bounded to 3 reports per profile per rolling 24h, counted from lost_found itself. p_image_path must match the community-media path grammar, sit under the caller''s building and uid, and name an object that exists. Audits community.lost_found_reported. Returns {ok:true,id,building_id,notified} or {ok:false, error: unauthenticated | invalid_kind | no_building | ambiguous_building | rate_limited | bad_reward | too_long | bad_image_path | image_not_found}; every rejection is a return value, not a raise, and every rejection writes nothing.';

revoke execute on function public.report_lost_found(text, text, public.pet_species, text, text, text, integer, text) from public, anon;
grant  execute on function public.report_lost_found(text, text, public.pet_species, text, text, text, integer, text) to authenticated, service_role;

-- ===========================================================================
-- publish_building_event
-- ===========================================================================
-- MANAGER/ADMIN ONLY, and that is the product decision this phase makes
-- explicit: a RESIDENT may create an event (events_insert, 20260826000000) but
-- may not ring every neighbour about it. Organising something and announcing it
-- are different acts, and that difference is the only thing keeping the
-- notification list from becoming a second, unmoderated feed. The resident's
-- event still appears in the Events tab for the whole building; it simply does
-- not ring.
--
-- ONE RING PER EVENT PER 24 HOURS. Not in the plan, added here: without it a
-- manager holding the button re-notifies every resident of the building on
-- every press, and the only record that it happened is the audit row this
-- function itself writes — so that row is also what bounds it. Reuse rather
-- than a new column.
create or replace function public.publish_building_event(
  p_event uuid,
  p_note  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me       uuid := auth.uid();
  v_ev       public.events%rowtype;
  v_note     text;
  v_bname    text;
  v_notified integer := 0;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;
  if p_event is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_ev from public.events where id = p_event;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- SECURITY DEFINER bypasses RLS, so scope is re-checked by hand, and it comes
  -- before anything else is read.
  if not (public.manages_building(v_ev.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if exists (
    select 1 from public.audit_log al
     where al.action = 'community.event_published'
       and al.entity_id = p_event
       and al.created_at > now() - interval '24 hours'
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_published');
  end if;

  v_note := case when p_note ~ '\S' then p_note else null end;
  if length(v_note) > 300 then
    return jsonb_build_object('ok', false, 'error', 'too_long', 'field', 'note', 'max', 300);
  end if;
  select b.name into v_bname from public.buildings b where b.id = v_ev.building_id;

  with recipients as (
    insert into public.notifications
      (profile_id, kind, severity, title, body, action_label, action_target, building_id)
    select rl.profile_id, 'community', 'info',
           v_ev.title,
           'A building event on '
             || to_char(v_ev.starts_at, 'FMMonth FMDD')
             || coalesce(' at ' || v_ev.location, '')
             || coalesce(' — ' || v_bname, '')
             || '.'
             || coalesce(' ' || v_note, ''),
           'Open Community', 'community', v_ev.building_id
      from public.resident_links rl
      join public.profiles pr on pr.id = rl.profile_id
     where rl.building_id = v_ev.building_id
       and rl.status = 'approved'
       and rl.left_at is null
       and not pr.is_suspended
       and rl.profile_id <> v_me
    returning 1
  )
  select count(*) into v_notified from recipients;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (v_me, 'community.event_published', 'event', p_event, v_ev.building_id,
          jsonb_build_object('title', v_ev.title, 'notified', v_notified,
                             'created_by', v_ev.created_by));

  return jsonb_build_object('ok', true, 'notified', v_notified);
end;
$$;

comment on function public.publish_building_event(uuid, text) is
  'Announces an EXISTING event to every approved unsuspended resident of its building. Manager or admin only — a resident may create an event but may not broadcast one. Refuses a second announcement of the same event within 24h (already_published), bounded off its own audit_log row. Audits community.event_published. Returns {ok:true,notified} or {ok:false, error: unauthenticated | not_found | forbidden | already_published | too_long}.';

revoke execute on function public.publish_building_event(uuid, text) from public, anon;
grant  execute on function public.publish_building_event(uuid, text) to authenticated, service_role;

-- ===========================================================================
-- moderate_community_post
-- ===========================================================================
-- Sets deleted_at, which useCommunityPosts already filters on. It does NOT hard
-- delete: a DELETE cascades to post_comments and post_reactions, and a
-- referential cascade is not subject to RLS, so one removal would take every
-- neighbour's comment with it.
--
-- IT DOES NOT NOTIFY THE AUTHOR. A removal notice is the opening of a
-- conversation; resident-manager messaging is explicitly out of scope for this
-- phase, and a notification the author cannot reply to is worse than none. The
-- audit row is the record.
--
-- An AUTHOR removing their OWN post does not come through here at all — that is
-- a plain `update … set deleted_at = now()`, which posts_update_own permits, and
-- it writes no audit row because it is not a moderation act.
create or replace function public.moderate_community_post(
  p_post   uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me     uuid := auth.uid();
  v_post   public.community_posts%rowtype;
  v_reason text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;
  if p_post is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_post from public.community_posts where id = p_post for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not (public.manages_building(v_post.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if v_post.deleted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_removed');
  end if;

  v_reason := case when p_reason ~ '\S' then p_reason else null end;
  if length(v_reason) > 300 then
    return jsonb_build_object('ok', false, 'error', 'too_long', 'field', 'reason', 'max', 300);
  end if;

  -- Only deleted_at moves. community_posts_guard (20260826000001) freezes
  -- building_id and author_id and gates the counters and the content; none of
  -- that is touched here, so the trigger passes this write through.
  update public.community_posts set deleted_at = now() where id = p_post;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (v_me, 'community.post_removed', 'community_post', p_post, v_post.building_id,
          jsonb_build_object('author_id', v_post.author_id, 'reason', v_reason,
                             'category', v_post.category));

  return jsonb_build_object('ok', true, 'id', p_post);
end;
$$;

comment on function public.moderate_community_post(uuid, text) is
  'Soft-removes a community post (deleted_at) as a manager of its building or an admin, and audits it as community.post_removed with the author id and the reason. Never hard-deletes: a DELETE cascades to post_comments and post_reactions and a referential cascade is not subject to RLS. Does not notify the author — resident-manager messaging is out of scope and a notice nobody can answer is worse than none. Returns {ok:true,id} or {ok:false, error: unauthenticated | not_found | forbidden | already_removed | too_long}.';

revoke execute on function public.moderate_community_post(uuid, text) from public, anon;
grant  execute on function public.moderate_community_post(uuid, text) to authenticated, service_role;
