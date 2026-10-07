-- Pet10x — Part F: an account can be deleted by everyone, not 27 of 48.
--
-- 20 foreign keys into `profiles` were NO ACTION, and `violations.pet_id` and
-- `service_bookings.business_id` refused the two owned-row deletes the route
-- runs first. Measured before this file: 21 of 48 live profiles could not be
-- deleted (app/api/account/delete/route.ts carried the histogram).
--
-- THE RULE. A column that records who DID something (granted, decided,
-- verified, triaged, issued, logged, suspended) goes NULL with the person: the
-- act stays on the record, the name does not. A column that records who a
-- record is ABOUT (the resident on a case or a fine, the customer on a
-- booking, the payer, the appellant) also goes NULL — enforcement and booking
-- history is retained, de-identified, as PIPEDA permits for legal obligations
-- — but the route refuses BEFORE deleting while a case is open or a fine is
-- owed, so nothing live loses its subject.
--
-- A REFERENTIAL SET NULL IS AN UPDATE, and four guards refused it
-- (20260827000006 learned this for accommodation_requests): fines_settle_only_
-- guard compares whole rows; community_freeze_attribution and
-- community_row_opening freeze created_by / reporter_id / author_id; and
-- community_posts_guard froze author_id while its own hint said the FK was the
-- one permitted writer. Each now admits exactly the referential case through
-- person_ref_released() below, and nothing else.
--
-- Guards checked and left alone, with the reason:
--   violations_stage_guard     — WHEN (old.stage is distinct from new.stage)
--   pet_documents_verdict_guard — exempts non-client roles; a NULL verified_by
--                                 is not an upgrade either way
--   guard_profile_privilege    — from 20261012000006 it does guard suspended_by,
--                                but only for callers with a JWT; the deletion
--                                cascade carries none, so it passes
--   accommodation_requests_freeze — already admits decided_by / pet_id going
--                                 NULL (20260827000006/7)
--   business_staff_guard       — exempts non-client roles
--   sync_pets_on_link_change   — acts on a status change only
--   building_rules_publish_guard — acts on is_published only
--   service_bookings status notify triggers — `after update of status`
--
-- WHO RUNS A REFERENTIAL ACTION. PostgreSQL executes ON DELETE SET NULL as the
-- OWNER of the referencing table (ri_triggers.c switches to its relowner), not
-- as the role that issued the DELETE — GoTrue's supabase_auth_admin holds no
-- UPDATE on public.fines, and deleting a user cascades today regardless. So
-- inside the cascade current_user is the owner, which is never `authenticated`
-- or `anon`; a client's own UPDATE always is.

