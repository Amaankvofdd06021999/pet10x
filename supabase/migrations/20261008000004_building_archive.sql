-- Pet10x — a building that has history is archived, not deleted.
--
-- `deleteBuilding` (lib/data/admin.ts) is a bare `.delete()`, and four foreign
-- keys into `buildings` are NO ACTION — fines, payouts, notifications,
-- business_listings — with violation_events RESTRICT behind violations. So on
-- any building anyone has used, Delete fails with raw 23503 text. That
-- refusal is correct: a fine, a notification and a payout are other people's
-- records of something that happened. What was missing was the thing an admin
-- actually wants instead — "this building is no longer on Pet10x".
--
-- `buildings.archived_at`. Set, the building:
--   * cannot be found by its code (resolve_building_code), so the guest
--     report form and the resident join form both say "invalid code";
--   * cannot be joined (request_building_link) or reported to
--     (submit_incident_report) — both answer invalid_code, as for a code
--     that never existed;
--   * is not offered by name (search_buildings_public,
--     buildings_matching_my_address) or to advertisers (targetable_buildings);
--   * cannot receive a lost/found notice (report_lost_found counts only links
--     to live buildings, so a resident of an archived building gets
--     no_building).
-- Everything already in it stays: residents, pets, cases, fines, history.
-- Restoring is clearing the column.
--
-- Each function below is copied VERBATIM from its latest definition (named
-- above it) and differs only by the `archived_at is null` filter, marked
-- `ARCHIVED (20261008000004)`. `create or replace` keeps each function's
-- existing grants, so the guest-facing ones (resolve_building_code,
-- search_buildings_public, submit_incident_report) stay callable by anon as
-- they were — that is their job.
--
-- WHO MAY ARCHIVE. `buildings_admin_all` lets an admin write the column, but
-- `buildings_manager_update` lets a MANAGER update their own building row too,
-- and a policy cannot say which column. A manager archiving (or un-archiving)
-- their own building would be a manager taking it off Pet10x. The guard
-- trigger below refuses that: only an admin — or a JWT-less service-role
-- session — may change archived_at.

alter table public.buildings add column if not exists archived_at timestamptz;

comment on column public.buildings.archived_at is
  'Set by an admin to take a building off Pet10x without deleting its history (20261008000004). An archived building cannot be resolved by code, joined, reported to, searched, targeted or posted to; everything already in it stays. Null = live. Only an admin may change it (buildings_archive_guard).';

