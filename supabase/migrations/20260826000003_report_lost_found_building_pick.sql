-- `min(uuid)` does not exist, and only calling the function could say so.
--
-- 20260826000002 wrote
--
--     select count(*), min(rl.building_id) into v_links, v_building
--
-- to derive the caller's building and, in the same pass, detect the
-- more-than-one case. There is no `min(uuid)` aggregate in Postgres. `create
-- function` DOES NOT PLAN ITS BODY, so the migration applied cleanly and the
-- error waited for the first live call:
--
--     ERROR 42883: function min(uuid) does not exist
--     CONTEXT: PL/pgSQL function report_lost_found(...) line 32
--
-- which is a RAISE out of a function whose entire contract is that every
-- rejection is a return value. Caught by the verification pass, which calls
-- every branch of every function this phase writes, rather than by a resident
-- trying to report a missing cat. This is the third time on this project that
-- an unplanned function body has shipped a type error into a migration
-- (20260823000006 shipped `pg_catalog.current_date`); the rule that catches it
-- is the same one both times — CALL IT.
--
-- WHY A NEW FILE. 20260826000002 is applied and its DDL is not edited. This
-- file replaces the whole function with `create or replace`, so a replay from
-- files reaches the right end state: 000002 creates the broken body (applies,
-- never called), 000003 replaces it entirely. The filename sorts after 000002
-- and before the storage migration, which is also the order the two were
-- actually applied in — see docs/superpowers/2026-08-23-migration-drift.md for
-- what goes wrong when those two orders disagree.
--
-- THE FIX: `(array_agg(rl.building_id))[1]`. array_agg is defined for every
-- type, and taking element 1 of the aggregate is exactly what the code meant —
-- "any one of them, and v_links tells you whether 'any one' was a choice".
-- Nothing else in the function changes; the body below is 20260826000002's
-- verbatim with that one line replaced.

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
  -- MIRRORS THE STORAGE GRAMMAR PINNED IN 20260826000004. Both must change
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

  -- THE ONE CHANGED LINE. `min(uuid)` does not exist; array_agg does, for every
  -- type. v_links is what decides no_building vs ambiguous_building, so which
  -- element is picked matters only in the case that is already refused.
  select count(*), (array_agg(rl.building_id))[1]
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

-- Restated because `create or replace` keeps the previous comment.
comment on function public.report_lost_found(text, text, public.pet_species, text, text, text, integer, text) is
  'Files a lost/found pet notice in the caller''s OWN building — derived from their single approved resident_links row, never passed in — and notifies every other approved unsuspended resident of that building (kind=community, severity warning for lost / info for found, action_target=community). Bounded to 3 reports per profile per rolling 24h, counted from lost_found itself. p_image_path must match the community-media path grammar, sit under the caller''s building and uid, and name an object that exists. Audits community.lost_found_reported. Returns {ok:true,id,building_id,notified} or {ok:false, error: unauthenticated | invalid_kind | no_building | ambiguous_building | rate_limited | bad_reward | too_long | bad_image_path | image_not_found}; every rejection is a return value, not a raise, and every rejection writes nothing.';

revoke execute on function public.report_lost_found(text, text, public.pet_species, text, text, text, integer, text) from public, anon;
grant  execute on function public.report_lost_found(text, text, public.pet_species, text, text, text, integer, text) to authenticated, service_role;