-- ---------------------------------------------------------------------------
-- 1. The predicate every guard below shares
-- ---------------------------------------------------------------------------
create or replace function public.person_ref_released(p_old uuid, p_new uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $fn$
  select p_new is null
     and p_old is not null
     and current_user not in ('authenticated', 'anon')
     and not exists (select 1 from public.profiles pr where pr.id = p_old)
$fn$;

comment on function public.person_ref_released(uuid, uuid) is
  'True only for the write an ON DELETE SET NULL referential action makes: a person column going from a uuid to NULL, the profile it named gone, and the write not made by a client role. Referential actions run as the referencing table''s owner, so under one the existence probe bypasses RLS and is authoritative; under authenticated/anon the function is false whatever the probe would say, so it is not an existence oracle. SECURITY INVOKER on purpose (20260827000007, 20260829000000).';

revoke all on function public.person_ref_released(uuid, uuid) from public, anon;
grant execute on function public.person_ref_released(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Actor columns — who did something. The record stays; the name goes.
-- ---------------------------------------------------------------------------
alter table public.building_managers
  drop constraint if exists building_managers_granted_by_fkey,
  add constraint building_managers_granted_by_fkey
  foreign key (granted_by) references public.profiles(id) on delete set null;
alter table public.resident_links
  drop constraint if exists resident_links_decided_by_fkey,
  add constraint resident_links_decided_by_fkey
  foreign key (decided_by) references public.profiles(id) on delete set null;
alter table public.pet_documents
  drop constraint if exists pet_documents_verified_by_fkey,
  add constraint pet_documents_verified_by_fkey
  foreign key (verified_by) references public.profiles(id) on delete set null;
alter table public.incident_reports
  drop constraint if exists incident_reports_reporter_id_fkey,
  add constraint incident_reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete set null;
alter table public.incident_reports
  drop constraint if exists incident_reports_triaged_by_fkey,
  add constraint incident_reports_triaged_by_fkey
  foreign key (triaged_by) references public.profiles(id) on delete set null;
alter table public.violations
  drop constraint if exists violations_opened_by_fkey,
  add constraint violations_opened_by_fkey
  foreign key (opened_by) references public.profiles(id) on delete set null;
alter table public.violation_events
  drop constraint if exists violation_events_actor_id_fkey,
  add constraint violation_events_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;
alter table public.lost_found
  drop constraint if exists lost_found_reporter_id_fkey,
  add constraint lost_found_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete set null;
alter table public.events
  drop constraint if exists events_created_by_fkey,
  add constraint events_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.fines
  drop constraint if exists fines_issued_by_fkey,
  add constraint fines_issued_by_fkey
  foreign key (issued_by) references public.profiles(id) on delete set null;
alter table public.emergency_access_tokens
  drop constraint if exists emergency_access_tokens_issued_by_fkey,
  add constraint emergency_access_tokens_issued_by_fkey
  foreign key (issued_by) references public.profiles(id) on delete set null;
alter table public.audit_log
  drop constraint if exists audit_log_actor_id_fkey,
  add constraint audit_log_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;
alter table public.care_entries
  drop constraint if exists care_entries_logged_by_fkey,
  add constraint care_entries_logged_by_fkey
  foreign key (logged_by) references public.profiles(id) on delete set null;
alter table public.profiles
  drop constraint if exists profiles_suspended_by_fkey,
  add constraint profiles_suspended_by_fkey
  foreign key (suspended_by) references public.profiles(id) on delete set null;
alter table public.violation_disputes
  drop constraint if exists violation_disputes_decided_by_fkey,
  add constraint violation_disputes_decided_by_fkey
  foreign key (decided_by) references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. Subject columns — who a record is about. Kept, de-identified.
--    The delete route refuses first while a case is open or a fine is owed.
-- ---------------------------------------------------------------------------
alter table public.service_bookings alter column customer_id drop not null;
alter table public.violation_disputes alter column filed_by drop not null;
alter table public.violations
  drop constraint if exists violations_resident_id_fkey,
  add constraint violations_resident_id_fkey
  foreign key (resident_id) references public.profiles(id) on delete set null;
alter table public.fines
  drop constraint if exists fines_resident_id_fkey,
  add constraint fines_resident_id_fkey
  foreign key (resident_id) references public.profiles(id) on delete set null;
alter table public.payments
  drop constraint if exists payments_profile_id_fkey,
  add constraint payments_profile_id_fkey
  foreign key (profile_id) references public.profiles(id) on delete set null;
alter table public.service_bookings
  drop constraint if exists service_bookings_customer_id_fkey,
  add constraint service_bookings_customer_id_fkey
  foreign key (customer_id) references public.profiles(id) on delete set null;
alter table public.violation_disputes
  drop constraint if exists violation_disputes_filed_by_fkey,
  add constraint violation_disputes_filed_by_fkey
  foreign key (filed_by) references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. The two owned-row deletes the route runs before the account itself.
--    A removed pet leaves its cases standing with no pet named; a removed
--    business leaves its customers' booking history with no business named.
--    The route refuses a business deletion while a booking is still open.
-- ---------------------------------------------------------------------------
alter table public.violations
  drop constraint if exists violations_pet_id_fkey,
  add constraint violations_pet_id_fkey
  foreign key (pet_id) references public.pets(id) on delete set null;
alter table public.service_bookings alter column business_id drop not null;
alter table public.service_bookings
  drop constraint if exists service_bookings_business_id_fkey,
  add constraint service_bookings_business_id_fkey
  foreign key (business_id) references public.businesses(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 5. A decided appeal whose decider has left still says it was decided.
-- ---------------------------------------------------------------------------
alter table public.violation_disputes drop constraint if exists violation_disputes_decision_whole;
alter table public.violation_disputes add constraint violation_disputes_decision_whole check (
  (outcome is null and decided_at is null and decided_by is null)
  or (outcome is not null and decided_at is not null)
);

-- ---------------------------------------------------------------------------
-- 6. Guards that read a SET NULL as an edit
-- ---------------------------------------------------------------------------

-- fines: settled, never rewritten — except the two person columns going NULL
-- with the person.
create or replace function public.fines_settle_only_guard()
returns trigger
language plpgsql
set search_path = ''
as $guard$
declare
  v_old jsonb := pg_catalog.to_jsonb(old) - 'status' - 'updated_at';
  v_new jsonb := pg_catalog.to_jsonb(new) - 'status' - 'updated_at';
begin
  if public.person_ref_released(old.resident_id, new.resident_id) then
    v_old := v_old - 'resident_id';
    v_new := v_new - 'resident_id';
  end if;
  if public.person_ref_released(old.issued_by, new.issued_by) then
    v_old := v_old - 'issued_by';
    v_new := v_new - 'issued_by';
  end if;
  if v_old is distinct from v_new then
    raise exception
      'a fine may be settled, not rewritten'
      using errcode = '42501',
            detail  = pg_catalog.format(
                        'Fine %s: an UPDATE changed a column other than status.', old.id),
            hint    = 'Only `status` may be changed on an existing fine (this is what "Mark paid" and "Waive" do). The amount, currency, due date and the case a fine belongs to are set when manager_advance_violation issues it, and are not editable afterwards — a fine the resident has already been told about cannot be quietly restated.';
  end if;
  return new;
end;
$guard$;

comment on function public.fines_settle_only_guard() is
  'BEFORE UPDATE guard on fines: permits a row to differ only in `status` (and `updated_at`, which trg_fines_updated rewrites), plus resident_id / issued_by going NULL when that person''s account is deleted (person_ref_released, 20261012000001). Compares whole rows as jsonb, so columns added later are protected without amending this function. Raises 42501.';

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
  -- 20261012000001: the hint below was always the intent and was never the
  -- behaviour — the FK's ON DELETE SET NULL is an UPDATE, and this branch
  -- refused it, so nobody who had ever posted could delete their account.
  if new.author_id is distinct from old.author_id
     and not public.person_ref_released(old.author_id, new.author_id) then
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
    -- 20261012000001: an attribution column going NULL because the person it
    -- named was deleted is the FK's ON DELETE SET NULL, not an edit. Nested,
    -- so the uuid cast only ever meets a uuid column.
    if k = any (array['created_by', 'reporter_id', 'author_id']) then
      if public.person_ref_released((v_old ->> k)::uuid, (v_new ->> k)::uuid) then
        continue;
      end if;
    end if;
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
    -- 20261012000001: the one way attribution changes — the author's account
    -- was deleted and the FK nulled it. Admitted only when nothing else on the
    -- row moved in the same write.
    if public.person_ref_released(v_actor::uuid, (v_new ->> v_col)::uuid)
       and (v_new - v_col) = (v_old - v_col) then
      return new;
    end if;
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