create or replace function public.buildings_archive_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'only an admin can archive or restore a building'
      using errcode = '42501',
            detail  = pg_catalog.format('Building %s, caller %s.', old.id, auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.buildings_archive_guard() from public, anon, authenticated;

drop trigger if exists buildings_archive_guard on public.buildings;
create trigger buildings_archive_guard
  before update on public.buildings
  for each row
  when (old.archived_at is distinct from new.archived_at)
  execute function public.buildings_archive_guard();

-- ---------------------------------------------------------------------------
-- What Delete would hit. The admin console offers Delete only where every
-- count is zero, and Archive otherwise. Admin-only; zero rows for anyone else.
-- ---------------------------------------------------------------------------
create or replace function public.admin_building_history()
returns table (building_id uuid, fines bigint, notifications bigint, payouts bigint,
               business_listings bigint, violations bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.id,
         (select count(*) from public.fines f where f.building_id = b.id),
         (select count(*) from public.notifications n where n.building_id = b.id),
         (select count(*) from public.payouts p where p.building_id = b.id),
         (select count(*) from public.business_listings l where l.building_id = b.id),
         (select count(*) from public.violations v where v.building_id = b.id)
    from public.buildings b
   where public.is_admin();
$$;
revoke all on function public.admin_building_history() from public, anon;
grant execute on function public.admin_building_history() to authenticated;

comment on function public.admin_building_history() is
  'Per building, the rows that would block a delete (fines, notifications, payouts, business_listings) plus violations (whose events RESTRICT). Admin only — returns nothing to anyone else. 20261008000004.';

-- ---------------------------------------------------------------------------
-- The seven readers, verbatim plus the filter.
-- ---------------------------------------------------------------------------

-- @@resolve_building_code (20260821000000)
create or replace function public.resolve_building_code(p_code text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select case
    when b.id is null then jsonb_build_object('valid', false)
    else jsonb_build_object('valid', true, 'building_id', b.id, 'name', b.name)
  end
  from (select 1) dummy
  left join public.buildings b
    on upper(b.building_code) = upper(trim(p_code))
   -- ARCHIVED (20261008000004)
   and b.archived_at is null;
$function$;

-- @@search_buildings_public (20260814000001)
create or replace function public.search_buildings_public(q text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_q text; v_rows jsonb;
begin
  v_q := lower(btrim(coalesce(q, '')));

  -- Three characters minimum. Shorter prefixes return most of the table, which
  -- makes this a directory dump rather than a search.
  if length(v_q) < 3 then return jsonb_build_object('matches', '[]'::jsonb); end if;

  select coalesce(jsonb_agg(r order by r->>'name'), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
             'name', b.name,
             'address', b.address,
             'city', b.city,
             'region', b.region,
             'postalCode', b.postal_code
           ) as r
    from public.buildings b
    where b.archived_at is null  -- ARCHIVED (20261008000004)
      and (lower(coalesce(b.name, '')) like '%' || v_q || '%'
       or lower(coalesce(b.address, '')) like '%' || v_q || '%'
       or upper(replace(coalesce(b.postal_code, ''), ' ', '')) like upper(replace(v_q, ' ', '')) || '%')
    -- Capped hard. A wide query should come back short and unhelpful, not
    -- paginate the whole customer list.
    limit 8
  ) s;

  return jsonb_build_object('matches', v_rows);
end; $$;

-- @@buildings_matching_my_address (20260809000006)
create or replace function public.buildings_matching_my_address()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_postal text; v_street text; v_names text[];
begin
  if auth.uid() is null then return jsonb_build_object('matches', '[]'::jsonb); end if;

  select upper(replace(coalesce(postal_code,''),' ','')), lower(btrim(coalesce(street_address,'')))
    into v_postal, v_street from public.profiles where id = auth.uid();

  -- Postal code required. Street alone is far too loose and city would suggest
  -- a building to everyone in Vancouver.
  if v_postal = '' then return jsonb_build_object('matches', '[]'::jsonb); end if;

  select coalesce(array_agg(b.name order by b.name), '{}') into v_names
  from public.buildings b
  where upper(replace(coalesce(b.postal_code,''),' ','')) = v_postal
    and b.archived_at is null  -- ARCHIVED (20261008000004)
    and (v_street = '' or lower(btrim(coalesce(b.address,''))) like '%' || split_part(v_street,' ',1) || '%');

  return jsonb_build_object('matches', to_jsonb(v_names));
end; $$;

-- @@request_building_link (20260801000003)
create or replace function public.request_building_link(p_code text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_building public.buildings;
  v_existing public.resident_links;
  v_who      text;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_building from public.buildings
    where upper(building_code) = upper(trim(p_code))
      and archived_at is null  -- ARCHIVED (20261008000004)
    limit 1;
  if v_building.id is null then
    return json_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select * into v_existing from public.resident_links
    where profile_id = auth.uid() and building_id = v_building.id
      and status in ('pending','approved') and left_at is null
    limit 1;

  -- Re-submitting an existing request must not notify again, or a resident
  -- tapping twice would notify every manager twice.
  if v_existing.id is not null then
    return json_build_object('ok', true, 'already', true, 'status', v_existing.status,
      'building_id', v_building.id, 'building_name', v_building.name);
  end if;

  insert into public.resident_links (profile_id, building_id, status, requested_at)
    values (auth.uid(), v_building.id, 'pending', now());

  select coalesce(nullif(trim(full_name), ''), email, 'A resident')
    into v_who
  from public.profiles where id = auth.uid();

  -- One per manager of this building. No managers means no rows, which is a
  -- valid state, not an error.
  insert into public.notifications
    (profile_id, kind, severity, title, body, action_label, action_target, building_id)
  select
    bm.profile_id,
    'building',
    'info',
    coalesce(v_who, 'A resident') || ' wants to join ' || v_building.name,
    'A new resident link is waiting for review in Approvals.',
    'Review request',
    'approvals',
    v_building.id
  from public.building_managers bm
  where bm.building_id = v_building.id;

  return json_build_object('ok', true, 'status', 'pending',
    'building_id', v_building.id, 'building_name', v_building.name);
end;
$function$;

-- @@submit_incident_report (20260822000001)
create or replace function public.submit_incident_report(
  p_building_code text,
  p_type          text,
  p_description   text,
  p_location      text default null,
  p_unit          text default null,
  p_anonymous     boolean default true,
  p_pet_id        uuid default null,
  p_evidence_paths text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_building uuid;
  v_ref      text;
  v_id       uuid;
  v_pet      uuid;
  v_path     text;
begin
  select id into v_building
  from public.buildings
  where upper(building_code) = upper(trim(p_building_code))
    and archived_at is null;  -- ARCHIVED (20261008000004)

  if v_building is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  if coalesce(trim(p_description), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'description_required');
  end if;

  -- Evidence lands in guest-evidence under {buildingId}/{draftId}/{name},
  -- uploaded through a signed URL this building's code authorised. Anything
  -- with a different prefix was not ours to attach, and anything that can be
  -- normalised out of that folder is the same problem wearing a disguise.
  -- One anchored regex does both: exactly three segments, segment 1 the
  -- building, segment 2 a uuid, segment 3 starting alphanumeric. See the note
  -- at the top of this migration for why the character class alone is not it.
  if coalesce(cardinality(p_evidence_paths), 0) > 0 then
    if array_ndims(p_evidence_paths) > 1 then
      return jsonb_build_object('ok', false, 'error', 'bad_evidence_path');
    end if;
    if cardinality(p_evidence_paths) > 5 then
      return jsonb_build_object('ok', false, 'error', 'too_many_files');
    end if;
    foreach v_path in array p_evidence_paths loop
      if v_path is null or v_path !~ (
           '^' || v_building::text ||
           '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' ||
           '/[A-Za-z0-9][A-Za-z0-9._-]*$'
         ) then
        return jsonb_build_object('ok', false, 'error', 'bad_evidence_path');
      end if;
    end loop;
  end if;

  -- Only a pet that actually lives in this building. Silently dropped rather
  -- than rejected: a stale id should not lose someone's written report.
  if p_pet_id is not null then
    select p.id into v_pet
    from public.pets p
    where p.id = p_pet_id and p.building_id = v_building and p.deleted_at is null;
  end if;

  v_ref := 'IR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.incident_reports (
    building_id, reporter_id, is_anonymous, type, description,
    location_text, unit_involved, pet_id, status, reference_code,
    evidence_paths
  )
  values (
    v_building,
    case when p_anonymous then null else auth.uid() end,
    p_anonymous,
    p_type::incident_type,
    trim(p_description),
    nullif(trim(coalesce(p_location, '')), ''),
    nullif(trim(coalesce(p_unit, '')), ''),
    v_pet,
    'submitted',
    v_ref,
    -- The column is NOT NULL DEFAULT '{}', and an explicit null argument would
    -- reach it as null rather than falling back to the default.
    coalesce(p_evidence_paths, '{}')
  )
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'incident.submitted', 'incident_report', v_id, v_building,
          jsonb_build_object('anonymous', p_anonymous, 'reference', v_ref,
                             'pet_identified', v_pet is not null,
                             'evidence_count', coalesce(cardinality(p_evidence_paths), 0)));

  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$function$;

-- @@targetable_buildings (20260722000003)
create or replace function public.targetable_buildings()
returns table (id uuid, name text, city text, pet_owners bigint, dogs bigint, cats bigint)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.city,
    (select count(distinct rl.profile_id) from public.resident_links rl
      where rl.building_id = b.id and rl.status = 'approved'),
    (select count(*) from public.pets p
      where p.building_id = b.id and p.species = 'dog' and p.deleted_at is null),
    (select count(*) from public.pets p
      where p.building_id = b.id and p.species = 'cat' and p.deleted_at is null)
  from public.buildings b
  where b.archived_at is null  -- ARCHIVED (20261008000004)
  order by b.name;
$$;

-- @@report_lost_found (20260826000003)
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
    -- ARCHIVED (20261008000004): a link to an archived building is not a building to post to.
    join public.buildings bl on bl.id = rl.building_id and bl.archived_at is null
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
