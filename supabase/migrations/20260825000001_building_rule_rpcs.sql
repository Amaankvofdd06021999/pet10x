-- Publishing is an act, and the act leaves a record.
--
-- Two functions and one trigger. `manager_save_building_rule` writes the text;
-- `publish_building_rule` decides who has been told about it. They are separate
-- because saving and publishing are separate acts (Decision 4), and the trigger
-- is what makes that separation real rather than a convention the UI observes.
--
-- ---------------------------------------------------------------------------
-- WHY BOTH ARE SECURITY DEFINER
--
-- `publish_building_rule` HAS to be. `notifs_insert_own_assistant` admits only
-- `kind = 'assistant'` for `profile_id = auth.uid()`, so a manager cannot
-- insert a notification addressed to a resident from the browser under any
-- circumstances. The same constraint that forces AD-6 forces this.
--
-- `manager_save_building_rule` does not strictly have to be — Task 1's
-- `building_rules_manager_insert` / `_manager_update` would carry a plain
-- client write. It is one anyway, for one reason that is not convenience: the
-- audit row. `audit_log` has no client INSERT policy, so a save that writes its
-- own audit record cannot be a client statement. An unaudited save and an
-- audited publish would mean the record answers "when was this served" and not
-- "when was this written", and an amendment between two publishes would leave
-- no trace at all.
--
-- SECURITY DEFINER BYPASSES RLS. Task 1's five policies do not protect these
-- functions, so each re-checks `manages_building(...) or is_admin()` BY HAND
-- against the row's own building_id, before any write, and returns
-- {"ok":false,"error":"forbidden"} rather than raising — the no-raise contract
-- `manager_advance_violation` established, so the client has something to
-- branch on instead of a 500.
--
-- ---------------------------------------------------------------------------
-- WHY publish_building_rule TAKES A STATE AND NOT A FLIP
--
-- Migration H specifies `publish_building_rule(p_rule uuid)` which "flips
-- is_published". A flip is not idempotent: a double-tap publishes then
-- unpublishes, and a manager cannot tell from the button which state they left
-- it in. A control that means "publish" must publish however many times it is
-- pressed. So the caller states the state it wants.
--
-- Re-publishing an already-published rule notifies AGAIN by default, because an
-- amendment IS an update and that is the whole mechanism by which a resident
-- learns to look again. `p_notify => false` exists so a typo fix does not send
-- nine notifications.

-- ---------------------------------------------------------------------------
-- 1. THE GUARD
--
-- `building_rules_manager_update` lets a manager write this table directly, so
-- without this `update building_rules set is_published = true` would publish a
-- rule with no notification and no audit record — the same hole Phase 2 found
-- and closed on `violations.stage`, and the same fix.
--
-- It RAISES rather than restoring. That is the opposite of the fine-schedule
-- guard in 20260825000002, deliberately: there, three legitimate client
-- surfaces round-trip the whole `pet_rules` object and carry the schedule keys
-- along by accident, so refusing would break three working buttons. Here NO
-- legitimate client path sends `is_published` at all, so there is no honest
-- write to accommodate and a raise is the honest answer.
--
-- Only the publication state is guarded. Title, body, category and sort_order
-- are all written by `manager_save_building_rule` without a token, so an
-- update that leaves `is_published` alone passes straight through.
-- TG_OP rather than a WHEN clause on the trigger: a WHEN clause on a
-- BEFORE INSERT OR UPDATE trigger cannot reference OLD on the INSERT side, so
-- the two cases have to be distinguished in the body.
--
-- SECURITY INVOKER, like `violations_stage_guard`: this reads one setting and
-- either raises or returns. It needs no privilege of its own, and triggers are
-- not RLS — is_admin() transcends the building_rules policies and transcends
-- nothing here. A super-admin's direct UPDATE fires this exactly as a
-- manager's does. Verified for both.
create or replace function public.building_rules_publish_guard()
returns trigger
language plpgsql
set search_path = ''
as $guard$
declare
  v_changing boolean;
begin
  if TG_OP = 'INSERT' then
    -- A row born published is a publication, and it has to carry the token
    -- just as a transition does. Without this branch the guard would be
    -- trivially bypassed by `insert ... (is_published) values (true)`.
    v_changing := new.is_published;
  else
    -- `is distinct from` rather than `<>`: is_published is NOT NULL so a NULL
    -- cannot arise here today, but the operator that cannot return NULL is the
    -- one to write in a guard. Phase 2 lost a scope check to `false or NULL`.
    v_changing := (old.is_published is distinct from new.is_published);
  end if;

  if not v_changing then
    return new;
  end if;

  -- Single-use capability, not a mode. A GUC set with set_config(..., true)
  -- is TRANSACTION-local and survives the SECURITY DEFINER function that set
  -- it — measured on this database in Phase 2 — so left as a mode it would
  -- fail open for the rest of the transaction after one legitimate publish.
  -- The trigger SPENDS it on the way through: one token, one publication.
  if pg_catalog.current_setting('pet10x.rule_publish', true) is distinct from 'ok' then
    raise exception
      'building_rules.is_published cannot be changed by a direct write'
      using errcode = '42501',
            detail  = pg_catalog.format(
                        'Rule %s: attempted is_published -> %s outside publish_building_rule().',
                        new.id, new.is_published),
            hint    = 'Call publish_building_rule(p_rule, p_published, p_notify) instead. It notifies the building''s approved residents and writes the audit row.';
  end if;

  perform pg_catalog.set_config('pet10x.rule_publish', '', true);
  return new;
