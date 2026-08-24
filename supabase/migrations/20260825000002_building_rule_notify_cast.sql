-- The notification insert needed a cast, and INSERT ... SELECT does not add one.
--
-- WHAT BROKE, MEASURED
--
-- 20260825000001's `publish_building_rule` copied the notification insert from
-- `manager_advance_violation` (20260823000001:~330), which writes
--
--     insert into public.notifications (..., kind, ...) values (..., 'building', ...)
--
-- and works. This one writes the same literal through an INSERT ... SELECT,
-- because the recipients are a SET (every approved resident) rather than one
-- row, and that fails:
--
--     42804: column "kind" is of type notification_kind but expression is of
--            type text
--
-- The difference is not stylistic. In `INSERT ... VALUES` an unadorned literal
-- is of type UNKNOWN and Postgres resolves it against the target column. Put
-- the same literal in a SELECT list and the select is type-resolved on its own
-- first — `'building'` becomes `text` — and text does not implicitly cast to an
-- enum. Nothing in `tsc`, the test suite or the migration applying cleanly
-- could have caught it: `create function` does not plan the body, so the error
-- only exists at the first call.
--
-- Caught by the Task 2 verification probe on the first publish. Recorded here
-- rather than fixed in place because 20260825000001 is applied.
--
-- The body below is 20260825000001's verbatim, with exactly two changes, both
-- marked in place: `'building'` and `'info'` are cast to their column types and
-- the null `action_label` is given one, so the select list resolves to the
-- target row type with no reliance on assignment casts at all.

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
    -- Residences today, one 'left' and one 'approved'.
    insert into public.notifications
      (profile_id, kind, severity, title, body, action_label, action_target, building_id)
    select distinct rl.profile_id,
           -- CHANGED: explicit casts. See the header — a bare literal in a
           -- SELECT list resolves to `text` before it ever meets the target
           -- column, and text does not implicitly cast to notification_kind.
           'building'::public.notification_kind,
           'info'::text,
           'Building rules updated'::text,
           v_rule.title,
           -- action_label is NULL on purpose. alerts-screen.tsx renders a
           -- button from the TARGET, falling back to "Open" when there is no
           -- label; a label written here would only duplicate the title.
           -- CHANGED: typed, for the same reason as above.
           null::text,
           'building-rules'::text,
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

-- `create or replace` keeps the comment and the EXECUTE grants set in
-- 20260825000001 — both are properties of the function object, not of its body.
-- Re-asserted anyway rather than assumed, because a `drop`/`create` slipped in
-- later would silently restore PUBLIC's default EXECUTE.
revoke execute on function public.publish_building_rule(uuid, boolean, boolean) from public, anon;
grant  execute on function public.publish_building_rule(uuid, boolean, boolean) to authenticated, service_role;