end;
$guard$;

comment on function public.building_rules_publish_guard() is
  'BEFORE INSERT OR UPDATE guard on building_rules.is_published: refuses any change to the publication state that does not carry the single-use pet10x.rule_publish token minted by publish_building_rule, and spends the token as it passes. Raises 42501. Every other column is untouched, so manager_save_building_rule — which never writes is_published — needs no token.';

-- ---------------------------------------------------------------------------
-- 2. THE SAVE

create or replace function public.manager_save_building_rule(
  p_rule       uuid,
  p_building   uuid,
  p_category   public.building_rule_category,
  p_title      text,
  p_body       text,
  p_sort_order integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.building_rules%rowtype;
  v_building uuid;
  v_title    text := btrim(coalesce(p_title, ''));
  -- Only the OUTERMOST whitespace is trimmed. Internal line breaks and blank
  -- lines are the content: this phase exists so that what the manager typed is
  -- what the resident reads, and normalising the interior would be exactly the
  -- silent rewrite it is meant to prevent.
  v_body     text := btrim(coalesce(p_body, ''));
  v_id       uuid;
  v_pub      boolean;
  v_created  boolean := false;
begin
  if v_title = '' or v_body = '' then
    -- Refused before the CHECK constraint has to, so the client gets something
    -- it can render instead of a 23514.
    return jsonb_build_object('ok', false, 'error', 'empty');
  end if;
  if char_length(v_title) > 120 or char_length(v_body) > 8000 then
    return jsonb_build_object('ok', false, 'error', 'too_long');
  end if;

  if p_rule is null then
    v_building := p_building;
    if v_building is null then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
  else
    select * into v_existing from public.building_rules where id = p_rule for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    -- Authorise against the EXISTING row's building, never the caller's
    -- argument. Trusting p_building here would let a manager of B edit a rule
    -- of A by naming B.
    v_building := v_existing.building_id;
    if p_building is not null and p_building <> v_building then
      -- A rule does not move buildings. Refused rather than silently ignored,
      -- so a client that thinks it is moving one finds out.
      return jsonb_build_object('ok', false, 'error', 'building_mismatch');
    end if;
  end if;

  if not (public.manages_building(v_building) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if p_rule is null then
    insert into public.building_rules
      (building_id, category, title, body, sort_order, created_by, updated_by)
    values
      (v_building, p_category, v_title, v_body,
       coalesce(p_sort_order,
                (select coalesce(max(sort_order), -1) + 1
                   from public.building_rules
                  where building_id = v_building and category = p_category)),
       auth.uid(), auth.uid())
    returning id, is_published into v_id, v_pub;
    v_created := true;
  else
    update public.building_rules
       set category   = p_category,
           title      = v_title,
           body       = v_body,
           sort_order = coalesce(p_sort_order, sort_order),
           updated_by = auth.uid()
     where id = p_rule
    returning id, is_published into v_id, v_pub;
  end if;

  -- `is_published` is not in either statement, so the guard's WHEN test is
  -- false on the update and the INSERT's value is the column default (false).
  -- Neither needs a token.

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'building_rule.saved', 'building_rule', v_id, v_building,
          jsonb_build_object('category', p_category::text,
                             'published', v_pub,
                             'created', v_created,
                             'title_len', char_length(v_title),
                             'body_len', char_length(v_body)));

  return jsonb_build_object('ok', true, 'id', v_id, 'is_published', v_pub, 'created', v_created);
end;
$$;

comment on function public.manager_save_building_rule(uuid, uuid, public.building_rule_category, text, text, integer) is
  'Creates or amends one house rule. NEVER publishes: a new rule is born is_published = false and an amendment leaves the flag exactly as it found it. Returns {ok:true, id, is_published, created} or {ok:false, error: empty | too_long | not_found | building_mismatch | forbidden}. Trims only the outermost whitespace of title and body — the interior of a body is the manager''s own paragraphs and is stored verbatim.';

-- ---------------------------------------------------------------------------
-- 3. THE PUBLISH

create or replace function public.publish_building_rule(
  p_rule      uuid,
  p_published boolean default true,
  p_notify    boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule     public.building_rules%rowtype;
  v_want     boolean := coalesce(p_published, true);
  v_notify   boolean := coalesce(p_notify, true);
  v_notified integer := 0;
begin
  select * into v_rule from public.building_rules where id = p_rule for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not (public.manages_building(v_rule.building_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- The token, minted after every early return so a refused call never mints
  -- one, and immediately before the only statement that touches is_published.
  -- The guard spends it on the way through: one token, one publication.
  --
  -- MINTED ONLY WHEN THE STATE IS ACTUALLY CHANGING, which is not a detail.
  -- This function is idempotent — re-publishing an already-published rule
  -- succeeds and notifies again — so on that path the UPDATE below does not
  -- change is_published, the guard's `is distinct from` test is false, and a
  -- token minted anyway would be left UNSPENT and transaction-local for
  -- everything that followed. That is precisely the "capability degrades into
  -- a mode" failure Phase 2 measured on `pet10x.stage_change` and corrected.
  -- Minting inside the branch keeps the invariant that every token issued is
  -- consumed by the statement it was issued for.
  --
  -- `is distinct from` on the comparison too: v_want is coalesced non-null and
  -- is_published is NOT NULL, so `<>` would do — but a guard-adjacent test that
  -- can return NULL is the shape this project has already been bitten by twice.
  if v_want is distinct from v_rule.is_published then
    perform set_config('pet10x.rule_publish', 'ok', true);
  end if;

  update public.building_rules
     set is_published = v_want,
         updated_by   = auth.uid()
   where id = p_rule;

  -- Notify only on a PUBLISH. Unpublishing is a withdrawal, and telling nine
  -- residents "the rules were updated" when what happened is that a notice was
  -- taken down would be a notification about nothing they can read.
  if v_want and v_notify then
    -- Re-derived by hand rather than through is_resident_of(), which answers
    -- about auth.uid() and not about a set.
    --
    -- DISTINCT because resident_links is not unique on (profile_id,
    -- building_id) — resident1@pet10x.com holds two rows at Maple Court
    -- Residences today, one 'left' and one 'approved'. Only one is approved so
    -- the filter already collapses it, but a resident who left and rejoined
    -- twice would otherwise be notified twice for one publication.
    insert into public.notifications
      (profile_id, kind, severity, title, body, action_label, action_target, building_id)
    select distinct rl.profile_id,
           'building', 'info',
           'Building rules updated',
           v_rule.title,
           -- action_label is NULL on purpose. alerts-screen.tsx renders a
           -- button from the TARGET, falling back to "Open" when there is no
           -- label; a label written here would only duplicate the title.
           null,
           'building-rules',
           v_rule.building_id
      from public.resident_links rl
      join public.profiles p on p.id = rl.profile_id
     where rl.building_id = v_rule.building_id
       and rl.status = 'approved'
       and not p.is_suspended;
    get diagnostics v_notified = row_count;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, building_id, metadata)
  values (auth.uid(), 'building_rule.published', 'building_rule', p_rule, v_rule.building_id,
          jsonb_build_object('category', v_rule.category::text,
                             'published', v_want,
                             'was_published', v_rule.is_published,
                             'notify_requested', v_notify,
                             'notified', v_notified));

  return jsonb_build_object('ok', true, 'published', v_want, 'notified', v_notified);
end;
$$;

comment on function public.publish_building_rule(uuid, boolean, boolean) is
  'Sets a house rule''s publication STATE (not a flip — a flip is not idempotent and a double-tap would leave the manager unable to tell which state they left it in) and, on a publish with p_notify, inserts one notification per approved non-suspended resident of the building. Returns {ok:true, published, notified} or {ok:false, error: not_found | forbidden}. The only legitimate writer of building_rules.is_published; every other path is refused by building_rules_publish_guard.';

-- ---------------------------------------------------------------------------
-- 4. ENFORCEMENT STARTS HERE — last, so there is no instant at which the
-- trigger is live and its only legitimate caller is not.
--
-- No WHEN clause: it would have to reference OLD, which does not exist on the
-- INSERT side. The function's first branch is the WHEN clause.
create trigger trg_building_rules_publish_guard
  before insert or update on public.building_rules
  for each row
  execute function public.building_rules_publish_guard();

-- ---------------------------------------------------------------------------
-- 5. WHO MAY CALL THEM
--
-- Both bypass RLS, so the execute grant is the only remaining gate. `anon` is
-- excluded: every caller is a signed-in manager, and an unauthenticated caller
-- has no auth.uid() for the scope check to test in the first place.
--
-- Revoked from PUBLIC **and** anon by name. Functions are granted EXECUTE to
-- PUBLIC by default and anon inherits from PUBLIC, so `from public` alone is
-- usually enough — but 20260615073613_harden_security.sql's seven revokes were
-- measured as no-ops in Phase 0, and naming both costs nothing. The grant list
-- is asserted from pg_proc.proacl afterwards rather than trusted.
revoke execute on function public.manager_save_building_rule(uuid, uuid, public.building_rule_category, text, text, integer) from public, anon;
grant  execute on function public.manager_save_building_rule(uuid, uuid, public.building_rule_category, text, text, integer) to authenticated, service_role;

revoke execute on function public.publish_building_rule(uuid, boolean, boolean) from public, anon;
grant  execute on function public.publish_building_rule(uuid, boolean, boolean) to authenticated, service_role;
